//! M7+M8+：软件扫描结果共享缓存 + SQLite 持久化 + schema_version 迁移
//!
//! 设计：
//! - `SoftwareCache` 包一个 `RwLock<SoftwareState>`，提供 `snapshot()` / `replace()` 两个原子操作
//! - M7：scan_loop 每 5 分钟跑一次扫描，结果写入 cache
//! - M7：http_loop 每 60 秒从 cache 读快照并发心跳
//! - M8：可选 `Arc<UsageStore>` 注入；构造时 `hydrate_from_db` 读上次结果回填
//!   内存 cache；`replace()` 内部异步调 `save_scan_cache` 落 SQLite（无过期策略，
//!   永久复用上次结果，启动时立即可用，5 分钟内会被 scan_loop 刷新）
//! - M8+：持久化数据用 `ScanCachePayload` 包装，强制带 `schema_version` 顶层字段。
//!   hydrate 时按版本号分支：当前版本正常解析；旧版 / 缺字段 → log warn + 丢弃
//!   （视为冷启动，下一次 scan_loop 跑完会写新版）。
//!
//! 锁粒度：只在 read/replace 时持锁 RwLock，scan 与 HTTP 不持锁久等。
//! 与 SQLite 的交互走 UsageStore Mutex，跨 .await 点不持 RwLock。

use crate::scanner::ScannedSoftware;
use crate::usage_store::UsageStore;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};

#[derive(Debug, Default)]
struct SoftwareState {
    items: Vec<ScannedSoftware>,
    /// Unix 毫秒——上一次扫描完成的时刻。0 表示从未扫过。
    last_scan_at_ms: i64,
    /// 上一次扫描耗时（毫秒），用于前端/日志展示"扫描用时"。
    last_scan_elapsed_ms: u64,
}

/// M8+：scan_cache 持久化负载格式。
///
/// 顶层结构同时承担数据 + schema 版本号，hydrate 时按版本号分支：
/// - 当前版本（`CURRENT_SCHEMA_VERSION`）：正常解析
/// - 更老版本 / 缺字段 / 缺 schema_version：丢弃整行（视为冷启动）
///
/// 注：只支持「一次迁移到位」——不维护多版解析。如未来需要，可在此处加
/// `match schema_version { 1 => ..., 2 => ..., _ => bail!() }` 分支。
#[derive(Debug, Serialize, Deserialize)]
struct ScanCachePayload {
    schema_version: u32,
    items: Vec<ScannedSoftware>,
}

/// 当前版本号。新加 ScannedSoftware 字段时 bump 此常量 + 增加 hydrate 分支。
const CURRENT_SCHEMA_VERSION: u32 = 1;

/// M7+M8：软件扫描结果共享缓存 + 持久化。
/// 注入 `UsageStore` 后：启动 hydrate、replace 同步 save。None 时纯内存模式（M7 默认）。
pub struct SoftwareCache {
    state: RwLock<SoftwareState>,
    db: Option<Arc<UsageStore>>,
}

impl Default for SoftwareCache {
    fn default() -> Self {
        Self::new()
    }
}

impl SoftwareCache {
    /// 纯内存模式（M7 兼容，不写库）
    pub fn new() -> Self {
        Self {
            state: RwLock::new(SoftwareState::default()),
            db: None,
        }
    }

    /// M8：构造时绑定 UsageStore。调用方需在 `spawn` 前调 `hydrate_from_db`
    /// 把上次扫描结果灌进 cache（启动延迟窗口 ~1ms）。
    pub fn with_db(db: Arc<UsageStore>) -> Self {
        Self {
            state: RwLock::new(SoftwareState::default()),
            db: Some(db),
        }
    }

    /// M8+：从 SQLite 读取 scan_cache 单行（仅一次），按 schema_version 迁移：
    /// - 缺 schema_version / 旧版 / 反序列化失败 → 丢弃整行，等同冷启动
    /// - 当前版本 → 正常解析回 cache
    /// 调用方应在启动期（不阻塞窗口）调一次。
    pub fn hydrate_from_db(&self) {
        let Some(db) = &self.db else {
            return; // 纯内存模式不需要 hydrate
        };
        let loaded = match db.load_scan_cache() {
            Ok(Some((last_at, json))) => (last_at, json),
            Ok(None) => {
                log::debug!("scan_cache hydrate: 首次启动无持久化数据");
                return;
            }
            Err(e) => {
                log::warn!("scan_cache hydrate 失败（继续走冷启动）：{}", e);
                return;
            }
        };

        // M8+：解析外层 ScanCachePayload，先看 schema_version
        let payload: ScanCachePayload = match serde_json::from_str(&loaded.1) {
            Ok(p) => p,
            Err(e) => {
                log::warn!(
                    "scan_cache hydrate 反序列化失败（外层 payload，视为冷启动）：{}",
                    e
                );
                return;
            }
        };
        if payload.schema_version != CURRENT_SCHEMA_VERSION {
            log::warn!(
                "scan_cache schema_version={} 与当前 {} 不符（丢弃走冷启动，下次 scan_loop 会写新版）",
                payload.schema_version, CURRENT_SCHEMA_VERSION
            );
            return;
        }

        log::info!(
            "scan_cache hydrate 成功：schema_version={}，{} 项，时间戳 {}",
            payload.schema_version,
            payload.items.len(),
            loaded.0
        );
        let mut s = match self.state.write() {
            Ok(s) => s,
            Err(p) => p.into_inner(),
        };
        s.items = payload.items;
        s.last_scan_at_ms = loaded.0;
        // elapsed_ms 在持久化时不存（不是关键指标）；给个 0 占位
        s.last_scan_elapsed_ms = 0;
    }

