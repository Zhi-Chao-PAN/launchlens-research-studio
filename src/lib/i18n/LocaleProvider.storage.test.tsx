// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LocaleProvider, useLocale } from "./LocaleProvider";
import { TrialGuide } from "@/components/studio/TrialGuide";

function Visitor() {
  const { setLocale } = useLocale();
  return <><button onClick={() => setLocale("zh-CN")}>中文</button><TrialGuide /></>;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("first trial with restricted browser storage", () => {
  it("renders and switches language when accessing localStorage is denied", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    render(<LocaleProvider><Visitor /></LocaleProvider>);
    expect(screen.getByText("First trial: complete one research question")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name: "中文"}));
    expect(screen.getByText("首次试用：完成一个研究问题")).toBeTruthy();
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("keeps a language change when persistence fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    render(<LocaleProvider><Visitor /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", {name: "中文"}));
    expect(document.documentElement.lang).toBe("zh-CN");
  });
});
