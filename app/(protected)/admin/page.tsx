import Link from "next/link";
import { listAdminQrs, listUsers } from "@/src/lib/admin-service";
import { requireAdmin } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  await requireAdmin();
  const [{ owner }, users, qrs] = await Promise.all([
    searchParams,
    listUsers(),
    listAdminQrs(),
  ]);
  const filteredQrs = owner ? qrs.filter((qr) => qr.ownerId === owner) : qrs;
  const activeCount = qrs.filter((qr) => qr.status === "active").length;
  const totalScans = qrs.reduce((total, qr) => total + qr.scanCount, 0);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="studio-kicker">Administrator overview</p>
          <h1>All QR Codes</h1>
          <p>Monitor every account, destination, status, and scan total.</p>
        </div>
        <Link className="btn btn-primary" href="/admin/invitations">Manage users</Link>
      </header>
      <section className="admin-metrics" aria-label="Platform metrics">
        <div><strong>{users.length} users</strong><span>Invited accounts</span></div>
        <div><strong>{activeCount} active</strong><span>Working short links</span></div>
        <div><strong>{qrs.length - activeCount} disabled</strong><span>Paused short links</span></div>
        <div><strong>{totalScans} total scans</strong><span>Recorded activity</span></div>
      </section>
      <form className="admin-filter" method="get">
        <label className="field-label">
          Filter by owner
          <select className="control-input" defaultValue={owner ?? ""} name="owner">
            <option value="">All owners</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
          </select>
        </label>
        <button className="btn btn-secondary btn-compact" type="submit">Apply filter</button>
      </form>
      <div className="qr-list">
        {filteredQrs.map((qr) => (
          <article className="qr-list-item" key={qr.slug}>
            <div className="qr-list-heading">
              <div><p className="studio-kicker">{qr.ownerEmail}</p><h2>{qr.title || "Untitled QR code"}</h2></div>
              <span className={`status-pill status-pill-${qr.status}`}>{qr.status === "active" ? "Active" : "Disabled"}</span>
            </div>
            <dl className="qr-metadata">
              <div><dt>Slug</dt><dd>{qr.slug}</dd></div>
              <div><dt>Destination</dt><dd>{qr.destinationUrl}</dd></div>
              <div><dt>Owner</dt><dd>{qr.ownerEmail}</dd></div>
              <div><dt>Activity</dt><dd>{qr.scanCount} scans</dd></div>
            </dl>
            <Link className="btn btn-primary btn-compact" href={`/dashboard/qr/${encodeURIComponent(qr.slug)}`}>Manage</Link>
          </article>
        ))}
        {filteredQrs.length === 0 ? <div className="dashboard-empty"><h2>No QR codes match this owner</h2></div> : null}
      </div>
    </main>
  );
}
