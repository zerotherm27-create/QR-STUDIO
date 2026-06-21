"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import QRCode from "qrcode";
import type { DashboardQr } from "@/src/components/dashboard/qr-list";

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "The QR request failed.");
  }
  return body;
}

function downloadBlob(contents: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function QrActions({ qr }: { qr: DashboardQr }) {
  const router = useRouter();
  const [title, setTitle] = useState(qr.title ?? "");
  const [destinationUrl, setDestinationUrl] = useState(qr.destinationUrl);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");

  async function mutate(
    action: string,
    init: RequestInit,
    successMessage: string,
  ) {
    setBusyAction(action);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/qr/${qr.slug}`, {
        ...init,
        headers:
          init.body === undefined
            ? init.headers
            : { "Content-Type": "application/json", ...init.headers },
      });
      await readResponse(response);
      setMessage(successMessage);
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The QR request failed.");
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function saveChanges() {
    await mutate(
      "save",
      {
        body: JSON.stringify({ destinationUrl, title }),
        method: "PATCH",
      },
      "Changes saved.",
    );
  }

  async function toggleStatus() {
    await mutate(
      "status",
      {
        body: JSON.stringify({
          status: qr.status === "active" ? "disabled" : "active",
        }),
        method: "PATCH",
      },
      qr.status === "active" ? "Link disabled." : "Link enabled.",
    );
  }

  async function deleteQr() {
    if (!window.confirm("Delete this QR code permanently? This cannot be undone.")) {
      return;
    }
    const deleted = await mutate(
      "delete",
      { method: "DELETE" },
      "QR code deleted.",
    );
    if (deleted) {
      router.push("/dashboard");
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(qr.shortUrl);
    setMessage("Short link copied.");
  }

  async function downloadPng() {
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, qr.shortUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 1200,
    });
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${qr.slug}.png`;
    link.click();
  }

  async function downloadSvg() {
    const svg = await QRCode.toString(qr.shortUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      type: "svg",
    });
    downloadBlob(svg, "image/svg+xml;charset=utf-8", `${qr.slug}.svg`);
  }

  return (
    <section className="dashboard-editor" aria-label="QR management actions">
      <div className="dashboard-form-grid">
        <label className="field-label">
          Title
          <input
            className="control-input h-11"
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </label>
        <label className="field-label">
          Destination URL
          <input
            className="control-input h-11"
            onChange={(event) => setDestinationUrl(event.target.value)}
            value={destinationUrl}
          />
        </label>
      </div>
      <div className="dashboard-actions">
        <button
          className="btn btn-primary"
          disabled={Boolean(busyAction)}
          onClick={saveChanges}
          type="button"
        >
          Save changes
        </button>
        <button
          className="btn btn-secondary"
          disabled={Boolean(busyAction)}
          onClick={toggleStatus}
          type="button"
        >
          {qr.status === "active" ? "Disable link" : "Enable link"}
        </button>
        <button className="btn btn-secondary" onClick={copyLink} type="button">
          Copy link
        </button>
        <button className="btn btn-secondary" onClick={downloadPng} type="button">
          Download PNG
        </button>
        <button className="btn btn-secondary" onClick={downloadSvg} type="button">
          Download SVG
        </button>
        <Link className="btn btn-secondary" href="/">
          Open generator
        </Link>
        <button
          className="btn dashboard-delete"
          disabled={Boolean(busyAction)}
          onClick={deleteQr}
          type="button"
        >
          Delete QR
        </button>
      </div>
      {message ? (
        <p className="status-message status-success" aria-live="polite">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="status-message status-error" aria-live="assertive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
