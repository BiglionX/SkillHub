# SkillHub A2A 协议集成指南

> **协议版本**: A2A v0.2
> **协议参考**: https://a2a-protocol.org
> **状态**: ✅ SkillHub v3.0+ 已支持

## 1. 概述

SkillHub v3.0 实现了 [A2A (Agent-to-Agent) Protocol](https://a2a-protocol.org)，使其他 AI Agent 能够：

1. **发现 SkillHub 提供的 Skills** - 通过 Agent Card
2. **调用 SkillHub Skills 执行任务** - 通过 Task API
3. **接收任务完成通知** - 通过 Webhook

## 2. 核心端点

### 2.1 Agent Card 发现

```
GET https://skillhub.proclaw.cc/.well-known/agent.json
GET https://skillhub.proclaw.cc/api/a2a/agent-card
```

**响应示例**：

```json
{
  "protocolVersion": "0.2",
  "name": "SkillHub",
  "description": "SkillHub is an open-source, enterprise-grade AI Agent Skills registry...",
  "url": "https://skillhub.proclaw.cc/api/a2a/tasks",
  "provider": {
    "name": "BigLionX",
    "url": "https://github.com/BigLionX"
  },
  "version": "3.0.0",
  "capabilities": [
    { "name": "streaming", "enabled": true },
    { "name": "pushNotifications", "enabled": true },
    { "name": "stateTransitionHistory", "enabled": true },
    { "name": "i18n", "enabled": true }
  ],
  "authentication": {
    "schemes": ["bearer", "oauth2"],
    "credentialsUrl": "https://skillhub.proclaw.cc/auth/oauth",
    "scopes": ["skills:read", "skills:publish", "skills:install"]
  },
  "defaultInputModes": ["text/plain", "application/json"],
  "defaultOutputModes": ["text/plain", "application/json"],
  "skills": [
    {
      "id": "skillhub:pdf-tools",
      "name": "PDF Tools",
      "description": "Generate, manipulate, and analyze PDF documents.",
      "tags": ["pdf", "document"],
      "skillhubSlug": "pdf-tools",
      "examples": ["POST /api/a2a/tasks ..."]
    }
  ],
  "documentationUrl": "https://skillhub.proclaw.cc/docs/integration/a2a",
  "iconUrl": "https://skillhub.proclaw.cc/logo.png"
}
```

### 2.2 创建任务

```
POST /api/a2a/tasks
Content-Type: application/json
```

**请求体**：

```json
{
  "skillSlug": "pdf-tools",
  "messages": [
    {
      "role": "user",
      "parts": [
        {
          "type": "text",
          "text": "Generate a quarterly financial report"
        }
      ]
    }
  ],
  "metadata": {
    "requestId": "req-123"
  },
  "webhookUrl": "https://your-agent.example.com/webhook"
}
```

**响应（201 Created）**：

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "skillSlug": "pdf-tools",
  "state": "pending",
  "messages": [...],
  "artifacts": [],
  "createdAt": "2026-09-30T10:00:00.000Z",
  "updatedAt": "2026-09-30T10:00:00.000Z"
}
```

### 2.3 查询任务

```
GET /api/a2a/tasks/{id}
```

**响应**：

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "state": "completed",
  "messages": [...],
  "artifacts": [
    {
      "name": "result.pdf",
      "mimeType": "application/pdf",
      "parts": [
        { "type": "file", "mimeType": "application/pdf", "data": "..." }
      ]
    }
  ],
  "createdAt": "2026-09-30T10:00:00.000Z",
  "updatedAt": "2026-09-30T10:00:05.123Z"
}
```

### 2.4 发送消息（多轮对话）

```
PATCH /api/a2a/tasks/{id}
Content-Type: application/json
```

**请求体**：

```json
{
  "message": {
    "role": "user",
    "parts": [
      { "type": "text", "text": "Add a chart on page 2" }
    ]
  }
}
```

### 2.5 取消任务

```
POST /api/a2a/tasks/{id}/cancel
```

**响应**：返回更新后的 Task 对象，state = `cancelled`。

### 2.6 列出任务

```
GET /api/a2a/tasks?state=running&skillSlug=pdf-tools&limit=50
```

**查询参数**：
- `state`: pending | running | completed | failed | cancelled | input-required
- `skillSlug`: 按 Skill 过滤
- `limit`: 返回数量上限（1-200，默认 50）

