"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminUser } from "@/src/lib/admin-service";
import type { UserRole } from "@/src/lib/auth";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export function AdminUserList({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [busyUserId, setBusyUserId] = useState("");
  const [error, setError] = useState("");
  const adminCount = users.filter((user) => user.role === "admin").length;

  async function changeRole(userId: string, role: UserRole) {
    setBusyUserId(userId);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        body: JSON.stringify({ role }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not update the user role.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the user role.");
    } finally {
      setBusyUserId("");
    }
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Email</th><th>Joined</th><th>QR codes</th><th>Role</th></tr></thead>
        <tbody>
          {users.map((user) => {
            const protectsLastAdmin = user.role === "admin" && adminCount === 1;
            return (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{formatDate(user.createdAt)}</td>
                <td>{user.qrCount}</td>
                <td>
                  <select
                    aria-label={`Role for ${user.email}`}
                    className="control-input"
                    disabled={busyUserId === user.id || protectsLastAdmin}
                    onChange={(event) => changeRole(user.id, event.target.value as UserRole)}
                    value={user.role}
                  >
                    <option value="user">User</option>
                    <option value="admin">Administrator</option>
                  </select>
                  {protectsLastAdmin ? <span className="admin-role-note">Last administrator</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error ? <p className="status-message status-error">{error}</p> : null}
    </div>
  );
}
