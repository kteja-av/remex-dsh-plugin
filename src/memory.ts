import { Context, Service } from "@deepseek-ai/cordis";

import type { MemoryType, RetrievedMemory } from "./remex-client.ts";

export interface RecallOptions {
  tokenBudget?: number;
  limit?: number;
  /** Request expired/superseded assertions in addition to active ones. */
  historical?: boolean;
}

export interface RecallResult {
  memories: RetrievedMemory[];
  tokenCount: number;
  degraded: boolean;
}

export interface SaveInput {
  type?: MemoryType;
  content: string;
  sourceTurnIds: string[];
  importance?: number;
  participants?: string[];
  parentEpisodeId?: string;
}

export interface SaveResult {
  jobId: string;
}

export const EMPTY_RECALL: RecallResult = {
  memories: [],
  tokenCount: 0,
  degraded: false,
};

declare module "@deepseek-ai/cordis" {
  interface Context {
    memory: MemoryService;
  }
}

/**
 * Abstract cross-session memory seam (`ctx.memory`). The Remex-backed
 * implementation lives in `remex-provider.ts`.
 */
export abstract class MemoryService extends Service {
  constructor(ctx: Context) {
    if (new.target === MemoryService) {
      throw new Error(
        "remex-dsh-plugin: MemoryService is abstract; load remex-provider instead",
      );
    }
    super(ctx, "memory");
  }

  abstract recall(query: string, options?: RecallOptions): Promise<RecallResult>;

  abstract save(input: SaveInput): Promise<SaveResult>;
}

export default MemoryService;
