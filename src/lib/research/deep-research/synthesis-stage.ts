import { selectProvider } from "@/lib/providers/provider-registry";
import type { ProviderFallbackDetail, ProviderFallbackReason } from "@/lib/providers/provider.types";
import type { RetrievedSource } from "@/lib/providers/retrieval.types";
import { buildDeepSynthesisContext } from "@/lib/research/deep-validation";
import type {
  AgentOutput,
  ResearchSession,
  SourceCitation,
  SynthesisOutput,
  ValidationLedgerV2,
} from "@/lib/schema/research-schema";
import { DeepWorkExecutionError } from "./service";

const SYNTHESIS_TIMEOUT_MS = 120_000;

export interface RunDeepSynthesisOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Synthesizes only from pass-3-eligible claims. Full specialist output is not
 * supplied, so excluded/conflicted claims cannot silently re-enter the brief.
 */
export async function runDeepSynthesisStage(
  sourceSession: ResearchSession,
  options: RunDeepSynthesisOptions = {},
): Promise<ResearchSession> {
  const session = structuredClone(sourceSession);
  const ledger = requireCompletedValidation(session.validation);
  const context = buildDeepSynthesisContext(ledger);
  if (context.eligibleClaims.length === 0) {
    throw new DeepWorkExecutionError(
      "no_synthesis_eligible_claims",
      false,
      "No fully reviewed claim is eligible to support a Deep Research synthesis.",
    );
  }

  const eligibleSourceIds = new Set(
    context.eligibleClaims.flatMap((claim) => claim.supportingSourceIds),
  );
  const sourceCatalog = new Map(
    ledger.reviewSources
      .filter((source) => eligibleSourceIds.has(source.id))
      .map((source) => [source.id, source]),
  );
  if (sourceCatalog.size < 2) {
    throw new DeepWorkExecutionError(
      "synthesis_evidence_insufficient",
      false,
      "Deep Research synthesis requires at least two allowlisted supporting sources.",
    );
  }

  const provider = selectProvider();
  if (provider.isMock) {
    throw new DeepWorkExecutionError(
      "mock_provider_forbidden",
      false,
      "Deep Research synthesis requires a real model provider.",
    );
  }

  const controller = new AbortController();
  const timeoutMs = clampTimeout(options.timeoutMs ?? SYNTHESIS_TIMEOUT_MS);
  const timer = setTimeout(
    () => controller.abort(new DOMException("Deep synthesis deadline reached", "AbortError")),
    timeoutMs,
  );
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  let fallback: { reason: ProviderFallbackReason; detail?: ProviderFallbackDetail } | undefined;

  try {
    const output = await provider.generate("synthesis", {
      query: session.query,
      keywords: session.keywords,
      // Intentionally omit raw upstream outputs. The eligible claim context
      // is the sole decision-content authority after pass three.
      upstream: [],
      retrievedSources: [...sourceCatalog.values()].map(toRetrievedSource),
      validationSummary: JSON.stringify(context),
      personaId: session.personaId,
      signal,
      onFallback: (reason, detail) => {
        fallback = { reason, detail };
      },
    });

    if (signal.aborted) {
      throw new DeepWorkExecutionError(
        "synthesis_aborted",
        true,
        "Deep Research synthesis was interrupted and will be retried.",
      );
    }
    if (fallback) throw fallbackError(fallback.reason, fallback.detail);
    if (output.agent !== "synthesis") {
      throw new DeepWorkExecutionError(
        "invalid_synthesis_output",
        true,
        "The model provider returned an invalid Deep Research synthesis.",
      );
    }

    const canonicalOutput = canonicalizeSynthesisCitations(output, sourceCatalog);
    if (canonicalOutput.citations.length < 2) {
      throw new DeepWorkExecutionError(
        "synthesis_citations_insufficient",
        true,
        "Deep Research synthesis did not retain two allowlisted supporting sources.",
      );
    }
    const now = new Date().toISOString();
    session.agents.synthesis = {
      ...session.agents.synthesis,
      status: "done",
      progress: 100,
      currentStep: "Complete",
      startedAt: session.agents.synthesis.startedAt ?? now,
      completedAt: now,
      output: canonicalOutput,
      resolvedProviderId: provider.id,
      degraded: false,
    };
    mergeCanonicalCitations(session, canonicalOutput.citations);
    session.updatedAt = now;
    return session;
  } catch (error) {
    if (error instanceof DeepWorkExecutionError) throw error;
    if (signal.aborted) {
      throw new DeepWorkExecutionError(
        "synthesis_aborted",
        true,
        "Deep Research synthesis was interrupted and will be retried.",
        { cause: error },
      );
    }
    throw new DeepWorkExecutionError(
      "synthesis_provider_failure",
      true,
      "The model provider could not complete Deep Research synthesis.",
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
  }
}

function requireCompletedValidation(
  value: ResearchSession["validation"],
): ValidationLedgerV2 {
  if (
    value?.version !== 2 ||
    value.protocol.executedPasses !== 3 ||
    !value.protocol.deepMultiPassExecuted ||
    value.semanticValidation.status !== "completed"
  ) {
    throw new DeepWorkExecutionError(
      "semantic_validation_incomplete",
      false,
      "Deep Research synthesis requires a complete three-pass semantic validation ledger.",
    );
  }
  return value;
}

function canonicalizeSynthesisCitations(
  output: SynthesisOutput,
  sources: ReadonlyMap<string, ValidationLedgerV2["reviewSources"][number]>,
): SynthesisOutput {
  const citations: SourceCitation[] = [];
  const seen = new Set<string>();
  for (const citation of output.citations) {
    if (seen.has(citation.id)) continue;
    const source = sources.get(citation.id);
    if (!source) continue;
    seen.add(citation.id);
    citations.push({
      id: source.id,
      title: source.title,
      ...(source.url ? { url: source.url } : {}),
      snippet: source.snippet,
      accessedAt: source.accessedAt,
      confidence: source.confidence,
      agent: "synthesis",
    });
  }
  return { ...output, citations };
}

function toRetrievedSource(
  source: ValidationLedgerV2["reviewSources"][number],
): RetrievedSource {
  return {
    id: source.id,
    title: source.title,
    ...(source.url ? { url: source.url } : {}),
    snippet: source.snippet,
    accessedAt: source.accessedAt,
    confidence: source.confidence,
    agent: source.agent,
    retrievedAt: source.accessedAt,
  };
}

function fallbackError(
  reason: ProviderFallbackReason,
  detail?: ProviderFallbackDetail,
): DeepWorkExecutionError {
  const status = detail?.status;
  const retryable =
    reason !== "validation_error" &&
    !(reason === "http_error" && typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429);
  return new DeepWorkExecutionError(
    `synthesis_provider_${reason}`,
    retryable,
    "The model provider degraded instead of producing a grounded Deep Research synthesis.",
  );
}

function mergeCanonicalCitations(session: ResearchSession, incoming: readonly SourceCitation[]): void {
  const seen = new Set(session.citations.map((citation) => citation.id));
  for (const citation of incoming) {
    if (seen.has(citation.id)) continue;
    seen.add(citation.id);
    session.citations.push(citation);
  }
}

function clampTimeout(value: number): number {
  if (!Number.isFinite(value)) return SYNTHESIS_TIMEOUT_MS;
  return Math.max(1_000, Math.min(220_000, Math.trunc(value)));
}

/** Narrowing helper retained for provider fixtures and integration tests. */
export function isSynthesisOutput(output: AgentOutput): output is SynthesisOutput {
  return output.agent === "synthesis";
}
