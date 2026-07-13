import { describe, expect, it } from "vitest";
import { isDeepWorkerAuthorized } from "./worker-auth";

describe("isDeepWorkerAuthorized", () => {
  const secret = "worker-secret-at-least-24-characters";

  it("accepts only the exact configured secret", () => {
    expect(isDeepWorkerAuthorized(secret, secret)).toBe(true);
    expect(isDeepWorkerAuthorized(`${secret}!`, secret)).toBe(false);
    expect(isDeepWorkerAuthorized("x".repeat(secret.length), secret)).toBe(false);
  });

  it("fails closed for weak or absent server configuration", () => {
    expect(isDeepWorkerAuthorized("", "")).toBe(false);
    expect(isDeepWorkerAuthorized("short", "short")).toBe(false);
  });
});
