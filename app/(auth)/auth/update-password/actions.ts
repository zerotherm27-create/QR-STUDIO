"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/src/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < 10) {
    redirect(
      "/auth/update-password?error=Password+must+be+at+least+10+characters.",
    );
  }
  if (password !== confirmation) {
    redirect("/auth/update-password?error=Passwords+do+not+match.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(
      "/auth/update-password?error=Could+not+update+the+password.+Request+a+new+link.",
    );
  }

  redirect("/login?message=Password+updated.+You+can+now+sign+in.");
}