## 3. 任务状态机

```
   pending
      ↓
   running ⇄ input-required
      ↓
   (completed | failed | cancelled)
```

- **pending**: 已创建，等待 Worker 拾取
- **running**: 正在执行
- **input-required**: 需要用户补充输入
- **completed**: 已完成，包含 artifacts
- **failed**: 执行失败，详见 `error` 字段
- **cancelled**: 已被用户取消

## 4. 认证

### 4.1 Bearer Token

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     https://skillhub.proclaw.cc/api/a2a/agent-card
```

获取 Token：访问 [https://skillhub.proclaw.cc/dashboard/settings/api-keys](https://skillhub.proclaw.cc/dashboard/settings/api-keys)

### 4.2 OAuth 2.1

发布和安装操作需要 OAuth 流程：

```
Authorization URL: https://skillhub.proclaw.cc/auth/oauth
Token URL: https://skillhub.proclaw.cc/auth/oauth/token
Scopes: skills:read, skills:publish, skills:install
```

## 5. 集成示例

### 5.1 Python 客户端

```python
import requests

# 1. 发现 SkillHub 能力
agent_card = requests.get(
    "https://skillhub.proclaw.cc/.well-known/agent.json"
).json()

print(f"Available skills: {len(agent_card['skills'])}")

# 2. 创建任务
task = requests.post(
    "https://skillhub.proclaw.cc/api/a2a/tasks",
    headers={"Authorization": "Bearer YOUR_TOKEN"},
    json={
        "skillSlug": "pdf-tools",
        "messages": [
            {
                "role": "user",
                "parts": [{"type": "text", "text": "Hello"}]
            }
        ],
        "webhookUrl": "https://my-app.com/webhook"
    }
).json()

print(f"Task created: {task['id']}")

# 3. 等待完成（Webhook 或轮询）
import time
while True:
    status = requests.get(
        f"https://skillhub.proclaw.cc/api/a2a/tasks/{task['id']}",
        headers={"Authorization": "Bearer YOUR_TOKEN"}
    ).json()

    if status['state'] in ('completed', 'failed', 'cancelled'):
        print(f"Final state: {status['state']}")
        print(f"Artifacts: {status['artifacts']}")
        break

    time.sleep(2)
```

### 5.2 JavaScript / TypeScript 客户端

```typescript
const AGENT_CARD = await fetch(
  'https://skillhub.proclaw.cc/.well-known/agent.json'
).then(r => r.json());

const task = await fetch('https://skillhub.proclaw.cc/api/a2a/tasks', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    skillSlug: 'pdf-tools',
    messages: [{
      role: 'user',
      parts: [{ type: 'text', text: 'Generate PDF' }],
    }],
    webhookUrl: 'https://my-app.com/webhook',
  }),
}).then(r => r.json());

console.log(`Task: ${task.id}`);
```

## 6. 缓存

- `/.well-known/agent.json` 和 `/api/a2a/agent-card`：5 分钟 CDN 缓存
- 任务操作：no-cache（实时性优先）

## 7. 限制

- 每用户最多 100 并发任务
- 任务消息大小限制：1 MB
- 单个 artifact 大小限制：10 MB
- Webhook 超时：10 秒

## 8. 错误处理

错误响应使用标准 HTTP 状态码：

| 状态码 | 含义 |
|---|---|
| 400 | 请求参数无效 |
| 401 | 缺少或无效的认证 |
| 404 | 任务或 Skill 不存在 |
| 409 | 任务状态冲突（如已取消） |
| 429 | 速率限制 |
| 500 | 服务器错误 |

错误响应体：

```json
{
  "error": "TASK_NOT_FOUND",
  "message": "Task not found: xxx",
  "issues": [...]   // 仅 Zod 校验错误时存在
}
```

## 9. 路线图

- [ ] Webhook 签名验证（HMAC）
- [ ] 流式响应（SSE）
- [ ] Task 持久化（PostgreSQL / Redis）
- [ ] 多 Skill 组合任务

---

参考：
- [A2A 协议规范](https://a2a-protocol.org/latest/)
- [SkillHub MCP 集成](https://skillhub.proclaw.cc/docs/integration/mcp)
- [Agent Skills 开放标准](https://agentskills.io)
