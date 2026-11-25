/**
 * 基于行为特征的内容质量 / 安全信号检测
 *
 * 本模块只识别「客观危险或低质量」的技术模式，不做任何主题、立场或观点判断：
 *  - 危险 shell 命令（curl | sh、rm -rf / 等）
 *  - 凭据诱导 / 钓鱼式外链（在文档中要求提供密码、token 并外发）
 *  - 垃圾内容（关键词堆砌、重复刷屏）
 *
 * 命中结果供入库门禁与人工审核参考，不直接删除数据。
 */

export type SignalSeverity = 'high' | 'medium' | 'low';

export interface QualitySignal {
  code: string;
  severity: SignalSeverity;
  detail: string;
}

export interface QualitySignalsReport {
  /** 未命中任何 high 级信号时为 true。 */
  safe: boolean;
  signals: QualitySignal[];
}

/** 危险 shell 模式：命中即 high。 */
const DANGEROUS_COMMAND_PATTERNS: Array<{ code: string; pattern: RegExp; detail: string }> = [
  {
    code: 'PIPE_TO_SHELL',
    pattern: /(?:curl|wget)\b[^\n|]*\|\s*(?:ba)?sh\b/i,
    detail: '从网络下载内容后直接管道执行 shell',
  },
  {
    code: 'RECURSIVE_ROOT_DELETE',
    pattern: /\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~\/\*|\/\*)(?=\s|$)/i,
    detail: '递归强制删除根目录或家目录',
  },
  {
    code: 'REVERSE_SHELL',
    pattern: /\bnc\b[^\n]*-[a-z]*e\s+\/bin\/(?:ba)?sh\b|\bbash\s+-i\s+>&\s*\/dev\/tcp/i,
    detail: '反弹 shell 连接',
  },
  {
    code: 'CREDENTIAL_EXFIL',
    pattern: /(?:env|printenv|cat\s+~?\/\.?(?:aws|ssh|npm|env)\w*)[^\n]*[|>]\s*(?:curl|wget|nc\b)/i,
    detail: '将环境变量或凭据文件外发到网络',
  },
];

/** 凭据诱导：要求用户交出敏感信息并配合外部地址。 */
const CREDENTIAL_PROMPT_PATTERNS: RegExp[] = [
  /(?:请输入|provide|enter|paste)\s+(?:your\s+)?(?:api\s*key|password|passwd|private\s*key|secret|token)\b/i,
  /(?:password|api\s*key|private\s*key|secret|token)\b[^\n]{0,60}(?:发送到|send\s+to|post\s+to|upload\s+to)\b/i,
];

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

/** 判断文本中是否存在关键词堆砌。 */
function hasKeywordStuffing(text: string): boolean {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z\u4e00-\u9fa5]+/)
    .filter((token) => token.length >= 1);

  if (tokens.length < 20) return false;

  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }

  // 任一非停用词占全部 token 的 25% 以上，视为堆砌。
  const stopWords = new Set(['a', 'i', 'the', 'and', 'for', 'with', 'this', 'that', 'from', 'you', '的', '了', '和', '是', '在', '有']);
  for (const [token, count] of freq) {
    if (!stopWords.has(token) && count / tokens.length > 0.25) return true;
  }
  return false;
}

/**
 * 检测给定文本的客观质量 / 安全信号。
 */
export function inspectQualitySignals(text: string | null | undefined): QualitySignalsReport {
  const content = text ?? '';
  const signals: QualitySignal[] = [];

  if (content.trim().length === 0) {
    return { safe: true, signals };
  }

  for (const { code, pattern, detail } of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(content)) {
      signals.push({ code, severity: 'high', detail });
    }
  }

  // 凭据诱导必须与外链同时出现才计为可疑，降低误报。
  const hasExternalUrl = (content.match(URL_PATTERN) ?? []).length > 0;
  if (hasExternalUrl && CREDENTIAL_PROMPT_PATTERNS.some((p) => p.test(content))) {
    signals.push({
      code: 'CREDENTIAL_PROMPT_WITH_EXTERNAL_URL',
      severity: 'high',
      detail: '文档中同时出现凭据索取与外部地址',
    });
  }

  if (hasKeywordStuffing(content)) {
    signals.push({
      code: 'KEYWORD_STUFFING',
      severity: 'low',
      detail: '文本存在关键词堆砌',
    });
  }

  const hasHigh = signals.some((s) => s.severity === 'high');
  return { safe: !hasHigh, signals };
}

/**
 * 汇总一个技能的所有可检视文本。
 */
export function collectInspectableText(input: {
  name?: string | null;
  description?: string | null;
  readme?: string | null;
  skillMdContent?: string | null;
  tags?: string[] | null;
}): string {
  return [
    input.name ?? '',
    input.description ?? '',
    input.readme ?? '',
    input.skillMdContent ?? '',
    (input.tags ?? []).join(' '),
  ].join('\n');
}
