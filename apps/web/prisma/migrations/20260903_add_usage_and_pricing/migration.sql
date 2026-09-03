-- v3 M4 新增：用量记录 + 游客会话 + Provider 单价
-- 2026-09-03

-- 1. Provider 单价表（云端权威，桌面端 1 小时缓存）
CREATE TABLE "provider_pricing" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "inputPer1k" DECIMAL(10, 6) NOT NULL,
  "outputPer1k" DECIMAL(10, 6) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_pricing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "provider_pricing_provider_model_effectiveAt_key"
  ON "provider_pricing"("provider", "model", "effectiveAt");
CREATE INDEX "provider_pricing_provider_model_effectiveAt_idx"
  ON "provider_pricing"("provider", "model", "effectiveAt" DESC);

-- 2. 游客会话表（匿名 UUID v4 + 机器指纹）
CREATE TABLE "guest_sessions" (
  "id" TEXT NOT NULL,
  "anonymousId" TEXT NOT NULL,
  "machineFingerprint" TEXT,
  "userId" TEXT,
  "helperVersion" TEXT,
  "osVersion" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bindAt" TIMESTAMP(3),
  CONSTRAINT "guest_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "guest_sessions_anonymousId_key" ON "guest_sessions"("anonymousId");
CREATE INDEX "guest_sessions_userId_idx" ON "guest_sessions"("userId");
CREATE INDEX "guest_sessions_lastSeenAt_idx" ON "guest_sessions"("lastSeenAt" DESC);
CREATE INDEX "guest_sessions_machineFingerprint_idx" ON "guest_sessions"("machineFingerprint");

ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. 用量记录表（每次 LLM 调用）
CREATE TABLE "usage_records" (
  "id" TEXT NOT NULL,
  "guestSessionId" TEXT,
  "userId" TEXT,
  "skillSlug" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "tokensIn" INTEGER NOT NULL DEFAULT 0,
  "tokensOut" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER,
  "costCny" DECIMAL(10, 6),
  "clientRecordId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "path" TEXT DEFAULT 'helper',
  CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "usage_records_clientRecordId_key"
  ON "usage_records"("clientRecordId");
CREATE INDEX "usage_records_userId_occurredAt_idx"
  ON "usage_records"("userId", "occurredAt" DESC);
CREATE INDEX "usage_records_guestSessionId_occurredAt_idx"
  ON "usage_records"("guestSessionId", "occurredAt" DESC);
CREATE INDEX "usage_records_skillSlug_idx" ON "usage_records"("skillSlug");
CREATE INDEX "usage_records_provider_idx" ON "usage_records"("provider");
CREATE INDEX "usage_records_occurredAt_idx" ON "usage_records"("occurredAt" DESC);

ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_guestSessionId_fkey"
  FOREIGN KEY ("guestSessionId") REFERENCES "guest_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. 种子：2026-09 主流 Provider 默认单价（人民币 / 1k tokens）
--    注：仅为占位种子；真实单价由 seed-m4-pricing 脚本或人工调整覆盖
INSERT INTO "provider_pricing" ("id", "provider", "model", "inputPer1k", "outputPer1k", "currency") VALUES
  ('seed-deepseek-chat-v1',     'deepseek', 'deepseek-chat',     0.001000, 0.002000, 'CNY'),
  ('seed-deepseek-reasoner-v1', 'deepseek', 'deepseek-reasoner', 0.004000, 0.016000, 'CNY'),
  ('seed-openai-gpt-4o-mini',   'openai',   'gpt-4o-mini',       0.001500, 0.006000, 'CNY'),
  ('seed-openai-gpt-4o',        'openai',   'gpt-4o',            0.025000, 0.075000, 'CNY'),
  ('seed-zhipu-glm-4-flash',    'zhipu',    'glm-4-flash',       0.000100, 0.000100, 'CNY'),
  ('seed-zhipu-glm-4-plus',     'zhipu',    'glm-4-plus',        0.007000, 0.007000, 'CNY');