import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listAdminQrsMock, listUsersMock, requireAdminMock } = vi.hoisted(() => ({
  listAdminQrsMock: vi.fn(),
  listUsersMock: vi.fn(),
  requireAdminMock: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/src/lib/admin-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/admin-service")>()),
  listAdminQrs: listAdminQrsMock,
  listUsers: listUsersMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const users = [
  {
    createdAt: "2026-06-18T00:00:00.000Z",
    email: "admin@example.com",
    id: "admin-1",
    qrCount: 1,
    role: "admin" as const,
  },
  {
    createdAt: "2026-06-19T00:00:00.000Z",
    email: "member@example.com",
    id: "user-1",
    qrCount: 2,
    role: "user" as const,
  },
];

describe("administrator dashboard", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({
      email: "admin@example.com",
      role: "admin",
      userId: "admin-1",
    });
    listUsersMock.mockResolvedValue(users);
    listAdminQrsMock.mockResolvedValue([
      {
        createdAt: "2026-06-19T00:00:00.000Z",
        destinationUrl: "https://example.com/",
        ownerEmail: "member@example.com",
        ownerId: "user-1",
        scanCount: 12,
        slug: "member-qr",
        status: "active",
        title: "Member campaign",
        updatedAt: "2026-06-19T01:00:00.000Z",
      },
    ]);
  });

  it("requires an administrator before loading overview data", async () => {
    requireAdminMock.mockRejectedValue(new Error("FORBIDDEN"));
    const { default: AdminPage } = await import("@/app/(protected)/admin/page");

    await expect(AdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(listUsersMock).not.toHaveBeenCalled();
    expect(listAdminQrsMock).not.toHaveBeenCalled();
  });

  it("shows metrics, owner filtering, and owner email for every QR", async () => {
    const { default: AdminPage } = await import("@/app/(protected)/admin/page");
    render(
      await AdminPage({
        searchParams: Promise.resolve({ owner: "user-1" }),
      }),
    );

    expect(screen.getByText("2 users")).toBeInTheDocument();
    expect(screen.getByText("1 active")).toBeInTheDocument();
    expect(screen.getByText("12 total scans")).toBeInTheDocument();
    expect(screen.getAllByText("member@example.com").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("member@example.com")).toBeInTheDocument();
  });

  it("submits invitations and reports provider errors", async () => {
    const { InviteForm } = await import("@/src/components/dashboard/invite-form");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ email: "new@example.com" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "That email is already invited." }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<InviteForm />);

    await userEvent.type(screen.getByLabelText("Email address"), "new@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("Invitation sent to new@example.com.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("That email is already invited.")).toBeInTheDocument();
  });

  it("does not offer demotion when there is only one administrator", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ role: "admin", userId: "user-1" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { AdminUserList } = await import(
      "@/src/components/dashboard/admin-user-list"
    );
    render(<AdminUserList users={users} />);

    const adminRole = screen.getByLabelText("Role for admin@example.com");
    expect(adminRole).toBeDisabled();

    const memberRole = screen.getByLabelText("Role for member@example.com");
    await userEvent.selectOptions(memberRole, "admin");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/users/user-1/role",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
  });
});
