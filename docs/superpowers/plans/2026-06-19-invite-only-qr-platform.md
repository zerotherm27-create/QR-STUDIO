# Invite-Only QR Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn QR Studio into an invite-only multi-user platform where administrators manage everyone, regular users manage only their own permanent QR links, and public visitors can only follow active short URLs.

**Architecture:** Use Supabase Auth with cookie-based SSR clients and a Next.js 16 `proxy.ts` for session refresh. Store profiles, ownership, link status, and scans in Postgres with RLS as the primary authorization boundary; use server-only Supabase secret credentials only for invitations, administrator operations, public redirects, and migration. Keep the existing QR designer as a client component, but move persistence and management into authenticated server routes and focused dashboard components.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Auth/Postgres/RLS, `@supabase/ssr`, `@supabase/supabase-js`, Vitest, Testing Library, Playwright.

**Primary references:** [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [Next.js proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).

---

## File Map

- `src/lib/supabase/client.ts`: browser Supabase client.
- `src/lib/supabase/server.ts`: cookie-aware server Supabase client.
- `src/lib/supabase/admin.ts`: server-only secret-key client.
- `src/lib/supabase/proxy.ts`: session refresh helper.
- `proxy.ts`: Next.js 16 proxy entry point.
- `src/lib/auth.ts`: authenticated-user and administrator guards.
- `src/lib/qr-repository.ts`: owned QR CRUD and administrator queries.
- `src/lib/qr-types.ts`: shared database-facing QR/profile types.
- `src/components/qr-generator.tsx`: existing QR designer and authenticated creation UI.
- `src/components/dashboard/*`: user and administrator management UI.
- `app/(auth)/*`: login, invitation completion, and password recovery.
- `app/(protected)/*`: generator and authenticated dashboards.
- `app/api/qr/*`: authenticated QR mutations.
- `app/api/admin/*`: administrator-only invitations and role management.
- `app/q/[slug]/route.ts`: public active-link redirect.
- `supabase/schema.sql`: canonical schema for a fresh project.
- `supabase/migrations/*_invite_only_auth.sql`: CLI-generated migration for an existing project.
- `scripts/bootstrap-admin.mjs`: explicit first-administrator bootstrap utility.
- `tests/*`: unit and route tests.
- `e2e/*`: browser tests for authentication and role boundaries.

### Task 1: Establish the Test and Dependency Baseline

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Install runtime and test dependencies**

Run:

```bash
npm install
npm install @supabase/supabase-js @supabase/ssr
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

Expected: all dependencies install and `npm ls --depth=0` exits successfully.

- [ ] **Step 2: Add test scripts**

Add these scripts to `package.json`:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 3: Create the Vitest configuration**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

```ts
// vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Write and run a smoke test**

```ts
// tests/smoke.test.ts
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(true).toBe(true);
  });
});
```

Run: `npm test`

Expected: one passing test.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts tests/smoke.test.ts
git commit -m "test: add application test harness"
```

### Task 2: Add Supabase SSR Clients and Session Refresh

**Files:**
- Modify: `.env.example`
- Delete: `src/lib/supabase.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/supabase/proxy.ts`
- Create: `proxy.ts`
- Create: `tests/supabase-config.test.ts`

- [ ] **Step 1: Write failing environment-contract tests**

Test exported helpers that throw clear errors when the public URL/key or server secret is absent:

```ts
// tests/supabase-config.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

describe("Supabase configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects a missing server secret", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.resetModules();
    const { createAdminClient } = await import("@/src/lib/supabase/admin");
    expect(() => createAdminClient()).toThrow("SUPABASE_SECRET_KEY");
  });
});
```

Run: `npm test -- tests/supabase-config.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 2: Implement browser, server, and admin clients**

Use `createBrowserClient` in `client.ts`, `createServerClient` plus `cookies()` in `server.ts`, and `createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })` in `admin.ts`. Accept `SUPABASE_SECRET_KEY`, with `SUPABASE_SERVICE_ROLE_KEY` only as a legacy fallback.

The public environment contract is:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 3: Implement session refresh**

`src/lib/supabase/proxy.ts` must:

1. Create a cookie-aware server client from `NextRequest`.
2. Call `supabase.auth.getClaims()`, never `getSession()`, to validate/refresh.
3. Copy changed cookies to both the forwarded request and response.
4. Redirect unauthenticated protected paths (`/`, `/dashboard`, `/admin`) to `/login`.
5. Leave `/login`, `/auth/*`, `/q/*`, and static assets public.

