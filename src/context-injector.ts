import type { Context } from "@deepseek-ai/cordis";
import { createUserMessage, type Message, type UserMessage } from "@deepseek-ai/dsh-llm";

import { formatRemexCoreMemoryBlock, isRemexCoreMemoryBlock } from "./core-memory.ts";
import {
  formatRemexMemoryBlock,
  isRemexMemoryBlock,
  recallFingerprint,
} from "./format-context.ts";
import type { RecallResult } from "./memory.ts";
import { RemexClient, type CoreMemoryBlock } from "./remex-client.ts";

export const PLUGIN_NAME = "remex-dsh-plugin";

export interface CoreMemoryInjectConfig {
  enabled?: boolean;
  baseUrl?: string;
  tenantId?: string;
  userId?: string;
  timeoutMs?: number;
}

export interface ContextInjectorConfig {
  enabled?: boolean;
  tokenBudget?: number;
  limit?: number;
  coreMemory?: CoreMemoryInjectConfig;
}

export interface PreStepDecision {
  kind: "enter" | "reject" | string;
  messages: Message[];
}

export interface PreStepPayload {
  agent: { session?: object };
  messages: Message[];
  step: number;
  signal: { throwIfAborted(): void };
}

declare module "@deepseek-ai/cordis" {
  interface Events {
    "agent/pre-step": (
      payload: PreStepPayload,
      next: () => Promise<PreStepDecision>,
    ) => PreStepDecision | Promise<PreStepDecision>;
  }
}

export interface PreStepInjectionInput {
  claimedMessages: readonly Message[];
  decision: PreStepDecision;
  recallResult: RecallResult;
  lastFingerprint?: string | undefined;
}

export interface PreStepInjectionResult {
  decision: PreStepDecision;
  fingerprint?: string | undefined;
}

function textFromMessage(message: Message): string {
  return message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/** Extract query text from the last durable user message in the claimed batch. */
export function extractLastUserMessageText(
  messages: readonly Message[],
): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message === undefined || message.role !== "user") {
      continue;
    }
    if (message.source.kind !== "user") {
      continue;
    }
    const text = textFromMessage(message).trim();
    if (text.length > 0) {
      return text;
    }
  }
  return undefined;
}

/** Fold injected context immediately after the claimed batch in the waterfall. */
export function foldAfterClaimed(
  allMessages: readonly Message[],
  claimedBatch: readonly Message[],
  injected: Message,
): Message[] {
  const lastClaimedIndex = allMessages.findLastIndex((message) =>
    claimedBatch.includes(message),
  );
  if (lastClaimedIndex === -1) {
    return [...allMessages, injected];
  }
  return allMessages.toSpliced(lastClaimedIndex + 1, 0, injected);
}

function hasInjectedBlock(messages: readonly Message[], block: string): boolean {
  return messages.some((message) => {
    if (message.role !== "user") {
      return false;
    }
    if (message.source.kind !== "plugin" || message.source.plugin !== PLUGIN_NAME) {
      return false;
    }
    return textFromMessage(message) === block;
  });
}

export function createRemexContextMessage(block: string): UserMessage {
  return createUserMessage({
    content: [{ type: "text", text: block }],
    source: {
      kind: "plugin",
      plugin: PLUGIN_NAME,
      form: "recall",
    },
  });
}

function createCoreMemoryContextMessage(block: string): UserMessage {
  return createUserMessage({
    content: [{ type: "text", text: block }],
    source: {
      kind: "plugin",
      plugin: PLUGIN_NAME,
      form: "snapshot",
      sections: [{ name: "remex_core_memory", text: block }],
    },
  });
}

export function foldCoreMemoryBlock(
  decision: PreStepDecision,
  claimedMessages: readonly Message[],
  block: string,
): PreStepDecision {
  const coreMessage = createCoreMemoryContextMessage(block);
  const messages = foldAfterLastRecall(decision.messages, coreMessage, claimedMessages);
  return {
    kind: "enter",
    messages,
  };
}

