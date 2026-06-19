import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerClientMock = vi.fn();
const createAdminClientMock = vi.fn();

vi.mock("@/src/lib/supabase/server", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/src/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

const userAuth = {
  email: "owner@example.com",
  role: "user" as const,
  userId: "owner-1",
};

function queryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    "delete",
    "eq",
    "insert",
    "limit",
    "maybeSingle",
    "order",
    "select",
    "single",
    "update",
  ]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = vi.fn((resolve) => Promise.resolve(result).then(resolve));
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.single = vi.fn().mockResolvedValue(result);
  return builder;
}

describe("QR repository", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it.each([
    "javascript:alert(1)",
    "ftp://example.com/file",
    "https://user:password@example.com",
  ])("rejects unsafe destination %s", async (destinationUrl) => {
    const { normalizeDestinationUrl } = await import("@/src/lib/qr-repository");

    expect(() => normalizeDestinationUrl(destinationUrl)).toThrow(
      "http or https",
    );
  });

  it("assigns ownership from auth instead of request input", async () => {
    const builder = queryBuilder({
      data: {
        created_at: "2026-06-19T00:00:00.000Z",
        destination_url: "https://example.com/",
        owner_id: "owner-1",
        scan_count: 0,
        slug: "AbCd1234",
        status: "active",
        title: null,
        updated_at: "2026-06-19T00:00:00.000Z",
      },
      error: null,
    });
    createServerClientMock.mockResolvedValue({
      from: vi.fn(() => builder),
    });
    const { createQr } = await import("@/src/lib/qr-repository");

    await createQr(
      {
        destinationUrl: "example.com",
        ownerId: "attacker-controlled",
      } as never,
      userAuth,
    );

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: "owner-1" }),
    );
    expect(builder.insert).not.toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: "attacker-controlled" }),
    );
  });

  it("filters regular-user lists by owner", async () => {
    const builder = queryBuilder({ data: [], error: null });
    createServerClientMock.mockResolvedValue({
      from: vi.fn(() => builder),
    });
    const { listQrs } = await import("@/src/lib/qr-repository");

    await listQrs(userAuth);

    expect(builder.eq).toHaveBeenCalledWith("owner_id", "owner-1");
  });

  it("does not add an owner filter for administrators", async () => {
    const builder = queryBuilder({ data: [], error: null });
    createServerClientMock.mockResolvedValue({
      from: vi.fn(() => builder),
    });
    const { listQrs } = await import("@/src/lib/qr-repository");

    await listQrs({ ...userAuth, role: "admin" });

    expect(builder.eq).not.toHaveBeenCalledWith("owner_id", "owner-1");
  });

  it.each(["updateQr", "deleteQr"] as const)(
    "forbids %s for a QR owned by another user",
    async (operation) => {
      const adminBuilder = queryBuilder({
        data: {
          created_at: "2026-06-19T00:00:00.000Z",
          destination_url: "https://example.com/",
          owner_id: "someone-else",
          scan_count: 0,
          slug: "AbCd1234",
          status: "active",
          title: null,
          updated_at: "2026-06-19T00:00:00.000Z",
        },
        error: null,
      });
      createAdminClientMock.mockReturnValue({
        from: vi.fn(() => adminBuilder),
      });
      const repository = await import("@/src/lib/qr-repository");

      const result =
        operation === "updateQr"
          ? repository.updateQr(
              "AbCd1234",
              { destinationUrl: "https://new.example.com" },
              userAuth,
            )
          : repository.deleteQr("AbCd1234", userAuth);

      await expect(result).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      });
      expect(createServerClientMock).not.toHaveBeenCalled();
    },
  );
});
