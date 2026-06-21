import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.fn();

vi.mock("@/src/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

function adminClientFor(qr: unknown, lookupError: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: qr,
    error: lookupError,
  });
  const lookup = {
    eq: vi.fn(() => lookup),
    insert: vi.fn(() => lookup),
    maybeSingle,
    select: vi.fn(() => lookup),
    then: vi.fn((resolve) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
    ),
    update: vi.fn(() => lookup),
  };
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const schema = vi.fn(() => ({ rpc }));
  const client = {
    from: vi.fn(() => lookup),
    schema,
  };
  createAdminClientMock.mockReturnValue(client);
  return { client, lookup, rpc };
}

describe("public QR redirects", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects active links to the latest http destination", async () => {
    adminClientFor({
      destination_url: "https://latest.example/path",
      scan_count: 4,
      slug: "AbCd1234",
      status: "active",
    });
    const { getPublicQrResult } = await import("@/src/lib/public-redirect");

    const result = await getPublicQrResult({
      ipAddress: "203.0.113.10",
      referrer: "https://referrer.example/",
      slug: "AbCd1234",
      userAgent: "Test agent",
    });

    expect(result).toEqual({
      destinationUrl: "https://latest.example/path",
      kind: "redirect",
    });
  });

  it("returns disabled for a known inactive link", async () => {
    const { rpc } = adminClientFor({
      destination_url: "https://destination.example/",
      scan_count: 4,
      slug: "AbCd1234",
      status: "disabled",
    });
    const { getPublicQrResult } = await import("@/src/lib/public-redirect");

    await expect(
      getPublicQrResult({
        ipAddress: null,
        referrer: null,
        slug: "AbCd1234",
        userAgent: null,
      }),
    ).resolves.toEqual({ kind: "disabled" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns missing for an unknown link", async () => {
    adminClientFor(null);
    const { getPublicQrResult } = await import("@/src/lib/public-redirect");

    await expect(
      getPublicQrResult({
        ipAddress: null,
        referrer: null,
        slug: "missing",
        userAgent: null,
      }),
    ).resolves.toEqual({ kind: "missing" });
  });

  it("does not block an active redirect when scan recording fails", async () => {
    const { lookup, rpc } = adminClientFor({
      destination_url: "https://destination.example/",
      scan_count: 4,
      slug: "AbCd1234",
      status: "active",
    });
    rpc.mockResolvedValue({ error: { message: "scan unavailable" } });
    lookup.then.mockImplementation((resolve) =>
      Promise.resolve({
        data: null,
        error: { message: "fallback unavailable" },
      }).then(resolve),
    );
    const errorMock = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getPublicQrResult } = await import("@/src/lib/public-redirect");

    await expect(
      getPublicQrResult({
        ipAddress: null,
        referrer: null,
        slug: "AbCd1234",
        userAgent: null,
      }),
    ).resolves.toEqual({
      destinationUrl: "https://destination.example/",
      kind: "redirect",
    });
    expect(errorMock).toHaveBeenCalled();
  });

  it.each([
    "javascript:alert(1)",
    "https://good.example/\r\nX-Injected: true",
    "ftp://files.example/archive",
  ])("rejects unsafe redirect destination %s", async (destinationUrl) => {
    adminClientFor({
      destination_url: destinationUrl,
      scan_count: 4,
      slug: "AbCd1234",
      status: "active",
    });
    const { getPublicQrResult } = await import("@/src/lib/public-redirect");

    await expect(
      getPublicQrResult({
        ipAddress: null,
        referrer: null,
        slug: "AbCd1234",
        userAgent: null,
      }),
    ).resolves.toEqual({ kind: "missing" });
  });

  it("returns a 302 redirect with private no-store caching", async () => {
    adminClientFor({
      destination_url: "https://latest.example/path",
      scan_count: 4,
      slug: "AbCd1234",
      status: "active",
    });
    const { GET } = await import("@/app/q/[slug]/route");

    const response = await GET(
      new Request("https://qr.example/q/AbCd1234"),
      { params: Promise.resolve({ slug: "AbCd1234" }) },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://latest.example/path",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });

  it.each([
    ["disabled", 410, "Link unavailable"],
    ["missing", 404, "Link not found"],
  ] as const)(
    "returns a branded %s response",
    async (kind, status, heading) => {
      adminClientFor(
        kind === "missing"
          ? null
          : {
              destination_url: "https://destination.example/",
              scan_count: 4,
              slug: "AbCd1234",
              status: "disabled",
            },
      );
      const { GET } = await import("@/app/q/[slug]/route");

      const response = await GET(
        new Request("https://qr.example/q/AbCd1234"),
        { params: Promise.resolve({ slug: "AbCd1234" }) },
      );

      expect(response.status).toBe(status);
      expect(await response.text()).toContain(heading);
      expect(response.headers.get("cache-control")).toBe(
        "private, no-store, max-age=0",
      );
    },
  );
});
