import Link from "next/link";
import { AdminUserList } from "@/src/components/dashboard/admin-user-list";
import { InviteForm } from "@/src/components/dashboard/invite-form";
import { listUsers } from "@/src/lib/admin-service";
import { requireAdmin } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminInvitationsPage() {
  await requireAdmin();
  const users = await listUsers();
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div><p className="studio-kicker">Account access</p><h1>Invitations and Roles</h1><p>Invite new members as users, then promote trusted administrators.</p></div>
        <Link className="btn btn-secondary" href="/admin">Back to overview</Link>
      </header>
      <section className="admin-section"><h2>Invite a user</h2><InviteForm /></section>
      <section className="admin-section"><h2>Current users</h2><AdminUserList users={users} /></section>
    </main>
  );
}
