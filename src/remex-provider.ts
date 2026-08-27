import { Context } from "@deepseek-ai/cordis";

import {
  EMPTY_RECALL,
  MemoryService,
  type RecallOptions,
  type RecallResult,
  type SaveInput,
  type SaveResult,
} from "./memory.ts";
import { RemexClient, type MemoryType } from "./remex-client.ts";
import type { RemexIdentity } from "./identity.ts";

export interface RemexProviderConfig {
  baseUrl?: string;
  tenantId: string;
  userId: string;
  timeoutMs?: number;
  tokenBudget?: number;
  limit?: number;
  rememberType?: MemoryType;
  /** Optional client override (tests only). */
  client?: RemexClient;
}

const DEFAULT_BASE_URL = "http://localhost:8000";
const DEFAULT_TOKEN_BUDGET = 512;
const DEFAULT_LIMIT = 5;

export class RemexMemoryProvider extends MemoryService {
  private readonly client: RemexClient;
  private readonly rememberType: MemoryType;
  private readonly defaultTokenBudget: number;
  private readonly defaultLimit: number;

  constructor(ctx: Context, config: RemexProviderConfig) {
    super(ctx);
    this.defaultTokenBudget = config.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
    this.defaultLimit = config.limit ?? DEFAULT_LIMIT;
    this.rememberType = config.rememberType ?? "semantic";

    if (config.client !== undefined) {
      this.client = config.client;
    } else {
      const identity: RemexIdentity = {
        tenantId: config.tenantId,
        userId: config.userId,
      };
      this.client = new RemexClient({
        baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
        identity,
        ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
        defaultTokenBudget: this.defaultTokenBudget,
        defaultLimit: this.defaultLimit,
      });
    }
  }

  async recall(query: string, options?: RecallOptions): Promise<RecallResult> {
    try {
      const result = await this.client.retrieve({
        query: query.trim(),
        tokenBudget: options?.tokenBudget ?? this.defaultTokenBudget,
        limit: options?.limit ?? this.defaultLimit,
        ...(options?.historical !== undefined
          ? { historical: options.historical }
          : {}),
      });

      if (result.degraded) {
        this.logRetrieveFailure("Remex retrieve returned degraded=true");
        return EMPTY_RECALL;
      }

      return {
        memories: result.memories,
        tokenCount: result.tokenCount,
        degraded: false,
      };
    } catch (error) {
      this.logRetrieveFailure("Remex retrieve failed", error);
      return EMPTY_RECALL;
    }
  }

  async save(input: SaveInput): Promise<SaveResult> {
    const evaluateInput = {
      type: input.type ?? this.rememberType,
      content: input.content,
      sourceTurnIds: input.sourceTurnIds,
      ...(input.importance !== undefined ? { importance: input.importance } : {}),
      ...(input.participants !== undefined ? { participants: input.participants } : {}),
      ...(input.parentEpisodeId !== undefined ? { parentEpisodeId: input.parentEpisodeId } : {}),
    };
    const result = await this.client.evaluate(evaluateInput);
    return { jobId: result.jobId };
  }

  private logRetrieveFailure(message: string, error?: unknown): void {
    if (error === undefined) {
      this.ctx.logger.warn(`[remex-memory] ${message}`);
      return;
    }
    this.ctx.logger.warn(`[remex-memory] ${message}:`, error);
  }
}

export default RemexMemoryProvider;
