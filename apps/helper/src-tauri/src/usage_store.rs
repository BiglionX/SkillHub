//! M4：本地用量 SQLite 存储
//!
//! 写入：`UsageStore::record(rec)`，按 `client_record_id` 幂等去重
//! 读取：`summarize(range)` / `count_today_guest()`
//! 维护：`prune_older_than(90)` 90 天滚动清理 + `export_csv()` Excel 可直接打开
//!
//! 数据目录复用 key_store 的 `dirs::data_dir() + skillhub-helper/.data/usage.db`
//! 主路径不可写时 fallback 到 `std::env::temp_dir()`，与 KeyStore 行为对齐。

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

/// 一条用量记录（写入参数）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageRecordInput {
    /// 客户端生成的幂等键（前端 NluSearchBox 用 `crypto.randomUUID()` 生成）
    /// 重复提交同 id 返回 0 行影响（INSERT OR IGNORE）
    pub client_record_id: String,
    /// Unix 毫秒
    pub created_at_ms: i64,
    pub skill_slug: String,
    pub provider_id: String,
    pub model: String,
    pub tokens_in: u32,
    pub tokens_out: u32,
    pub duration_ms: u64,
    /// CNY 估算（前端按 ProviderPricing 单价算好后传入）；None 表示无法估算
    pub cost_estimate: Option<f64>,
    /// "LOCAL_DESKTOP" | "WEB_DIRECT" | "GUEST_TEST"
    pub source: String,
    /// "user" | "guest"
    pub session_kind: String,
    /// 可选：登录用户的 userId 或游客 anonymous_id
    pub session_id: Option<String>,
}

