import { describe, expect, it } from "vitest";
import { filterSensitiveAnalyticsEvent } from "./PrivacySafeAnalytics";

describe("filterSensitiveAnalyticsEvent", () => {
  it("drops public share pageviews before a bearer token reaches analytics", () => {
    expect(filterSensitiveAnalyticsEvent({
      type: "pageview",
      url: "https://launchlens.example/share/private_bearer_token?locale=zh",
    })).toBeNull();
    expect(filterSensitiveAnalyticsEvent({
      type: "event",
      url: "/share/private_bearer_token",
    })).toBeNull();
  });

  it("preserves non-sensitive product analytics events", () => {
    const event = {
      type: "pageview" as const,
      url: "https://launchlens.example/?utm_source=shared_report",
    };
    expect(filterSensitiveAnalyticsEvent(event)).toBe(event);
  });

  it("fails closed for malformed event URLs", () => {
    expect(filterSensitiveAnalyticsEvent({ type: "pageview", url: "http://[" }))
      .toBeNull();
  });
});
