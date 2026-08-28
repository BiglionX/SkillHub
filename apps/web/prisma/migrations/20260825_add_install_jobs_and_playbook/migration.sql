-- v3 M2 新增：安装任务 + 剧本定义 + 用户软件路径库
-- 2026-08-25

-- 1. 枚举：安装任务状态
CREATE TYPE "InstallStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
);

-- 2. 枚举：剧本来源（内置 vs 发布者声明）
CREATE TYPE "PlaybookSource" AS ENUM (
  'BUILTIN',
  'PUBLISHER'
);

-- 3. 安装任务
CREATE TABLE "install_jobs" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "slug" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "playbookId" TEXT NOT NULL,
  "playbookSource" "PlaybookSource" NOT NULL,
  "status" "InstallStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "totalDurationMs" INTEGER,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "install_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "install_jobs_userId_slug_idx" ON "install_jobs"("userId", "slug");
CREATE INDEX "install_jobs_status_createdAt_idx" ON "install_jobs"("status", "createdAt");
CREATE INDEX "install_jobs_slug_idx" ON "install_jobs"("slug");

-- 4. 安装任务事件（每个 step 的开始/完成/失败）
CREATE TABLE "install_events" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "stepId" TEXT,
  "stepType" TEXT,
  "eventType" TEXT NOT NULL,
  "payload" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "install_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "install_events_jobId_occurredAt_idx" ON "install_events"("jobId", "occurredAt");
CREATE INDEX "install_events_eventType_idx" ON "install_events"("eventType");

ALTER TABLE "install_events" ADD CONSTRAINT "install_events_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "install_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. 剧本定义（含 YAML 源）
CREATE TABLE "playbook_definitions" (
  "id" TEXT NOT NULL,
  "software" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "source" "PlaybookSource" NOT NULL,
  "skillSlug" TEXT,
  "yaml" TEXT NOT NULL,
  "schemaHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "playbook_definitions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playbook_definitions_software_version_idx" ON "playbook_definitions"("software", "version");
CREATE INDEX "playbook_definitions_skillSlug_idx" ON "playbook_definitions"("skillSlug");

-- 6. 用户软件路径库（手动补位 + 助手扫描共用）
CREATE TABLE "user_software_paths" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "software" TEXT NOT NULL,
  "pathHash" TEXT NOT NULL,
  "pathCipher" TEXT NOT NULL,
  "version" TEXT,
  "isManual" BOOLEAN NOT NULL DEFAULT false,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_software_paths_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_software_paths_userId_software_key" ON "user_software_paths"("userId", "software");

-- 7. 种子：5 个内置剧本元数据（用于 /api/v2/install/jobs 查询）
INSERT INTO "playbook_definitions" ("id", "software", "version", "source", "yaml", "schemaHash") VALUES
  ('photoshop-plugin@v1', 'photoshop', '1.0.0', 'BUILTIN', '<!-- 内置，YAML 见 apps/helper/resources/playbooks/photoshop-plugin.yml -->', 'sha256:placeholder1'),
  ('vscode-extension@v1', 'vscode', '1.0.0', 'BUILTIN', '<!-- 内置 -->', 'sha256:placeholder2'),
  ('blender-addon@v1', 'blender', '1.0.0', 'BUILTIN', '<!-- 内置 -->', 'sha256:placeholder3'),
  ('excel-automation@v1', 'excel', '1.0.0', 'BUILTIN', '<!-- 内置 -->', 'sha256:placeholder4'),
  ('powerpoint-template@v1', 'powerpoint', '1.0.0', 'BUILTIN', '<!-- 内置 -->', 'sha256:placeholder5');