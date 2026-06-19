import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { QrActions } from "@/src/components/dashboard/qr-actions";
import type { DashboardQr } from "@/src/components/dashboard/qr-list";
import { requireUser } from "@/src/lib/auth";
import { getQr, QrRepositoryError } from "@/src/lib/qr-repository";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

async function getOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return host ? `${protocol}://${host}` : "";
}

export default async function QrDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const auth = await requireUser();
  const { slug } = await params;

  let qr;
  try {
    qr = await getQr(slug, auth);
  } catch (error) {
    if (
      error instanceof QrRepositoryError &&
      (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")
    ) {
      notFound();
    }
    throw error;
  }

  const origin = await getOrigin();
  const dashboardQr: DashboardQr = {
    ...qr,
    shortUrl: `${origin}/q/${encodeURIComponent(qr.slug)}`,
  };

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="studio-kicker">{qr.slug}</p>
          <h1>{qr.title || "Untitled QR code"}</h1>
          <p>{qr.destinationUrl}</p>
        </div>
        <span className={`status-pill status-pill-${qr.status}`}>
          {qr.status === "active" ? "Active" : "Disabled"}
        </span>
      </header>
      <section className="dashboard-summary">
        <div>
          <span>Short URL</span>
          <strong>{dashboardQr.shortUrl}</strong>
        </div>
        <div>
          <span>Scans</span>
          <strong>{qr.scanCount}</strong>
        </div>
        <div>
          <span>Created</span>
          <strong>{formatDate(qr.createdAt)}</strong>
        </div>
        <div>
          <span>Updated</span>
          <strong>{formatDate(qr.updatedAt)}</strong>
        </div>
      </section>
      <QrActions qr={dashboardQr} />
    </main>
  );
}
