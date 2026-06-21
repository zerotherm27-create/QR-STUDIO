import { updatePassword } from "./actions";

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-950">
          Choose your password
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Use at least 10 characters.
        </p>
        {error ? (
          <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <form action={updatePassword} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-800">
            New password
            <input
              className="mt-1 w-full border border-slate-300 bg-white px-3 py-2"
              minLength={10}
              name="password"
              required
              type="password"
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Confirm password
            <input
              className="mt-1 w-full border border-slate-300 bg-white px-3 py-2"
              minLength={10}
              name="confirmation"
              required
              type="password"
            />
          </label>
          <button
            className="w-full bg-slate-950 px-4 py-3 font-semibold text-white"
            type="submit"
          >
            Save password
          </button>
        </form>
      </section>
    </main>
  );
}
