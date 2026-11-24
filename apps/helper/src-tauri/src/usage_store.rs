//! M4：本地用量 SQLite 存储
//!
//! 写入：`UsageStore::record(rec)`，按 `client_record_id` 幂等去重
//! 读取：`summarize(range)` / `count_today_guest()`
//! 维护：`prune_older_than(90)` 90 天滚动清理 + `export_csv()` Excel 可直接打开
//! （启动自动清理由 lib.rs 调用 `prune_older_than`，本模块不自行起后台任务）
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

/// 已安装技能清单条目（桌面端「我的技能」展示用）。
/// serde 字段保持蛇形命名，供前端 invoke 直接序列化。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledSkill {
    pub slug: String,
    pub name: String,
    pub software: String,
    pub installed_at_ms: i64,
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
                    restrict_db_permissions(&primary);
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
        // 关键：内存库只能作为最后兜底。签名返回 Self 无法把失败冒泡给调用方，
        // 因此这里不 panic，而是把降级事实完整写进 fallback_reason（含"内存库，数据仅存本次进程"）
        // 并用 log::error 显式告警"数据持久化完全失效"，前端可通过 is_fallback() 拿到并展示警示。
        let (conn, fallback_reason) = match Connection::open(&path) {
            Ok(conn) => {
                restrict_db_permissions(&path);
                log::warn!(
                    "UsageStore fallback 到临时目录成功：{}（主路径不可用，数据持久化不可靠）",
                    path.display()
                );
                (
                    conn,
                    format!("主路径 {} 不可用，已降级到临时目录 {}", primary.display(), path.display()),
                )
            }
            Err(e) => {
                log::error!(
                    "UsageStore 临时目录 fallback 也失败：{}，已降级内存库；数据持久化完全失效，数据仅存本次进程",
                    e
                );
                (
                    Connection::open_in_memory()
                        .unwrap_or_else(|e2| panic!("UsageStore 内存库也开不了：{}", e2)),
                    format!(
                        "主路径 {} 与临时目录 {} 均不可用，已降级内存库，数据仅存本次进程（临时库错误：{}）",
                        primary.display(),
                        path.display(),
                        e
                    ),
                )
            }
        };
        let _ = Self::init_schema(&conn);
        Self {
            conn: Mutex::new(conn),
            is_fallback: true,
            fallback_reason: Some(fallback_reason),
        }
    }

    pub(crate) fn init_schema(conn: &Connection) -> Result<()> {
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
            -- 游客配额：按 UTC 日期 + 匿名 ID 计次，原子 UPSERT 限流（M5 §6.2）
            CREATE TABLE IF NOT EXISTS guest_quota (
                day           TEXT    NOT NULL,
                anonymous_id  TEXT    NOT NULL,
                calls         INTEGER NOT NULL,
                PRIMARY KEY (day, anonymous_id)
            );
            -- 桌面端「我的技能」已安装清单（同 slug 覆盖，幂等）
            CREATE TABLE IF NOT EXISTS installed_skills (
                slug            TEXT    PRIMARY KEY,
                name            TEXT    NOT NULL,
                software        TEXT    NOT NULL,
                installed_at_ms INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_created ON usage_records(created_at_ms);
            CREATE INDEX IF NOT EXISTS idx_skill ON usage_records(skill_slug, created_at_ms);
            CREATE INDEX IF NOT EXISTS idx_provider ON usage_records(provider_id, created_at_ms);
            CREATE INDEX IF NOT EXISTS idx_session ON usage_records(session_id, created_at_ms);
            "#,
        )
        .context("init_schema 失败")?;

        // M5 增量：synced_at_ms 列（null = 未同步）。已存在的库用 ALTER TABLE 补列，
        // 重复执行幂等（PRAGMA table_info 检查）。
        Self::add_column_if_missing(conn, "usage_records", "synced_at_ms", "INTEGER")?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_unsynced ON usage_records(synced_at_ms) WHERE synced_at_ms IS NULL",
            [],
        )?;

        // M8 增量：scan_cache 表（持久化软件扫描结果）。
        // 单行 KV：id 固定为 1；items_json 存 Vec<ScannedSoftware> 的 serde_json 字符串。
        // 选择 JSON 而非逐行：
        //   1) 启动时一次性 deserialize，无须 cursor
        //   2) 写时一次 INSERT OR REPLACE，比 N 行 UPDATE 快
        //   3) schema 演进兼容性（新增字段不动 SQL）
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS scan_cache (
                id              INTEGER PRIMARY KEY CHECK (id = 1),
                items_json      TEXT    NOT NULL,
                last_scan_at_ms INTEGER NOT NULL,
                saved_at_ms     INTEGER NOT NULL
            );
            "#,
        )
        .context("create scan_cache 失败")?;
        Ok(())
    }

    /// M8：从 SQLite 读 scan_cache 单行。
    /// 返回 `(last_scan_at_ms, items_json)`；不存在返回 Ok(None)。
    /// 失败：SQLite 损坏 / 锁竞争 — 返回 Err 由调用方 log + 降级到内存空 cache。
    pub fn load_scan_cache(&self) -> Result<Option<(i64, String)>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
        let mut stmt = conn.prepare("SELECT last_scan_at_ms, items_json FROM scan_cache WHERE id = 1")?;
        let row = stmt
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })?
            .next();
        Ok(row.transpose()?)
    }

    /// M8：写 scan_cache 单行（覆盖式 INSERT OR REPLACE）。
    /// 写入失败 → log warn，不阻断主流程（next loop 会再尝试）。
    pub fn save_scan_cache(
        &self,
        items_json: &str,
        last_scan_at_ms: i64,
    ) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
        let saved_at_ms = chrono_like_now_ms();
        conn.execute(
            "INSERT OR REPLACE INTO scan_cache (id, items_json, last_scan_at_ms, saved_at_ms)
             VALUES (1, ?1, ?2, ?3)",
            params![items_json, last_scan_at_ms, saved_at_ms],
        )?;
        Ok(())
    }

