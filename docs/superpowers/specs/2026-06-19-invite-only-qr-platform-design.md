# Invite-Only QR Platform Design

## Summary

Convert the existing QR Studio into an invite-only, multi-user platform with permanent short URLs. The owner and the owner's wife are administrators. Invited regular users can create and manage only their own QR codes. Administrators can manage every account, QR code, and short link.

Public visitors may follow generated short links, but they cannot access the generator or dashboard without an invited account.

## Goals

- Require authentication before anyone can generate or manage QR codes.
- Allow only administrators to invite new users.
- Give administrators full management access across the platform.
- Restrict regular users to QR codes they own.
- Keep generated short URLs active indefinitely unless disabled or deleted.
- Preserve public, fast redirects and scan tracking.
- Enforce authorization in the database as well as the interface.

## Non-Goals

- Open public registration.
- Paid plans, subscriptions, or usage billing.
- Teams or multiple independent workspaces.
- Custom roles beyond `admin` and `user`.
- Password sharing or one shared administrator account.
- Automatic link expiration.

## Roles and Permissions

### Administrator

The owner and the owner's wife each use a separate administrator account. Administrators can:

- Invite users by email.
- View all platform users.
- View, create, edit, disable, and delete any QR code.
- View scan totals and available scan details for every QR code.
- Promote or demote users only through a protected server-side operation.

At least one administrator must always remain. A user cannot promote themselves through client-controlled profile data.

### Regular User

An invited regular user can:

- Sign in and reset their password.
- Create QR codes and permanent short URLs.
- View, edit, disable, and delete only their own QR codes.
- View scan totals and available scan details only for their own QR codes.

A regular user cannot invite people, view other users, change roles, or operate on QR codes owned by another user.

### Public Visitor

A visitor without an account can:

- Open `/q/{slug}` and be redirected when the link is active.

A visitor cannot access the generator, dashboards, user records, invitations, edit tokens, or private analytics.

## Authentication and Invitations

Supabase Auth will provide email/password authentication, password recovery, sessions, and administrator-issued email invitations.

There will be no public sign-up path. New accounts originate from an administrator invitation. The invitation flow is:

1. An administrator enters an email address in the admin dashboard.
2. A protected server endpoint verifies the caller is an administrator.
3. The endpoint uses the Supabase server administration API to send the invitation.
4. The invitee follows the single-use email link and chooses a password.
5. A profile row is created with the `user` role by default.
6. The user signs in and reaches their private dashboard.

Administrative Supabase credentials remain server-only. Roles are stored in a protected profile table and are never determined from user-editable metadata.

## Application Structure

### Public Routes

- `/login`: email/password sign-in and password recovery entry point.
- `/auth/callback`: completes Supabase authentication flows.
- `/q/{slug}`: public redirect and scan-recording route.

### Protected Routes

- `/`: authenticated QR generator.
- `/dashboard`: current user's QR code collection.
- `/dashboard/qr/{slug}`: QR details, editing, download, and analytics.
- `/admin`: administrator overview of all QR codes and users.
- `/admin/invitations`: invitation controls and invitation status.

Unauthenticated access to protected routes redirects to `/login`. Regular users attempting to access administrator routes receive a forbidden response or are redirected to their dashboard.

### Server Boundaries

The browser uses the user's Supabase session for ordinary authenticated operations. Privileged actions, including invitations and role changes, go through server-only endpoints that verify the current administrator before using administrative credentials.

The public redirect route performs a server-side lookup by slug. It exposes only the redirect result and does not expose ownership, edit credentials, or private analytics.

## Data Model

### `profiles`

- `id uuid primary key references auth.users(id)`
- `email text`
- `display_name text`
- `role text not null check (role in ('admin', 'user')) default 'user'`
- `created_at timestamptz`
- `updated_at timestamptz`

The role is controlled by administrators through protected server logic. Authorization must not depend on `user_metadata`.

### `qr_codes`

Extend the existing table with:

- `owner_id uuid not null references profiles(id)`
- `status text not null check (status in ('active', 'disabled')) default 'active'`
- Existing `slug`, `destination_url`, `title`, `scan_count`, and timestamps remain.

The existing client-held `edit_token` model will no longer authorize authenticated edits. Ownership and administrator status replace edit tokens. The column may be retained temporarily during migration and removed after legacy data is handled.

There is no expiration column. A record remains active until explicitly disabled or deleted.

### `qr_scans`

The existing scan table remains linked to `qr_codes`. Users can read scan records only when they own the associated QR code; administrators can read all scan records. Public visitors cannot read scan data.

### Invitations

Supabase Auth manages the invitation token and email flow. If the dashboard needs invitation history beyond what the administration API provides, add a private `invitations` table containing email, inviter, status, and timestamps. This table is never publicly readable.

