import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const createServerClientMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/src/lib/supabase/server", () => ({
  createServerClient: createServerClientMock,
}));

function makeClient({
  claims,
  profile,
}: {
  claims: Record<string, unknown> | null;
  profile?: {
    email: string | null;
    id: string;
    role: "admin" | "user";
  } | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: profile ?? null,
    error: profile ? null : { message: "not found" },
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: claims ? { claims } : null,
        error: claims ? null : { message: "invalid session" },
      }),
    },
    from,
  };
}

describe("authentication guards", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to login", async () => {
    createServerClientMock.mockResolvedValue(makeClient({ claims: null }));
    const { requireUser } = await import("@/src/lib/auth");

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("uses the profile role instead of user-controlled metadata", async () => {
    createServerClientMock.mockResolvedValue(
      makeClient({
        claims: {
          email: "member@example.com",
          sub: "user-1",
          user_metadata: { role: "admin" },
        },
        profile: {
          email: "member@example.com",
          id: "user-1",
          role: "user",
        },
      }),
    );
    const { requireUser } = await import("@/src/lib/auth");

    await expect(requireUser()).resolves.toEqual({
      email: "member@example.com",
      role: "user",
      userId: "user-1",
    });
  });

  it("allows administrators based only on the profile role", async () => {
    createServerClientMock.mockResolvedValue(
      makeClient({
        claims: { email: "admin@example.com", sub: "admin-1" },
        profile: {
          email: "admin@example.com",
          id: "admin-1",
          role: "admin",
        },
      }),
    );
    const { requireAdmin } = await import("@/src/lib/auth");

    await expect(requireAdmin()).resolves.toMatchObject({
      role: "admin",
      userId: "admin-1",
    });
  });

  it("rejects regular users from administrator operations", async () => {
    createServerClientMock.mockResolvedValue(
      makeClient({
        claims: { email: "member@example.com", sub: "user-1" },
        profile: {
          email: "member@example.com",
          id: "user-1",
          role: "user",
        },
      }),
    );
    const { requireAdmin } = await import("@/src/lib/auth");

    await expect(requireAdmin()).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });
});