/// M5 helper：检查列是否存在；不存在则 ALTER TABLE ADD COLUMN。
/// rusqlite 没有原生 IF NOT EXISTS for columns，需要读 pragma table_info 判断。
/// 作为 UsageStore 的关联函数，避免 impl 块内 fallback 不到顶层 fn 的解析问题。
fn add_column_if_missing(conn: &Connection, table: &str, column: &str, type_decl: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let exists: bool = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .any(|c| c == column);
    if !exists {
        conn.execute(
            &format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, type_decl),
            [],
        )
        .with_context(|| format!("ALTER TABLE 加列 {} 失败", column))?;
    }
    Ok(())
}

    pub fn is_fallback(&self) -> bool {
        self.is_fallback
    }

    pub fn fallback_reason(&self) -> Option<&str> {
        self.fallback_reason.as_deref()
    }

    /// M8 测试 helper：打开指定路径的 db（不走 open_or_fallback 默认路径）。
    /// 仅 `#[cfg(test)]` 编译进测试 binary。
    #[cfg(test)]
    pub fn open_path_for_test(path: &std::path::Path) -> Self {
        let conn = Connection::open(path).expect("open test db");
        Self::init_schema(&conn).expect("init schema");
        Self {
            conn: Mutex::new(conn),
            is_fallback: false,
            fallback_reason: None,
        }
    }

    /// M8 测试 helper：在已打开的连接上建表（用于 scan_cache 集成测试
    /// 复用同一个 db 文件模拟多次"启动"）。
    #[cfg(test)]
    pub fn init_schema_for_test(conn: &Connection) -> Result<()> {
        Self::init_schema(conn)
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

    /// F22 修复：更新一条已有记录的 cost_estimate。
    /// 前端按 ProviderPricing 单价算好后回传（Rust 端不依赖外部 HTTP）。
    /// 若 record_id 不存在返回 0；存在返回 1。
    pub fn update_cost(&self, client_record_id: &str, cost: f64) -> Result<u64> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
        let n = conn.execute(
            "UPDATE usage_records SET cost_estimate = ?1 WHERE client_record_id = ?2",
            params![cost, client_record_id],
        )?;
        Ok(n as u64)
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
        // guest_quota.day 为 YYYY-MM-DD，可直接字典序比较（与 cutoff 同 UTC 日界）
        let cutoff_day = ms_to_iso(cutoff_ms)[..10].to_string();
        let n = {
            let conn = self
                .conn
                .lock()
                .map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
            let n = conn.execute(
                "DELETE FROM usage_records WHERE created_at_ms < ?1",
                params![cutoff_ms],
            )?;
            // 顺带清理过期配额行，避免 guest_quota 无限累积。
            // 与 usage_records 的 DELETE 共用同一次加锁（不二次 lock，防死锁）。
            conn.execute("DELETE FROM guest_quota WHERE day < ?1", params![cutoff_day])?;
            n
        };
        // WAL 自动 checkpoint；不手动跑（避免二次加锁死锁）
        Ok(n as u64)
    }

    /// M5 §6.2：统计"今日"已记录的用量条数。
    /// "今日"按 UTC 日界（与 `summarize("today")` 一致）。
    /// 计 session_kind='guest' 的所有记录（匿名游客的上限；登录用户不限）。
    /// 返回 i64 直接给 handle_chat 前置判断 `>= 50` 用。
    pub fn count_today_guest(&self) -> Result<i64> {
        let day_start = chrono_like_now_ms() / 86_400_000 * 86_400_000;
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM usage_records
             WHERE created_at_ms >= ?1 AND session_kind = 'guest'",
            params![day_start],
            |row| row.get(0),
        )?;
        Ok(n)
    }

    /// M5 §7.3：取 `synced_at_ms IS NULL` 的记录（用于云端 sync 批量上报）。
    /// 限制 `limit` 条数，避免单次 payload 过大被云端 413 拒绝。
    /// `since_ms` 可选：仅取 `created_at_ms >= since_ms`（典型用法：`now - 7d`）。
    pub fn list_unsynced(&self, since_ms: Option<i64>, limit: u32) -> Result<Vec<UsageRecordInput>> {
        let since = since_ms.unwrap_or(0);
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
        let mut stmt = conn.prepare(
            "SELECT client_record_id, created_at_ms, skill_slug, provider_id, model,
                    tokens_in, tokens_out, duration_ms, cost_estimate, source,
                    session_kind, session_id
             FROM usage_records
             WHERE synced_at_ms IS NULL AND created_at_ms >= ?1
             ORDER BY created_at_ms ASC
             LIMIT ?2",
        )?;
        let rows = stmt
            .query_map(params![since, limit as i64], |row| {
                Ok(UsageRecordInput {
                    client_record_id: row.get(0)?,
                    created_at_ms: row.get(1)?,
                    skill_slug: row.get(2)?,
                    provider_id: row.get(3)?,
                    model: row.get(4)?,
                    tokens_in: row.get::<_, i64>(5)? as u32,
                    tokens_out: row.get::<_, i64>(6)? as u32,
                    duration_ms: row.get::<_, i64>(7)? as u64,
                    cost_estimate: row.get(8)?,
                    source: row.get(9)?,
                    session_kind: row.get(10)?,
                    session_id: row.get(11)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// M5 §7.3：把 `client_record_ids` 列表标记为已同步（synced_at_ms = now）。
    /// 返回真更新的行数（== 传入列表长度时表示全部命中）。
    pub fn mark_synced(&self, client_record_ids: &[String]) -> Result<u64> {
        if client_record_ids.is_empty() {
            return Ok(0);
        }
        let now = chrono_like_now_ms();
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
        let tx = conn.unchecked_transaction()?;
        let mut total = 0u64;
        {
            let mut stmt = tx.prepare(
                "UPDATE usage_records SET synced_at_ms = ?1
                 WHERE client_record_id = ?2 AND synced_at_ms IS NULL",
            )?;
            for id in client_record_ids {
                total += stmt.execute(params![now, id])? as u64;
            }
        }
        tx.commit()?;
        Ok(total)
    }

    /// 游客配额：原子尝试占用一次额度。
    /// `day` 为 UTC 日期（YYYY-MM-DD），从 `chrono_like_now_ms()` 换算。
    /// 同一 `(day, anonymous_id)` 累计调用次数达到 `limit` 后返回 false，超限时不新增记录。
    /// 整段在拿到 mutex 后的单个事务内完成，避免并发超限。
    pub fn try_reserve_guest(&self, anonymous_id: &str, limit: i64) -> anyhow::Result<bool> {
        let day = ms_to_iso(chrono_like_now_ms())[..10].to_string();
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
        let tx = conn.unchecked_transaction()?;
        let changed = {
            let mut stmt = tx.prepare(
                "INSERT INTO guest_quota (day, anonymous_id, calls) VALUES (?1, ?2, 1)
                 ON CONFLICT(day, anonymous_id) DO UPDATE SET calls = calls + 1
                 WHERE guest_quota.calls < ?3",
            )?;
            stmt.execute(params![day, anonymous_id, limit])?
        };
        tx.commit()?;
        Ok(changed > 0)
    }

    /// 列出已安装技能（按安装时间倒序），供桌面端「我的技能」页展示。
    pub fn list_installed_skills(&self) -> anyhow::Result<Vec<InstalledSkill>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
        let mut stmt = conn.prepare(
            "SELECT slug, name, software, installed_at_ms
             FROM installed_skills ORDER BY installed_at_ms DESC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(InstalledSkill {
                    slug: row.get(0)?,
                    name: row.get(1)?,
                    software: row.get(2)?,
                    installed_at_ms: row.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// 写入/覆盖一个已安装技能（同 slug 覆盖，幂等）。
    pub fn record_installed_skill(&self, skill: &InstalledSkill) -> anyhow::Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
        conn.execute(
            "INSERT OR REPLACE INTO installed_skills (slug, name, software, installed_at_ms)
             VALUES (?1, ?2, ?3, ?4)",
            params![skill.slug, skill.name, skill.software, skill.installed_at_ms],
        )?;
        Ok(())
    }

    /// 按 slug 移除一个已安装技能（不存在时不报错）。
    pub fn remove_installed_skill(&self, slug: &str) -> anyhow::Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
        conn.execute("DELETE FROM installed_skills WHERE slug = ?1", params![slug])?;
        Ok(())
    }

    /// 导出 CSV（含 UTF-8 BOM，Excel 直接打开不乱码）
    /// 写入给定路径，返回写入行数
    ///
    /// 锁粒度：仅在锁内 prepare + 查询并把所有行 materialize 到 Vec，
    /// 随即 drop conn（连带 stmt / 行迭代器），CSV 拼装与 fs::write 均在锁外完成，
    /// 不再阻塞并发的 chat 记账。
    pub fn export_csv(&self, path: &PathBuf) -> Result<u64> {
        // 作用域结束即 drop stmt / 行迭代器 / conn（rusqlite 要求 statement 先于 conn 释放）。
        // 锁内只做查询 + materialize，后续 CSV 拼装与文件写入全部在锁外。
        let rows: Vec<(
            i64,
            String,
            String,
            String,
            i64,
            i64,
            i64,
            Option<f64>,
            String,
            String,
            Option<String>,
        )> = {
            let conn = self
                .conn
                .lock()
                .map_err(|e| anyhow::anyhow!("UsageStore 锁失败：{}", e))?;
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
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
            // 显式释放：statement 必须先于 conn drop（rusqlite 借用约束），
            // 保证 mutex 锁在返回前解除，后续 CSV 拼装与 fs::write 在锁外进行。
            drop(stmt);
            drop(conn);
            rows
        }; // 锁已在此释放

        let mut out = Vec::new();
        out.extend_from_slice(b"\xEF\xBB\xBF"); // UTF-8 BOM
        out.extend_from_slice(
            b"created_at_iso,skill_slug,provider_id,model,tokens_in,tokens_out,duration_ms,cost_cny,source,session_kind,session_id\n",
        );
        let mut n: u64 = 0;
        for r in rows {
            let (ts, skill, prov, model, ti, to, dur, cost, src, kind, sid) = r;
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

/// 收紧 usage.db 文件权限到 0600（仅属主可读写）。
/// 仅对数据库文件本身调用，绝不作用于 WAL / SHM 伴随文件。
#[cfg(unix)]
fn restrict_db_permissions(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Err(e) = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)) {
        log::warn!("设置 usage.db 权限 0600 失败（{}）：{}", path.display(), e);
    }
}

/// Windows 无 POSIX 权限位：数据目录位于当前用户档案目录，目录 ACL 继承即可
/// 保证仅当前用户可写，无需也不应在数据库文件上做 chmod 等价操作。
#[cfg(not(unix))]
fn restrict_db_permissions(_path: &std::path::Path) {}

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

pub fn chrono_like_now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Public wrapper for `ms_to_iso`; lets external modules (e.g. cloud sync
/// reporters) reuse the same ISO8601 UTC formatting as `export_csv` without
/// duplicating the Howard Hinnant date math or the `ms_to_iso` plumbing.
pub fn ms_to_iso_public(ms: i64) -> String {
    ms_to_iso(ms)
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

    // ============================================================
    // M5 §6.2 / §7.3 新方法测试
    // ============================================================

    /// 构造一条记录的 helper（避免每个测试重复 boilerplate）
    fn mk_rec(id: &str, session_kind: &str, created_at_ms: i64) -> UsageRecordInput {
        UsageRecordInput {
            client_record_id: id.into(),
            created_at_ms,
            skill_slug: "x".into(),
            provider_id: "deepseek".into(),
            model: "deepseek-chat".into(),
            tokens_in: 1,
            tokens_out: 1,
            duration_ms: 1,
            cost_estimate: None,
            source: "LOCAL_DESKTOP".into(),
            session_kind: session_kind.into(),
            session_id: None,
        }
    }

    #[test]
    fn count_today_guest_filters_user_and_yesterday() {
        let store = fresh_store();
        let now = chrono_like_now_ms();
        // 今天 3 条 guest
        for i in 0..3 {
            store.record(mk_rec(&format!("g-today-{i}"), "guest", now)).unwrap();
        }
        // 今天 2 条 user（**不应被计数**）
        for i in 0..2 {
            store.record(mk_rec(&format!("u-today-{i}"), "user", now)).unwrap();
        }
        // 昨天 5 条 guest（**不应被计数**）
        let yesterday = now - 86_400_000;
        for i in 0..5 {
            store.record(mk_rec(&format!("g-yest-{i}"), "guest", yesterday)).unwrap();
        }
        let n = store.count_today_guest().unwrap();
        assert_eq!(n, 3, "只数 session_kind='guest' 且 created_at_ms 在今日");
    }

    #[test]
    fn list_unsynced_returns_unmarked_records() {
        let store = fresh_store();
        let now = chrono_like_now_ms();
        for i in 0..5 {
            store.record(mk_rec(&format!("u-{i}"), "guest", now)).unwrap();
        }
        // 标记前 2 条为已同步
        let marked = store.mark_synced(&["u-0".into(), "u-1".into()]).unwrap();
        assert_eq!(marked, 2);

        let unsynced = store.list_unsynced(None, 100).unwrap();
        assert_eq!(unsynced.len(), 3, "应剩 3 条未同步");
        // 顺序 ASC：u-2 / u-3 / u-4
        assert_eq!(unsynced[0].client_record_id, "u-2");
        assert_eq!(unsynced[2].client_record_id, "u-4");
    }

    #[test]
    fn list_unsynced_respects_since_ms_and_limit() {
        let store = fresh_store();
        let now = chrono_like_now_ms();
        // 10 条老 + 3 条新
        for i in 0..10 {
            store
                .record(mk_rec(&format!("old-{i}"), "guest", now - 30 * 86_400_000))
                .unwrap();
        }
        for i in 0..3 {
            store.record(mk_rec(&format!("new-{i}"), "guest", now)).unwrap();
        }
        // since = 7 天前 → 只剩 3 条新
        let since = now - 7 * 86_400_000;
        let rows = store.list_unsynced(Some(since), 100).unwrap();
        assert_eq!(rows.len(), 3);
        // limit 限制
        let rows = store.list_unsynced(Some(since), 2).unwrap();
        assert_eq!(rows.len(), 2);
    }

    #[test]
    fn mark_synced_idempotent_and_empty() {
        let store = fresh_store();
        let now = chrono_like_now_ms();
        store.record(mk_rec("only", "guest", now)).unwrap();

        // 第一次标
        assert_eq!(store.mark_synced(&["only".into()]).unwrap(), 1);
        // 第二次标同一条 → 0（WHERE synced_at_ms IS NULL 已过滤）
        assert_eq!(store.mark_synced(&["only".into()]).unwrap(), 0);
        // 空列表 → 0，不报错
        assert_eq!(store.mark_synced(&[]).unwrap(), 0);
    }

    // ============================================================
    // M8 scan_cache 持久化测试
    // ============================================================

    #[test]
    fn load_scan_cache_returns_none_when_empty() {
        let store = fresh_store();
        let result = store.load_scan_cache().unwrap();
        assert!(result.is_none(), "首次启动 SQLite 无 scan_cache 行");
    }

    #[test]
    fn save_then_load_scan_cache_roundtrip() {
        let store = fresh_store();
        let now = chrono_like_now_ms();
        let items_json = r#"[{"tag":"vscode","display":"VS Code","path":"/usr/bin/code"}]"#;
        store.save_scan_cache(items_json, now).unwrap();

        let (loaded_at, loaded_json) = store.load_scan_cache().unwrap().expect("应读到 1 行");
        assert_eq!(loaded_at, now);
        assert_eq!(loaded_json, items_json);
    }

    #[test]
    fn save_scan_cache_overwrites_previous() {
        // M8：无过期策略 → 直接覆盖旧值；第二次 save 后 load 拿新值
        let store = fresh_store();
        store.save_scan_cache(r#"["first"]"#, 1000).unwrap();
        store.save_scan_cache(r#"["second"]"#, 2000).unwrap();
        let (at, json) = store.load_scan_cache().unwrap().unwrap();
        assert_eq!(at, 2000);
        assert_eq!(json, r#"["second"]"#);
    }

    // ============================================================
    // 配额 / 已安装技能 / CSV 锁粒度测试
    // ============================================================

    #[test]
    fn test_try_reserve_guest_limit() {
        let store = fresh_store();
        // limit=2：前两次占用成功，第三次（超限）返回 false 且不新增记录
        assert!(store.try_reserve_guest("anon-x", 2).unwrap());
        assert!(store.try_reserve_guest("anon-x", 2).unwrap());
        assert!(!store.try_reserve_guest("anon-x", 2).unwrap());
        assert!(!store.try_reserve_guest("anon-x", 2).unwrap());
        // 不同匿名 ID 独立计数
        assert!(store.try_reserve_guest("anon-y", 2).unwrap());

        let conn = store.conn.lock().unwrap();
        let calls: i64 = conn
            .query_row(
                "SELECT calls FROM guest_quota WHERE anonymous_id = 'anon-x'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(calls, 2, "超限调用不应增加 calls");
    }

    #[test]
    fn test_installed_skills_crud() {
        let store = fresh_store();
        assert!(store.list_installed_skills().unwrap().is_empty());

        let skill = InstalledSkill {
            slug: "photoshop-retouch".into(),
            name: "PS 修图".into(),
            software: "photoshop".into(),
            installed_at_ms: chrono_like_now_ms(),
        };
        store.record_installed_skill(&skill).unwrap();
        let list = store.list_installed_skills().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].slug, skill.slug);
        assert_eq!(list[0].name, skill.name);
        assert_eq!(list[0].software, skill.software);
        assert_eq!(list[0].installed_at_ms, skill.installed_at_ms);

        // 同 slug 覆盖（幂等写入）
        let updated = InstalledSkill {
            name: "PS 修图 v2".into(),
            installed_at_ms: skill.installed_at_ms + 1000,
            ..skill.clone()
        };
        store.record_installed_skill(&updated).unwrap();
        let list = store.list_installed_skills().unwrap();
        assert_eq!(list.len(), 1, "同 slug 应覆盖而非新增");
        assert_eq!(list[0].name, "PS 修图 v2");

        store.remove_installed_skill(&skill.slug).unwrap();
        assert!(store.list_installed_skills().unwrap().is_empty());
        // 删除不存在的 slug 不报错
        store.remove_installed_skill("nope").unwrap();
    }

    #[test]
    fn test_export_csv_does_not_hold_lock() {
        let store = fresh_store();
        let now = chrono_like_now_ms();
        for i in 0..3 {
            store.record(mk_rec(&format!("csv-{i}"), "guest", now)).unwrap();
        }
        let path =
            std::env::temp_dir().join(format!("usage-export-lock-{}.csv", uuid::Uuid::new_v4()));
        let n = store.export_csv(&path).unwrap();
        assert_eq!(n, 3);

        let bytes = std::fs::read(&path).unwrap();
        assert!(bytes.starts_with(b"\xEF\xBB\xBF"), "应含 UTF-8 BOM");
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.contains("created_at_iso,skill_slug,provider_id"));
        assert_eq!(text.lines().count(), 4, "表头 1 行 + 数据 3 行");
        assert_eq!(text.matches("deepseek-chat").count(), 3, "应有 3 行数据");

        // 导出返回后锁应已释放：继续记账不阻塞
        assert!(store.record(mk_rec("csv-after", "guest", now)).unwrap());
    }
}
