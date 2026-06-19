import { createClient } from "@supabase/supabase-js";

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!secret) throw new Error("Missing SUPABASE_SECRET_KEY.");
  return { secret, url };
}

async function countOwnerless(admin) {
  const { count, error } = await admin
    .from("qr_codes")
    .select("slug", { count: "exact", head: true })
    .is("owner_id", null);
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Provide the destination profile email address.");
  }
  const { url, secret } = config();
  if (!process.argv.slice(3).includes("--confirm")) {
    throw new Error("Refusing to assign QR ownership without the exact --confirm flag.");
  }

  const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .single();
  if (profileError) throw profileError;

  const before = await countOwnerless(admin);
  if (before > 0) {
    const { error: updateError } = await admin
      .from("qr_codes")
      .update({ owner_id: profile.id })
      .is("owner_id", null);
    if (updateError) throw updateError;
  }
  const after = await countOwnerless(admin);

  console.log(`Legacy owner: ${profile.email ?? email}`);
  console.log(`Ownerless QR rows before: ${before}`);
  console.log(`QR rows assigned: ${before - after}`);
  console.log(`Ownerless QR rows after: ${after}`);
  if (after !== 0) throw new Error("Some QR rows remain ownerless; do not run final migration.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
