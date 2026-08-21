/**
 * Minimal OpenAI-compatible mock for DSH headless boot tests.
 */
import { createServer, type Server } from "node:http";

export interface MockLlmServer {
  baseURL: string;
  requests: Array<{ path: string; body: unknown }>;
  close(): Promise<void>;
}

export async function startMockLlmServer(successText: string): Promise<MockLlmServer> {
  const requests: Array<{ path: string; body: unknown }> = [];
  let server: Server | undefined;

  await new Promise<void>((resolve) => {
    server = createServer(async (req, res) => {
      const path = req.url ?? "/";
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = raw;
      try {
        body = raw.length > 0 ? JSON.parse(raw) : {};
      } catch {
        // keep raw body for debugging
      }
      requests.push({ path, body });

      const payload = {
        id: "mock-chat",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: successText },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    });
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server!.address();
  if (address === null || typeof address === "string") {
    throw new Error("mock LLM server failed to bind");
  }

  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () =>
      new Promise((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
