import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.fn();
const requireAdminMock = vi.fn();

vi.mock("@/src/lib/auth", () => ({
  AuthError: class AuthError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  requireAdmin: requireAdminMock,
}));

vi.mock("@/src/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

function queryBuilder(result: { data: unknown; error: unknown; count?: number }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    "eq",
    "in",
    "is",
    "order",
    "select",
    "single",
    "update",
  ]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = vi.fn((resolve) => Promise.resolve(result).then(resolve));
  builder.single = vi.fn().mockResolvedValue(result);
  return builder;
}

describe("administrator service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({
      email: "admin@example.com",
      role: "admin",
      userId: "admin-1",
    });
  });

  it("rejects malformed invitation email addresses", async () => {
    const { inviteUser } = await import("@/src/lib/admin-service");

    await expect(inviteUser("not-an-email", "https://qr.example")).rejects.toMatchObject({
      code: "VALIDATION",
      status: 422,
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("invites a normalized email with the password setup redirect", async () => {
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: { id: "user-2" } },
      error: null,
    });
    const profileBuilder = queryBuilder({ data: null, error: null });
    createAdminClientMock.mockReturnValue({
      auth: { admin: { inviteUserByEmail } },
      from: vi.fn(() => profileBuilder),
    });
    const { inviteUser } = await import("@/src/lib/admin-service");

    await inviteUser(" New.User@Example.com ", "https://qr.example/");

    expect(inviteUserByEmail).toHaveBeenCalledWith("new.user@example.com", {
      redirectTo:
        "https://qr.example/auth/confirm?next=%2Fauth%2Fupdate-password",
    });
    expect(profileBuilder.update).toHaveBeenCalledWith({ role: "user" });
    expect(profileBuilder.eq).toHaveBeenCalledWith("id", "user-2");
  });

  it("maps duplicate invitations to a conflict", async () => {
    createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          inviteUserByEmail: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { code: "email_exists", message: "User already registered" },
          }),
        },
      },
    });
    const { inviteUser } = await import("@/src/lib/admin-service");

    await expect(
      inviteUser("existing@example.com", "https://qr.example"),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("lists profile roles with QR counts without reading auth metadata", async () => {
    const profiles = queryBuilder({
      data: [
        {
          created_at: "2026-06-19T00:00:00.000Z",
          email: "member@example.com",
          id: "user-1",
          role: "user",
        },
      ],
      error: null,
    });
    const qrs = queryBuilder({
      data: [{ owner_id: "user-1" }, { owner_id: "user-1" }],
      error: null,
    });
    const from = vi.fn((table: string) => (table === "profiles" ? profiles : qrs));
    const admin = { auth: { admin: { listUsers: vi.fn() } }, from };
    createAdminClientMock.mockReturnValue(admin);
    const { listUsers } = await import("@/src/lib/admin-service");

    await expect(listUsers()).resolves.toEqual([
      expect.objectContaining({ email: "member@example.com", qrCount: 2, role: "user" }),
    ]);
    expect(admin.auth.admin.listUsers).not.toHaveBeenCalled();
  });

  it("changes roles through the transaction-safe database function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const admin = {
      auth: { admin: { updateUserById: vi.fn() } },
      schema: vi.fn(() => ({ rpc })),
    };
    createAdminClientMock.mockReturnValue(admin);
    const { setUserRole } = await import("@/src/lib/admin-service");

    await setUserRole("user-2", "admin");

    expect(rpc).toHaveBeenCalledWith("set_user_role", {
      p_role: "admin",
      p_user_id: "user-2",
    });
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("reports the protected last-administrator database error", async () => {
    createAdminClientMock.mockReturnValue({
      schema: vi.fn(() => ({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "P0001", message: "Cannot demote the last administrator." },
        }),
      })),
    });
    const { setUserRole } = await import("@/src/lib/admin-service");

    await expect(setUserRole("admin-1", "user")).rejects.toMatchObject({
      code: "LAST_ADMIN",
      status: 409,
    });
  });

  it("returns 403 from the invitation API for a regular user", async () => {
    const { AuthError } = await import("@/src/lib/auth");
    requireAdminMock.mockRejectedValue(
      new AuthError("Administrator access is required.", 403, "FORBIDDEN"),
    );
    const { POST } = await import("@/app/api/admin/invitations/route");

    const response = await POST(
      new Request("https://qr.example/api/admin/invitations", {
        body: JSON.stringify({ email: "new@example.com" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Administrator access is required.",
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });
});
