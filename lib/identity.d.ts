/** Fixed namespace for deterministic DSH MessageId → Remex source_turn_id mapping. */
export declare const DSH_TURN_NAMESPACE = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
export interface RemexIdentity {
    tenantId: string;
    userId: string;
}
export declare function buildAuthHeaders(identity: RemexIdentity): Record<string, string>;
/** Map a DSH message id string to a stable UUID v5 for Remex provenance. */
export declare function messageIdToTurnUuid(messageId: string): string;
//# sourceMappingURL=identity.d.ts.map