`proxy.ts` exports:

```ts
import type { NextRequest } from "next/server";
import { updateSession } from "@/src/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 4: Run tests and type checking**

Run:

```bash
npm test -- tests/supabase-config.test.ts
npx tsc --noEmit
```

Expected: tests pass and TypeScript exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add .env.example src/lib/supabase proxy.ts tests/supabase-config.test.ts
git commit -m "feat: add Supabase SSR session clients"
```

### Task 3: Create the Ownership Schema and RLS Policies

**Files:**
- Modify: `supabase/schema.sql`
- Create via Supabase CLI: `supabase/migrations/*_invite_only_auth.sql`
- Create: `tests/schema-policy.test.ts`

- [ ] **Step 1: Generate the migration file through the CLI**

Run:

```bash
npx supabase --version
npx supabase migration new invite_only_auth
```

Expected: the CLI prints the exact new timestamped migration path. Use that printed file for every migration edit in this task.

- [ ] **Step 2: Write a failing schema-content test**

The test reads `supabase/schema.sql` and asserts it includes `profiles`, `owner_id`, `status`, `is_admin`, RLS enablement, and ownership/admin policies.

```ts
// tests/schema-policy.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/schema.sql", "utf8");

describe("database authorization schema", () => {
  it.each(["public.profiles", "owner_id", "status", "private.is_admin", "enable row level security"])(
    "contains %s",
    (fragment) => expect(sql).toContain(fragment),
  );
});
```

Run: `npm test -- tests/schema-policy.test.ts`

Expected: FAIL because the ownership schema is absent.

- [ ] **Step 3: Implement the schema and migration SQL**

Both SQL files must define:

- `private` schema, inaccessible to `anon` and `authenticated`.
- `public.profiles(id uuid primary key references auth.users on delete cascade, email, display_name, role, timestamps)`.
- A trigger on `auth.users` that inserts a profile with role `user`.
- `private.is_admin()` as `security definer`, `stable`, `set search_path = ''`, reading `public.profiles`.
- `qr_codes.owner_id uuid references profiles(id)`, initially nullable for legacy migration.
- `qr_codes.status` constrained to `active|disabled`.
- RLS policies granting owners their own rows and administrators all rows.
- `qr_scans` select access through the associated QR owner or administrator.
- No `anon` table policies.
- Explicit grants for `authenticated`, followed by RLS restrictions.
- A private atomic `record_qr_scan(slug, user_agent, referrer, ip_address)` function callable only by the server secret role.

The migration must preserve existing slugs and destinations. Do not set `owner_id not null` until Task 11 assigns legacy rows.

- [ ] **Step 4: Run local database checks**

Run:

```bash
npx supabase start
npx supabase db reset
npx supabase migration list --local
npx supabase db advisors
```

Expected: reset succeeds, the migration is applied, and no security advisor error remains unresolved.

- [ ] **Step 5: Run schema test and commit**

```bash
npm test -- tests/schema-policy.test.ts
git add supabase/schema.sql supabase/migrations tests/schema-policy.test.ts
git commit -m "feat: add owned QR schema and row security"
```

### Task 4: Add Authentication Guards and Invite Acceptance

**Files:**
- Create: `src/lib/auth.ts`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/login/actions.ts`
- Create: `app/(auth)/auth/confirm/route.ts`
- Create: `app/(auth)/auth/update-password/page.tsx`
- Create: `app/(auth)/auth/update-password/actions.ts`
- Create: `app/(protected)/layout.tsx`
- Create: `tests/auth-guards.test.ts`

- [ ] **Step 1: Write failing guard tests**

Mock the server client and verify:

- `requireUser()` redirects to `/login` without valid claims.
- `requireAdmin()` returns the profile only for role `admin`.
- A user-controlled metadata role is ignored.

Run: `npm test -- tests/auth-guards.test.ts`

Expected: FAIL because `src/lib/auth.ts` does not exist.

- [ ] **Step 2: Implement server-side guards**

`requireUser()` calls `auth.getClaims()`, extracts the subject, and loads the matching `profiles` row. `requireAdmin()` calls `requireUser()` and uses only `profiles.role`. Export a typed result:

```ts
export type AuthContext = {
  userId: string;
  email: string;
  role: "admin" | "user";
};
```

- [ ] **Step 3: Implement login and password flows**

- Login action uses `signInWithPassword`.
- Password recovery uses `resetPasswordForEmail(email, { redirectTo: siteUrl + "/auth/confirm?next=/auth/update-password" })`.
- Confirm route validates `token_hash` with `verifyOtp({ token_hash, type })`, constrains `next` to a same-origin path, then redirects.
- Update-password action uses `auth.updateUser({ password })` with a minimum length of 10.
- Protected layout calls `requireUser()` and renders navigation plus logout.
- No sign-up form or `signUp()` call exists.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- tests/auth-guards.test.ts
npx tsc --noEmit
npm run lint
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts 'app/(auth)' 'app/(protected)' tests/auth-guards.test.ts
git commit -m "feat: add invite-only authentication flows"
```

