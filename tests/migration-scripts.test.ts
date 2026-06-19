import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function run(script: string, args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [`scripts/${script}`, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

describe("administrator migration scripts", () => {
  it.each(["bootstrap-admin.mjs", "assign-legacy-qrs.mjs"])(
    "%s requires an email, configuration, and exact confirmation",
    (script) => {
      const missingEmail = run(script);
      expect(missingEmail.status).not.toBe(0);
      expect(missingEmail.stderr).toMatch(/email/i);

      const missingConfig = run(script, ["owner@example.com", "--confirm"]);
      expect(missingConfig.status).not.toBe(0);
      expect(missingConfig.stderr).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);

      const noConfirmation = run(script, ["owner@example.com"], {
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SECRET_KEY: "super-secret-value",
      });
      expect(noConfirmation.status).not.toBe(0);
      expect(noConfirmation.stderr).toMatch(/--confirm/);
      expect(`${noConfirmation.stdout}${noConfirmation.stderr}`).not.toContain(
        "super-secret-value",
      );
    },
  );

  it("keeps the fresh schema canonical and finalizes legacy ownership separately", () => {
    const schema = readFileSync("supabase/schema.sql", "utf8");
    expect(schema).toMatch(/owner_id uuid not null/);
    expect(schema).not.toMatch(/\bedit_token\b/);

    const finalMigration = readFileSync(
      "supabase/migrations/20260619143000_finalize_qr_ownership.sql",
      "utf8",
    );
    expect(finalMigration).toMatch(/owner_id set not null/);
    expect(finalMigration).toMatch(/drop column if exists edit_token/);
    expect(finalMigration).toMatch(/owner_id is null/);
  });
});
