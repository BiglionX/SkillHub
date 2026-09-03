/**
 * LlmGateway — SkillHub v3 LLM 接入网关（v2.0.2 决策 D6）
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │ 占位说明（2026-08 D6 决策）                                      │
 * │ - 默认走「用户本地 Key + 助手转发」链路                           │
 * │ - 本文件保留云端直连 hook，但 useCloudFallback=false 默认不启用    │
 * │ - 未来若启用云端托管，把 useCloudFallback 改 true 即可           │
 * └────────────────────────────────────────────────────────────────┘
 *
 * 当前链路：
 *   1. chat() 先尝试调本地助手本机 HTTP（127.0.0.1:{port}）
 *   2. 助手在线 + 已配 Key → 转发成功（用户自费 LLM Provider）
 *   3. 助手离线 / 未配 Key → 抛 SERVICE_DISABLED，调用方降级到启发式
 *
 * 端口发现策略：
 *   - 浏览器侧：window.__SKILLHUB_HELPER_PORT__（助手唤起时由协议回调注入）
 *   - 服务端侧：从数据库 UserInstalledSoftware.helperPort 读（用户最近一次唤起时上报）
 */

interface LlmChatRequest {
  systemPrompt: string;
  userMessage: string;
  jsonMode?: boolean;
  detectedSoftware?: string[]; // 注入到 prompt 上下文
  temperature?: number;
  maxTokens?: number;
}

interface LlmChatOk {
  ok: true;
  content?: string; // 原始文本（C 类生成用）
  parsed?: {
    software_tags: string[];
    intent_tags: string[];
    skill_category?: 'A' | 'B' | 'C';
    confidence: number;
  };
  path: 'helper' | 'cloud';
  tokensUsed?: number;
  durationMs?: number;
}

interface LlmChatErr {
  ok: false;
  reason: 'helper_offline' | 'helper_no_key' | 'helper_timeout' | 'service_disabled';
  message: string;
}

export class LlmGateway {
  private useCloudFallback = false; // 🔒 占位开关
  /**
   * dev 模式占位：未配置助手 / Key 时返回一段示例文本
   * 用途：让开发环境能跑通端到端流程，方便前端调试 + SFTSR 联调
   * 生产环境永远 false（必须真实助手转发）
   */
  private readonly devMockEnabled =
    process.env.NODE_ENV !== 'production' &&
    (process.env.SKILLHUB_DEV_MOCK === '1' ||
      process.env.SKILLHUB_DEV_MOCK === 'true' ||
      process.env.NEXT_PUBLIC_SKILLHUB_DEV_MOCK === '1');

  async chat(req: LlmChatRequest): Promise<LlmChatOk | LlmChatErr> {
    // 0. dev 模式 mock（仅在开发时启用，不影响生产）
    if (this.devMockEnabled) {
      return this.devMockRespond(req);
    }

    // 1. 助手转发（默认路径）
    const helperResult = await this.tryHelperProxy(req);
    if (helperResult.ok) return helperResult;

    // 2. 云端直连（占位，默认抛 SERVICE_DISABLED）
    if (this.useCloudFallback) {
      // const cloudResult = await this.callCloudLlm(req);
      // return cloudResult;
      // 🔒 当前未启用
    }

    return {
      ok: false,
      reason: 'service_disabled',
      message: '云端 LLM 服务当前未启用（v2.0.2），请配置桌面助手 LLM Key',
    };
  }

  /**
   * dev 模式占位实现：返回基于用户输入的伪内容
   * 不调任何网络，纯本地，用于前端调试
   */
  private devMockRespond(req: LlmChatRequest): LlmChatOk {
    const userText = req.userMessage;
    const systemText = req.systemPrompt;

    // 模拟响应（json 模式 vs 普通模式）
    let content: string;
    if (req.jsonMode) {
      // 意图解析 mock：基于 userText 的关键词
      const lower = userText.toLowerCase();
      const isA = /修图|磨皮|滤镜|ps|photoshop|vscode|插件|调试|blender|excel|ppt|figma/.test(lower);
      const isB = /飞书|notion|同步|邮件|归档|oauth/.test(lower);
      const isC = /文案|写作|小红书|朋友圈|纪要|总结|翻译|ppt生成|写报告|润色/.test(lower);

      const skillCategory = isA ? 'A' : isB ? 'B' : isC ? 'C' : 'C';

      const softwareTags: string[] = [];
      if (/ps|photoshop|磨皮|滤镜|修图/.test(lower)) softwareTags.push('photoshop');
      if (/vscode|调试|插件/.test(lower)) softwareTags.push('vscode');
      if (/blender/.test(lower)) softwareTags.push('blender');
      if (/excel/.test(lower)) softwareTags.push('excel');
      if (/ppt|powepoint/.test(lower)) softwareTags.push('powerpoint');
      if (/飞书/.test(lower)) softwareTags.push('feishu');
      if (/notion/.test(lower)) softwareTags.push('notion');

      const intentTags: string[] = [];
      if (isA) intentTags.push('image-retouch');
      if (isB) intentTags.push('doc-sync');
      if (isC) intentTags.push('content-write');

      content = JSON.stringify({
        software_tags: softwareTags,
        intent_tags: intentTags,
        skill_category: skillCategory,
        confidence: 0.75,
      });
    } else {
      // C 类生成 mock：基于 topic 参数
      const topicMatch = systemText.match(/topic[:：]\s*(.+)/i);
      const topic = topicMatch ? topicMatch[1].trim() : userText;
      content = `# ${topic}\n\n（这是开发环境的占位输出。要看真实效果，请安装 SkillHub 桌面助手并填入 LLM Key。）\n\n## 这里原本应该有一段生成的文案\n\n比如，如果主题是「618 母婴好物」，那这里应该会出现：\n\n1. 奶瓶消毒器推荐\n2. 婴儿背带推荐\n3. ...\n\n但在 dev mock 模式下，我们只返回这段说明文本。\n\n**当前状态**：\n- 助手未运行\n- 或未配置 LLM Key\n\n**如何解除 mock**：\n1. 设置环境变量 \`SKILLHUB_DEV_MOCK=0\`\n2. 启动 SkillHub Helper 桌面客户端\n3. 在助手设置页填入您的 LLM Key`;
    }

    return {
      ok: true,
      content,
      parsed: req.jsonMode
        ? (JSON.parse(content) as {
            software_tags: string[];
            intent_tags: string[];
            skill_category?: 'A' | 'B' | 'C';
            confidence: number;
          })
        : undefined,
      path: 'helper',
      tokensUsed: content.length,
      durationMs: 50,
    };
  }

