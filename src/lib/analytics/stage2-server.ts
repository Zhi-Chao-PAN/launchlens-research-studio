import { createHash } from "node:crypto";

import type { Stage2TrackingContext } from "./stage2-context";
import { normalizeStage2Value } from "./stage2-context";

export type Stage2TrackingHashes = {
  stage2ParticipantHash?: string;
  stage2BatchHash?: string;
};

export function hashStage2Value(value: string | null | undefined) {
  const normalized = normalizeStage2Value(value);
  if (!normalized) return undefined;
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function hashStage2TrackingContext(
  context: Stage2TrackingContext | null | undefined,
): Stage2TrackingHashes | undefined {
  if (!context) return undefined;
  const hashes: Stage2TrackingHashes = {
    stage2ParticipantHash: hashStage2Value(context.stage2Participant),
    stage2BatchHash: hashStage2Value(context.stage2Batch),
  };
  return hashes.stage2ParticipantHash || hashes.stage2BatchHash
    ? hashes
    : undefined;
}
