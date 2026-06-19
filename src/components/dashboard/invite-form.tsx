"use client";

import { useState } from "react";

async function readResponse(response: Response) {
  const body = (await response.json()) as { email?: string; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Could not send the invitation.");
  return body;
}

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/invitations", {
        body: JSON.stringify({ email }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await readResponse(response);
      setMessage(`Invitation sent to ${result.email ?? email.trim()}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the invitation.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form className="dashboard-editor" onSubmit={submit}>
      <label className="field-label">
        Email address
        <input
          autoComplete="email"
          className="control-input h-11"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="person@example.com"
          required
          type="email"
          value={email}
        />
      </label>
      <div className="dashboard-actions">
        <button className="btn btn-primary" disabled={isSending} type="submit">
          {isSending ? "Sending…" : "Send invitation"}
        </button>
      </div>
      {message ? <p className="status-message status-success">{message}</p> : null}
      {error ? <p className="status-message status-error">{error}</p> : null}
    </form>
  );
}