/// 范围查询的输出（按 Skill + Provider 聚合）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageSummary {
    pub total_calls: u64,
    pub total_tokens_in: u64,
    pub total_tokens_out: u64,
    pub total_cost: f64,
    /// range = "today" | "7d" | "30d"
    pub range: String,
    /// 按 skill_slug 分组
    pub by_skill: Vec<UsageByKey>,
    /// 按 provider_id 分组
    pub by_provider: Vec<UsageByKey>,
    /// 时间序列（按天）
    pub daily: Vec<UsageDaily>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageByKey {
    pub key: String,
    pub calls: u64,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageDaily {
    pub date: String, // YYYY-MM-DD
    pub calls: u64,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub cost: f64,
}

pub struct UsageStore {
    conn: Mutex<Connection>,
    /// 是否 fallback 到临时目录（与 KeyStore 同语义）
    is_fallback: bool,
    fallback_reason: Option<String>,
}

impl UsageStore {
    /// 优先 `dirs::data_dir()`，失败 fallback 到 temp。返回时已建表。
    pub fn open_or_fallback() -> Self {
        let primary = primary_path();
        match Connection::open(&primary) {
            Ok(conn) => match Self::init_schema(&conn) {
                Ok(()) => {
                    log::info!("UsageStore 初始化成功：{}", primary.display());
                    return Self {
                        conn: Mutex::new(conn),
                        is_fallback: false,
                        fallback_reason: None,
                    };
                }
                Err(e) => {
                    log::warn!("UsageStore schema 初始化失败：{}，fallback", e);
                }
            },
            Err(e) => {
                log::warn!("UsageStore 主路径打开失败（{}），fallback 到临时目录", e);
            }
        }

        // fallback 路径
        let temp_dir = std::env::temp_dir().join("skillhub-helper").join(".data");
        let _ = std::fs::create_dir_all(&temp_dir);
        let path = temp_dir.join("usage.db");
        let conn = Connection::open(&path).unwrap_or_else(|e| {
            log::error!("UsageStore fallback 也失败：{}，使用内存库（数据丢失）", e);
            Connection::open_in_memory().expect("内存库也开不了")
        });
        let _ = Self::init_schema(&conn);
        Self {
            conn: Mutex::new(conn),
            is_fallback: true,
            fallback_reason: Some(format!("主路径 {} 不可用", primary.display())),
        }
    }

    fn init_schema(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS usage_records (
                client_record_id TEXT PRIMARY KEY,
                created_at_ms     INTEGER NOT NULL,
                skill_slug        TEXT    NOT NULL,
                provider_id       TEXT    NOT NULL,
                model             TEXT    NOT NULL,
                tokens_in         INTEGER NOT NULL,
                tokens_out        INTEGER NOT NULL,
                duration_ms       INTEGER NOT NULL,
                cost_estimate     REAL,
                source            TEXT    NOT NULL,
                session_kind      TEXT    NOT NULL,
                session_id        TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_created ON usage_records(created_at_ms);
            CREATE INDEX IF NOT EXISTS idx_skill ON usage_records(skill_slug, created_at_ms);
            CREATE INDEX IF NOT EXISTS idx_provider ON usage_records(provider_id, created_at_ms);
            CREATE INDEX IF NOT EXISTS idx_session ON usage_records(session_id, created_at_ms);
            "#,
        )
        .context("init_schema 失败")?;
        Ok(())
    }

    pub fn is_fallback(&self) -> bool {
        self.is_fallback
    }

    pub fn fallback_reason(&self) -> Option<&str> {
        self.fallback_reason.as_deref()
    }

    /// 写入一条记录；幂等：同 `client_record_id` 重复调用只保留第一次
    /// 返回是否真插入（false = 已存在，幂等命中）
    pub fn record(&self, rec: UsageRecordInput) -> Result<bool> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
        let inserted = conn.execute(
            r#"
            INSERT OR IGNORE INTO usage_records (
                client_record_id, created_at_ms, skill_slug, provider_id, model,
                tokens_in, tokens_out, duration_ms, cost_estimate,
                source, session_kind, session_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
            params![
                rec.client_record_id,
                rec.created_at_ms,
                rec.skill_slug,
                rec.provider_id,
                rec.model,
                rec.tokens_in,
                rec.tokens_out,
                rec.duration_ms,
                rec.cost_estimate,
                rec.source,
                rec.session_kind,
                rec.session_id,
            ],
        )?;
        Ok(inserted == 1)
    }

    /// 范围汇总。`range` ∈ {"today", "7d", "30d"}
    pub fn summarize(&self, range: &str) -> Result<UsageSummary> {
        let since_ms = range_start_ms(range);
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;

        // 总体
        let (total_calls, total_tokens_in, total_tokens_out, total_cost): (i64, i64, i64, f64) = conn
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(tokens_in),0), COALESCE(SUM(tokens_out),0), COALESCE(SUM(cost_estimate),0.0)
                 FROM usage_records WHERE created_at_ms >= ?1",
                params![since_ms],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )?;

        // 按 skill
        let mut stmt = conn.prepare(
            "SELECT skill_slug, COUNT(*), COALESCE(SUM(tokens_in),0), COALESCE(SUM(tokens_out),0), COALESCE(SUM(cost_estimate),0.0)
             FROM usage_records WHERE created_at_ms >= ?1 GROUP BY skill_slug ORDER BY 2 DESC",
        )?;
        let by_skill: Vec<UsageByKey> = stmt
            .query_map(params![since_ms], |row| {
                Ok(UsageByKey {
                    key: row.get(0)?,
                    calls: row.get::<_, i64>(1)? as u64,
                    tokens_in: row.get::<_, i64>(2)? as u64,
                    tokens_out: row.get::<_, i64>(3)? as u64,
                    cost: row.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        // 按 provider
        let mut stmt = conn.prepare(
            "SELECT provider_id, COUNT(*), COALESCE(SUM(tokens_in),0), COALESCE(SUM(tokens_out),0), COALESCE(SUM(cost_estimate),0.0)
             FROM usage_records WHERE created_at_ms >= ?1 GROUP BY provider_id ORDER BY 2 DESC",
        )?;
        let by_provider: Vec<UsageByKey> = stmt
            .query_map(params![since_ms], |row| {
                Ok(UsageByKey {
                    key: row.get(0)?,
                    calls: row.get::<_, i64>(1)? as u64,
                    tokens_in: row.get::<_, i64>(2)? as u64,
                    tokens_out: row.get::<_, i64>(3)? as u64,
                    cost: row.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        // 按天（本地时区，简化为 UTC 日界，M4 暂不处理时区）
        let mut stmt = conn.prepare(
            "SELECT strftime('%Y-%m-%d', created_at_ms/1000, 'unixepoch') AS day,
                    COUNT(*), COALESCE(SUM(tokens_in),0), COALESCE(SUM(tokens_out),0), COALESCE(SUM(cost_estimate),0.0)
             FROM usage_records WHERE created_at_ms >= ?1 GROUP BY day ORDER BY day ASC",
        )?;
        let daily: Vec<UsageDaily> = stmt
            .query_map(params![since_ms], |row| {
                Ok(UsageDaily {
                    date: row.get(0)?,
                    calls: row.get::<_, i64>(1)? as u64,
                    tokens_in: row.get::<_, i64>(2)? as u64,
                    tokens_out: row.get::<_, i64>(3)? as u64,
                    cost: row.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(UsageSummary {
            total_calls: total_calls as u64,
            total_tokens_in: total_tokens_in as u64,
            total_tokens_out: total_tokens_out as u64,
            total_cost,
            range: range.to_string(),
            by_skill,
            by_provider,
            daily,
        })
    }

    /// 清理 N 天前的数据（M4：90 天滚动）
    /// 返回删除的行数
    ///
    /// 安全说明：旧版本曾在 DELETE 之后立即在同一函数内对 `self.conn` 二次加锁
    /// 以运行 `PRAGMA wal_checkpoint(TRUNCATE)`。`std::sync::Mutex` 不可重入，
    /// 第二次 lock() 会永久阻塞 → 设置页手动清理按钮触发后整个 Tauri 助手卡死，
    /// 且 `prune_removes_old_records` 单元测试一旦真正运行也会卡死。
    /// 现在把整个 DELETE 包在一个作用域里让 conn drop 释放锁，并去掉手动 WAL
    /// checkpoint（SQLite 的 WAL 由 autocommit 自动管理，无需每次都手动）。
    pub fn prune_older_than(&self, days: u32) -> Result<u64> {
        let cutoff_ms = chrono_like_now_ms() - (days as i64) * 86_400_000;
        let n = {
            let conn = self
                .conn
                .lock()
                .map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
            conn.execute(
                "DELETE FROM usage_records WHERE created_at_ms < ?1",
                params![cutoff_ms],
            )?
        };
        // WAL 自动 checkpoint；不手动跑（避免二次加锁死锁）
        Ok(n as u64)
    }

    /// 导出 CSV（含 UTF-8 BOM，Excel 直接打开不乱码）
    /// 写入给定路径，返回写入行数
    pub fn export_csv(&self, path: &PathBuf) -> Result<u64> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
        let mut stmt = conn.prepare(
            "SELECT created_at_ms, skill_slug, provider_id, model, tokens_in, tokens_out,
                    duration_ms, cost_estimate, source, session_kind, session_id
             FROM usage_records ORDER BY created_at_ms DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, Option<f64>>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, Option<String>>(10)?,
            ))
        })?;

        let mut out = Vec::new();
        out.extend_from_slice(b"\xEF\xBB\xBF"); // UTF-8 BOM
        out.extend_from_slice(
            b"created_at_iso,skill_slug,provider_id,model,tokens_in,tokens_out,duration_ms,cost_cny,source,session_kind,session_id\n",
        );
        let mut n: u64 = 0;
        for r in rows {
            let (ts, skill, prov, model, ti, to, dur, cost, src, kind, sid) = r?;
            let iso = ms_to_iso(ts);
            let cost_s = cost.map(|c| format!("{:.6}", c)).unwrap_or_default();
            let sid_s = sid.unwrap_or_default();
            out.extend_from_slice(
                format!(
                    "{},{},{},{},{},{},{},{},{},{},{}\n",
                    csv_escape(&iso),
                    csv_escape(&skill),
                    csv_escape(&prov),
                    csv_escape(&model),
                    ti,
                    to,
                    dur,
                    cost_s,
                    csv_escape(&src),
                    csv_escape(&kind),
                    csv_escape(&sid_s),
                )
                .as_bytes(),
            );
            n += 1;
        }
        std::fs::write(path, &out).with_context(|| format!("写入 CSV 失败：{}", path.display()))?;
        Ok(n)
    }
}

fn primary_path() -> PathBuf {
    match dirs::data_dir() {
        Some(dir) => dir.join("skillhub-helper").join(".data").join("usage.db"),
        None => std::env::temp_dir().join("skillhub-helper").join(".data").join("usage.db"),
    }
}

fn range_start_ms(range: &str) -> i64 {
    let now = chrono_like_now_ms();
    match range {
        "today" => {
            // 当日 00:00 (UTC)
            let day_start = now / 86_400_000 * 86_400_000;
            day_start
        }
        "7d" => now - 7 * 86_400_000,
        "30d" => now - 30 * 86_400_000,
        _ => 0, // 全量
    }
}

fn chrono_like_now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn ms_to_iso(ms: i64) -> String {
    // 简易 ISO8601 UTC（前端解析友好）
    use std::time::{Duration, UNIX_EPOCH};
    let secs = ms / 1000;
    let days_since_epoch = secs / 86400;
    let secs_of_day = secs % 86400;
    let (year, month, day) = civil_from_days(days_since_epoch);
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, minute, second
    )
}

/// Howard Hinnant date 算法（避免引入 chrono）
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i32 + (era * 400) as i32;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

// =============================================================================
// 单元测试
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_store() -> UsageStore {
        // 每次测试用临时文件
        let path = std::env::temp_dir().join(format!("usage-test-{}.db", uuid::Uuid::new_v4()));
        let conn = Connection::open(&path).unwrap();
        UsageStore::init_schema(&conn).unwrap();
        UsageStore {
            conn: Mutex::new(conn),
            is_fallback: true,
            fallback_reason: Some("test".to_string()),
        }
    }

    #[test]
    fn record_is_idempotent() {
        let store = fresh_store();
        let now = chrono_like_now_ms();
        let rec = UsageRecordInput {
            client_record_id: "idem-1".into(),
            created_at_ms: now,
            skill_slug: "photoshop-retouch".into(),
            provider_id: "deepseek".into(),
            model: "deepseek-chat".into(),
            tokens_in: 100,
            tokens_out: 50,
            duration_ms: 1200,
            cost_estimate: Some(0.0001),
            source: "LOCAL_DESKTOP".into(),
            session_kind: "user".into(),
            session_id: Some("user-1".into()),
        };
        assert!(store.record(rec.clone()).unwrap(), "第一次应真插入");
        assert!(!store.record(rec.clone()).unwrap(), "第二次应幂等命中");
        let summary = store.summarize("7d").unwrap();
        assert_eq!(summary.total_calls, 1);
    }

    #[test]
    fn summarize_groups_correctly() {
        let store = fresh_store();
        let now = chrono_like_now_ms();
        for (i, slug) in ["photoshop-retouch", "vscode-debug", "photoshop-retouch"].iter().enumerate() {
            store
                .record(UsageRecordInput {
                    client_record_id: format!("g-{}", i),
                    created_at_ms: now,
                    skill_slug: slug.to_string(),
                    provider_id: if i % 2 == 0 { "deepseek".into() } else { "openai".into() },
                    model: "x".into(),
                    tokens_in: 10,
                    tokens_out: 5,
                    duration_ms: 100,
                    cost_estimate: Some(0.001),
                    source: "LOCAL_DESKTOP".into(),
                    session_kind: "user".into(),
                    session_id: None,
                })
                .unwrap();
        }
        let summary = store.summarize("7d").unwrap();
        assert_eq!(summary.total_calls, 3);
        assert_eq!(summary.by_skill.len(), 2);
        assert_eq!(summary.by_provider.len(), 2);
        // 验证按调用数降序
        assert!(summary.by_skill[0].calls >= summary.by_skill[1].calls);
    }

    #[test]
    fn prune_removes_old_records() {
        let store = fresh_store();
        let now = chrono_like_now_ms();
        // 100 天前的记录
        store
            .record(UsageRecordInput {
                client_record_id: "old-1".into(),
                created_at_ms: now - 100 * 86_400_000,
                skill_slug: "x".into(),
                provider_id: "p".into(),
                model: "m".into(),
                tokens_in: 1,
                tokens_out: 1,
                duration_ms: 1,
                cost_estimate: None,
                source: "GUEST_TEST".into(),
                session_kind: "guest".into(),
                session_id: None,
            })
            .unwrap();
        // 今天的记录
        store
            .record(UsageRecordInput {
                client_record_id: "new-1".into(),
                created_at_ms: now,
                skill_slug: "x".into(),
                provider_id: "p".into(),
                model: "m".into(),
                tokens_in: 1,
                tokens_out: 1,
                duration_ms: 1,
                cost_estimate: None,
                source: "GUEST_TEST".into(),
                session_kind: "guest".into(),
                session_id: None,
            })
            .unwrap();
        let n = store.prune_older_than(90).unwrap();
        assert_eq!(n, 1, "应删除 1 条 100 天前的记录");
        let summary = store.summarize("30d").unwrap();
        assert_eq!(summary.total_calls, 1, "应只剩 1 条新记录");
    }

    #[test]
    fn export_csv_contains_bom_and_header() {
        let store = fresh_store();
        let now = chrono_like_now_ms();
        store
            .record(UsageRecordInput {
                client_record_id: "e-1".into(),
                created_at_ms: now,
                skill_slug: "vscode-debug".into(),
                provider_id: "deepseek".into(),
                model: "deepseek-chat".into(),
                tokens_in: 200,
                tokens_out: 100,
                duration_ms: 500,
                cost_estimate: Some(0.0002),
                source: "LOCAL_DESKTOP".into(),
                session_kind: "user".into(),
                session_id: Some("u-1".into()),
            })
            .unwrap();
        let path = std::env::temp_dir().join(format!("usage-export-{}.csv", uuid::Uuid::new_v4()));
        let n = store.export_csv(&path).unwrap();
        assert_eq!(n, 1);
        let bytes = std::fs::read(&path).unwrap();
        assert!(bytes.starts_with(b"\xEF\xBB\xBF"), "应含 UTF-8 BOM");
        let s = String::from_utf8(bytes).unwrap();
        assert!(s.contains("created_at_iso,skill_slug,provider_id"));
        assert!(s.contains("vscode-debug"));
    }

    #[test]
    fn summarize_today_only_includes_today() {
        let store = fresh_store();
        let now = chrono_like_now_ms();
        store
            .record(UsageRecordInput {
                client_record_id: "t-old".into(),
                created_at_ms: now - 5 * 86_400_000, // 5 天前
                skill_slug: "x".into(),
                provider_id: "p".into(),
                model: "m".into(),
                tokens_in: 1,
                tokens_out: 1,
                duration_ms: 1,
                cost_estimate: None,
                source: "GUEST_TEST".into(),
                session_kind: "guest".into(),
                session_id: None,
            })
            .unwrap();
        store
            .record(UsageRecordInput {
                client_record_id: "t-new".into(),
                created_at_ms: now,
                skill_slug: "x".into(),
                provider_id: "p".into(),
                model: "m".into(),
                tokens_in: 1,
                tokens_out: 1,
                duration_ms: 1,
                cost_estimate: None,
                source: "GUEST_TEST".into(),
                session_kind: "guest".into(),
                session_id: None,
            })
            .unwrap();
        let today = store.summarize("today").unwrap();
        assert_eq!(today.total_calls, 1, "today 应只含当天 1 条");
        let seven_d = store.summarize("7d").unwrap();
        assert_eq!(seven_d.total_calls, 2);
    }
}
