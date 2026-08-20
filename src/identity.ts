import { createHash } from "node:crypto";

/** Fixed namespace for deterministic DSH MessageId → Remex source_turn_id mapping. */
export const DSH_TURN_NAMESPACE = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

export interface RemexIdentity {
  tenantId: string;
  userId: string;
}

export function buildAuthHeaders(identity: RemexIdentity): Record<string, string> {
  return {
    "X-Tenant-ID": identity.tenantId,
    "X-User-ID": identity.userId,
  };
}

function parseUuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function formatUuidBytes(bytes: Uint8Array): string {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Map a DSH message id string to a stable UUID v5 for Remex provenance. */
export function messageIdToTurnUuid(messageId: string): string {
  const namespace = parseUuidBytes(DSH_TURN_NAMESPACE);
  const hash = createHash("sha1").update(namespace).update(messageId, "utf8").digest();
  const bytes = new Uint8Array(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return formatUuidBytes(bytes);
}
