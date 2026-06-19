import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/src/lib/auth";
import { createServerClient } from "@/src/lib/supabase/server";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const auth = await requireUser();

  async function logout() {
    "use server";
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex min-h-16 max-w-7xl items-center gap-5 px-6">
          <Link className="font-bold text-slate-950" href="/">
            QR Studio
          </Link>
          <Link className="text-sm text-slate-700" href="/dashboard">
            My QR Codes
          </Link>
          {auth.role === "admin" ? (
            <Link className="text-sm text-slate-700" href="/admin">
              Admin
            </Link>
          ) : null}
          <span className="ml-auto text-sm text-slate-500">{auth.email}</span>
          <form action={logout}>
            <button
              className="border border-slate-300 px-3 py-2 text-sm font-semibold"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>
      {children}
    </>
  );
}
