import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QrActions } from "@/src/components/dashboard/qr-actions";
import { QrList } from "@/src/components/dashboard/qr-list";

const {
  getQrMock,
  headersMock,
  notFoundMock,
  pushMock,
  refreshMock,
  requireUserMock,
} = vi.hoisted(() => ({
  getQrMock: vi.fn(),
  headersMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  requireUserMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/src/lib/auth", () => ({
  requireUser: requireUserMock,
}));

vi.mock("@/src/lib/qr-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/qr-repository")>()),
  getQr: getQrMock,
}));

vi.mock("qrcode", () => ({
  default: {
    toCanvas: vi.fn().mockResolvedValue(undefined),
    toString: vi.fn().mockResolvedValue("<svg />"),
  },
}));

const qr = {
  createdAt: "2026-06-18T08:30:00.000Z",
  destinationUrl: "https://destination.example/",
  ownerId: "owner-1",
  scanCount: 42,
  shortUrl: "https://qr.example/q/AbCd1234",
  slug: "AbCd1234",
  status: "active" as const,
  title: "Campaign",
  updatedAt: "2026-06-19T09:45:00.000Z",
};

describe("QR dashboard", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({
      email: "owner@example.com",
      role: "user",
      userId: "owner-1",
    });
    headersMock.mockResolvedValue(new Headers({ host: "qr.example" }));
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("lists title destination short URL status scans and dates", () => {
    render(<QrList qrs={[qr]} />);

    expect(screen.getByText("Campaign")).toBeInTheDocument();
    expect(screen.getByText(qr.destinationUrl)).toBeInTheDocument();
    expect(screen.getByText(qr.shortUrl)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("42 scans")).toBeInTheDocument();
    expect(screen.getByText(/^Created /)).toBeInTheDocument();
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
  });

  it("edits destination and title through the authenticated endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...qr,
          destinationUrl: "https://new.example/",
          title: "New campaign",
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<QrActions qr={qr} />);

    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.type(screen.getByLabelText("Title"), "New campaign");
    await userEvent.clear(screen.getByLabelText("Destination URL"));
    await userEvent.type(
      screen.getByLabelText("Destination URL"),
      "new.example",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qr/AbCd1234",
      expect.objectContaining({
        body: JSON.stringify({
          destinationUrl: "new.example",
          title: "New campaign",
        }),
        method: "PATCH",
      }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("disables and enables a saved QR", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...qr, status: "disabled" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<QrActions qr={qr} />);

    await userEvent.click(screen.getByRole("button", { name: "Disable link" }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      status: "disabled",
    });

    rerender(<QrActions qr={{ ...qr, status: "disabled" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Enable link" }));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({
      status: "active",
    });
  });

  it("requires confirmation before deleting", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.stubGlobal("fetch", fetchMock);
    render(<QrActions qr={qr} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete QR" }));
    expect(confirmMock).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    confirmMock.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Delete QR" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/qr/AbCd1234",
      expect.objectContaining({ method: "DELETE" }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("uses notFound for an inaccessible dashboard item", async () => {
    const { QrRepositoryError } = await import("@/src/lib/qr-repository");
    getQrMock.mockRejectedValue(
      new QrRepositoryError(
        "You do not have access to this QR link.",
        403,
        "FORBIDDEN",
      ),
    );
    const { default: QrDetailPage } = await import(
      "@/app/(protected)/dashboard/qr/[slug]/page"
    );

    await expect(
      QrDetailPage({
        params: Promise.resolve({ slug: "someone-elses-qr" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });
});