## Row Level Security

RLS is enabled on every exposed table.

- `profiles`: users may read their own profile; administrators may read all profiles.
- `qr_codes`: users may select, insert, update, and delete rows where `owner_id = auth.uid()`; administrators may operate on all rows.
- `qr_scans`: users may read scans belonging to their QR codes; administrators may read all scans.
- Public roles receive no direct table access for redirects or analytics.

Administrator checks use protected role data. Any helper function used by policies must avoid recursive RLS and must live in a private, unexposed schema when it requires elevated privileges.

Service-role credentials are used only in server code and never appear in `NEXT_PUBLIC_*` variables or browser bundles.

## QR Code and Short-Link Lifecycle

1. An authenticated user enters a destination and chooses QR styling.
2. The server creates a unique slug and a `qr_codes` row owned by that user.
3. The generated QR code encodes the stable `/q/{slug}` URL.
4. Scanning the QR code looks up the slug and records a scan.
5. If active, the route returns an HTTP temporary redirect to the current destination.
6. The owner or an administrator may change the destination without changing the short URL or printed QR code.
7. A disabled link shows a friendly unavailable response and does not redirect.
8. A deleted or unknown link returns a not-found response.

Short links do not expire automatically. Their continued availability depends on keeping the production deployment, database, and chosen domain active.

## Dashboard Experience

### User Dashboard

The default dashboard shows "My QR Codes" with:

- Title and destination.
- Short URL and copy action.
- Active or disabled status.
- Scan count.
- Created and updated dates.
- Edit, download, disable/enable, and delete actions.

The existing generator remains the creation experience but becomes protected and saves every dynamic QR code to the signed-in user's collection.

### Administrator Dashboard

Administrators receive:

- An "All QR Codes" view with owner filtering.
- A user list showing email, role, join date, and QR count.
- Invitation creation and status.
- The same edit, status, analytics, and deletion controls available to owners.

Destructive actions require confirmation. Role changes and deletion of user-owned content clearly describe their effect.

## Legacy Data

Existing local or ownerless QR records need an explicit owner before the new non-null ownership constraint is enforced.

During migration:

1. Create the two administrator accounts.
2. Assign existing QR records to the primary administrator.
3. Verify redirects still resolve.
4. Make `owner_id` non-null.
5. Stop using local file or stateless production fallback storage.
6. Remove browser-local edit-token authorization after confirming migrated records are manageable through authenticated ownership.

Production permanent links require Supabase persistence. The current stateless Vercel fallback is unsuitable because it cannot support ownership, editing, reliable analytics, disabling, or deletion.

## Error Handling

- Invalid credentials show a generic authentication error.
- Expired or consumed invitations direct the user to request a new invitation from an administrator.
- Unauthorized mutations return `403`; missing records return `404`.
- Duplicate or invalid destinations show actionable form errors.
- Disabled links return a branded unavailable page with an appropriate non-success status.
- Scan recording failures do not prevent a valid active link from redirecting.
- Invitation and role-management errors are logged server-side without exposing sensitive provider details.

## Testing

### Authentication

- Unauthenticated users cannot access the generator or dashboards.
- Invited users can set a password and sign in.
- There is no functional public registration path.
- Password recovery works without granting a different role.

### Authorization

- Regular users can create and manage their own records.
- Regular users cannot read or mutate another user's records, including through direct API requests.
- Administrators can manage all records and invite users.
- Client-controlled metadata cannot grant administrator privileges.

### Redirects

- Active slugs redirect to the latest destination.
- Updating a destination does not change the slug.
- Disabled links do not redirect.
- Deleted and unknown links return not found.
- A scan-recording failure does not block an otherwise valid redirect.

### Migration and Persistence

- Existing QR links retain their slugs and destinations after assignment to an administrator.
- Production creation fails safely when persistent storage is not configured; it must not silently create a non-manageable stateless link.
- Permanent links survive redeployment because their records are stored in Supabase.

## Rollout

1. Configure Supabase Auth URLs and email delivery.
2. Create and verify the administrator accounts.
3. Apply schema changes and RLS policies.
4. Migrate existing QR records to the primary administrator.
5. Deploy authentication and protected dashboards.
6. Verify user and administrator permission boundaries.
7. Verify existing and newly created redirects in production.
8. Enable administrator invitations.

## Success Criteria

- Only invited, authenticated accounts can generate QR codes.
- The owner and the owner's wife can manage every account and QR code.
- Regular users can access only their own generated items.
- Public short links remain scannable without login and have no automatic expiry.
- Updating a destination preserves the same printed QR code and short URL.
- Database policies reject unauthorized cross-user access even when the UI is bypassed.
