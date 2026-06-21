# Custom Short-Link Aliases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated users choose an optional, globally unique, permanent alias when creating a URL QR code.

**Architecture:** Add a pure alias validator in the QR repository and pass the optional alias through the authenticated creation API. Reuse the existing `qr_codes.slug` primary key for uniqueness, keep random generation as the blank-input fallback, and expose an immutable alias field in the existing generator.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres/RLS, Vitest, Testing Library.

---

### Task 1: Add Server-Side Alias Validation and Creation

**Files:**
- Modify: `src/lib/qr-repository.ts`
- Modify: `tests/qr-repository.test.ts`

- [ ] **Step 1: Write failing validator tests**

Add tests that import `normalizeCustomAlias` and assert:

```ts
expect(normalizeCustomAlias(undefined)).toBeUndefined();
expect(normalizeCustomAlias("  My-Business  ")).toBe("my-business");
expect(() => normalizeCustomAlias("ab")).toThrow("3–40");
expect(() => normalizeCustomAlias("my--business")).toThrow("single hyphens");
expect(() => normalizeCustomAlias("-business")).toThrow("single hyphens");
expect(() => normalizeCustomAlias("my_business")).toThrow("single hyphens");
expect(() => normalizeCustomAlias("Admin")).toThrow("reserved");
```

Run:

```bash
npm test -- tests/qr-repository.test.ts
```

Expected: FAIL because `normalizeCustomAlias` is not exported.

- [ ] **Step 2: Implement the validator**

Add:

```ts
const reservedAliases = new Set([
  "admin",
  "api",
  "auth",
  "dashboard",
  "login",
  "logout",
  "new",
  "settings",
  "signup",
  "support",
  "unavailable",
]);

export function normalizeCustomAlias(value: string | undefined) {
  const alias = value?.trim().toLowerCase();
  if (!alias) return undefined;
  if (alias.length < 3 || alias.length > 40) {
    throw new QrRepositoryError("Alias must be 3–40 characters.", 422, "VALIDATION");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(alias)) {
    throw new QrRepositoryError(
      "Use lowercase letters, numbers, and single hyphens.",
      422,
      "VALIDATION",
    );
  }
  if (reservedAliases.has(alias)) {
    throw new QrRepositoryError("That alias is reserved.", 422, "VALIDATION");
  }
  return alias;
}
```

- [ ] **Step 3: Write failing creation tests**

Update the repository test harness to verify:

```ts
await createQr(
  { customAlias: "My-Business", destinationUrl: "https://example.com" },
  auth,
);
expect(builder.insert).toHaveBeenCalledWith(
  expect.objectContaining({ slug: "my-business" }),
);
```

Also mock a `23505` response and expect:

```ts
await expect(
  createQr(
    { customAlias: "my-business", destinationUrl: "https://example.com" },
    auth,
  ),
).rejects.toMatchObject({
  code: "CONFLICT",
  message: "That alias is already in use.",
  status: 409,
});
```

Run the targeted test and confirm both fail before implementation.

- [ ] **Step 4: Implement custom and random creation paths**

Change the input type to:

```ts
input: {
  customAlias?: string;
  destinationUrl: string;
  title?: string;
}
```

Normalize once. For a custom alias, perform one insert and map `23505` to the exact alias conflict. For no alias, retain five random-slug attempts and the current random collision error.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- tests/qr-repository.test.ts
npx tsc --noEmit
git add src/lib/qr-repository.ts tests/qr-repository.test.ts
git commit -m "feat: validate permanent custom QR aliases"
```

### Task 2: Pass Aliases Through the Creation API

**Files:**
- Modify: `app/api/qr/route.ts`
- Modify: `tests/qr-repository.test.ts`

- [ ] **Step 1: Write a failing API creation test**

Mock `createQr`, call `POST` with:

```json
{
  "customAlias": "my-business",
  "destinationUrl": "https://example.com",
  "title": "My Business"
}
```

Assert:

```ts
expect(createQr).toHaveBeenCalledWith(
  {
    customAlias: "my-business",
    destinationUrl: "https://example.com",
    title: "My Business",
  },
  auth,
);
```

Run the test and confirm it fails because the API drops `customAlias`.

- [ ] **Step 2: Implement API parsing**

Extend the body type and pass:

```ts
customAlias:
  typeof body.customAlias === "string" ? body.customAlias : undefined
```

Do not add alias parsing to `PATCH /api/qr/[slug]`.

- [ ] **Step 3: Verify and commit**

```bash
npm test -- tests/qr-repository.test.ts
npx tsc --noEmit
git add app/api/qr/route.ts tests/qr-repository.test.ts
git commit -m "feat: accept custom aliases during QR creation"
```

### Task 3: Add the Immutable Alias Field to the Generator

**Files:**
- Modify: `src/components/qr-generator.tsx`
- Modify: `tests/qr-generator.test.tsx`
- Modify: `app/globals.css` only if the existing input styles cannot express the guidance text

- [ ] **Step 1: Write failing component tests**

Add tests that:

1. Find **Custom alias (optional)**.
2. Enter `my-business`.
3. Click **Create**.
4. Assert the POST body includes `customAlias: "my-business"`.
5. Resolve the response and assert the alias input is disabled.
6. Click **Direct** and assert the field becomes enabled and empty.

Also verify guidance text includes “cannot be changed after creation.”

Run:

```bash
npm test -- tests/qr-generator.test.tsx
```

Expected: FAIL because the field does not exist.

- [ ] **Step 2: Implement alias state and request payload**

Add:

```ts
const [customAlias, setCustomAlias] = useState("");
```

Pass `customAlias` in the creation body. After creation, set it from `result.slug`. In `clearDynamicLink`, reset it to an empty string.

- [ ] **Step 3: Render the field and immutable guidance**

Render a labeled input with:

```tsx
disabled={Boolean(dynamicQr)}
maxLength={40}
pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
placeholder="my-business"
```

Normalize typing to lowercase and remove spaces without silently removing other invalid characters. Show `/q/{alias}` preview when non-empty and the permanence warning below the field.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/qr-generator.test.tsx
npx tsc --noEmit
npm run lint
git add src/components/qr-generator.tsx tests/qr-generator.test.tsx app/globals.css
git commit -m "feat: add custom alias input to QR generator"
```

### Task 4: Full Verification and Deployment

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document custom aliases**

Add a short section stating:

- aliases are optional;
- allowed format and length;
- aliases are globally unique and permanent;
- blank aliases remain random.

- [ ] **Step 2: Run the full local verification**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Expected: all commands exit successfully.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md
git commit -m "docs: explain permanent custom aliases"
```

- [ ] **Step 4: Push and deploy**

```bash
git push
vercel --prod --yes
```

Expected: Vercel reports a READY production deployment and aliases `my-qr-platform.vercel.app`.

- [ ] **Step 5: Smoke-test production**

Using an invited disposable user:

1. Create a unique alias such as `alias-smoke-<timestamp>`.
2. Verify `/q/<alias>` returns `302` to the chosen destination.
3. Verify a second create request returns `409`.
4. Delete the disposable QR record.

No database migration is required.
