import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const migration = readFileSync(join(dir, "../../../supabase/migrations/0032_annual_leave_ledger.sql"), "utf8");
const previous = readFileSync(join(dir, "../../../supabase/migrations/0031_over_target.sql"), "utf8");

describe("annual leave ledger migration 0032", () => {
  it("creates public.annual_leave_ledger without modifying 0031", () => {
    assert.match(migration, /create table annual_leave_ledger/);
    assert.match(previous, /create table over_target/);
    assert.equal(previous.includes("annual_leave_ledger"), false);
    assert.equal(migration.includes("expected_weeks"), false);
    assert.equal(migration.includes("expected_week_collectors"), false);
    assert.equal(migration.includes("batchUpdate"), false);
    assert.equal(migration.includes("Annual Spare"), true);
  });

  it("defines the required columns", () => {
    assert.match(migration, /id uuid primary key default gen_random_uuid\(\)/);
    assert.match(migration, /hr_code text not null/);
    assert.match(migration, /collector_id uuid references profiles \(id\) on delete set null/);
    assert.match(migration, /leave_date date not null/);
    assert.match(migration, /leave_type text not null/);
    assert.match(migration, /source_week text/);
    assert.match(migration, /source_cell text/);
    assert.match(migration, /action text not null default 'consume'/);
    assert.match(migration, /created_at timestamptz not null default now\(\)/);
    assert.match(migration, /updated_at timestamptz not null default now\(\)/);
  });

  it("accepts only AL-R and AL-C leave types", () => {
    assert.match(migration, /annual_leave_ledger_leave_type_check/);
    assert.match(migration, /leave_type in \('AL-R', 'AL-C'\)/);
    assert.equal(/leave_type in \([^)]*SL/.test(migration), false);
    assert.equal(/leave_type in \([^)]*UL/.test(migration), false);
  });

  it("accepts only consume and reverse actions", () => {
    assert.match(migration, /annual_leave_ledger_action_check/);
    assert.match(migration, /action in \('consume', 'reverse'\)/);
  });

  it("uniquely identifies a leave day by HR-Code, date, and leave type", () => {
    assert.match(migration, /annual_leave_ledger_identity_unique/);
    assert.match(migration, /unique \(hr_code, leave_date, leave_type\)/);
    assert.equal(/unique \(hr_code, leave_date, leave_type, action\)/.test(migration), false);
    assert.equal(/unique \(hr_code, leave_date, leave_type, source_week/.test(migration), false);
  });

  it("keeps collector_id nullable and stores canonical uppercase HR-Code", () => {
    assert.match(migration, /collector_id uuid references profiles \(id\) on delete set null/);
    assert.equal(/collector_id uuid not null/.test(migration), false);
    assert.match(migration, /hr_code = upper\(btrim\(hr_code\)\) and hr_code <> ''/);
  });

  it("enables SELECT-only RLS for admin and matching collector HR-Code", () => {
    assert.match(migration, /alter table annual_leave_ledger enable row level security/);
    assert.match(migration, /create policy annual_leave_ledger_select on annual_leave_ledger\s+for select/s);
    assert.match(migration, /lower\(p\.hr_code\) = lower\(annual_leave_ledger\.hr_code\)/);
    assert.match(migration, /or is_admin\(\)/);
    assert.match(migration, /grant select on table annual_leave_ledger to authenticated/);
    assert.equal(/for insert/.test(migration), false);
    assert.equal(/for update/.test(migration), false);
    assert.equal(/for delete/.test(migration), false);
    assert.equal(/grant insert/.test(migration), false);
    assert.equal(/grant update/.test(migration), false);
    assert.equal(/grant delete/.test(migration), false);
  });

  it("adds lookup indexes and reuses set_updated_at", () => {
    assert.match(migration, /annual_leave_ledger_hr_code_idx\s+on annual_leave_ledger \(lower\(hr_code\)\)/);
    assert.match(migration, /annual_leave_ledger_collector_id_idx\s+on annual_leave_ledger \(collector_id\)/);
    assert.match(migration, /annual_leave_ledger_leave_date_idx\s+on annual_leave_ledger \(leave_date\)/);
    assert.match(migration, /annual_leave_ledger_leave_type_idx\s+on annual_leave_ledger \(leave_type\)/);
    assert.match(migration, /annual_leave_ledger_source_week_idx\s+on annual_leave_ledger \(source_week\)/);
    assert.match(migration, /execute function set_updated_at\(\)/);
  });

  it("does not write Annual Spare or change Expected", () => {
    const expected = readFileSync(join(dir, "../expected/sheet.ts"), "utf8");
    const annualSpare = readFileSync(join(dir, "sheet.ts"), "utf8");
    assert.equal(expected.includes("annual_leave_ledger"), false);
    assert.equal(annualSpare.includes("batchUpdate"), false);
    assert.equal(annualSpare.includes(":append"), false);
  });
});
