import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const migration = readFileSync(join(dir, "../../../supabase/migrations/0034_protected_admins.sql"), "utf8");

const PROTECTED_IDENTITIES = [
  ["A-1271", "mohamed.nour@hudl.com"],
  ["A-2082", "yousefabdelgaberarqam@gmail.com"],
  ["A-325", "ahmedghanem19997@gmail.com"],
  ["A-765", "mohamedarqam90@gmail.com"],
] as const;

describe("protected admin migration 0034", () => {
  it("adds is_protected_admin without changing the role enum", () => {
    assert.match(migration, /add column if not exists is_protected_admin boolean not null default false/);
    assert.equal(migration.includes("create type user_role"), false);
    assert.equal(migration.includes("alter type user_role"), false);
  });

  it("contains the 4 exact HR-Code/email pairs", () => {
    for (const [hrCode, email] of PROTECTED_IDENTITIES) {
      assert.match(migration, new RegExp(`'${hrCode}', '${email}'`));
    }
    assert.equal((migration.match(/'A-\d+'/g) ?? []).length, 8);
  });

  it("does not hardcode UUIDs", () => {
    assert.equal(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(migration),
      false
    );
    assert.equal(migration.includes("uuid"), false);
  });

  it("fails safely on missing, mismatched, duplicated, or non-admin identities", () => {
    assert.match(migration, /protected admin identity does not exist/);
    assert.match(migration, /HR-Code\/email do not match/);
    assert.match(migration, /duplicate profiles match protected admin identity/);
    assert.match(migration, /is not currently role=admin/);
    assert.match(migration, /expected exactly 4 protected admins/);
    assert.match(migration, /raise exception 'protected admin migration failed/);
  });

  it("creates a BEFORE UPDATE trigger that protects protected admins", () => {
    assert.match(migration, /create or replace function public\.protect_protected_admins\(\)/);
    assert.match(migration, /create trigger profiles_protect_protected_admins/);
    assert.match(migration, /before update on public\.profiles/);
    assert.match(migration, /execute function public\.protect_protected_admins\(\)/);
  });

  it("trigger blocks demotion", () => {
    assert.match(migration, /new\.role is distinct from 'admin'/);
    assert.match(migration, /protected admin cannot change role away from admin/);
  });

  it("trigger blocks HR-Code change", () => {
    assert.match(migration, /new\.hr_code is distinct from old\.hr_code/);
    assert.match(migration, /protected admin HR-Code cannot be changed/);
  });

  it("trigger blocks deleted_at", () => {
    assert.match(migration, /new\.deleted_at is distinct from old\.deleted_at/);
    assert.match(migration, /protected admin cannot be deleted/);
  });

  it("trigger blocks suspended_at", () => {
    assert.match(migration, /new\.suspended_at is distinct from old\.suspended_at/);
    assert.match(migration, /protected admin cannot be suspended/);
  });

  it("trigger blocks removing protection", () => {
    assert.match(migration, /new\.is_protected_admin is distinct from true/);
    assert.match(migration, /protected admin protection cannot be removed/);
  });

  it("trigger preserves protection against service-role writes", () => {
    const functionBody = migration.slice(
      migration.indexOf("create or replace function public.protect_protected_admins()"),
      migration.indexOf("drop trigger if exists profiles_protect_protected_admins")
    );
    assert.match(functionBody, /if old\.is_protected_admin is not true then/);
    assert.equal(functionBody.includes("auth.uid()"), false);
    assert.equal(functionBody.includes("is_admin()"), false);
    assert.equal(functionBody.includes("service_role"), false);
    assert.equal(functionBody.includes("request.jwt"), false);
    assert.match(migration, /including service-role/);
  });

  it("preserves prevent_role_self_escalation and adds last-admin protection", () => {
    assert.equal(migration.includes("drop function prevent_role_self_escalation"), false);
    assert.equal(migration.includes("drop trigger profiles_prevent_role_self_escalation"), false);
    assert.match(migration, /create or replace function public\.protect_last_admin\(\)/);
    assert.match(migration, /The last remaining admin cannot be downgraded/);
    assert.match(migration, /The last remaining admin cannot be deleted/);
  });
});