/** Insert after the last injected recall block so core memory follows `<remex_memory>`. */
function foldAfterLastRecall(
  allMessages: readonly Message[],
  injected: Message,
  fallbackClaimed: readonly Message[],
): Message[] {
  const lastRecallIndex = allMessages.findLastIndex(
    (message) =>
      message.role === "user" &&
      message.source.kind === "plugin" &&
      message.source.plugin === PLUGIN_NAME &&
      message.source.form === "recall",
  );
  if (lastRecallIndex === -1) {
    return foldAfterClaimed(allMessages, fallbackClaimed, injected);
  }
  return allMessages.toSpliced(lastRecallIndex + 1, 0, injected);
}

export function buildCoreMemoryClient(config: CoreMemoryInjectConfig): RemexClient | undefined {
  if (config.tenantId === undefined || config.userId === undefined) {
    return undefined;
  }
  return new RemexClient({
    baseUrl: config.baseUrl ?? "http://localhost:8000",
    identity: { tenantId: config.tenantId, userId: config.userId },
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
  });
}

export function handlePreStepInjection(
  input: PreStepInjectionInput,
): PreStepInjectionResult {
  const { claimedMessages, decision, recallResult, lastFingerprint } = input;

  if (decision.kind === "reject") {
    return { decision };
  }

  const block = formatRemexMemoryBlock(recallResult.memories);
  if (block === undefined || !isRemexMemoryBlock(block)) {
    return { decision };
  }

  const fingerprint = recallFingerprint(recallResult.memories);
  if (fingerprint === lastFingerprint) {
    return { decision };
  }

  if (hasInjectedBlock(decision.messages, block)) {
    return { decision, fingerprint };
  }

  const contextMessage = createRemexContextMessage(block);
  return {
    decision: {
      kind: "enter",
      messages: foldAfterClaimed(decision.messages, claimedMessages, contextMessage),
    },
    fingerprint,
  };
}

export function apply(ctx: Context, config: ContextInjectorConfig = {}): void {
  const lastFingerprintBySession = new WeakMap<object, string>();

  ctx.inject(["memory"], (scopedCtx: Context) => {
    scopedCtx.on(
      "agent/pre-step",
      async (payload: PreStepPayload, next) => {
        const decision = (await next()) as PreStepDecision;
        if (config.enabled === false) {
          return decision;
        }

        payload.signal.throwIfAborted();

        const query = extractLastUserMessageText(payload.messages);
        if (query === undefined) {
          return decision;
        }

        const recallResult = await scopedCtx.memory.recall(query, {
          ...(config.tokenBudget !== undefined ? { tokenBudget: config.tokenBudget } : {}),
          ...(config.limit !== undefined ? { limit: config.limit } : {}),
        });

        const session = payload.agent.session;
        const lastFingerprint =
          session === undefined ? undefined : lastFingerprintBySession.get(session);

        const result = handlePreStepInjection({
          claimedMessages: payload.messages,
          decision,
          recallResult,
          lastFingerprint,
        });

        if (session !== undefined && result.fingerprint !== undefined) {
          lastFingerprintBySession.set(session, result.fingerprint);
        }

        if (config.coreMemory?.enabled !== true) {
          return result.decision;
        }

        const coreClient = buildCoreMemoryClient(config.coreMemory);
        if (coreClient === undefined) {
          return result.decision;
        }

        let coreBlocks: CoreMemoryBlock[] = [];
        try {
          coreBlocks = (await coreClient.readCoreMemory()).blocks;
        } catch (error) {
          scopedCtx.logger.warn("[remex-memory] core-memory read failed", error);
          return result.decision;
        }

        const coreBlockText = formatRemexCoreMemoryBlock(coreBlocks);
        if (coreBlockText === undefined || !isRemexCoreMemoryBlock(coreBlockText)) {
          return result.decision;
        }

        return foldCoreMemoryBlock(
          result.decision,
          payload.messages,
          coreBlockText,
        );
      },
      { prepend: true },
    );
  });
}

apply.inject = ["memory"];

export default apply;
