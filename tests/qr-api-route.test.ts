import { beforeEach, describe, expect, it, vi } from "vitest";

const { createQrMock, requireUserMock } = vi.hoisted(() => ({
  createQrMock: vi.fn(),
  requireUserMock: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({
  AuthError: class AuthError extends Error {},
  requireUser: requireUserMock,
}));

vi.mock("@/src/lib/qr-repository", () => ({
  createQr: createQrMock,
  listQrs: vi.fn(),
  QrRepositoryError: class QrRepositoryError extends Error {},
}));

describe("POST /api/qr", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({
      email: "owner@example.com",
      role: "user",
      userId: "owner-1",
    });
    createQrMock.mockResolvedValue({
      createdAt: "2026-06-21T00:00:00.000Z",
      destinationUrl: "https://example.com/",
      ownerId: "owner-1",
      scanCount: 0,
      slug: "my-business",
      status: "active",
      title: "My Business",
      updatedAt: "2026-06-21T00:00:00.000Z",
    });
  });

  it("passes a custom alias only during creation", async () => {
    const { POST } = await import("@/app/api/qr/route");
    const response = await POST(
      new Request("https://qr.example/api/qr", {
        body: JSON.stringify({
          customAlias: "my-business",
          destinationUrl: "https://example.com",
          title: "My Business",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(201);
    expect(createQrMock).toHaveBeenCalledWith(
      {
        customAlias: "my-business",
        destinationUrl: "https://example.com",
        title: "My Business",
      },
      expect.objectContaining({ userId: "owner-1" }),
    );
  });
});
