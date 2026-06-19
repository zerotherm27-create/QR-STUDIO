# QR Studio

QR Studio is an invite-only platform for permanent, editable QR short links. Supabase Auth controls account access, Postgres stores ownership and scan data, and public `/q/{slug}` routes remain available without login.

## Environment

Create `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` is accepted as a legacy fallback, but `SUPABASE_SECRET_KEY` is preferred. Never expose either secret in a `NEXT_PUBLIC_*` variable or commit `.env.local`.
Before running the standalone administration scripts, export the same values into the shell (for zsh: `set -a; source .env.local; set +a`).

Install and run:

```bash
npm install
npm run dev
```

## Supabase Auth URLs

In Supabase Auth URL Configuration, set the Site URL to the production origin, such as `https://qr.example.com`. Add redirect URLs for each environment:

```text
http://localhost:3000/auth/confirm
http://localhost:3000/auth/update-password
https://qr.example.com/auth/confirm
https://qr.example.com/auth/update-password
```

Invitation and recovery links return through `/auth/confirm`; invited users then choose a password at `/auth/update-password`.

For reliable SSR sessions, customize the Supabase **Invite user** and
**Reset password** email templates so their links send the token hash to the
confirmation route. Use the appropriate type in each template:

```html
<!-- Invite user -->
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite">
  Accept invitation
</a>

<!-- Reset password -->
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">
  Reset password
</a>
```

The confirmation route also accepts a PKCE `code` query parameter. Do not use a
template that returns access tokens in a URL fragment because server routes
cannot read fragments.

## First administrator and invitations

There is no public sign-up. Create the first account in Supabase Auth, then promote that existing Auth user:

```bash
npm run admin:bootstrap -- owner@example.com --confirm
```

The script requires the Supabase URL and secret, changes only the matching `profiles.role`, and never prints credentials.

Sign in as the first administrator, open `/admin/invitations`, invite your wife, and let her accept the email invitation and choose a password. After her profile exists, promote her from the user list. Roles live only in `public.profiles`, never Auth user metadata. The database refuses to demote the last administrator.

## Existing QR links

Before applying the final ownership migration, assign every legacy row with a null owner:

```bash
npm run qr:assign-legacy -- owner@example.com --confirm
```

The script prints ownerless counts before and after assignment. Do not apply the final migration unless the final count is zero. Existing slugs and destinations are preserved.

## Database migrations

For a fresh project with no legacy QR rows, apply migrations normally:

```bash
npx supabase db push
npx supabase migration list
npx supabase db advisors
```

For an existing project that already has QR rows, first run
`20260619092417_invite_only_auth.sql` through the Supabase SQL Editor. This
idempotent migration adds nullable ownership and the authorization policies.
Then create and bootstrap the first administrator, run
`npm run qr:assign-legacy -- owner@example.com --confirm`, and only after the
ownerless count reaches zero run `npx supabase db push`. The push can safely
re-run the first migration and then applies the final ownership migration.

The finalization migration aborts if ownerless QR rows remain, then makes
`owner_id` non-null and drops `edit_token`. `supabase/schema.sql` represents
the canonical final schema for fresh projects.

Review and resolve database advisor findings before production deployment, especially security or RLS findings.

## Verification

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

### Browser permission tests

Playwright covers anonymous route protection, the absence of public sign-up,
cross-user isolation, administrator visibility, and the complete public-link
lifecycle. Use disposable invited accounts in a non-production Supabase
project:

```dotenv
E2E_USER_EMAIL=user-one@example.com
E2E_USER_PASSWORD=a-test-password
E2E_SECOND_USER_EMAIL=user-two@example.com
E2E_SECOND_USER_PASSWORD=a-test-password
E2E_ADMIN_EMAIL=admin@example.com
E2E_ADMIN_PASSWORD=a-test-password
```

Export `.env.local` and the E2E variables into the shell, install the browser
once, then run:

```bash
set -a; source .env.local; source .env.e2e.local; set +a
npx playwright install chromium
npm run test:e2e
```

Credential-dependent tests explicitly skip when these variables are absent.
They never contain real credentials in source control.

## Permanence

QR links have no automatic expiry and keep the same slug when their destination changes. “Permanent” still depends on continued operation of the deployment, Supabase project/database, and domain. Losing or retiring any of those can break printed QR codes, so maintain backups, billing, and domain renewal.
