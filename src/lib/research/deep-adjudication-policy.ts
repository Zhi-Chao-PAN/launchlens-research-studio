import type {
  ClaimDisposition,
  ClaimReviewFinding,
  ConfidenceLevel,
} from "@/lib/schema/research-schema";

export interface DeterministicAdjudicationPolicy {
  disposition: ClaimDisposition;
  supportingSourceIds: string[];
  contradictingSourceIds: string[];
  reviewedPasses: ClaimReviewFinding["pass"][];
  maximumConfidence: ConfidenceLevel;
}

/**
 * Derive the authoritative third-pass result from the two bounded review
 * passes. Model adjudication may add prose limitations or lower confidence,
 * but it cannot change this decision or attach different evidence.
 */
export function deriveDeterministicAdjudication(
  findings: readonly ClaimReviewFinding[],
): DeterministicAdjudicationPolicy {
  const entailment = findings.find(
    (finding) => finding.pass === "claim_source_entailment",
  );
  const corroboration = findings.find(
    (finding) => finding.pass === "independent_corroboration_conflict",
  );
  const supportingSourceIds = uniqueStrings([
    ...(entailment?.supportingSourceIds ?? []),
    ...(corroboration?.supportingSourceIds ?? []),
  ]);
  // Only the independent conflict pass is allowed to assert contradiction.
  // A source failing to entail a claim is not evidence that the claim is false.
  const contradictingSourceIds = uniqueStrings(
    corroboration?.contradictingSourceIds ?? [],
  );

  let disposition: ClaimDisposition = "insufficient_evidence";
  if (entailment && corroboration) {
    if (
      contradictingSourceIds.length > 0 ||
      corroboration.verdict === "contradicted" ||
      corroboration.verdict === "mixed"
    ) {
      disposition = "conflicted";
    } else if (
      supportingSourceIds.length > 0 &&
      entailment.verdict === "entailed" &&
      corroboration.verdict === "corroborated"
    ) {
      disposition = "supported";
    } else if (
      supportingSourceIds.length > 0 &&
      (entailment.verdict === "entailed" ||
        entailment.verdict === "partially_entailed" ||
        corroboration.verdict === "corroborated")
    ) {
      disposition = "partially_supported";
    } else if (entailment.verdict === "not_entailed") {
      disposition = "unsupported";
    }
  }

  const reviewedPasses = [entailment, corroboration]
    .filter((finding): finding is ClaimReviewFinding => Boolean(finding))
    .map((finding) => finding.pass);
  const maximumConfidence = minimumConfidence(
    findings.map((finding) => finding.confidence),
    disposition === "partially_supported" ? "medium" : undefined,
  );

  return {
    disposition,
    supportingSourceIds,
    contradictingSourceIds,
    reviewedPasses,
    maximumConfidence,
  };
}

export function confidenceAtMost(
  value: ConfidenceLevel,
  maximum: ConfidenceLevel,
): boolean {
  return CONFIDENCE_RANK[value] <= CONFIDENCE_RANK[maximum];
}

function minimumConfidence(
  values: readonly ConfidenceLevel[],
  maximum?: ConfidenceLevel,
): ConfidenceLevel {
  let selected = values.reduce(
    (lowest, value) => Math.min(lowest, CONFIDENCE_RANK[value]),
    CONFIDENCE_RANK.high,
  );
  if (maximum) selected = Math.min(selected, CONFIDENCE_RANK[maximum]);
  return CONFIDENCE_BY_RANK[selected] ?? "low";
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const CONFIDENCE_BY_RANK: ConfidenceLevel[] = ["low", "medium", "high"];
