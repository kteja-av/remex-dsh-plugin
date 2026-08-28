/**
 * Controlled cross-session recall experiment.
 *
 * A generic user persona ("Alex", autonomous driving work, dosa breakfast)
 * verifies that memories persist across sessions and that a work question
 * outranks an irrelevant breakfast detail.
 *
 * Mirrors Phase 14 from Deepseek_Harness_plugin_with_remex.md:
 *
 * Manual live run (requires Remex + DSH):
 *   Turn 1 — "My name is Alex. I work on autonomous driving simulation."
 *   Turn 2 — new session, same tenant/user: "What do you know about my work?"
 *            → expect autonomous driving domain recalled
 *   Turn 3 — "Today I had dosa for breakfast", then "What kind of work am I doing?"
 *            → expect driving simulation, not dosa
 *
 * This file scripts the expected retrieval ranking with an in-memory Remex stand-in
 * scoped by tenant+user (session id is not sent to Remex).
 */
import { describe, expect, it, vi } from "vitest";

import { messageIdToTurnUuid } from "../../src/identity.ts";
import {
  formatRemexMemoryBlock,
  isRemexMemoryBlock,
} from "../../src/format-context.ts";
import {
  handlePreStepInjection,
} from "../../src/context-injector.ts";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { RemexMemoryProvider } from "../../src/remex-provider.ts";
import {
  RemexClient,
  type EvaluateInput,
  type MemoryType,
  type RetrieveInput,
  type RetrieveResult,
} from "../../src/remex-client.ts";
import type { Context } from "@deepseek-ai/cordis";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

interface StoredMemory {
  id: string;
  type: MemoryType;
  content: string;
  sourceTurnIds: string[];
  createdAt: string;
}

function scoreMemory(query: string, content: string): number {
  const q = query.toLowerCase();
  const c = content.toLowerCase();

  const workQuery = /\b(work|job|professional|doing)\b/.test(q);
  if (workQuery && c.includes("autonomous driving")) {
    return 0.95;
  }
  if (workQuery && c.includes("dosa")) {
    return 0.15;
  }

  let score = 0;
  for (const token of q.split(/\W+/).filter((part) => part.length > 2)) {
    if (c.includes(token)) {
      score += 0.2;
    }
  }
  if (c.includes("alex") && q.includes("name")) {
    score += 0.5;
  }
  return score;
}

function createCrossSessionStore(): {
  client: RemexClient;
  saveTurn: (content: string, messageId: string) => Promise<void>;
} {
  const store: StoredMemory[] = [];
  let jobCounter = 0;

  const client = {
    health: vi.fn(async () => ({ status: "ok" as const })),
    evaluate: vi.fn(async (input: EvaluateInput) => {
      store.push({
        id: `mem-${store.length + 1}`,
        type: input.type,
        content: input.content,
        sourceTurnIds: input.sourceTurnIds,
        createdAt: new Date().toISOString(),
      });
      jobCounter += 1;
      return { jobId: `job-${jobCounter}` };
    }),
    retrieve: vi.fn(async (input: RetrieveInput): Promise<RetrieveResult> => {
      const limit = input.limit ?? 5;
      const ranked = store
        .map((memory) => ({
          memory,
          score: scoreMemory(input.query, memory.content),
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);

      const memories = ranked.map(({ memory, score }) => ({
        id: memory.id,
        type: memory.type,
        content: memory.content,
        sourceTurnIds: memory.sourceTurnIds,
        createdAt: memory.createdAt,
        score,
      }));

      const tokenCount = memories.reduce(
        (total, memory) => total + memory.content.split(/\s+/).length,
        0,
      );

      return {
        memories,
        tokenCount,
        degraded: false,
      };
    }),
  } as unknown as RemexClient;

  return {
    client,
    saveTurn: async (content: string, messageId: string) => {
      await client.evaluate({
        type: "semantic",
        content,
        sourceTurnIds: [messageIdToTurnUuid(messageId)],
        participants: ["user", "assistant"],
      });
    },
  };
}

function mockContext(): Context {
  return {
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
    reflect: {
      provide: vi.fn(),
    },
  } as unknown as Context;
}

function providerForSession(client: RemexClient): RemexMemoryProvider {
  return new RemexMemoryProvider(mockContext(), {
    tenantId: TENANT_ID,
    userId: USER_ID,
    client,
  });
}

function userMessage(text: string) {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: { kind: "user" },
  });
}

describe("cross-session recall experiment", () => {
  it("turn 1 stores name and professional domain", async () => {
    const { client, saveTurn } = createCrossSessionStore();

    await saveTurn(
      "User: My name is Alex.\n\nAssistant: Nice to meet you, Alex.",
      "turn-1-user",
    );
    await saveTurn(
      "User: I work on autonomous driving simulation.\n\nAssistant: Understood — autonomous driving simulation.",
      "turn-1-work",
    );

    expect(client.evaluate).toHaveBeenCalledTimes(2);
  });

  it("turn 2 (new session) recalls professional domain for a work question", async () => {
    const { client, saveTurn } = createCrossSessionStore();

    await saveTurn(
      "User: My name is Alex.\n\nAssistant: Nice to meet you, Alex.",
      "session-a-turn-1",
    );
    await saveTurn(
      "User: I work on autonomous driving simulation.\n\nAssistant: Noted.",
      "session-a-turn-2",
    );

    const sessionB = providerForSession(client);
    const recall = await sessionB.recall("What do you know about my work?");

    expect(recall.memories.length).toBeGreaterThan(0);
    expect(recall.memories[0]?.content.toLowerCase()).toContain("autonomous driving");
  });

  it("turn 3 prefers work memory over irrelevant breakfast detail", async () => {
    const { client, saveTurn } = createCrossSessionStore();

    await saveTurn(
      "User: I work on autonomous driving simulation.\n\nAssistant: Noted.",
      "work-turn",
    );
    await saveTurn(
      "User: Today I had dosa for breakfast.\n\nAssistant: Enjoy your meal.",
      "dosa-turn",
    );

    const sessionC = providerForSession(client);
    const recall = await sessionC.recall("What kind of work am I doing?");

    expect(recall.memories[0]?.content.toLowerCase()).toContain("autonomous driving");
    expect(recall.memories[0]?.content.toLowerCase()).not.toContain("dosa");
  });

  it("injects recalled work context into pre-step for a new session query", async () => {
    const { client, saveTurn } = createCrossSessionStore();

    await saveTurn(
      "User: I work on autonomous driving simulation.\n\nAssistant: Noted.",
      "prior-work",
    );

    const provider = providerForSession(client);
    const query = "What do you know about my work?";
    const claimed = [userMessage(query)];
    const decision = { kind: "enter" as const, messages: [...claimed] };
    const recallResult = await provider.recall(query);
    const block = formatRemexMemoryBlock(recallResult.memories);

    expect(block).toBeDefined();
    expect(isRemexMemoryBlock(block!)).toBe(true);
    expect(block).toContain("autonomous driving");

    const injection = handlePreStepInjection({
      claimedMessages: claimed,
      decision,
      recallResult,
    });

    expect(injection.decision.kind).toBe("enter");
    expect(injection.decision.messages.length).toBeGreaterThan(claimed.length);
    expect(injection.fingerprint).toBeDefined();
  });
});
