import { selectProvider } from "@/lib/providers/provider-registry";
import { selectRetrievalProvider } from "@/lib/providers/retrieval-registry";
import { selectStructuredCompletionProvider } from "@/lib/providers/structured-completion-registry";
import type { RetrievalProvider } from "@/lib/providers/retrieval.types";
import {
  ResearchAgentStageError,
  runResearchAgentStage,
  type ResearchAgentStageResult,
} from "@/lib/research/research-engine";
import { isValidationLedgerV2 } from "@/lib/research/ledger-guards";
import type { ResearchSession } from "@/lib/schema/research-schema";
import { DeepSemanticReviewer } from "./semantic-reviewer";
import {
  DeepWorkExecutionError,
  isDeepSpecialistWork,
  type DeepWorkExecutor,
} from "./service";
import { runDeepSynthesisStage } from "./synthesis-stage";
import { runGapFillStage } from "./gap-fill-stage";

type SpecialistRunner = typeof runResearchAgentStage;
type SynthesisRunner = typeof runDeepSynthesisStage;
type GapFillRunner = (session: ResearchSession, signal?: AbortSignal) => Promise<ResearchSession>;

interface SemanticPassRunner {
  runPass(
    session: ResearchSession,
    pass: "claim_source_entailment" | "independent_corroboration_conflict" | "adjudication",
    signal?: AbortSignal,
  ): Promise<ResearchSession>;
}

export interface ProductionDeepWorkExecutorOptions {
  generationProviderId: string;
  retrievalProviderId: string;
  reviewerProviderId: string;
  semanticReviewer: SemanticPassRunner;
  retrieval: RetrievalProvider;
  specialistRunner?: SpecialistRunner;
  synthesisRunner?: SynthesisRunner;
  gapFillRunner?: GapFillRunner;
  now?: () => number;
}

/** Maps each fixed durable work kind to one isolated, fail-closed stage. */
export class ProductionDeepWorkExecutor implements DeepWorkExecutor {
  private readonly specialistRunner: SpecialistRunner;
  private readonly synthesisRunner: SynthesisRunner;
  private readonly gapFillRunner: GapFillRunner;
  private readonly now: () => number;

  constructor(private readonly options: ProductionDeepWorkExecutorOptions) {
    this.specialistRunner = options.specialistRunner ?? runResearchAgentStage;
    this.synthesisRunner = options.synthesisRunner ?? runDeepSynthesisStage;
    this.gapFillRunner =
      options.gapFillRunner ??
      ((session, signal) => runGapFillStage(session, options.retrieval, { signal }));
    this.now = options.now ?? Date.now;
  }

  async execute(input: Parameters<DeepWorkExecutor["execute"]>[0]): Promise<ResearchSession> {
    assertExecutionProfile(input.record.executionProfile, this.options);

    if (isDeepSpecialistWork(input.work)) {
      try {
        const result: ResearchAgentStageResult = await this.specialistRunner(
          input.record.sessionId,
          input.work.agentId,
          {
            strict: true,
            signal: input.signal,
            deadlineAt: this.now() + 220_000,
            minimumRetrievedSources: 3,
            sessionSnapshot: input.record.session,
          },
        );
        return result.session;
      } catch (error) {
        throw mapSpecialistError(error);
      }
    }

    if (input.work.kind === "semantic_pass_1") {
      return this.options.semanticReviewer.runPass(
        input.record.session,
        "claim_source_entailment",
        input.signal,
      );
    }
    if (input.work.kind === "gap_fill") {
      return this.gapFillRunner(input.record.session, input.signal);
    }
    if (input.work.kind === "semantic_pass_2") {
      return this.options.semanticReviewer.runPass(
        input.record.session,
        "independent_corroboration_conflict",
        input.signal,
      );
    }
    if (input.work.kind === "semantic_pass_3") {
      return this.options.semanticReviewer.runPass(
        input.record.session,
        "adjudication",
        input.signal,
      );
    }
    if (input.work.kind === "synthesis") {
      return this.synthesisRunner(input.record.session, {
        signal: input.signal,
        timeoutMs: 120_000,
      });
    }
    if (input.work.kind === "finalize") {
      return finalizeProjection(input.record.session);
    }

    throw new DeepWorkExecutionError(
      "unknown_work_kind",
      false,
      "Deep Research encountered an unknown fixed work unit.",
    );
  }
}

