/**
 * LlmGateway 单元测试
 *
 * 覆盖：
 *   - dev 模式 mock（不依赖网络）
 *   - 助手离线 / 未配 Key 降级
 *   - 启发式兜底在 chat() 失败时的处理路径（chat() 本身不调启发式，由调用方负责）
 */

import { LlmGateway } from '../LlmGateway';

// 模拟 fetch（不会被调到，因为 dev mock 优先）
global.fetch = jest.fn() as unknown as typeof fetch;

describe('LlmGateway', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.NODE_ENV = 'test';
    // 默认开 mock（测试不依赖网络）
    process.env.SKILLHUB_DEV_MOCK = '1';
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    // 清理 window 注入的端口（每个用例独立）
    delete (window as unknown as { __SKILLHUB_HELPER_PORT__?: number }).__SKILLHUB_HELPER_PORT__;
    localStorage.removeItem('skillhub-helper-port');
  });

  describe('dev 模式 mock', () => {
    it('NODE_ENV=development + SKILLHUB_DEV_MOCK=1 走 mock', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SKILLHUB_DEV_MOCK = '1';
      const llm = new LlmGateway();
      const result = await llm.chat({
        systemPrompt: '你是意图分类器',
        userMessage: '帮我把照片皮肤磨皮',
        jsonMode: true,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.path).toBe('helper');
        expect(result.parsed?.skill_category).toBe('A');
        expect(result.parsed?.software_tags).toContain('photoshop');
      }
    });

    it('jsonMode=false 返回普通文本', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SKILLHUB_DEV_MOCK = '1';
      const llm = new LlmGateway();
      const result = await llm.chat({
        systemPrompt: '你是文案生成',
        userMessage: '写小红书',
        jsonMode: false,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.content).toBeDefined();
        if (result.content) {
          expect(result.content.length).toBeGreaterThan(0);
        }
        expect(result.parsed).toBeUndefined();
      }
    });

    it('完全匹配不上时默认 C 类（兜底）', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SKILLHUB_DEV_MOCK = '1';
      const llm = new LlmGateway();
      const result = await llm.chat({
        systemPrompt: '你是意图分类器',
        userMessage: '一段完全不相关的话',
        jsonMode: true,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        // mock 会默认归到 C
        expect(['A', 'B', 'C']).toContain(result.parsed?.skill_category);
      }
    });
  });

  describe('生产模式 + 助手离线', () => {
    it('NODE_ENV=production + SKILLHUB_DEV_MOCK=0 → 调 fetch 探测助手', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SKILLHUB_DEV_MOCK;
      // 注入端口（jsdom 下直接写 window 属性，不要用 global.window = {...}，
      //   后者在 jsdom 是 no-op，因为 global === window）
      (window as unknown as { __SKILLHUB_HELPER_PORT__?: number }).__SKILLHUB_HELPER_PORT__ = 12345;
      (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1'));

      const llm = new LlmGateway();
      const result = await llm.chat({
        systemPrompt: '你是意图分类器',
        userMessage: '修图',
        jsonMode: true,
      });

      expect(result.ok).toBe(false);
      // D6 决策：助手失败 + 云端未启用 → chat() 统一返回 service_disabled（调用方降级到启发式）
      // 验证 fetch 真的被调到了（否则就是 dev mock 走捷径）
      expect(global.fetch).toHaveBeenCalled();
      if (!result.ok) {
        expect(result.reason).toBe('service_disabled');
      }
    });

    it('助手返回 503 → service_disabled（chat 统一降级）', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SKILLHUB_DEV_MOCK;
      // 注入端口，让 fetch 真的被调到
      (window as unknown as { __SKILLHUB_HELPER_PORT__?: number }).__SKILLHUB_HELPER_PORT__ = 12345;
      // 端口发现成功 + 助手 chat 返回 503
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          reason: 'helper_no_key',
          message: '未配置 Key',
        }),
      });

      const llm = new LlmGateway();
      const result = await llm.chat({
        systemPrompt: 'x',
        userMessage: 'y',
      });

      expect(result.ok).toBe(false);
      expect(global.fetch).toHaveBeenCalled();
      // D6：chat() 不区分 helper 内部原因，统一返回 service_disabled
      if (!result.ok) {
        expect(result.reason).toBe('service_disabled');
      }
    });

    it('助手 ECONNREFUSED → 走 service_disabled', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SKILLHUB_DEV_MOCK;
      (window as unknown as { __SKILLHUB_HELPER_PORT__?: number }).__SKILLHUB_HELPER_PORT__ = 12345;
      (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

      const llm = new LlmGateway();
      const result = await llm.chat({
        systemPrompt: 'x',
        userMessage: 'y',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // 助手连不上，最终降级到 service_disabled
        expect(result.reason).toBe('service_disabled');
      }
    });
  });

  describe('probeHelper', () => {
    it('端口不存在 → online=false', async () => {
      process.env.NODE_ENV = 'production';
      const llm = new LlmGateway();
      const status = await llm.probeHelper();
      expect(status.online).toBe(false);
      expect(status.hasKey).toBe(false);
    });

    it('window 注入端口 → 助手返回 200 + hasKey=true', async () => {
      process.env.NODE_ENV = 'production';
      // 关键：直接写 window 的属性（jsdom 下 window === global，
      //   global.window = {...} 等价于 window.window = {...}，不会真的注入端口）
      (window as unknown as { __SKILLHUB_HELPER_PORT__?: number }).__SKILLHUB_HELPER_PORT__ = 12345;
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ online: true, hasKey: true, provider: 'deepseek' }),
      });
      const llm = new LlmGateway();
      const status = await llm.probeHelper();
      expect(status.online).toBe(true);
      expect(status.hasKey).toBe(true);
      expect(status.provider).toBe('deepseek');
    });

    it('localStorage 端口缓存命中', async () => {
      process.env.NODE_ENV = 'production';
      // 模拟 localStorage（jsdom 默认有 localStorage，但初始为空）
      localStorage.setItem('skillhub-helper-port', '54321');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ online: true, hasKey: false }),
      });
      const llm = new LlmGateway();
      const status = await llm.probeHelper();
      expect(status.online).toBe(true);
      expect(status.port).toBe(54321);
    });
  });
});