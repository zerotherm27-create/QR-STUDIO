"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/src/lib/supabase/server";

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

function getEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    redirect("/login?error=Enter+a+valid+email+address.");
  }
  return email;
}

export async function login(formData: FormData) {
  const email = getEmail(formData);
  const password = String(formData.get("password") ?? "");
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=Email+or+password+is+incorrect.");
  }

  redirect("/");
}

export async function requestPasswordRecovery(formData: FormData) {
  const email = getEmail(formData);
  const supabase = await createServerClient();
  const redirectTo = `${getSiteUrl()}/auth/confirm?next=/auth/update-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    redirect("/login?error=Could+not+send+the+recovery+email.");
  }

  redirect(
    "/login?message=If+that+invited+account+exists%2C+a+recovery+email+has+been+sent.",
  );
}
