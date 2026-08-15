-- Migration: add_agent_skills_standard_support
-- 日期: 2026-06-24
-- 目的: 为 SkillHub v3.0 增加 Agent Skills 开放标准（https://agentskills.io）兼容能力

BEGIN;

-- ============================================================================
-- 1. 扩展 skills 表，添加 Agent Skills 标准字段
-- ============================================================================

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS skill_md_content       TEXT,
  ADD COLUMN IF NOT EXISTS skill_md_frontmatter   JSONB,
  ADD COLUMN IF NOT EXISTS standard_name          VARCHAR(64),
  ADD COLUMN IF NOT EXISTS standard_description   TEXT,
  ADD COLUMN IF NOT EXISTS discovery_keywords     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS agent_skills_version   VARCHAR(16),
  ADD COLUMN IF NOT EXISTS last_analyzed_at       TIMESTAMPTZ;

-- 添加索引以加速发现端点查询
CREATE INDEX IF NOT EXISTS idx_skills_standard_name
  ON skills(standard_name)
  WHERE standard_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_skills_agent_skills_version
  ON skills(agent_skills_version)
  WHERE agent_skills_version IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_skills_discovery_keywords
  ON skills USING GIN(discovery_keywords);

-- ============================================================================
-- 2. 新增 skill_resources 表（存储 scripts/references/assets）
-- ============================================================================

CREATE TABLE IF NOT EXISTS skill_resources (
  id          TEXT PRIMARY KEY,
  skill_id    TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,

  type        TEXT NOT NULL CHECK (type IN ('script', 'reference', 'asset', 'other')),
  path        TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL CHECK (size_bytes >= 0),
  mime_type   TEXT,
  checksum    TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(skill_id, path)
);

CREATE INDEX IF NOT EXISTS idx_skill_resources_skill_id
  ON skill_resources(skill_id);

CREATE INDEX IF NOT EXISTS idx_skill_resources_skill_type
  ON skill_resources(skill_id, type);

-- updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION update_skill_resources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_skill_resources_updated_at ON skill_resources;
CREATE TRIGGER trg_skill_resources_updated_at
  BEFORE UPDATE ON skill_resources
  FOR EACH ROW
  EXECUTE FUNCTION update_skill_resources_updated_at();

-- ============================================================================
-- 3. 注释
-- ============================================================================

COMMENT ON COLUMN skills.skill_md_content IS
  'SKILL.md 完整内容（Agent Skills 开放标准）';
COMMENT ON COLUMN skills.skill_md_frontmatter IS
  '解析后的 YAML frontmatter（用于快速访问）';
COMMENT ON COLUMN skills.standard_name IS
  '标准 name（与 frontmatter.name 一致，用于 Agent 渐进式披露）';
COMMENT ON COLUMN skills.standard_description IS
  '标准 description（用于 Agent 渐进式披露）';
COMMENT ON COLUMN skills.discovery_keywords IS
  '用于 Agent 发现的关键词列表';
COMMENT ON COLUMN skills.agent_skills_version IS
  '兼容的 Agent Skills 协议版本（如 "1.0"）';

COMMENT ON TABLE skill_resources IS
  'Agent Skills 标准的 scripts/references/assets 资源表';

COMMIT;