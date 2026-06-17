"use client";

import { useState } from "react";
import { KeyboardCheatsheet } from "./KeyboardCheatsheet";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";

export function KeyboardCheatsheetGlobal() {
  const [isOpen, setIsOpen] = useState(false);

  useHotkeys("?", () => setIsOpen((v) => !v), {
    ignoreInputs: true,
    scope: "global",
  });

  return <KeyboardCheatsheet isOpen={isOpen} onClose={() => setIsOpen(false)} />;
}
