import Link from "next/link";
import type { QrCode } from "@/src/lib/qr-types";

export type DashboardQr = QrCode & { shortUrl: string };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function QrList({ qrs }: { qrs: DashboardQr[] }) {
  if (qrs.length === 0) {
    return (
      <div className="dashboard-empty">
        <h2>No saved QR codes yet</h2>
        <p>Create a dynamic QR from the studio and it will appear here.</p>
        <Link className="btn btn-primary" href="/">
          Create a QR code
        </Link>
      </div>
    );
  }

  return (
    <div className="qr-list">
      {qrs.map((qr) => (
        <article className="qr-list-item" key={qr.slug}>
          <div className="qr-list-heading">
            <div>
              <p className="studio-kicker">{qr.slug}</p>
              <h2>{qr.title || "Untitled QR code"}</h2>
            </div>
            <span className={`status-pill status-pill-${qr.status}`}>
              {qr.status === "active" ? "Active" : "Disabled"}
            </span>
          </div>
          <dl className="qr-metadata">
            <div>
              <dt>Destination</dt>
              <dd>{qr.destinationUrl}</dd>
            </div>
            <div>
              <dt>Short URL</dt>
              <dd>{qr.shortUrl}</dd>
            </div>
            <div>
              <dt>Activity</dt>
              <dd>{qr.scanCount} scans</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>Created {formatDate(qr.createdAt)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>Updated {formatDate(qr.updatedAt)}</dd>
            </div>
          </dl>
          <div className="dashboard-actions">
            <Link className="btn btn-primary btn-compact" href={`/dashboard/qr/${qr.slug}`}>
              Manage
            </Link>
            <a className="btn btn-secondary btn-compact" href={qr.shortUrl}>
              Open short link
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}
