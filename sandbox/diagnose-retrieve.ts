import { messageIdToTurnUuid } from "../lib/identity.js";
import { RemexMemoryProvider } from "../lib/remex-provider.js";

const TENANT = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-000000000002";
const headers = {
  "X-Tenant-ID": TENANT,
  "X-User-ID": USER,
  Accept: "application/json",
};

const ctx = {
  logger: { warn: console.warn, error: console.error, info: () => {}, debug: () => {} },
  reflect: { provide: () => {} },
};

const provider = new RemexMemoryProvider(ctx as never, {
  tenantId: TENANT,
  userId: USER,
  baseUrl: "http://localhost:8000",
});

async function enqueue(content: string, messageId: string) {
  const saved = await provider.save({
    type: "semantic",
    content,
    sourceTurnIds: [messageIdToTurnUuid(messageId)],
    participants: ["user", "assistant"],
  });
  console.log("job_id:", saved.jobId);
  for (let i = 0; i < 120; i++) {
    const response = await fetch(`http://localhost:8000/v1/jobs/${saved.jobId}`, { headers });
    const body = (await response.json()) as Record<string, unknown>;
    if (body.status === "finished" || body.status === "failed") {
      console.log(JSON.stringify(body, null, 2));
      return body;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

await enqueue(
  "User: I work on autonomous driving simulation.\n\nAssistant: Noted.",
  "diag-work-2",
);
await new Promise((r) => setTimeout(r, 5000));
const recall = await provider.recall("What do you know about my work?", {
  tokenBudget: 512,
  limit: 5,
});
console.log("recall:", JSON.stringify(recall, null, 2));