### Task 5: Replace Edit Tokens with Authenticated QR CRUD

**Files:**
- Create: `src/lib/qr-types.ts`
- Create: `src/lib/qr-repository.ts`
- Rewrite: `app/api/qr/route.ts`
- Rewrite: `app/api/qr/[slug]/route.ts`
- Create: `tests/qr-repository.test.ts`
- Delete: `src/lib/dynamic-qr.ts`

- [ ] **Step 1: Write failing repository tests**

Cover:

- Create assigns `owner_id` from the authenticated context, not request JSON.
- Regular-user list filters by owner.
- Administrator list does not add an owner filter.
- Update/delete return forbidden when neither owner nor admin.
- Create fails when persistent Supabase configuration is absent.

Run: `npm test -- tests/qr-repository.test.ts`

Expected: FAIL because the repository does not exist.

- [ ] **Step 2: Implement focused repository functions**

Export:

```ts
createQr(input: { destinationUrl: string; title?: string }, auth: AuthContext)
listQrs(auth: AuthContext)
getQr(slug: string, auth: AuthContext)
updateQr(slug: string, input: { destinationUrl?: string; title?: string; status?: "active" | "disabled" }, auth: AuthContext)
deleteQr(slug: string, auth: AuthContext)
```

Generate an eight-character base64url slug with collision retry. Normalize only `http:` and `https:` destinations; reject credentials embedded in URLs. Use the authenticated server client so RLS remains active.

- [ ] **Step 3: Rewrite authenticated API routes**

- `POST /api/qr`: require user, ignore any submitted owner, create QR.
- `GET /api/qr`: require user, return own rows or all rows for admin.
- `GET/PATCH/DELETE /api/qr/[slug]`: require user and rely on RLS plus repository checks.
- Return `401`, `403`, `404`, and `422` distinctly.
- Never return an edit token.

Response shape:

```ts
{
  slug: string;
  shortUrl: string;
  destinationUrl: string;
  title: string | null;
  status: "active" | "disabled";
  scanCount: number;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- tests/qr-repository.test.ts
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/qr-types.ts src/lib/qr-repository.ts app/api/qr tests/qr-repository.test.ts
git rm src/lib/dynamic-qr.ts
git commit -m "feat: authorize QR management by account ownership"
```

### Task 6: Integrate the Existing QR Designer with Accounts

**Files:**
- Move and modify: `app/page.tsx` → `src/components/qr-generator.tsx`
- Create: `app/(protected)/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/qr-generator.test.tsx`

- [ ] **Step 1: Preserve the existing uncommitted designer**

Before editing, inspect `git diff -- app/page.tsx app/globals.css` and carry forward all current QR types, styling, logo, PNG, SVG, and dynamic-link UI.

- [ ] **Step 2: Write failing interaction tests**

Render `QrGenerator` with a mocked fetch and verify:

- Create sends only destination/title.
- The returned permanent short URL becomes the encoded payload.
- Update sends no edit token.
- “Direct” clears only the current selection and does not delete the saved item.
- API failure remains visible.

Run: `npm test -- tests/qr-generator.test.tsx`

Expected: FAIL until the component is extracted.

- [ ] **Step 3: Implement authenticated generator behavior**

Remove localStorage edit-token persistence. After creating a link, show:

- Stable short URL.
- “Saved to My QR Codes.”
- Update destination.
- Copy link.
- Open dashboard item.

