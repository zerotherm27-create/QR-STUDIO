# Custom Short-Link Aliases Design

## Summary

Allow an authenticated user to choose an optional permanent alias when creating a URL QR code. A custom alias produces a stable short URL such as:

```text
https://my-qr-platform.vercel.app/q/my-business
```

If the user leaves the alias blank, QR Studio continues generating a random eight-character slug. Existing links and QR codes are unchanged.

## Rules

- A custom alias is optional.
- Custom aliases are normalized to lowercase before validation.
- Allowed characters are lowercase ASCII letters, numbers, and single hyphens between alphanumeric groups.
- Length is 3–40 characters.
- An alias cannot begin or end with a hyphen.
- Consecutive hyphens are rejected.
- Aliases are unique across the entire platform, not merely per user.
- Aliases are permanent after creation.
- A destination, title, or active/disabled status remains editable without changing the alias.
- Existing random slugs remain valid even though they may contain uppercase characters.

Reserved aliases:

```text
admin
api
auth
dashboard
login
logout
new
settings
signup
support
unavailable
```

Reserved aliases are rejected even when submitted with different capitalization.

## User Experience

The URL generator receives a field labeled **Custom alias (optional)**. The field appears before the dynamic-link creation controls and displays the resulting path format:

```text
my-business → /q/my-business
```

The interface explains that the alias cannot be changed after creation. When a saved QR is selected, the alias field becomes read-only. Choosing **Direct** clears the saved selection and allows a new alias to be entered for another QR.

Validation feedback is specific:

- Too short or long: “Alias must be 3–40 characters.”
- Invalid format: “Use lowercase letters, numbers, and single hyphens.”
- Reserved value: “That alias is reserved.”
- Existing value: “That alias is already in use.”

## API and Repository

`POST /api/qr` accepts an optional `customAlias` string. The API never accepts an owner ID or an alias update through `PATCH`.

The repository exposes a pure validator:

```ts
normalizeCustomAlias(value: string | undefined): string | undefined
```

Creation behavior:

1. Normalize and validate `customAlias`.
2. If present, attempt one insert with that exact slug.
3. Convert a Postgres unique violation into a `409 CONFLICT` response with the alias-in-use message.
4. If absent, retain the existing random-slug collision retry.

Update behavior does not include a slug or alias property. Extra request properties are ignored, so the existing slug remains immutable.

## Database

No schema migration is required. `qr_codes.slug` is already the primary key and enforces global uniqueness.

A database format constraint will not be added because existing random slugs use a broader character set. Application validation applies only to newly requested custom aliases, while the primary key remains the final collision guard.

## Security

- Alias ownership is assigned through the authenticated account exactly like random links.
- The server performs all validation; client validation is only an early usability check.
- Reserved-name checks prevent misleading short URLs.
- Global uniqueness prevents two users from claiming the same public path.
- Alias immutability protects printed QR codes and previously shared URLs.

## Testing

Repository tests cover normalization, valid aliases, every invalid format category, reserved words, duplicate conflicts, and random-slug fallback.

API tests verify that `customAlias` is forwarded only during creation and cannot change through update requests.

Component tests verify the optional field, creation payload, read-only state after creation, alias guidance, and clearing for a new QR.

The full unit, type, lint, and production build suites must pass. A production smoke test will create a disposable custom alias after deployment and verify its redirect before deleting it.

## Success Criteria

- A signed-in user can create `/q/my-business`.
- The same alias cannot be claimed twice.
- Invalid and reserved aliases receive clear errors.
- Blank alias input still generates a random slug.
- A created alias cannot be changed.
- Existing short links continue working unchanged.
