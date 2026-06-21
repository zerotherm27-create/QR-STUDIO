import { requireAdmin, type UserRole } from "@/src/lib/auth";
import { createAdminClient } from "@/src/lib/supabase/admin";
import type { QrStatus } from "@/src/lib/qr-types";

export type AdminServiceErrorCode =
  | "CONFLICT"
  | "LAST_ADMIN"
  | "NOT_FOUND"
  | "VALIDATION";

export class AdminServiceError extends Error {
  code: AdminServiceErrorCode;
  status: 404 | 409 | 422;

  constructor(
    message: string,
    status: 404 | 409 | 422,
    code: AdminServiceErrorCode,
  ) {
    super(message);
    this.name = "AdminServiceError";
    this.status = status;
    this.code = code;
  }
}

export type AdminUser = {
  createdAt: string;
  email: string;
  id: string;
  qrCount: number;
  role: UserRole;
};

export type AdminQr = {
  createdAt: string;
  destinationUrl: string;
  ownerEmail: string;
  ownerId: string;
  scanCount: number;
  slug: string;
  status: QrStatus;
  title: string | null;
  updatedAt: string;
};

type ProfileRow = {
  created_at: string;
  email: string | null;
  id: string;
  role: UserRole;
};

type AdminQrRow = {
  created_at: string;
  destination_url: string;
  owner_id: string;
  scan_count: number;
  slug: string;
  status: QrStatus;
  title: string | null;
  updated_at: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!emailPattern.test(normalized) || normalized.length > 254) {
    throw new AdminServiceError(
      "Enter a valid email address.",
      422,
      "VALIDATION",
    );
  }
  return normalized;
}

function invitationRedirect(origin: string) {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new AdminServiceError(
      "Invitation origin must be a valid URL.",
      422,
      "VALIDATION",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AdminServiceError(
      "Invitation origin must use http or https.",
      422,
      "VALIDATION",
    );
  }
  const confirmationUrl = new URL("/auth/confirm", url);
  confirmationUrl.searchParams.set("next", "/auth/update-password");
  return confirmationUrl.toString();
}

function isDuplicateInvitation(error: { code?: string; message: string; status?: number }) {
  return (
    error.code === "email_exists" ||
    /already (?:been )?(?:registered|invited)|already exists|user already/i.test(
      error.message,
    )
  );
}

export async function inviteUser(email: string, origin: string) {
  await requireAdmin();
  const normalizedEmail = normalizeEmail(email);
  const redirectTo = invitationRedirect(origin);
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(
    normalizedEmail,
    { redirectTo },
  );

  if (error) {
    if (isDuplicateInvitation(error)) {
      throw new AdminServiceError(
        "That email already has an account or pending invitation.",
        409,
        "CONFLICT",
      );
    }
    throw new Error(error.message);
  }

  const userId = data.user?.id;
  if (!userId) {
    throw new Error("Supabase did not return the invited user.");
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: "user" })
    .eq("id", userId);

  if (profileError) {
    throw new Error(profileError.message);
  }

  return { email: normalizedEmail, userId };
}

export async function listUsers(): Promise<AdminUser[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: profiles, error: profileError }, { data: qrs, error: qrError }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, email, role, created_at")
        .order("created_at", { ascending: true }),
      admin.from("qr_codes").select("owner_id"),
    ]);

  if (profileError) {
    throw new Error(profileError.message);
  }
  if (qrError) {
    throw new Error(qrError.message);
  }

  const counts = new Map<string, number>();
  for (const qr of (qrs ?? []) as { owner_id: string | null }[]) {
    if (qr.owner_id) {
      counts.set(qr.owner_id, (counts.get(qr.owner_id) ?? 0) + 1);
    }
  }

  return ((profiles ?? []) as ProfileRow[]).map((profile) => ({
    createdAt: profile.created_at,
    email: profile.email ?? "Unknown email",
    id: profile.id,
    qrCount: counts.get(profile.id) ?? 0,
    role: profile.role,
  }));
}

export async function listAdminQrs(): Promise<AdminQr[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: qrs, error: qrError }, { data: profiles, error: profileError }] =
    await Promise.all([
      admin
        .from("qr_codes")
        .select(
          "slug, destination_url, title, owner_id, status, scan_count, created_at, updated_at",
        )
        .order("created_at", { ascending: false }),
      admin.from("profiles").select("id, email"),
    ]);

  if (qrError) {
    throw new Error(qrError.message);
  }
  if (profileError) {
    throw new Error(profileError.message);
  }

  const emails = new Map(
    ((profiles ?? []) as { email: string | null; id: string }[]).map((profile) => [
      profile.id,
      profile.email ?? "Unknown email",
    ]),
  );

  return ((qrs ?? []) as AdminQrRow[]).map((qr) => ({
    createdAt: qr.created_at,
    destinationUrl: qr.destination_url,
    ownerEmail: emails.get(qr.owner_id) ?? "Unknown owner",
    ownerId: qr.owner_id,
    scanCount: qr.scan_count,
    slug: qr.slug,
    status: qr.status,
    title: qr.title,
    updatedAt: qr.updated_at,
  }));
}

export async function setUserRole(userId: string, role: UserRole) {
  await requireAdmin();
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new AdminServiceError("User id is required.", 422, "VALIDATION");
  }
  if (role !== "admin" && role !== "user") {
    throw new AdminServiceError(
      "Role must be admin or user.",
      422,
      "VALIDATION",
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.schema("private").rpc("set_user_role", {
    p_role: role,
    p_user_id: normalizedUserId,
  });

  if (error) {
    if (/last administrator/i.test(error.message)) {
      throw new AdminServiceError(
        "The last administrator cannot be demoted.",
        409,
        "LAST_ADMIN",
      );
    }
    if (/profile not found/i.test(error.message)) {
      throw new AdminServiceError("User profile not found.", 404, "NOT_FOUND");
    }
    throw new Error(error.message);
  }

  return { role, userId: normalizedUserId };
}
