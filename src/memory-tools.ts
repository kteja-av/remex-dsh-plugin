import type { Context } from "@deepseek-ai/cordis";
import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";

import { formatRemexMemoryBlock } from "./format-context.ts";
import type { MemoryService } from "./memory.ts";

export const MEMORY_SEARCH_TOOL_NAME = "memory_search" as const;

export interface MemoryToolsConfig {
  enabled?: boolean;
  tokenBudget?: number;
  limit?: number;
}

export interface MemorySearchArgs {
  query: string;
  tokenBudget?: number;
  limit?: number;
}

export interface MemorySearchEntry {
  id: string;
  type: string;
  content: string;
  score: number;
}

export interface MemorySearchResult {
  memories: MemorySearchEntry[];
  tokenCount: number;
  formatted?: string;
}

/** Canonical output for `memory_search` (JSON lossless payload). */
export type MemorySearchValue = MemorySearchResult;

declare module "@deepseek-ai/cordis" {
  interface Context {
    tools: import("@deepseek-ai/dsh-tools").ToolRuntime;
  }
}

export function memoryOf(ctx: Context): MemoryService {
  const memory = ctx.get("memory");
  if (memory === undefined) {
    throw new Error(
      "memory service unavailable: mount remex-provider in cordis.patch.yml",
    );
  }
  return memory;
}

export async function executeMemorySearch(
  memory: MemoryService,
  args: MemorySearchArgs,
  defaults: Pick<MemoryToolsConfig, "tokenBudget" | "limit"> = {},
): Promise<MemorySearchResult> {
  const query = args.query.trim();
  if (query.length === 0) {
    throw new Error("memory_search: query must be a non-empty string");
  }

  const recallResult = await memory.recall(query, {
    ...(args.tokenBudget ?? defaults.tokenBudget) !== undefined
      ? { tokenBudget: args.tokenBudget ?? defaults.tokenBudget }
      : {},
    ...(args.limit ?? defaults.limit) !== undefined
      ? { limit: args.limit ?? defaults.limit }
      : {},
  });

  const formatted = formatRemexMemoryBlock(recallResult.memories);
  const result: MemorySearchResult = {
    memories: recallResult.memories.map((memory) => ({
      id: memory.id,
      type: memory.type,
      content: memory.content,
      score: memory.score,
    })),
    tokenCount: recallResult.tokenCount,
  };

  if (formatted !== undefined) {
    result.formatted = formatted;
  }

  return result;
}

export function buildMemorySearchToolDefinition(
  getMemory: () => MemoryService,
  config: MemoryToolsConfig = {},
): ToolDefinition {
  const defaults: Pick<MemoryToolsConfig, "tokenBudget" | "limit"> = {};
  if (config.tokenBudget !== undefined) {
    defaults.tokenBudget = config.tokenBudget;
  }
  if (config.limit !== undefined) {
    defaults.limit = config.limit;
  }

  return defineTool({
    name: MEMORY_SEARCH_TOOL_NAME,
    description:
      "Search persistent Remex memory for notes relevant to a query. "
      + "Use when automatic pre-step recall is insufficient or you need "
      + "agent-directed lookup across past sessions (same tenant/user).",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: "Natural-language search query.",
      },
      tokenBudget: {
        type: "integer",
        description: "Optional token budget for retrieval (defaults to plugin config).",
      },
      limit: {
        type: "integer",
        description: "Optional maximum number of memories to return.",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          memories: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                type: { type: "string" },
                content: { type: "string" },
                score: { type: "number" },
              },
            },
          },
          tokenCount: { type: "integer" },
          formatted: { type: "string" },
        },
      },
      render: (_args, value): ContentBlock[] => {
        const result = value as MemorySearchValue;
        const text = result.formatted
          ?? result.memories
            .map((memory) => memory.content)
            .join("\n")
          ?? "";
        return [{ type: "text", text }];
      },
    },
    execute: async (args, exec) => {
      exec.signal.throwIfAborted();
      return executeMemorySearch(getMemory(), args, defaults);
    },
  });
}

export function apply(ctx: Context, config: MemoryToolsConfig = {}): void {
  ctx.inject(["memory", "tools"], (scopedCtx: Context) => {
    if (config.enabled === false) {
      return;
    }

    scopedCtx.tools.register(
      buildMemorySearchToolDefinition(() => scopedCtx.memory, config),
    );
  });
}

apply.inject = ["memory", "tools"];

export default apply;
