import { headers } from "next/headers";
import Link from "next/link";
import { QrList, type DashboardQr } from "@/src/components/dashboard/qr-list";
import { requireUser } from "@/src/lib/auth";
import { listQrs } from "@/src/lib/qr-repository";

export const dynamic = "force-dynamic";

async function getOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return host ? `${protocol}://${host}` : "";
}

export default async function DashboardPage() {
  const auth = await requireUser();
  const [qrs, origin] = await Promise.all([listQrs(auth), getOrigin()]);
  const dashboardQrs: DashboardQr[] = qrs.map((qr) => ({
    ...qr,
    shortUrl: `${origin}/q/${encodeURIComponent(qr.slug)}`,
  }));

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="studio-kicker">Private collection</p>
          <h1>My QR Codes</h1>
          <p>Manage destinations, status, downloads, and scan totals.</p>
        </div>
        <Link className="btn btn-primary" href="/">
          Create another QR
        </Link>
      </header>
      <QrList qrs={dashboardQrs} />
    </main>
  );
}
