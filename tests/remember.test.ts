import { createAssistantMessage, createUserMessage } from "@deepseek-ai/dsh-llm";
import { describe, expect, it, vi } from "vitest";

import { messageIdToTurnUuid } from "../src/identity.ts";
import { PLUGIN_NAME } from "../src/context-injector.ts";
import {
  buildRememberContent,
  buildSaveInput,
  createRememberState,
  enqueueRemember,
  formatUserFactForEvaluate,
  handleSessionEvent,
  isDurableUserMessage,
  shouldRememberTurn,
} from "../src/remember.ts";
import { RemexHttpError } from "../src/remex-client.ts";

function durableUserMessage(text: string) {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: { kind: "user" },
  });
}

function pluginUserMessage(text: string) {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: { kind: "plugin", plugin: PLUGIN_NAME, form: "recall" },
  });
}

function assistantMessage(text: string) {
  return createAssistantMessage({
    content: [{ type: "text", text }],
    source: { provider: "mock", model: "mock-model" },
  });
}

function completedTurnEvents(turn: number, userText: string, assistantText: string) {
  const user = durableUserMessage(userText);
  const assistant = assistantMessage(assistantText);
  return {
    events: [
      { type: "turn/start", data: { turn } },
      { type: "user/message", data: user },
      {
        type: "assistant/message",
        data: { turn, step: 0, message: assistant },
      },
      { type: "turn/end", data: { turn, reason: { kind: "completed" } } },
    ],
    user,
    assistant,
  };
}

describe("remember helpers", () => {
  it("accepts only durable user messages", () => {
    expect(isDurableUserMessage(durableUserMessage("hello"))).toBe(true);
    expect(isDurableUserMessage(pluginUserMessage("memory block"))).toBe(false);
  });

  it("remembers only completed turns", () => {
    expect(shouldRememberTurn({ kind: "completed" })).toBe(true);
    expect(shouldRememberTurn({ kind: "aborted" })).toBe(false);
    expect(shouldRememberTurn({ kind: "error" })).toBe(false);
  });

  it("formats user facts for Remex Write Gate admission", () => {
    expect(formatUserFactForEvaluate("My name is Alex.")).toBe("The user's name is Alex.");
    expect(formatUserFactForEvaluate("I work on autonomous driving simulation.")).toBe(
      "The user works on autonomous driving simulation.",
    );
    expect(formatUserFactForEvaluate("I like dosa.")).toBe("The user likes dosa.");
    expect(formatUserFactForEvaluate("The user prefers tea.")).toBe("The user prefers tea.");
  });

  it("builds Write-Gate-friendly turn content from user text only", () => {
    const assistant = assistantMessage("Noted your preference.");
    const content = buildRememberContent({
      turn: 1,
      userText: "I like dosa.",
      assistantMessages: [{ id: assistant.id, text: "Noted your preference." }],
    });

    expect(content).toBe("The user likes dosa.");
    expect(content).not.toContain("Assistant");
  });

  it("maps message ids to UUID v5 source_turn_ids", () => {
    const user = durableUserMessage("I drive autonomously.");
    const assistant = assistantMessage("Understood.");
    const input = buildSaveInput({
      turn: 1,
      userMessageId: user.id,
      userText: "I drive autonomously.",
      assistantMessages: [{ id: assistant.id, text: "Understood." }],
    });

    expect(input).toMatchObject({
      type: "semantic",
      participants: ["user", "assistant"],
      sourceTurnIds: [messageIdToTurnUuid(user.id), messageIdToTurnUuid(assistant.id)],
    });
  });
});

describe("handleSessionEvent", () => {
  it("enqueues evaluate once per completed durable turn", () => {
    const state = createRememberState();
    const { events, user, assistant } = completedTurnEvents(
      1,
      "I work on autonomous driving simulation.",
      "Understood — autonomous driving simulation.",
    );

    let saveInput: ReturnType<typeof handleSessionEvent>;
    for (const event of events) {
      saveInput = handleSessionEvent(state, event);
    }

    expect(saveInput).toMatchObject({
      type: "semantic",
      content: "The user works on autonomous driving simulation.",
      sourceTurnIds: [messageIdToTurnUuid(user.id), messageIdToTurnUuid(assistant.id)],
    });

    const duplicate = handleSessionEvent(state, {
      type: "turn/end",
      data: { turn: 1, reason: { kind: "completed" } },
    });
    expect(duplicate).toBeUndefined();
  });

  it("skips plugin-injected user messages", () => {
    const state = createRememberState();

    handleSessionEvent(state, { type: "turn/start", data: { turn: 1 } });
    handleSessionEvent(state, { type: "user/message", data: pluginUserMessage("recall block") });
    handleSessionEvent(state, {
      type: "assistant/message",
      data: { turn: 1, step: 0, message: assistantMessage("reply") },
    });
    const saveInput = handleSessionEvent(state, {
      type: "turn/end",
      data: { turn: 1, reason: { kind: "completed" } },
    });

    expect(saveInput).toBeUndefined();
  });

  it("skips aborted turns", () => {
    const state = createRememberState();

    for (const event of [
      { type: "turn/start", data: { turn: 2 } },
      { type: "user/message", data: durableUserMessage("hello") },
      { type: "turn/end", data: { turn: 2, reason: { kind: "aborted" } } },
    ]) {
      handleSessionEvent(state, event);
    }

    expect(
      handleSessionEvent(state, {
        type: "turn/end",
        data: { turn: 2, reason: { kind: "aborted" } },
      }),
    ).toBeUndefined();
  });
});

describe("enqueueRemember", () => {
  it("does not throw on 429 and logs instead", async () => {
    const save = vi.fn(async () => {
      throw new RemexHttpError(429, "write gate queue is at capacity");
    });
    const log = vi.fn();

    await expect(
      enqueueRemember(save, {
        type: "semantic",
        content: "User: overflow",
        sourceTurnIds: [messageIdToTurnUuid("turn-429")],
      }, log),
    ).resolves.toBeUndefined();

    expect(save).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      "Remex evaluate rate limited (429); dropping enqueue",
      expect.any(RemexHttpError),
    );
  });

  it("fires evaluate without awaiting job completion on the caller path", async () => {
    let resolveSave: (() => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<{ jobId: string }>((resolve) => {
          resolveSave = () => resolve({ jobId: "job-999" });
        }),
    );
    const log = vi.fn();

    const pending = enqueueRemember(
      save,
      {
        type: "semantic",
        content: "User: async",
        sourceTurnIds: [messageIdToTurnUuid("turn-async")],
      },
      log,
    );

    expect(save).toHaveBeenCalledOnce();
    resolveSave?.();
    await pending;
    expect(log).not.toHaveBeenCalled();
  });
});

describe("session/event hot path", () => {
  it("returns before evaluate completes", () => {
    const state = createRememberState();
    const { events } = completedTurnEvents(3, "What food do I like?", "You mentioned dosa.");

    for (const event of events.slice(0, -1)) {
      handleSessionEvent(state, event);
    }

    let resolveSave: (() => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<{ jobId: string }>((resolve) => {
          resolveSave = () => resolve({ jobId: "job-hot" });
        }),
    );
    const log = vi.fn();

    const saveInput = handleSessionEvent(state, events.at(-1)!);
    expect(saveInput).toBeDefined();

    void enqueueRemember(save, saveInput!, log);
    expect(save).toHaveBeenCalledOnce();

    resolveSave?.();
  });
});
