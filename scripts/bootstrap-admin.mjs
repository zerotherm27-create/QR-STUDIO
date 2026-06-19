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

async function findAuthUserByEmail(admin, email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email,
    );
    if (user) return user;
    if (data.users.length < 200) return null;
  }
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Provide the existing Auth user's email address.");
  }
  const { url, secret } = config();
  if (!process.argv.slice(3).includes("--confirm")) {
    throw new Error("Refusing to change a role without the exact --confirm flag.");
  }

  const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const user = await findAuthUserByEmail(admin, email);
  if (!user) throw new Error(`No existing Auth user found for ${email}.`);

  const { data: profile, error: readError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (readError) throw readError;

  if (profile.role === "admin") {
    console.log(`No change: ${email} is already an administrator.`);
    console.log("Profiles promoted: 0");
    return;
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", user.id);
  if (updateError) throw updateError;

  console.log(`Promoted existing Auth user ${email} to administrator.`);
  console.log("Profiles promoted: 1");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
