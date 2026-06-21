import { expect, type Page } from "@playwright/test";

export const hasAppEnvironment = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    (process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY),
);

export const appEnvironmentReason =
  "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY before running E2E tests.";

export type Credentials = {
  email: string;
  password: string;
};

export function credentials(prefix: string): Credentials | null {
  const email = process.env[`${prefix}_EMAIL`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`];
  return email && password ? { email, password } : null;
}

export async function signIn(page: Page, account: Credentials) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(?:dashboard)?$/);
}

export function uniqueDestination(label: string) {
  return `https://example.com/${label}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
