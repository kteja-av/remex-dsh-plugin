import { createUserMessage } from "@deepseek-ai/dsh-llm";
import type { Message } from "@deepseek-ai/dsh-llm";
import { describe, expect, it, vi } from "vitest";

import {
  createRemexContextMessage,
  extractLastUserMessageText,
  foldAfterClaimed,
  handlePreStepInjection,
  PLUGIN_NAME,
} from "../src/context-injector.ts";
import {
  formatRemexMemoryBlock,
  isRemexMemoryBlock,
  recallFingerprint,
} from "../src/format-context.ts";
import { EMPTY_RECALL } from "../src/memory.ts";
import type { RetrievedMemory } from "../src/remex-client.ts";

const sampleMemories: RetrievedMemory[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    type: "semantic",
    content: "User prefers dosa.",
    sourceTurnIds: ["44444444-4444-4444-8444-444444444444"],
    createdAt: "2026-08-20T12:00:00Z",
    score: 0.9,
  },
];

function userMessage(text: string): Message {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: { kind: "user" },
  });
}

describe("format-context", () => {
  it("formats a remex memory block", () => {
    const block = formatRemexMemoryBlock(sampleMemories);

    expect(block).toContain("<remex_memory>");
    expect(block).toContain("1. User prefers dosa.");
    expect(block).toContain("Use these memories only when relevant.");
    expect(isRemexMemoryBlock(block!)).toBe(true);
  });

  it("returns undefined for empty memories", () => {
    expect(formatRemexMemoryBlock([])).toBeUndefined();
  });

  it("builds a stable recall fingerprint", () => {
    const first = recallFingerprint(sampleMemories);
    const second = recallFingerprint(sampleMemories);
    expect(first).toBe(second);
  });
});

describe("extractLastUserMessageText", () => {
  it("reads the last durable user message in the claimed batch", () => {
    const messages = [
      userMessage("first question"),
      createRemexContextMessage(formatRemexMemoryBlock(sampleMemories)!),
      userMessage("what food do I like?"),
    ];

    expect(extractLastUserMessageText(messages)).toBe("what food do I like?");
  });
});

describe("foldAfterClaimed", () => {
  it("inserts injected context after the claimed batch", () => {
    const claimed = [userMessage("hello"), userMessage("follow up")];
    const trailing = userMessage("already downstream");
    const allMessages = [...claimed, trailing];
    const injected = createRemexContextMessage(formatRemexMemoryBlock(sampleMemories)!);

    const folded = foldAfterClaimed(allMessages, claimed, injected);

    expect(folded.map((message) => textFrom(message))).toEqual([
      "hello",
      "follow up",
      injected.content[0]?.type === "text" ? injected.content[0].text : "",
      "already downstream",
    ]);
  });
});

describe("handlePreStepInjection", () => {
  it("returns enter decision with folded messages after downstream hooks", () => {
    const claimed = [userMessage("what food do I like?")];
    const downstream = userMessage("tool follow-up");
    const decision = { kind: "enter" as const, messages: [...claimed, downstream] };

    const result = handlePreStepInjection({
      claimedMessages: claimed,
      decision,
      recallResult: {
        memories: sampleMemories,
        tokenCount: 8,
        degraded: false,
      },
    });

    expect(result.decision.kind).toBe("enter");
    expect(result.decision.messages).toHaveLength(3);
    expect(result.decision.messages[1]?.source).toMatchObject({
      kind: "plugin",
      plugin: PLUGIN_NAME,
      form: "recall",
    });
    expect(result.fingerprint).toBe(recallFingerprint(sampleMemories));
  });

  it("skips injection when recall is empty", () => {
    const claimed = [userMessage("anything")];
    const decision = { kind: "enter" as const, messages: [...claimed] };

    const result = handlePreStepInjection({
      claimedMessages: claimed,
      decision,
      recallResult: EMPTY_RECALL,
    });

    expect(result.decision).toEqual(decision);
    expect(result.fingerprint).toBeUndefined();
  });

  it("dedupes identical recall fingerprints on tool continuations", () => {
    const claimed = [userMessage("continue")];
    const decision = { kind: "enter" as const, messages: [...claimed] };
    const recallResult = {
      memories: sampleMemories,
      tokenCount: 8,
      degraded: false,
    };
    const fingerprint = recallFingerprint(sampleMemories);

    const result = handlePreStepInjection({
      claimedMessages: claimed,
      decision,
      recallResult,
      lastFingerprint: fingerprint,
    });

    expect(result.decision).toEqual(decision);
  });

  it("dedupes when the same block is already present in decision messages", () => {
    const block = formatRemexMemoryBlock(sampleMemories)!;
    const injected = createRemexContextMessage(block);
    const claimed = [userMessage("question")];
    const decision = { kind: "enter" as const, messages: [...claimed, injected] };

    const result = handlePreStepInjection({
      claimedMessages: claimed,
      decision,
      recallResult: {
        memories: sampleMemories,
        tokenCount: 8,
        degraded: false,
      },
    });

    expect(result.decision.messages).toHaveLength(2);
    expect(result.fingerprint).toBe(recallFingerprint(sampleMemories));
  });

  it("awaits downstream pre-step hooks before injecting", async () => {
    const order: string[] = [];
    const next = vi.fn(async () => {
      order.push("next");
      return { kind: "enter" as const, messages: [userMessage("claimed")] };
    });

    order.push("before-next");
    await next();
    order.push("after-next");

    const claimed = [userMessage("query")];
    handlePreStepInjection({
      claimedMessages: claimed,
      decision: { kind: "enter", messages: [...claimed] },
      recallResult: { memories: sampleMemories, tokenCount: 8, degraded: false },
    });
    order.push("inject");

    expect(order).toEqual(["before-next", "next", "after-next", "inject"]);
  });
});

function textFrom(message: Message): string {
  return message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