    /// 取当前快照（不会 panic；锁中毒时 fallback 到空快照）。
    pub fn snapshot(&self) -> Vec<ScannedSoftware> {
        match self.state.read() {
            Ok(s) => s.items.clone(),
            Err(_) => Vec::new(),
        }
    }

    /// M8+：写入新扫描结果。
    /// 1. 更新内存 cache
    /// 2. 如果绑定了 db：用 `ScanCachePayload` 序列化（含 schema_version）落 SQLite
    pub fn replace(&self, items: Vec<ScannedSoftware>, elapsed_ms: u64) {
        let now = now_ms();
        {
            let mut s = match self.state.write() {
                Ok(s) => s,
                Err(p) => p.into_inner(),
            };
            s.items = items.clone();
            s.last_scan_at_ms = now;
            s.last_scan_elapsed_ms = elapsed_ms;
        }
        // M8+：异步持久化（fire-and-forget，错误不阻断）。外层包 ScanCachePayload
        // 写 schema_version，hydrate 时校验。
        if let Some(db) = &self.db {
            let payload = ScanCachePayload {
                schema_version: CURRENT_SCHEMA_VERSION,
                items: items.clone(),
            };
            match serde_json::to_string(&payload) {
                Ok(json) => {
                    if let Err(e) = db.save_scan_cache(&json, now) {
                        log::warn!("scan_cache save 失败（下次 replace 会重试）：{}", e);
                    }
                }
                Err(e) => log::warn!("scan_cache 序列化失败：{}", e),
            }
        }
    }

    /// 距上一次扫描成功的毫秒数。0 = 从未扫描。
    pub fn last_scan_age_ms(&self) -> i64 {
        match self.state.read() {
            Ok(s) if s.last_scan_at_ms > 0 => now_ms() - s.last_scan_at_ms,
            _ => 0,
        }
    }

    /// 上一次扫描耗时。None = 从未扫。
    pub fn last_scan_elapsed_ms(&self) -> Option<u64> {
        match self.state.read() {
            Ok(s) if s.last_scan_at_ms > 0 => Some(s.last_scan_elapsed_ms),
            _ => None,
        }
    }

