-- v3 M1 新增：交付物类型（A/B/C）+ 意图/软件标签 + 用户已装软件
-- 2026-08-15

-- 1. 枚举类型
CREATE TYPE "SkillDeliveryCategory" AS ENUM (
  'ENVIRONMENT_DEPENDENT',
  'OAUTH_AUTHORIZED',
  'CONTENT_GENERATION'
);

-- 2. Skill 表加两个字段
ALTER TABLE "skills" ADD COLUMN "deliveryCategory" "SkillDeliveryCategory";
ALTER TABLE "skills" ADD COLUMN "llmConfig" JSONB;

CREATE INDEX "skills_deliveryCategory_idx" ON "skills"("deliveryCategory");

-- 3. 意图标签
CREATE TABLE "intent_tags" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "labelZh" TEXT NOT NULL,
  "category" "SkillDeliveryCategory",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "intent_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "intent_tags_name_key" ON "intent_tags"("name");
CREATE INDEX "intent_tags_category_idx" ON "intent_tags"("category");

-- 4. 软件标签
CREATE TABLE "software_tags" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "labelZh" TEXT NOT NULL,
  "icon" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "software_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "software_tags_name_key" ON "software_tags"("name");

-- 5. Skill ↔ IntentTag 多对多
CREATE TABLE "skill_intent_tags" (
  "skillId" TEXT NOT NULL,
  "intentTagId" TEXT NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "skill_intent_tags_pkey" PRIMARY KEY ("skillId", "intentTagId")
);
CREATE INDEX "skill_intent_tags_intentTagId_idx" ON "skill_intent_tags"("intentTagId");

ALTER TABLE "skill_intent_tags" ADD CONSTRAINT "skill_intent_tags_skillId_fkey"
  FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_intent_tags" ADD CONSTRAINT "skill_intent_tags_intentTagId_fkey"
  FOREIGN KEY ("intentTagId") REFERENCES "intent_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Skill ↔ SoftwareTag 多对多
CREATE TABLE "skill_software_tags" (
  "skillId" TEXT NOT NULL,
  "softwareTagId" TEXT NOT NULL,
  CONSTRAINT "skill_software_tags_pkey" PRIMARY KEY ("skillId", "softwareTagId")
);
CREATE INDEX "skill_software_tags_softwareTagId_idx" ON "skill_software_tags"("softwareTagId");

ALTER TABLE "skill_software_tags" ADD CONSTRAINT "skill_software_tags_skillId_fkey"
  FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_software_tags" ADD CONSTRAINT "skill_software_tags_softwareTagId_fkey"
  FOREIGN KEY ("softwareTagId") REFERENCES "software_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. 用户已装软件
CREATE TABLE "user_installed_software" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "softwareTagId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "version" TEXT,
  "helperPort" INTEGER,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_installed_software_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_installed_software_userId_softwareTagId_key"
  ON "user_installed_software"("userId", "softwareTagId");
CREATE INDEX "user_installed_software_userId_idx" ON "user_installed_software"("userId");

-- 8. 种子数据：常用意图标签
INSERT INTO "intent_tags" ("id", "name", "labelZh", "category") VALUES
  ('it_content_write', 'content-write', '内容写作', 'CONTENT_GENERATION'),
  ('it_meeting_summary', 'meeting-summary', '会议纪要', 'CONTENT_GENERATION'),
  ('it_summarize', 'summarize', '内容摘要', 'CONTENT_GENERATION'),
  ('it_translate', 'translate', '翻译', 'CONTENT_GENERATION'),
  ('it_ppt_generate', 'ppt-generate', 'PPT 生成', 'CONTENT_GENERATION'),
  ('it_report_write', 'report-write', '报告撰写', 'CONTENT_GENERATION'),
  ('it_content_polish', 'content-polish', '文案润色', 'CONTENT_GENERATION'),
  ('it_image_retouch', 'image-retouch', '图片精修', 'ENVIRONMENT_DEPENDENT'),
  ('it_image_process', 'image-process', '图片处理', 'ENVIRONMENT_DEPENDENT'),
  ('it_code_diagnose', 'code-diagnose', '代码诊断', 'ENVIRONMENT_DEPENDENT'),
  ('it_code_tool', 'code-tool', '代码工具', 'ENVIRONMENT_DEPENDENT'),
  ('it_3d_tool', '3d-tool', '3D 工具', 'ENVIRONMENT_DEPENDENT'),
  ('it_data_tool', 'data-tool', '数据工具', 'ENVIRONMENT_DEPENDENT'),
  ('it_design_tool', 'design-tool', '设计工具', 'ENVIRONMENT_DEPENDENT'),
  ('it_doc_sync', 'doc-sync', '文档同步', 'OAUTH_AUTHORIZED'),
  ('it_feishu_integration', 'feishu-integration', '飞书集成', 'OAUTH_AUTHORIZED'),
  ('it_notion_integration', 'notion-integration', 'Notion 集成', 'OAUTH_AUTHORIZED'),
  ('it_email_handle', 'email-handle', '邮件处理', 'OAUTH_AUTHORIZED'),
  ('it_data_archive', 'data-archive', '数据归档', 'OAUTH_AUTHORIZED'),
  ('it_data_sync', 'data-sync', '数据同步', 'OAUTH_AUTHORIZED');

-- 9. 种子数据：常用软件标签
INSERT INTO "software_tags" ("id", "name", "labelZh", "icon") VALUES
  ('st_photoshop', 'photoshop', 'Photoshop', '🎨'),
  ('st_vscode', 'vscode', 'VS Code', '💻'),
  ('st_blender', 'blender', 'Blender', '🎬'),
  ('st_excel', 'excel', 'Excel', '📊'),
  ('st_powerpoint', 'powerpoint', 'PowerPoint', '📽️'),
  ('st_figma', 'figma', 'Figma', '🎯'),
  ('st_feishu', 'feishu', '飞书', '🪶'),
  ('st_notion', 'notion', 'Notion', '📝'),
  ('st_gmail', 'gmail', 'Gmail', '📧'),
  ('st_calendar', 'calendar', '日历', '📅');