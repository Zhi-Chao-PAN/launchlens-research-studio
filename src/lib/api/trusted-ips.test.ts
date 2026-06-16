import { isTrustedIp, getTrustedIpList, _resetTrustedIpCache } from "@/lib/api/trusted-ips";

describe("Trusted IPs", () => {
  const originalEnv = process.env.LAUNCHLENS_TRUSTED_IPS;

  beforeEach(() => {
    _resetTrustedIpCache();
    delete process.env.LAUNCHLENS_TRUSTED_IPS;
  });

  afterAll(() => {
    _resetTrustedIpCache();
    if (originalEnv) process.env.LAUNCHLENS_TRUSTED_IPS = originalEnv;
    else delete process.env.LAUNCHLENS_TRUSTED_IPS;
  });

  describe("empty / no config", () => {
    it("returns false when no trusted IPs are configured", () => {
      expect(isTrustedIp("192.168.1.1")).toBe(false);
    });

    it("getTrustedIpList returns empty array when not configured", () => {
      expect(getTrustedIpList()).toEqual([]);
    });

    it("handles empty string", () => {
      process.env.LAUNCHLENS_TRUSTED_IPS = "";
      _resetTrustedIpCache();
      expect(isTrustedIp("10.0.0.1")).toBe(false);
      expect(getTrustedIpList()).toEqual([]);
    });
  });

  describe("exact IPv4 match", () => {
    beforeEach(() => {
      process.env.LAUNCHLENS_TRUSTED_IPS = "192.168.1.1, 10.0.0.5";
      _resetTrustedIpCache();
    });

    it("matches exact IPv4 address", () => {
      expect(isTrustedIp("192.168.1.1")).toBe(true);
      expect(isTrustedIp("10.0.0.5")).toBe(true);
    });

    it("does not match other IPv4 addresses", () => {
      expect(isTrustedIp("192.168.1.2")).toBe(false);
      expect(isTrustedIp("10.0.0.6")).toBe(false);
    });

    it("getTrustedIpList returns the configured list", () => {
      const list = getTrustedIpList();
      expect(list).toContain("192.168.1.1");
      expect(list).toContain("10.0.0.5");
    });
  });

  describe("CIDR ranges", () => {
    beforeEach(() => {
      process.env.LAUNCHLENS_TRUSTED_IPS = "10.0.0.0/8, 192.168.1.0/24";
      _resetTrustedIpCache();
    });

    it("matches IPs in /8 range", () => {
      expect(isTrustedIp("10.0.0.1")).toBe(true);
      expect(isTrustedIp("10.255.255.254")).toBe(true);
      expect(isTrustedIp("10.1.2.3")).toBe(true);
    });

    it("does not match IPs outside /8 range", () => {
      expect(isTrustedIp("11.0.0.1")).toBe(false);
      expect(isTrustedIp("9.255.255.255")).toBe(false);
    });

    it("matches IPs in /24 range", () => {
      expect(isTrustedIp("192.168.1.1")).toBe(true);
      expect(isTrustedIp("192.168.1.254")).toBe(true);
    });

    it("does not match IPs outside /24 range", () => {
      expect(isTrustedIp("192.168.2.1")).toBe(false);
      expect(isTrustedIp("192.168.0.255")).toBe(false);
    });

    it("handles /32 as exact match", () => {
      process.env.LAUNCHLENS_TRUSTED_IPS = "1.2.3.4/32";
      _resetTrustedIpCache();
      expect(isTrustedIp("1.2.3.4")).toBe(true);
      expect(isTrustedIp("1.2.3.5")).toBe(false);
    });
  });

  describe("IPv6", () => {
    beforeEach(() => {
      process.env.LAUNCHLENS_TRUSTED_IPS = "::1, fe80::1";
      _resetTrustedIpCache();
    });

    it("matches exact IPv6 address", () => {
      expect(isTrustedIp("::1")).toBe(true);
      expect(isTrustedIp("fe80::1")).toBe(true);
    });

    it("case-insensitive IPv6 match", () => {
      expect(isTrustedIp("FE80::1")).toBe(true);
    });

    it("does not match other IPv6 addresses", () => {
      expect(isTrustedIp("::2")).toBe(false);
      expect(isTrustedIp("fe80::2")).toBe(false);
    });
  });

  describe("mixed IPv4 and IPv6", () => {
    beforeEach(() => {
      process.env.LAUNCHLENS_TRUSTED_IPS = "127.0.0.1, ::1, 192.168.0.0/16";
      _resetTrustedIpCache();
    });

    it("matches IPv4 exact", () => {
      expect(isTrustedIp("127.0.0.1")).toBe(true);
    });

    it("matches IPv6 exact", () => {
      expect(isTrustedIp("::1")).toBe(true);
    });

    it("matches IPv4 CIDR", () => {
      expect(isTrustedIp("192.168.50.1")).toBe(true);
    });

    it("does not match unrelated addresses", () => {
      expect(isTrustedIp("8.8.8.8")).toBe(false);
      expect(isTrustedIp("2001:db8::1")).toBe(false);
    });
  });

  describe("invalid inputs", () => {
    beforeEach(() => {
      process.env.LAUNCHLENS_TRUSTED_IPS = "10.0.0.0/8";
      _resetTrustedIpCache();
    });

    it("returns false for empty string IP", () => {
      expect(isTrustedIp("")).toBe(false);
    });

    it("returns false for malformed IP", () => {
      expect(isTrustedIp("not-an-ip")).toBe(false);
      expect(isTrustedIp("999.999.999.999")).toBe(false);
      expect(isTrustedIp("1.2.3")).toBe(false);
    });
  });

  describe("invalid CIDR in config", () => {
    it("skips invalid CIDR prefixes", () => {
      process.env.LAUNCHLENS_TRUSTED_IPS = "10.0.0.0/999, 10.0.0.1";
      _resetTrustedIpCache();
      expect(isTrustedIp("10.0.0.1")).toBe(true);
      expect(isTrustedIp("10.0.0.2")).toBe(false); // 0.0.0.0/999 is invalid, no range match
    });
  });
});
