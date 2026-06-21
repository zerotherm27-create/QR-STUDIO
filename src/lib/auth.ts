import { redirect } from "next/navigation";
import { createServerClient } from "@/src/lib/supabase/server";

export type UserRole = "admin" | "user";

export type AuthContext = {
  userId: string;
  email: string;
  role: UserRole;
};

export class AuthError extends Error {
  code: "FORBIDDEN" | "UNAUTHORIZED";
  status: 401 | 403;

  constructor(
    message: string,
    status: 401 | 403,
    code: "FORBIDDEN" | "UNAUTHORIZED",
  ) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

export async function requireUser(
  options: { redirectToLogin?: boolean } = {},
): Promise<AuthContext> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId =
    typeof claims?.sub === "string" ? claims.sub : undefined;

  if (error || !userId) {
    if (options.redirectToLogin !== false) {
      redirect("/login");
    }
    throw new AuthError("Authentication is required.", 401, "UNAUTHORIZED");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, role")
    .eq("id", userId)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    (profile.role !== "admin" && profile.role !== "user")
  ) {
    throw new AuthError("Your account profile is unavailable.", 401, "UNAUTHORIZED");
  }

  const claimEmail =
    typeof claims?.email === "string" ? claims.email : "";

  return {
    email: profile.email ?? claimEmail,
    role: profile.role,
    userId: profile.id,
  };
}

export async function requireAdmin(): Promise<AuthContext> {
  const auth = await requireUser();

  if (auth.role !== "admin") {
    throw new AuthError(
      "Administrator access is required.",
      403,
      "FORBIDDEN",
    );
  }

  return auth;
}
