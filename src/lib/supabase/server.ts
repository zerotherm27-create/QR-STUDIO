import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseConfig } from "./config";

export async function createServerClient() {
  const { publishableKey, url } = getPublicSupabaseConfig();
  const cookieStore = await cookies();

  return createSupabaseServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, options, value } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The root proxy refreshes
          // sessions and writes any changed cookies before rendering.
        }
      },
    },
  });
}