  /**
   * 调本地助手本机 HTTP 转发 LLM
   * 失败 / 离线 / 未配 Key 时返回 ok:false，调用方降级
   */
  private async tryHelperProxy(req: LlmChatRequest): Promise<LlmChatOk | LlmChatErr> {
    const port = await this.discoverHelperPort();
    if (!port) {
      return {
        ok: false,
        reason: 'helper_offline',
        message: '桌面助手未运行或端口未发现',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3 秒超时

    try {
      const res = await fetch(`http://127.0.0.1:${port}/llm/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: req.systemPrompt,
          userMessage: req.userMessage,
          jsonMode: req.jsonMode ?? true,
          detectedSoftware: req.detectedSoftware,
          temperature: req.temperature ?? 0.1,
          maxTokens: req.maxTokens ?? 500,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        return {
          ok: false,
          reason: body.reason || 'helper_no_key',
          message: body.message || '助手未配置 LLM Key',
        };
      }

      if (!res.ok) {
        return {
          ok: false,
          reason: 'helper_offline',
          message: `助手返回 ${res.status}`,
        };
      }

      const data = await res.json();
      return {
        ok: true,
        content: data.content,
        parsed: data.parsed,
        path: 'helper',
        tokensUsed: data.tokensUsed,
        durationMs: data.durationMs,
      };
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          ok: false,
          reason: 'helper_timeout',
          message: '助手转发超时（>3s）',
        };
      }
      return {
        ok: false,
        reason: 'helper_offline',
        message: err instanceof Error ? err.message : '助手连接失败',
      };
    }
  }

  /**
   * 端口发现策略（M2 升级）：
   *   1. 优先从全局读 window 注入（M1 浏览器侧最快路径）
   *   2. 兜底从 localStorage 读（助手唤起时存储）
   *   3. 扫描常见端口范围探测助手（新增）
   */
  private async discoverHelperPort(): Promise<number | null> {
    if (typeof window !== 'undefined') {
      // 1. window 注入
      const w = window as unknown as { __SKILLHUB_HELPER_PORT__?: number };
      if (w.__SKILLHUB_HELPER_PORT__) return w.__SKILLHUB_HELPER_PORT__;

      // 2. localStorage 缓存
      const stored = localStorage.getItem('skillhub-helper-port');
      if (stored) {
        const port = parseInt(stored, 10);
        if (!isNaN(port) && port > 0) return port;
      }

      // 3. 端口扫描（开发环境助手通常占用 39000-39099）
      if (process.env.NODE_ENV !== 'production') {
        const scanned = await this.scanCommonPorts();
        if (scanned) {
          localStorage.setItem('skillhub-helper-port', String(scanned));
          return scanned;
        }
      }
    }
    return null;
  }

  /**
   * 扫描常见端口范围，探测助手 /llm/discover 端点
   * 每个请求 500ms 超时，串行避免性能问题
   */
  private async scanCommonPorts(): Promise<number | null> {
    // 助手使用 portpicker 选择端口，但会尽量选在 39000-39099 范围
    // 也覆盖常见的 8080/8000 等（开发环境）
    const candidates = [
      ...range(39000, 39100, 5), // 助手默认区间
      3001, 3002, 4567, 8080, 8000, 5173,
    ];

    for (const port of candidates) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 500);
        const res = await fetch(`http://127.0.0.1:${port}/llm/discover`, {
          signal: controller.signal,
          mode: 'cors',
        });
        clearTimeout(t);
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.name === 'SkillHub Helper') {
            return port;
          }
        }
      } catch {
        // continue
      }
    }
    return null;
  }

  /**
   * 探测助手是否在线 + 是否配置了 Key（前端用，决定是否弹引导）
   */
  async probeHelper(): Promise<{
    online: boolean;
    hasKey: boolean;
    provider?: string;
    port?: number;
  }> {
    const port = await this.discoverHelperPort();
    if (!port) return { online: false, hasKey: false };

    // 用 AbortController（不用 AbortSignal.timeout，保证与 tryHelperProxy 一致 + 兼容 jsdom）
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/llm/status`, {
        signal: controller.signal,
      });
      if (!res.ok) return { online: true, hasKey: false };
      const data = await res.json();
      return {
        online: true,
        hasKey: !!data.hasKey,
        provider: data.provider,
        port,
      };
    } catch {
      return { online: false, hasKey: false };
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * 类型扩展：浏览器侧挂载的助手端口
 */
declare global {
  interface Window {
    __SKILLHUB_HELPER_PORT__?: number;
  }
}

export const llmGateway = new LlmGateway();
export type { LlmChatRequest, LlmChatOk, LlmChatErr };

/**
 * 生成 [start, end) 的等差数列，步长 step
 */
function range(start: number, end: number, step: number): number[] {
  const result: number[] = [];
  for (let i = start; i < end; i += step) {
    result.push(i);
  }
  return result;
}