import { afterEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

describe("Supabase configuration", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    createClientMock.mockReset();
  });

  it("requires the public project URL and publishable key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    const { getPublicSupabaseConfig } = await import(
      "@/src/lib/supabase/config"
    );

    expect(() => getPublicSupabaseConfig()).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it("requires a server secret for the admin client", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://example-project.supabase.co",
    );
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const { createAdminClient } = await import("@/src/lib/supabase/admin");

    expect(() => createAdminClient()).toThrow("SUPABASE_SECRET_KEY");
  });

  it("accepts the legacy service-role key as a fallback", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://example-project.supabase.co",
    );
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-service-role");

    const { createAdminClient } = await import("@/src/lib/supabase/admin");
    createAdminClient();

    expect(createClientMock).toHaveBeenCalledWith(
      "https://example-project.supabase.co",
      "legacy-service-role",
      expect.objectContaining({
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }),
    );
  });
});
