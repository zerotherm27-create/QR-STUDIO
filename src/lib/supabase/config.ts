export type PublicSupabaseConfig = {
  publishableKey: string;
  url: string;
};

function requireEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  const url = getSupabaseUrl();

  return {
    publishableKey: requireEnvironmentVariable(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ),
    url,
  };
}

export function getSupabaseUrl() {
  return requireEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseSecretKey() {
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!key) {
    throw new Error(
      "Missing required environment variable: SUPABASE_SECRET_KEY (SUPABASE_SERVICE_ROLE_KEY is supported only as a legacy fallback)",
    );
  }

  return key;
}
