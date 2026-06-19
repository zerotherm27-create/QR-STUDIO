import { randomBytes } from "node:crypto";
import type { AuthContext } from "@/src/lib/auth";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createServerClient } from "@/src/lib/supabase/server";
import {
  mapQrRow,
  type QrCode,
  type QrRow,
  type QrStatus,
} from "@/src/lib/qr-types";

export type QrRepositoryErrorCode =
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION";

export class QrRepositoryError extends Error {
  code: QrRepositoryErrorCode;
  status: 403 | 404 | 409 | 422;

  constructor(
    message: string,
    status: 403 | 404 | 409 | 422,
    code: QrRepositoryErrorCode,
  ) {
    super(message);
    this.name = "QrRepositoryError";
    this.status = status;
    this.code = code;
  }
}

const qrColumns =
  "slug, destination_url, title, owner_id, status, scan_count, created_at, updated_at";

function cleanTitle(title: string | undefined) {
  const value = title?.trim();
  return value ? value.slice(0, 200) : null;
}

function createSlug() {
  return randomBytes(6).toString("base64url").slice(0, 8);
}

function throwDatabaseError(message: string, error: { code?: string; message: string }) {
  if (error.code === "23505") {
    throw new QrRepositoryError(message, 409, "CONFLICT");
  }
  throw new Error(error.message);
}

export function normalizeDestinationUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new QrRepositoryError(
      "Enter a destination URL.",
      422,
      "VALIDATION",
    );
  }

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new QrRepositoryError(
      "Destination must be a valid http or https URL.",
      422,
      "VALIDATION",
    );
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new QrRepositoryError(
      "Destination must be an http or https URL without embedded credentials.",
      422,
      "VALIDATION",
    );
  }

  return url.toString();
}

export async function createQr(
  input: { destinationUrl: string; title?: string },
  auth: AuthContext,
): Promise<QrCode> {
  const supabase = await createServerClient();
  const destinationUrl = normalizeDestinationUrl(input.destinationUrl);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("qr_codes")
      .insert({
        destination_url: destinationUrl,
        owner_id: auth.userId,
        slug: createSlug(),
        status: "active",
        title: cleanTitle(input.title),
      })
      .select(qrColumns)
      .single();

    if (data) {
      return mapQrRow(data as QrRow);
    }

    if (!error) {
      throw new Error("Supabase did not return the created QR record.");
    }

    if (error?.code !== "23505") {
      throwDatabaseError("A QR code with that slug already exists.", error);
    }
  }

  throw new QrRepositoryError(
    "Could not create a unique QR link. Try again.",
    409,
    "CONFLICT",
  );
}

export async function listQrs(auth: AuthContext): Promise<QrCode[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("qr_codes")
    .select(qrColumns)
    .order("created_at", { ascending: false });

  if (auth.role !== "admin") {
    query = query.eq("owner_id", auth.userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as QrRow[]).map(mapQrRow);
}

async function getAuthorizedRow(slug: string, auth: AuthContext) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("qr_codes")
    .select(qrColumns)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new QrRepositoryError("QR link not found.", 404, "NOT_FOUND");
  }

  const row = data as QrRow;
  if (auth.role !== "admin" && row.owner_id !== auth.userId) {
    throw new QrRepositoryError(
      "You do not have access to this QR link.",
      403,
      "FORBIDDEN",
    );
  }

  return row;
}

export async function getQr(
  slug: string,
  auth: AuthContext,
): Promise<QrCode> {
  return mapQrRow(await getAuthorizedRow(slug, auth));
}

export async function updateQr(
  slug: string,
  input: {
    destinationUrl?: string;
    status?: QrStatus;
    title?: string;
  },
  auth: AuthContext,
): Promise<QrCode> {
  await getAuthorizedRow(slug, auth);

  const changes: Record<string, string | null> = {};
  if (input.destinationUrl !== undefined) {
    changes.destination_url = normalizeDestinationUrl(input.destinationUrl);
  }
  if (input.title !== undefined) {
    changes.title = cleanTitle(input.title);
  }
  if (input.status !== undefined) {
    if (input.status !== "active" && input.status !== "disabled") {
      throw new QrRepositoryError(
        "Status must be active or disabled.",
        422,
        "VALIDATION",
      );
    }
    changes.status = input.status;
  }

  if (Object.keys(changes).length === 0) {
    throw new QrRepositoryError(
      "Provide a destination, title, or status to update.",
      422,
      "VALIDATION",
    );
  }

  const supabase = await createServerClient();
  let query = supabase.from("qr_codes").update(changes).eq("slug", slug);
  if (auth.role !== "admin") {
    query = query.eq("owner_id", auth.userId);
  }
  const { data, error } = await query.select(qrColumns).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new QrRepositoryError(
      "You do not have access to this QR link.",
      403,
      "FORBIDDEN",
    );
  }

  return mapQrRow(data as QrRow);
}

export async function deleteQr(slug: string, auth: AuthContext) {
  await getAuthorizedRow(slug, auth);
  const supabase = await createServerClient();
  let query = supabase.from("qr_codes").delete().eq("slug", slug);
  if (auth.role !== "admin") {
    query = query.eq("owner_id", auth.userId);
  }
  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }
}