`app/(protected)/page.tsx` calls `requireUser()` and renders `<QrGenerator />`.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- tests/qr-generator.test.tsx
npx tsc --noEmit
npm run lint
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx 'app/(protected)/page.tsx' src/components/qr-generator.tsx app/globals.css tests/qr-generator.test.tsx
git commit -m "feat: connect QR designer to authenticated accounts"
```

### Task 7: Build the User Dashboard and Item Detail

**Files:**
- Create: `app/(protected)/dashboard/page.tsx`
- Create: `app/(protected)/dashboard/qr/[slug]/page.tsx`
- Create: `src/components/dashboard/qr-list.tsx`
- Create: `src/components/dashboard/qr-actions.tsx`
- Create: `tests/qr-dashboard.test.tsx`

- [ ] **Step 1: Write failing dashboard tests**

Verify the list displays title, destination, short URL, status, scan count, and dates. Verify enable/disable and delete call the correct authenticated endpoints and require confirmation for delete.

- [ ] **Step 2: Implement server-loaded user pages**

`/dashboard` calls `listQrs(auth)` and labels the collection “My QR Codes” for users and “All QR Codes” only in the admin area. The item page calls `getQr(slug, auth)` and returns `notFound()` when inaccessible.

- [ ] **Step 3: Implement actions**

Client actions support copy, edit destination/title, enable/disable, delete, PNG/SVG download, and navigation back to the generator. Revalidate dashboard paths after mutations.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/qr-dashboard.test.tsx
npx tsc --noEmit
npm run lint
git add 'app/(protected)/dashboard' src/components/dashboard tests/qr-dashboard.test.tsx
git commit -m "feat: add personal QR management dashboard"
```

### Task 8: Harden Public Redirects and Scan Recording

**Files:**
- Rewrite: `app/q/[slug]/route.ts`
- Create: `app/q/unavailable/page.tsx`
- Create: `src/lib/public-redirect.ts`
- Create: `tests/public-redirect.test.ts`

- [ ] **Step 1: Write failing redirect tests**

Cover:

- Active link returns `302` to the latest destination.
- Disabled link returns a branded `410 Gone` response.
- Missing link returns `404`.
- Scan logging failure still returns the redirect.
- User-controlled destination cannot inject response headers.

- [ ] **Step 2: Implement server-only lookup**

Use the admin client only inside `public-redirect.ts`. Fetch slug/status/destination, then call the atomic scan function. Do not expose table access to `anon`. Validate the destination as `http:` or `https:` immediately before redirect.

- [ ] **Step 3: Return explicit cache headers**

Set:

```http
Cache-Control: private, no-store, max-age=0
```

This prevents a changed destination or disabled status from being hidden behind a cached redirect.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/public-redirect.test.ts
npx tsc --noEmit
git add app/q src/lib/public-redirect.ts tests/public-redirect.test.ts
git commit -m "feat: add permanent status-aware public redirects"
```

### Task 9: Add Administrator Invitation and User Management APIs

**Files:**
- Create: `app/api/admin/invitations/route.ts`
- Create: `app/api/admin/users/route.ts`
- Create: `app/api/admin/users/[id]/role/route.ts`
- Create: `src/lib/admin-service.ts`
- Create: `tests/admin-service.test.ts`

- [ ] **Step 1: Write failing administrator tests**

Verify:

- Regular users receive `403`.
- Admin invitation calls `inviteUserByEmail(email, { redirectTo })`.
- Invite defaults to role `user`.
- Role changes update protected profile data, not Auth user metadata.
- The last administrator cannot be demoted.
- A malformed or duplicate email returns `422` or `409`.

- [ ] **Step 2: Implement administrator service**

Use `requireAdmin()` before creating the admin client. Export:

```ts
inviteUser(email: string, origin: string)
listUsers()
setUserRole(userId: string, role: "admin" | "user")
```

Invitation redirect target: `${origin}/auth/update-password`.

`setUserRole` counts existing administrators in a transaction-safe database function and refuses to reduce the count below one.

- [ ] **Step 3: Implement routes and verify**

```bash
npm test -- tests/admin-service.test.ts
npx tsc --noEmit
npm run lint
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin src/lib/admin-service.ts tests/admin-service.test.ts
git commit -m "feat: add administrator invitations and roles"
```

### Task 10: Build the Administrator Dashboard

**Files:**
- Create: `app/(protected)/admin/page.tsx`
- Create: `app/(protected)/admin/invitations/page.tsx`
- Create: `src/components/dashboard/admin-user-list.tsx`
- Create: `src/components/dashboard/invite-form.tsx`
- Create: `tests/admin-dashboard.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Verify:

- Regular users cannot render admin controls.
- Admin sees all QR codes with owner email.
- Invite form reports success and provider errors.
- Role selector cannot demote the last administrator.

- [ ] **Step 2: Implement admin pages**

