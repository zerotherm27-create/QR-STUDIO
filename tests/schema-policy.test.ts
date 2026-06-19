import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("supabase/schema.sql", "utf8").toLowerCase();

describe("database authorization schema", () => {
  it.each([
    "create table if not exists public.profiles",
    "owner_id uuid",
    "status text",
    "private.is_admin",
    "enable row level security",
    "on auth.users",
  ])("contains %s", (fragment) => {
    expect(schema).toContain(fragment);
  });

  it("keeps the fresh schema in its final canonical ownership state", () => {
    expect(schema).toMatch(/owner_id uuid not null/);
    expect(schema).not.toContain("edit_token");
  });

  it("has owner and administrator policies without anonymous policies", () => {
    expect(schema).toMatch(/owner_id\s*=\s*\(select auth\.uid\(\)\)/);
    expect(schema).toContain("private.is_admin()");
    expect(schema).not.toMatch(/create policy[\s\S]*?\bto anon\b/);
  });

  it("allows authenticated users to read only authorized scan rows", () => {
    expect(schema).toMatch(
      /create policy[\s\S]*?on public\.qr_scans[\s\S]*?for select[\s\S]*?exists/,
    );
  });
});
