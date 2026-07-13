// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canonicalizeSafeExternalUrl } from "./safe-external-url";

describe("canonicalizeSafeExternalUrl", () => {
  it("canonicalizes public HTTP(S) links and removes tracking material", () => {
    expect(
      canonicalizeSafeExternalUrl(
        "https://EXAMPLE.com/report/?utm_source=test&b=2&a=1#section",
      ),
    ).toBe("https://example.com/report?a=1&b=2");
    expect(canonicalizeSafeExternalUrl("http://93.184.216.34/path/"))
      .toBe("http://93.184.216.34/path");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "https://user:secret@example.com/report",
    "http://localhost/admin",
    "http://localhost./admin",
    "http://service.local/admin",
    "http://intranet/admin",
    "http://127.0.0.1/admin",
    "http://2130706433/admin",
    "http://10.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.10/admin",
    "http://198.51.100.4/example",
    "http://[::1]/admin",
    "http://[::ffff:127.0.0.1]/admin",
    "http://[fc00::1]/admin",
    "http://[fe80::1]/admin",
    "http://[2001:db8::1]/example",
  ])("rejects unsafe or non-public link %s", (url) => {
    expect(canonicalizeSafeExternalUrl(url)).toBeUndefined();
  });

  it("accepts a public IPv6 host", () => {
    expect(canonicalizeSafeExternalUrl("https://[2606:4700:4700::1111]/dns-query"))
      .toBe("https://[2606:4700:4700::1111]/dns-query");
  });
});
