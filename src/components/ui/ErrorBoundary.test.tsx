// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

describe("ErrorBoundary (round 196)", () => {
  it("renders children when nothing throws", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <div>hello</div>
      </ErrorBoundary>
    );
    expect(getByText("hello")).toBeTruthy();
  });

  it("renders fallback UI when child throws during render", () => {
    const Boom = () => { throw new Error("kaboom"); };
    const { getByText } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(getByText("Something went wrong")).toBeTruthy();
    expect(getByText("kaboom")).toBeTruthy();
    expect(getByText("Go home")).toBeTruthy();
    expect(getByText("Reload")).toBeTruthy();
  });

  it("supports custom fallback render prop", () => {
    const Boom = () => { throw new Error("x"); };
    const { getByText } = render(
      <ErrorBoundary fallback={(err, reset) => (
        <button onClick={reset}>custom: {err.message}</button>
      )}>
        <Boom />
      </ErrorBoundary>
    );
    expect(getByText("custom: x")).toBeTruthy();
    fireEvent.click(getByText("custom: x"));
    // after reset, boom throws again, so still fallback. That's fine - bounday resets but child throws.
  });
});
