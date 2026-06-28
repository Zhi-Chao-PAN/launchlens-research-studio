export const STAGE2_PARTICIPANT_HEADER = "x-launchlens-stage2-participant";
export const STAGE2_BATCH_HEADER = "x-launchlens-stage2-batch";

const STAGE2_PARTICIPANT_KEYS = [
  "stage2Participant",
  "participant",
  "participantId",
] as const;
const STAGE2_BATCH_KEYS = ["stage2Batch", "batch", "batchId"] as const;
const MAX_STAGE2_VALUE_CHARS = 80;
const STAGE2_VALUE_PATTERN = /^[A-Za-z0-9._:-]+$/;

export type Stage2TrackingContext = {
  stage2Participant?: string;
  stage2Batch?: string;
};

function firstParam(
  params: URLSearchParams,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = normalizeStage2Value(params.get(key));
    if (value) return value;
  }
  return undefined;
}

function hasStage2Context(context: Stage2TrackingContext): boolean {
  return Boolean(context.stage2Participant || context.stage2Batch);
}

export function normalizeStage2Value(
  value: string | null | undefined,
): string | undefined {
  const normalized = (value ?? "").trim().replace(/\s+/g, "-");
  if (!normalized || normalized.length > MAX_STAGE2_VALUE_CHARS) {
    return undefined;
  }
  return STAGE2_VALUE_PATTERN.test(normalized) ? normalized : undefined;
}

export function stage2ContextFromSearchParams(
  params: URLSearchParams,
): Stage2TrackingContext | undefined {
  const context: Stage2TrackingContext = {
    stage2Participant: firstParam(params, STAGE2_PARTICIPANT_KEYS),
    stage2Batch: firstParam(params, STAGE2_BATCH_KEYS),
  };
  return hasStage2Context(context) ? context : undefined;
}

export function stage2ContextFromRequest(
  request: Request,
): Stage2TrackingContext | undefined {
  const headerContext: Stage2TrackingContext = {
    stage2Participant: normalizeStage2Value(
      request.headers.get(STAGE2_PARTICIPANT_HEADER),
    ),
    stage2Batch: normalizeStage2Value(request.headers.get(STAGE2_BATCH_HEADER)),
  };
  if (hasStage2Context(headerContext)) return headerContext;

  return stage2ContextFromSearchParams(new URL(request.url).searchParams);
}

export function stage2HeadersFromCurrentUrl(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const context = stage2ContextFromSearchParams(
    new URLSearchParams(window.location.search),
  );
  if (!context) return {};

  return {
    ...(context.stage2Participant
      ? { [STAGE2_PARTICIPANT_HEADER]: context.stage2Participant }
      : {}),
    ...(context.stage2Batch
      ? { [STAGE2_BATCH_HEADER]: context.stage2Batch }
      : {}),
  };
}

export function stage2SearchFromCurrentUrl(): string {
  if (typeof window === "undefined") return "";
  const context = stage2ContextFromSearchParams(
    new URLSearchParams(window.location.search),
  );
  if (!context) return "";

  const params = new URLSearchParams();
  if (context.stage2Participant) {
    params.set("stage2Participant", context.stage2Participant);
  }
  if (context.stage2Batch) {
    params.set("stage2Batch", context.stage2Batch);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