    /// M8：返回最后一次扫描的 Unix 毫秒时间戳（用于 telemetry / cloud 同步）。
    /// hydrate 后的旧 cache 时间戳可能是几个月前；调用方用 `last_scan_age_ms` 判断新鲜度。
    pub fn last_scan_at_ms(&self) -> i64 {
        match self.state.read() {
            Ok(s) => s.last_scan_at_ms,
            Err(_) => 0,
        }
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// =============================================================================
// 单元测试
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::ScanSource;

    fn mk_fake(tag: &str) -> ScannedSoftware {
        ScannedSoftware {
            software_tag: tag.to_string(),
            display_name: format!("{}-display", tag),
            path: "/fake/path".to_string(),
            version: None,
            source: ScanSource::Registry,
        }
    }

    #[test]
    fn empty_cache_returns_empty_snapshot() {
        let cache = SoftwareCache::new();
        assert!(cache.snapshot().is_empty());
        assert_eq!(cache.last_scan_age_ms(), 0);
        assert_eq!(cache.last_scan_elapsed_ms(), None);
    }

    #[test]
    fn replace_then_snapshot() {
        let cache = SoftwareCache::new();
        cache.replace(vec![mk_fake("vscode"), mk_fake("photoshop")], 123);
        let snap = cache.snapshot();
        assert_eq!(snap.len(), 2);
        assert_eq!(snap[0].software_tag, "vscode");
        assert_eq!(cache.last_scan_elapsed_ms(), Some(123));
        assert!(cache.last_scan_age_ms() >= 0);
        assert!(cache.last_scan_age_ms() < 1_000);
    }

    #[test]
    fn replace_with_empty_is_allowed() {
        let cache = SoftwareCache::new();
        cache.replace(vec![], 50);
        assert!(cache.snapshot().is_empty());
        assert_eq!(cache.last_scan_elapsed_ms(), Some(50));
    }

    #[test]
    fn second_replace_overwrites() {
        let cache = SoftwareCache::new();
        cache.replace(vec![mk_fake("vscode")], 100);
        cache.replace(vec![mk_fake("blender"), mk_fake("excel")], 200);
        let snap = cache.snapshot();
        assert_eq!(snap.len(), 2);
        assert!(snap.iter().any(|s| s.software_tag == "blender"));
        assert!(!snap.iter().any(|s| s.software_tag == "vscode"));
        assert_eq!(cache.last_scan_elapsed_ms(), Some(200));
    }

    #[test]
    fn hydrate_from_db_with_no_db_is_noop() {
        // 纯内存模式（无 UsageStore）调 hydrate 应该什么也不做
        let cache = SoftwareCache::new();
        cache.hydrate_from_db();
        assert!(cache.snapshot().is_empty());
    }

    /// M8+ 集成测试：构造 UsageStore + SoftwareCache(hydrate) → 持久化路径完整。
    /// SQLite 文件在临时目录，测试结束清理。
    #[test]
    fn hydrate_from_db_roundtrip() {
        use crate::usage_store::UsageStore;

        // 1. 第一次"启动"：写 v1 payload 进 store（模拟 scan_loop 跑完后 replace 落盘）
        let tmp_path = std::env::temp_dir().join(format!(
            "scan-cache-test-{}.db",
            uuid::Uuid::new_v4()
        ));
        let v1_payload = serde_json::json!({
            "schema_version": 1,
            "items": [{
                "software_tag": "vscode",
                "display_name": "VS Code",
                "path": "/x",
                "version": null,
                "source": "registry"
            }]
        })
        .to_string();

        let conn = rusqlite::Connection::open(&tmp_path).unwrap();
        UsageStore::init_schema_for_test(&conn).unwrap();
        conn.execute(
            "INSERT INTO scan_cache (id, items_json, last_scan_at_ms, saved_at_ms)
             VALUES (1, ?1, ?2, ?3)",
            rusqlite::params![v1_payload, 12345_i64, 12346_i64],
        )
        .unwrap();
        drop(conn);

        // 2. 第二次"启动"：用 UsageStore 打开同 db + SoftwareCache.hydrate
        let store = UsageStore::open_path_for_test(&tmp_path);
        let cache = SoftwareCache::with_db(Arc::new(store));
        cache.hydrate_from_db();

        // 3. 验证 hydrate 成功 + 反序列化 + 时间戳
        let snap = cache.snapshot();
        assert_eq!(snap.len(), 1);
        assert_eq!(snap[0].software_tag, "vscode");
        assert_eq!(cache.last_scan_at_ms(), 12345);

        // 4. replace 后 SQLite 落盘（验证 save 路径写 v1 payload）
        cache.replace(vec![mk_fake("photoshop"), mk_fake("blender")], 50);
        let snap2 = cache.snapshot();
        assert_eq!(snap2.len(), 2);
        assert!(cache.last_scan_at_ms() > 12345);

        // 5. 重新打开 cache 验证 SQLite 写入内容是 v1 payload
        let conn2 = rusqlite::Connection::open(&tmp_path).unwrap();
        let (at, raw_json): (i64, String) = conn2
            .query_row(
                "SELECT last_scan_at_ms, items_json FROM scan_cache WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert!(at > 12345, "save 应该更新 last_scan_at_ms");
        let parsed: serde_json::Value = serde_json::from_str(&raw_json).unwrap();
        assert_eq!(parsed["schema_version"], 1);
        assert_eq!(parsed["items"].as_array().unwrap().len(), 2);

        // cleanup
        let _ = std::fs::remove_file(&tmp_path);
    }

    /// M8+ 迁移测试：scan_cache 表里只有旧版 payload（schema_version=0），
    /// hydrate 应丢弃走冷启动，不崩。
    #[test]
    fn hydrate_drops_old_schema_version() {
        use crate::usage_store::UsageStore;

        let tmp_path = std::env::temp_dir().join(format!(
            "scan-cache-v0-{}.db",
            uuid::Uuid::new_v4()
        ));
        let old_payload = serde_json::json!({
            "schema_version": 0,
            "items": [{"software_tag": "old", "display_name": "Old", "path": "/o", "version": null, "source": "registry"}]
        })
        .to_string();

        let conn = rusqlite::Connection::open(&tmp_path).unwrap();
        UsageStore::init_schema_for_test(&conn).unwrap();
        conn.execute(
            "INSERT INTO scan_cache (id, items_json, last_scan_at_ms, saved_at_ms)
             VALUES (1, ?1, ?2, ?3)",
            rusqlite::params![old_payload, 5000_i64, 5001_i64],
        )
        .unwrap();
        drop(conn);

        let store = UsageStore::open_path_for_test(&tmp_path);
        let cache = SoftwareCache::with_db(Arc::new(store));
        cache.hydrate_from_db();

        // 应丢弃 → cache 空 + last_scan_at_ms 仍为 0（默认）
        assert!(cache.snapshot().is_empty());
        assert_eq!(cache.last_scan_at_ms(), 0);
        let _ = std::fs::remove_file(&tmp_path);
    }

    /// M8+ 迁移测试：scan_cache 写入的是未来版本（schema_version=2），
    /// 当前代码不能解析 → 丢弃（不崩）。
    #[test]
    fn hydrate_drops_future_schema_version() {
        use crate::usage_store::UsageStore;

        let tmp_path = std::env::temp_dir().join(format!(
            "scan-cache-v2-{}.db",
            uuid::Uuid::new_v4()
        ));
        let future_payload = serde_json::json!({
            "schema_version": 2,
            "items": []
        })
        .to_string();

        let conn = rusqlite::Connection::open(&tmp_path).unwrap();
        UsageStore::init_schema_for_test(&conn).unwrap();
        conn.execute(
            "INSERT INTO scan_cache (id, items_json, last_scan_at_ms, saved_at_ms)
             VALUES (1, ?1, ?2, ?3)",
            rusqlite::params![future_payload, 5000_i64, 5001_i64],
        )
        .unwrap();
        drop(conn);

        let store = UsageStore::open_path_for_test(&tmp_path);
        let cache = SoftwareCache::with_db(Arc::new(store));
        cache.hydrate_from_db();

        // 当前 v1 不兼容 v2 → 丢弃
        assert!(cache.snapshot().is_empty());
        let _ = std::fs::remove_file(&tmp_path);
    }

    /// M8+ 迁移测试：scan_cache 完全没 schema_version 字段（M8 之前的旧数据），
    /// 反序列化会因缺字段失败 → hydrate 丢弃。
    #[test]
    fn hydrate_drops_missing_schema_version_field() {
        use crate::usage_store::UsageStore;

        let tmp_path = std::env::temp_dir().join(format!(
            "scan-cache-noversion-{}.db",
            uuid::Uuid::new_v4()
        ));
        // 与 M8 之前完全一致的 payload（裸 array）
        let legacy_payload = r#"[{"software_tag":"x","display_name":"X","path":"/x","version":null,"source":"registry"}]"#;

        let conn = rusqlite::Connection::open(&tmp_path).unwrap();
        UsageStore::init_schema_for_test(&conn).unwrap();
        conn.execute(
            "INSERT INTO scan_cache (id, items_json, last_scan_at_ms, saved_at_ms)
             VALUES (1, ?1, ?2, ?3)",
            rusqlite::params![legacy_payload, 5000_i64, 5001_i64],
        )
        .unwrap();
        drop(conn);

        let store = UsageStore::open_path_for_test(&tmp_path);
        let cache = SoftwareCache::with_db(Arc::new(store));
        cache.hydrate_from_db();

        // 缺 schema_version 字段 → ScanCachePayload 反序列化失败 → 丢弃
        assert!(cache.snapshot().is_empty());
        let _ = std::fs::remove_file(&tmp_path);
    }

    /// M8+ 迁移测试：save 路径写入的 JSON 顶层包含 schema_version=1。
    #[test]
    fn save_writes_schema_version_one_payload() {
        use crate::usage_store::UsageStore;

        let tmp_path = std::env::temp_dir().join(format!(
            "scan-cache-save-{}.db",
            uuid::Uuid::new_v4()
        ));
        let store = UsageStore::open_path_for_test(&tmp_path);
        let cache = SoftwareCache::with_db(Arc::new(store));
        cache.replace(vec![mk_fake("vscode")], 100);

        // 直接读 SQLite 验证写入的 JSON 顶层结构
        let conn = rusqlite::Connection::open(&tmp_path).unwrap();
        let raw: String = conn
            .query_row("SELECT items_json FROM scan_cache WHERE id = 1", [], |r| r.get(0))
            .unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();

        assert_eq!(parsed["schema_version"], 1, "顶层必须有 schema_version 字段");
        assert!(parsed["items"].is_array());
        assert_eq!(parsed["items"].as_array().unwrap().len(), 1);

        let _ = std::fs::remove_file(&tmp_path);
    }
}