Both pages call `requireAdmin()` on the server. The overview displays user count, active/disabled QR counts, total scans, owner filters, and all QR rows. The invitation page displays the invite form and current users with role controls.

- [ ] **Step 3: Verify and commit**

```bash
npm test -- tests/admin-dashboard.test.tsx
npx tsc --noEmit
npm run lint
git add 'app/(protected)/admin' src/components/dashboard tests/admin-dashboard.test.tsx
git commit -m "feat: add administrator management dashboard"
```

### Task 11: Bootstrap Administrators and Migrate Existing Links

**Files:**
- Create: `scripts/bootstrap-admin.mjs`
- Create: `scripts/assign-legacy-qrs.mjs`
- Modify: `package.json`
- Modify: `supabase/schema.sql`
- Modify: generated `supabase/migrations/*_invite_only_auth.sql`
- Modify: `README.md`
- Create: `tests/migration-scripts.test.ts`

- [ ] **Step 1: Write failing script-contract tests**

Check that both scripts reject missing email/configuration, never print secrets, and require exact confirmation before assigning legacy rows or changing a role.

- [ ] **Step 2: Implement bootstrap scripts**

Commands:

```bash
npm run admin:bootstrap -- owner@example.com
npm run qr:assign-legacy -- owner@example.com
```

`admin:bootstrap` finds the Auth user by email and updates `profiles.role` to `admin`. `qr:assign-legacy` resolves the profile and assigns every `owner_id is null` QR row to that profile. Both print counts and require `--confirm`.

- [ ] **Step 3: Finalize the ownership constraint**

After assignment verification, add:

```sql
alter table public.qr_codes alter column owner_id set not null;
alter table public.qr_codes drop column if exists edit_token;
```

Remove the local JSON and stateless Vercel fallback from the application. Document that production creation is unavailable until Supabase is configured.

- [ ] **Step 4: Document deployment setup**

README must include:

- Required environment variables.
- Supabase Auth site URL and redirect URLs.
- How to create the first account, bootstrap the first admin, invite the wife, then promote her.
- How to assign legacy links.
- How to run migrations and advisors.
- The permanence guarantee and its dependency on database/deployment/domain continuity.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- tests/migration-scripts.test.ts
npx tsc --noEmit
npm run lint
git add scripts package.json package-lock.json supabase README.md tests/migration-scripts.test.ts
git commit -m "feat: add administrator bootstrap and legacy migration"
```

### Task 12: Add End-to-End Permission and Redirect Verification

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/auth.spec.ts`
- Create: `e2e/permissions.spec.ts`
- Create: `e2e/redirects.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Configure Playwright**

Use `npm run dev` as the web server and require test-user credentials through environment variables:

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 2: Implement full-flow tests**

Test:

1. Anonymous visitor is redirected from `/` and `/dashboard` to `/login`.
2. Invited user signs in, creates a QR, edits it, and sees only their records.
3. A second regular user cannot fetch or mutate the first user's slug.
4. Admin sees both users and both users' QR records.
5. Active public link redirects; update keeps the slug; disable returns `410`; delete returns `404`.
6. No `/signup` route or public registration control exists.

- [ ] **Step 3: Run the complete verification suite**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e
npx supabase db advisors
git diff --check
```

Expected: all commands pass; advisors show no unresolved security findings.

- [ ] **Step 4: Perform manual production checks**

After deployment:

- Accept one real invitation.
- Promote the wife's account to admin.
- Verify each admin can manage a test user's QR.
- Verify the test user cannot access administrator routes or another user's API records.
- Scan an active QR from a phone.
- Change its destination and scan the same printed code again.
- Disable it and confirm the unavailable response.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e README.md
git commit -m "test: verify invite-only QR platform end to end"
```

## Final Acceptance Checklist

- [ ] Only invited accounts can authenticate; no public registration path exists.
- [ ] Owner and wife have separate administrator accounts.
- [ ] Regular users can create and manage only their own QR codes.
- [ ] Administrators can manage all users and QR codes.
- [ ] RLS blocks cross-user access when the UI and application routes are bypassed.
- [ ] Public active links redirect without authentication.
- [ ] Disabled links return `410`; deleted and unknown links return `404`.
- [ ] Short URLs and printed QR codes remain stable when destinations change.
- [ ] Production contains no stateless or local-file persistence fallback.
- [ ] Existing slugs are preserved and assigned to the primary administrator.
- [ ] Supabase secret credentials remain server-only.
- [ ] Unit tests, build, browser tests, and database advisors all pass.
