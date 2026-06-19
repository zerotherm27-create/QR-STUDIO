import { login, requestPasswordRecovery } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-700">
          Invite-only
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">
          Sign in to QR Studio
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Accounts are created by administrator invitation. Public sign-up is
          not available.
        </p>

        {error ? (
          <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}

        <form action={login} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-800">
            Email
            <input
              className="mt-1 w-full border border-slate-300 bg-white px-3 py-2"
              name="email"
              required
              type="email"
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Password
            <input
              className="mt-1 w-full border border-slate-300 bg-white px-3 py-2"
              minLength={10}
              name="password"
              required
              type="password"
            />
          </label>
          <button
            className="w-full bg-slate-950 px-4 py-3 font-semibold text-white"
            type="submit"
          >
            Sign in
          </button>
        </form>

        <form action={requestPasswordRecovery} className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-slate-800">
            Recovery email
            <input
              className="mt-1 w-full border border-slate-300 bg-white px-3 py-2"
              name="email"
              required
              type="email"
            />
          </label>
          <button
            className="w-full border border-slate-300 px-4 py-3 font-semibold text-slate-900"
            type="submit"
          >
            Send password recovery
          </button>
        </form>
      </section>
    </main>
  );
}
