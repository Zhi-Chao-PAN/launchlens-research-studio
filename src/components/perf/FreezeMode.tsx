"use client";
import { useFreezeMode } from "@/lib/perf/use-freeze-mode";

/** Mount this at the root layout to honor the ?freeze=1 param. */
export function FreezeMode(): null {
  useFreezeMode();
  return null;
}
