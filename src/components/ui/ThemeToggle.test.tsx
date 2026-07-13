// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

const { setThemeMock, useThemeMock } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
  useThemeMock: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: useThemeMock,
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    setThemeMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    ["system", "dark", "System theme"],
    ["dark", "light", "Dark mode"],
    ["light", "system", "Light mode"],
  ])("cycles %s to %s through next-themes", (current, next, label) => {
    useThemeMock.mockReturnValue({ theme: current, setTheme: setThemeMock });

    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: new RegExp(label, "i") });

    fireEvent.click(button);

    expect(button.getAttribute("type")).toBe("button");
    expect(setThemeMock).toHaveBeenCalledWith(next);
  });
});
