import { createAdminClient } from "@/src/lib/supabase/admin";

export type DynamicQrCode = {
  destination_url: string;
  scan_count: number;
  slug: string;
};

export async function recordQrScan({
  ipAddress,
  referrer,
  slug,
  userAgent,
}: {
  ipAddress: string | null;
  referrer: string | null;
  slug: string;
  userAgent: string | null;
}): Promise<DynamicQrCode | null> {
  const supabase = createAdminClient();
  const { data: qrCode, error } = await supabase
    .from("qr_codes")
    .select("slug, destination_url, scan_count")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!qrCode) {
    return null;
  }

  const [{ error: scanError }, { error: countError }] = await Promise.all([
    supabase.from("qr_scans").insert({
      ip_address: ipAddress,
      qr_slug: slug,
      referrer,
      user_agent: userAgent,
    }),
    supabase
      .from("qr_codes")
      .update({ scan_count: qrCode.scan_count + 1 })
      .eq("slug", slug),
  ]);

  if (scanError) {
    console.error("Could not record QR scan", scanError);
  }
  if (countError) {
    console.error("Could not update QR scan count", countError);
  }

  return qrCode;
}
