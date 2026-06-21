import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QrGenerator } from "@/src/components/qr-generator";

const { toCanvasMock, toStringMock } = vi.hoisted(() => ({
  toCanvasMock: vi.fn(),
  toStringMock: vi.fn(),
}));

vi.mock("qrcode", () => ({
  default: {
    toCanvas: toCanvasMock,
    toString: toStringMock,
  },
}));

const savedQr = {
  createdAt: "2026-06-19T01:00:00.000Z",
  destinationUrl: "https://destination.example/",
  ownerId: "owner-1",
  scanCount: 0,
  shortUrl: "https://qr.example/q/AbCd1234",
  slug: "AbCd1234",
  status: "active",
  title: "Launch page",
  updatedAt: "2026-06-19T01:00:00.000Z",
};

describe("QrGenerator", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    toCanvasMock.mockResolvedValue(undefined);
    toStringMock.mockResolvedValue("<svg />");
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
    HTMLCanvasElement.prototype.toDataURL = vi.fn(
      () => "data:image/png;base64,qr",
    );
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("creates an authenticated QR using only destination and title", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(savedQr), {
        headers: { "Content-Type": "application/json" },
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<QrGenerator />);

    fireEvent.change(screen.getByLabelText("Destination URL"), {
      target: { value: "destination.example" },
    });
    fireEvent.change(screen.getByLabelText("Link title"), {
      target: { value: "Launch page" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(request.body))).toEqual({
      destinationUrl: "destination.example",
      title: "Launch page",
    });
    expect(String(request.body)).not.toContain("editToken");
  });

  it("creates a permanent custom alias and locks it after creation", async () => {
    const customQr = {
      ...savedQr,
      shortUrl: "https://qr.example/q/my-business",
      slug: "my-business",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(customQr), {
        headers: { "Content-Type": "application/json" },
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<QrGenerator />);

    const aliasInput = screen.getByLabelText("Custom alias (optional)");
    expect(
      screen.getByText("The alias cannot be changed after creation."),
    ).toBeVisible();

    fireEvent.change(aliasInput, { target: { value: "My-Business" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(request.body))).toEqual({
      customAlias: "my-business",
      destinationUrl: "https://example.com",
      title: "",
    });
    expect(aliasInput).toBeDisabled();
    expect(aliasInput).toHaveValue("my-business");

    fireEvent.click(screen.getByRole("button", { name: "Direct" }));
    expect(aliasInput).toBeEnabled();
    expect(aliasInput).toHaveValue("");
  });

  it("uses the returned stable short URL as the QR payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(savedQr), {
          headers: { "Content-Type": "application/json" },
          status: 201,
        }),
      ),
    );
    render(<QrGenerator />);

    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(
      (await screen.findAllByText("https://qr.example/q/AbCd1234")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Saved to My QR Codes.")).toBeInTheDocument();
    await waitFor(() =>
      expect(toCanvasMock).toHaveBeenLastCalledWith(
        expect.anything(),
        savedQr.shortUrl,
        expect.any(Object),
      ),
    );
    expect(
      screen.getByRole("link", { name: "Open dashboard item" }),
    ).toHaveAttribute("href", "/dashboard/qr/AbCd1234");
  });

  it("updates a saved QR without sending an edit token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(savedQr), {
          headers: { "Content-Type": "application/json" },
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...savedQr,
            destinationUrl: "https://changed.example/",
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<QrGenerator />);

    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByText("Saved to My QR Codes.");
    await userEvent.clear(screen.getByLabelText("Destination URL"));
    await userEvent.type(
      screen.getByLabelText("Destination URL"),
      "changed.example",
    );
    await userEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/qr/AbCd1234");
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(String(request.body))).toEqual({
      destinationUrl: "changed.example",
      title: "Launch page",
    });
    expect(String(request.body)).not.toContain("editToken");
  });

  it("switches to a direct QR without deleting the saved row", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(savedQr), {
        headers: { "Content-Type": "application/json" },
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<QrGenerator />);

    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByText("Saved to My QR Codes.");
    await userEvent.click(screen.getByRole("button", { name: "Direct" }));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(
      screen.queryByRole("link", { name: "Open dashboard item" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(toCanvasMock).toHaveBeenLastCalledWith(
        expect.anything(),
        "https://destination.example/",
        expect.any(Object),
      ),
    );
  });

  it("keeps API failures visible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Destination is blocked." }), {
          headers: { "Content-Type": "application/json" },
          status: 422,
        }),
      ),
    );
    render(<QrGenerator />);

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Destination is blocked.")).toBeVisible();
  });
});
