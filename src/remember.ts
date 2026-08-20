import type { Context } from "@deepseek-ai/cordis";
import type { AssistantMessage, Message, UserMessage } from "@deepseek-ai/dsh-llm";

import { messageIdToTurnUuid } from "./identity.ts";
import type { SaveInput } from "./memory.ts";
import { RemexHttpError, type MemoryType } from "./remex-client.ts";

export interface RememberConfig {
  enabled?: boolean;
  rememberType?: MemoryType;
}

export interface TurnRememberBuffer {
  turn: number;
  userMessageId?: string;
  userText?: string;
  assistantMessages: Array<{ id: string; text: string }>;
}

export interface TurnEndReasonLike {
  kind: string;
}

export interface SessionEventLike {
  type: string;
  data: unknown;
}

export interface RememberState {
  activeTurn?: number;
  buffers: Map<number, TurnRememberBuffer>;
  enqueuedTurns: Set<number>;
}

declare module "@deepseek-ai/cordis" {
  interface Events {
    "session/event": (session: object, event: SessionEventLike) => void;
  }
}

function textFromMessage(message: Message): string {
  return message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/** Only durable human prompts — skip plugin injects and tool results. */
export function isDurableUserMessage(message: UserMessage): boolean {
  return message.source.kind === "user";
}

export function shouldRememberTurn(reason: TurnEndReasonLike): boolean {
  return reason.kind === "completed";
}

export function createRememberState(): RememberState {
  return { buffers: new Map(), enqueuedTurns: new Set() };
}

export function buildRememberContent(buffer: TurnRememberBuffer): string | undefined {
  const userText = buffer.userText?.trim();
  if (userText === undefined || userText.length === 0) {
    return undefined;
  }

  const assistantParts = buffer.assistantMessages
    .map((entry) => entry.text.trim())
    .filter((text) => text.length > 0);

  if (assistantParts.length === 0) {
    return `User: ${userText}`;
  }

  return [`User: ${userText}`, ...assistantParts.map((text) => `Assistant: ${text}`)].join(
    "\n\n",
  );
}

export function buildSaveInput(
  buffer: TurnRememberBuffer,
  rememberType: MemoryType = "semantic",
): SaveInput | undefined {
  const content = buildRememberContent(buffer);
  if (content === undefined) {
    return undefined;
  }

  const sourceTurnIds: string[] = [];
  if (buffer.userMessageId !== undefined) {
    sourceTurnIds.push(messageIdToTurnUuid(buffer.userMessageId));
  }
  for (const assistant of buffer.assistantMessages) {
    sourceTurnIds.push(messageIdToTurnUuid(assistant.id));
  }

  if (sourceTurnIds.length === 0) {
    return undefined;
  }

  return {
    type: rememberType,
    content,
    sourceTurnIds,
    participants: ["user", "assistant"],
  };
}

/**
 * Pure session/event reducer. Returns a save candidate when a completed turn
 * ends with durable user input; otherwise undefined.
 */
export function handleSessionEvent(
  state: RememberState,
  event: SessionEventLike,
  rememberType: MemoryType = "semantic",
): SaveInput | undefined {
  switch (event.type) {
    case "turn/start": {
      const data = event.data as { turn: number };
      state.activeTurn = data.turn;
      state.buffers.set(data.turn, { turn: data.turn, assistantMessages: [] });
      return undefined;
    }
    case "user/message": {
      const message = event.data as UserMessage;
      if (!isDurableUserMessage(message)) {
        return undefined;
      }
      const turn = state.activeTurn;
      if (turn === undefined) {
        return undefined;
      }
      const buffer = state.buffers.get(turn) ?? { turn, assistantMessages: [] };
      buffer.userMessageId = message.id;
      buffer.userText = textFromMessage(message);
      state.buffers.set(turn, buffer);
      return undefined;
    }
    case "assistant/message": {
      const data = event.data as { turn: number; message: AssistantMessage };
      const buffer = state.buffers.get(data.turn) ?? {
        turn: data.turn,
        assistantMessages: [],
      };
      buffer.assistantMessages.push({
        id: data.message.id,
        text: textFromMessage(data.message),
      });
      state.buffers.set(data.turn, buffer);
      return undefined;
    }
    case "turn/end": {
      const data = event.data as { turn: number; reason: TurnEndReasonLike };
      if (!shouldRememberTurn(data.reason)) {
        state.buffers.delete(data.turn);
        return undefined;
      }
      if (state.enqueuedTurns.has(data.turn)) {
        return undefined;
      }
      const buffer = state.buffers.get(data.turn);
      if (buffer === undefined) {
        return undefined;
      }
      const saveInput = buildSaveInput(buffer, rememberType);
      state.enqueuedTurns.add(data.turn);
      state.buffers.delete(data.turn);
      if (state.activeTurn === data.turn) {
        delete state.activeTurn;
      }
      return saveInput;
    }
    default:
      return undefined;
  }
}

export async function enqueueRemember(
  save: (input: SaveInput) => Promise<{ jobId: string }>,
  input: SaveInput,
  log: (message: string, error?: unknown) => void,
): Promise<void> {
  try {
    await save(input);
  } catch (error) {
    if (error instanceof RemexHttpError && error.status === 429) {
      log("Remex evaluate rate limited (429); dropping enqueue", error);
      return;
    }
    log("Remex evaluate failed", error);
  }
}

export function apply(ctx: Context, config: RememberConfig = {}): void {
  const rememberType = config.rememberType ?? "semantic";
  const stateBySession = new WeakMap<object, RememberState>();

  ctx.inject(["memory"], (scopedCtx: Context) => {
    scopedCtx.on("session/event", (session: object, event: SessionEventLike) => {
      if (config.enabled === false) {
        return;
      }

      let state = stateBySession.get(session);
      if (state === undefined) {
        state = createRememberState();
        stateBySession.set(session, state);
      }

      const saveInput = handleSessionEvent(state, event, rememberType);
      if (saveInput === undefined) {
        return;
      }

      void enqueueRemember(
        (input) => scopedCtx.memory.save(input),
        saveInput,
        (message, error) => {
          if (error === undefined) {
            scopedCtx.logger.warn(`[remex-memory] ${message}`);
          } else {
            scopedCtx.logger.warn(`[remex-memory] ${message}:`, error);
          }
        },
      );
    });
  });
}

apply.inject = ["memory"];

export default apply;
