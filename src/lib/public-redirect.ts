import { createAdminClient } from "@/src/lib/supabase/admin";

type PublicQrRow = {
  destination_url: string;
  scan_count: number;
  slug: string;
  status: "active" | "disabled";
};

export type PublicQrResult =
  | { kind: "redirect"; destinationUrl: string }
  | { kind: "disabled" }
  | { kind: "missing" };

function safeRedirectDestination(value: string) {
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export async function getPublicQrResult({
  ipAddress,
  referrer,
  slug,
  userAgent,
}: {
  ipAddress: string | null;
  referrer: string | null;
  slug: string;
  userAgent: string | null;
}): Promise<PublicQrResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("qr_codes")
    .select("slug, destination_url, status, scan_count")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return { kind: "missing" };
  }

  const qr = data as PublicQrRow;
  if (qr.status !== "active") {
    return { kind: "disabled" };
  }

  const destinationUrl = safeRedirectDestination(qr.destination_url);
  if (!destinationUrl) {
    console.error("QR redirect has an unsafe destination", { slug });
    return { kind: "missing" };
  }

  try {
    const { error: scanError } = await admin.schema("private").rpc(
      "record_qr_scan",
      {
        p_ip_address: ipAddress,
        p_referrer: referrer,
        p_slug: slug,
        p_user_agent: userAgent,
      },
    );
    if (scanError) {
      const [{ error: insertError }, { error: countError }] = await Promise.all([
        admin.from("qr_scans").insert({
          ip_address: ipAddress,
          qr_slug: slug,
          referrer,
          user_agent: userAgent,
        }),
        admin
          .from("qr_codes")
          .update({ scan_count: qr.scan_count + 1 })
          .eq("slug", slug)
          .eq("status", "active"),
      ]);
      if (insertError || countError) {
        console.error("Could not record QR scan", {
          countError,
          insertError,
          rpcError: scanError,
        });
      }
    }
  } catch (scanError) {
    console.error("Could not record QR scan", scanError);
  }

  return { destinationUrl, kind: "redirect" };
}
