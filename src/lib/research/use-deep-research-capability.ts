"use client";

import { useEffect, useState } from "react";
import type {
  DeepCapabilityRequirementId,
  DeepCapabilityRequirement,
  DeepResearchCapability,
} from "@/lib/research/deep-research/capability";

const DEEP_REQUIREMENT_IDS = new Set<DeepCapabilityRequirementId>([
  "explicit_opt_in",
  "durable_state",
  "generation_provider",
  "retrieval_provider",
  "semantic_reviewer",
  "worker_wake",
  "independent_recovery",
  "recovery_freshness",
]);

interface CapabilityEnvelope {
  modes: {
    deep: DeepResearchCapability;
  };
}

export interface DeepResearchCapabilityState {
  capability: DeepResearchCapability | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Reads the server-side production gate once per workspace mount.
 *
 * The API remains authoritative because Redis reachability and provider
 * secrets cannot be inferred safely in the browser. Invalid or unavailable
 * responses fail closed: Deep Research stays Preview.
 */
export function useDeepResearchCapability(): DeepResearchCapabilityState {
  const [state, setState] = useState<DeepResearchCapabilityState>({
    capability: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/research/capabilities", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Capability probe failed with status ${response.status}.`);
        }
        const body: unknown = await response.json();
        if (!isCapabilityEnvelope(body)) {
          throw new Error("Capability probe returned an invalid response.");
        }
        setState({ capability: body.modes.deep, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          capability: null,
          isLoading: false,
          error: error instanceof Error ? error.message : "Capability probe failed.",
        });
      });

    return () => controller.abort();
  }, []);

  return state;
}

function isCapabilityEnvelope(value: unknown): value is CapabilityEnvelope {
  if (!isRecord(value) || !isRecord(value.modes)) return false;
  return isDeepResearchCapability(value.modes.deep);
}

function isDeepResearchCapability(value: unknown): value is DeepResearchCapability {
  if (!isRecord(value)) return false;
  if (value.mode !== "deep" || value.id !== "deep") return false;
  if (value.availability !== "available" && value.availability !== "preview") return false;
  if (!Array.isArray(value.requirements) || !value.requirements.every(isRequirement)) return false;
  if (!Array.isArray(value.blockers) || !value.blockers.every(isRequirementId)) return false;
  return (
    typeof value.checkedAt === "string" &&
    typeof value.capabilityNotice === "string" &&
    value.validationPasses === 3 &&
    value.retrieval === "required" &&
    value.requiresAsyncExecution === true &&
    value.maxSynchronousDurationSec === 300
  );
}

function isRequirement(value: unknown): value is DeepCapabilityRequirement {
  return (
    isRecord(value) &&
    isRequirementId(value.id) &&
    typeof value.ready === "boolean" &&
    typeof value.label === "string" &&
    typeof value.detail === "string"
  );
}

function isRequirementId(value: unknown): value is DeepCapabilityRequirementId {
  return typeof value === "string" && DEEP_REQUIREMENT_IDS.has(value as DeepCapabilityRequirementId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