/** Creates the production executor only when every strict provider is real. */
export function createProductionDeepWorkExecutor(): ProductionDeepWorkExecutor {
  const generation = selectProvider();
  const retrieval = selectRetrievalProvider();
  const reviewerSelection = selectStructuredCompletionProvider();
  if (generation.isMock) {
    throw new DeepWorkExecutionError(
      "mock_provider_forbidden",
      false,
      "Deep Research requires a real model provider.",
    );
  }
  if (retrieval.isMock) {
    throw new DeepWorkExecutionError(
      "mock_retrieval_forbidden",
      false,
      "Deep Research requires a real retrieval provider.",
    );
  }
  if (reviewerSelection.kind !== "configured" || reviewerSelection.provider.isMock) {
    throw new DeepWorkExecutionError(
      "reviewer_not_configured",
      false,
      "Deep Research requires a real structured-completion reviewer.",
    );
  }

  const semanticReviewer = new DeepSemanticReviewer({
    provider: reviewerSelection.provider,
    retrieval,
  });
  return new ProductionDeepWorkExecutor({
    generationProviderId: generation.id,
    retrievalProviderId: retrieval.id,
    reviewerProviderId: semanticReviewer.providerId,
    semanticReviewer,
    retrieval,
  });
}

export function currentDeepExecutionProfile() {
  const generation = selectProvider();
  const retrieval = selectRetrievalProvider();
  const reviewer = selectStructuredCompletionProvider();
  if (generation.isMock || retrieval.isMock || reviewer.kind !== "configured" || reviewer.provider.isMock) {
    return null;
  }
  return {
    generationProviderId: generation.id,
    retrievalProviderId: retrieval.id,
    reviewerProviderId: reviewer.provider.id,
  };
}

function assertExecutionProfile(
  expected: {
    generationProviderId: string;
    retrievalProviderId: string;
    reviewerProviderId: string;
  },
  configured: Pick<
    ProductionDeepWorkExecutorOptions,
    "generationProviderId" | "retrievalProviderId" | "reviewerProviderId"
  >,
): void {
  if (
    expected.generationProviderId !== configured.generationProviderId ||
    expected.retrievalProviderId !== configured.retrievalProviderId ||
    expected.reviewerProviderId !== configured.reviewerProviderId
  ) {
    throw new DeepWorkExecutionError(
      "execution_profile_changed",
      false,
      "Deep Research provider configuration changed during the run.",
    );
  }
}

function mapSpecialistError(error: unknown): DeepWorkExecutionError {
  if (error instanceof DeepWorkExecutionError) return error;
  if (error instanceof ResearchAgentStageError) {
    const retryable =
      error.retryable ??
      (error.code === "aborted" ||
        error.code === "deadline_exceeded" ||
        error.code === "provider_degraded" ||
        error.code === "retrieval_unavailable" ||
        error.code === "retrieval_insufficient" ||
        error.code === "evidence_insufficient");
    return new DeepWorkExecutionError(
      error.code === "provider_degraded" && error.degradedReason
        ? `specialist_provider_${error.degradedReason}`
        : `specialist_${error.code}`,
      retryable,
      error.code === "retrieval_insufficient" || error.code === "retrieval_unavailable"
        ? error.message
        : retryable
          ? "The Deep Research specialist stage did not meet its strict evidence contract and will be retried."
          : "The Deep Research specialist stage cannot run under the current configuration.",
      { cause: error },
    );
  }
  return new DeepWorkExecutionError(
    "specialist_unexpected_failure",
    true,
    "The Deep Research specialist stage failed unexpectedly and will be retried.",
    { cause: error },
  );
}

function finalizeProjection(session: ResearchSession): ResearchSession {
  const validation = session.validation;
  if (
    !isValidationLedgerV2(validation) ||
    validation.protocol.executedPasses !== 3 ||
    validation.semanticValidation.status !== "completed" ||
    validation.provenance.mockAgents.length > 0 ||
    validation.provenance.degradedAgents.length > 0 ||
    session.agents.synthesis.status !== "done" ||
    session.agents.synthesis.degraded === true ||
    session.agents.synthesis.output?.agent !== "synthesis"
  ) {
    throw new DeepWorkExecutionError(
      "finalization_contract_failed",
      false,
      "Deep Research cannot finalize because its evidence, validation, or synthesis contract is incomplete.",
    );
  }
  const next = structuredClone(session);
  next.validation = {
    ...validation,
    stage: "final",
    generatedAt: new Date().toISOString(),
  };
  next.updatedAt = new Date().toISOString();
  return next;
}
