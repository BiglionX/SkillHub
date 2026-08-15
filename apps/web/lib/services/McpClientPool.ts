/**
 * MCP Client 服务
 *
 * 让 SkillHub 可作为 MCP Client 调用其他 MCP Servers
 * 复用 @modelcontextprotocol/sdk 提供的 Client
 *
 * 核心能力：
 * - 连接外部 MCP Server（stdio/HTTP）
 * - 列出工具（ListTools）
 * - 调用工具（CallTool）
 * - 连接管理（缓存、超时、并发控制）
 *
 * 使用场景：
 * - Agent 在 SkillHub 内执行外部 MCP 工具（如文件系统、数据库）
 * - 跨平台数据互操作
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type {
  ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js';

export type McpTransportType = 'stdio' | 'http' | 'sse';

export interface McpServerConfig {
  name: string;
  transport: McpTransportType;
  // stdio 配置
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // HTTP/SSE 配置
  url?: string;
  headers?: Record<string, string>;
  // 通用
  timeoutMs?: number;
  maxReconnectAttempts?: number;
}

interface ConnectionEntry {
  client: Client;
  config: McpServerConfig;
  connectedAt: number;
  lastUsedAt: number;
  toolCount: number;
  // 错误计数（用于自动断开）
  errorCount: number;
}

const CONNECTION_TTL_MS = 5 * 60 * 1000; // 5 分钟无活动自动断开
const MAX_ERRORS_BEFORE_DISCONNECT = 3;

/**
 * MCP Client 池 - 管理多个 MCP Server 连接
 */
export class McpClientPool {
  private connections = new Map<string, ConnectionEntry>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * 连接到 MCP Server
   */
  async connect(config: McpServerConfig): Promise<Client> {
    const existing = this.connections.get(config.name);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.client;
    }

    const client = new Client(
      {
        name: 'skillhub-mcp-client',
        version: '3.0.0',
      },
      {
        capabilities: {},
      },
    );

    const transport = this.createTransport(config);

    try {
      await client.connect(transport, {
        timeout: config.timeoutMs ?? 30000,
      });
    } catch (error) {
      const e = error as { message?: string };
      throw new Error(
        `Failed to connect to MCP server "${config.name}": ${e.message ?? 'Unknown error'}`,
      );
    }

    // 获取工具列表（验证连接 + 缓存 toolCount）
    let toolCount = 0;
    try {
      const tools = await client.listTools();
      toolCount = tools.tools.length;
    } catch {
      // 某些 MCP Server 可能不允许 listTools，忽略
    }

    const entry: ConnectionEntry = {
      client,
      config,
      connectedAt: Date.now(),
      lastUsedAt: Date.now(),
      toolCount,
      errorCount: 0,
    };

    this.connections.set(config.name, entry);
    return client;
  }

  /**
   * 创建传输层
   */
  private createTransport(config: McpServerConfig) {
    if (config.transport === 'stdio') {
      if (!config.command) {
        throw new Error(`stdio transport requires "command" for ${config.name}`);
      }
      return new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: config.env,
      });
    }

    if (config.transport === 'http') {
      if (!config.url) {
        throw new Error(`http transport requires "url" for ${config.name}`);
      }
      return new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: config.headers },
      });
    }

    if (config.transport === 'sse') {
      if (!config.url) {
        throw new Error(`sse transport requires "url" for ${config.name}`);
      }
      return new SSEClientTransport(new URL(config.url), {
        requestInit: { headers: config.headers },
      });
    }

    throw new Error(`Unsupported transport: ${config.transport}`);
  }

  /**
   * 列出指定 Server 的所有工具
   */
  async listTools(serverName: string): Promise<ListToolsResult> {
    const client = await this.connect(
      this.connections.get(serverName)?.config ?? {
        name: serverName,
        transport: 'http',
      },
    );
    const entry = this.connections.get(serverName);
    if (entry) entry.lastUsedAt = Date.now();

    return client.listTools();
  }

  /**
   * 调用工具
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Awaited<ReturnType<Client['callTool']>>> {
    const client = await this.connect(
      this.connections.get(serverName)?.config ?? {
        name: serverName,
        transport: 'http',
      },
    );
    const entry = this.connections.get(serverName);
    if (entry) {
      entry.lastUsedAt = Date.now();
    }

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });
      if (entry) entry.errorCount = 0; // 重置错误计数
      return result;
    } catch (error) {
      if (entry) {
        entry.errorCount++;
        if (entry.errorCount >= MAX_ERRORS_BEFORE_DISCONNECT) {
          await this.disconnect(serverName);
        }
      }
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(serverName: string): Promise<void> {
    const entry = this.connections.get(serverName);
    if (!entry) return;
    try {
      await entry.client.close();
    } catch {
      // 忽略关闭错误
    }
    this.connections.delete(serverName);
  }

  /**
   * 列出所有活跃连接
   */
  listConnections(): Array<{
    name: string;
    transport: McpTransportType;
    toolCount: number;
    connectedAt: number;
    lastUsedAt: number;
    errorCount: number;
  }> {
    return Array.from(this.connections.values()).map((entry) => ({
      name: entry.config.name,
      transport: entry.config.transport,
      toolCount: entry.toolCount,
      connectedAt: entry.connectedAt,
      lastUsedAt: entry.lastUsedAt,
      errorCount: entry.errorCount,
    }));
  }

  /**
   * 启动定期清理（关闭空闲连接）
   */
  private startCleanupTimer() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [name, entry] of this.connections) {
        if (now - entry.lastUsedAt > CONNECTION_TTL_MS) {
          this.disconnect(name).catch(() => {});
        }
      }
    }, 60 * 1000); // 每分钟检查一次

    // 防止 timer 阻止进程退出
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 关闭所有连接
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const name of Array.from(this.connections.keys())) {
      await this.disconnect(name);
    }
  }
}

// 全局单例（避免每次请求创建新池）
let globalPool: McpClientPool | null = null;

export function getMcpClientPool(): McpClientPool {
  if (!globalPool) {
    globalPool = new McpClientPool();
  }
  return globalPool;
}

/**
 * 预设的 MCP Server 列表（用户可一键连接）
 */
export const PRESET_MCP_SERVERS: McpServerConfig[] = [
  {
    name: 'filesystem',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  },
  {
    name: 'github',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN ?? '' },
  },
  {
    name: 'fetch',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
  },
];