import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROTECTED_ADMIN_IDENTITY_PRESERVED_MESSAGE,
  buildCollectorImportProfileWrite,
  planTeamRosterProfileUpdate,
} from "./protected-admins";

const dir = fileURLToPath(new URL(".", import.meta.url));
const importSource = readFileSync(join(dir, "collector-import.ts"), "utf8");
const route = readFileSync(join(dir, "../../app/api/admin/collectors/route.ts"), "utf8");

const protectedAdmin = {
  role: "admin" as const,
  hr_code: "A-1271",
  email: "mohamed.nour@hudl.com",
  is_protected_admin: true,
};

const temporaryAdmin = {
  role: "admin" as const,
  hr_code: "T-100",
  email: "temp.admin@example.com",
  is_protected_admin: false,
};

const collector = {
  role: "collector" as const,
  hr_code: "C-1",
  email: "collector@example.com",
  is_protected_admin: false,
};

const incoming = {
  hr_code: "A-9999",
  full_name: "Changed Name",
  email: "changed@example.com",
  phone: "555",
  team: "Team X",
  status: "Active",
};

describe("collector import protected-admin safety", () => {
  it("wires identity preservation into collector import", () => {
    assert.match(importSource, /buildCollectorImportProfileWrite\(existing, row\)/);
    assert.match(importSource, /PROTECTED_ADMIN_IDENTITY_PRESERVED_MESSAGE/);
    assert.match(importSource, /protectedAdminIdentityWouldChange/);
    assert.match(importSource, /outcome: "skipped"/);
  });

  it("preserves protected admin role, HR-Code, and email on import write", () => {
    const write = buildCollectorImportProfileWrite(protectedAdmin, incoming);
    assert.equal(write.role, "admin");
    assert.equal(write.hr_code, "A-1271");
    assert.equal(write.email, "mohamed.nour@hudl.com");
    assert.equal(write.full_name, "Changed Name");
    assert.equal(write.phone, "555");
    assert.equal("is_protected_admin" in write, false);
  });

  it("leaves temporary admin and collector import writes unchanged", () => {
    const tempWrite = buildCollectorImportProfileWrite(temporaryAdmin, incoming);
    assert.equal(tempWrite.role, "admin");
    assert.equal(tempWrite.hr_code, "A-9999");
    assert.equal(tempWrite.email, "changed@example.com");

    const collectorWrite = buildCollectorImportProfileWrite(collector, incoming);
    assert.equal(collectorWrite.role, "collector");
    assert.equal(collectorWrite.hr_code, "A-9999");
    assert.equal(collectorWrite.email, "changed@example.com");

    const created = buildCollectorImportProfileWrite(undefined, incoming);
    assert.equal(created.role, "collector");
    assert.equal(created.hr_code, "A-9999");
  });
});

describe("team-sheet sync protected-admin safety", () => {
  it("wires identity preservation into team-sheet sync", () => {
    assert.match(route, /planTeamRosterProfileUpdate\(existing, row\)/);
    assert.match(route, /plan\.outcome === "skipped"/);
    assert.match(route, /update\(plan\.fields\)/);
  });

  it("preserves protected admin HR-Code and email when the sheet identity differs", () => {
    const plan = planTeamRosterProfileUpdate(protectedAdmin, incoming);
    assert.equal(plan.outcome, "skipped");
    if (plan.outcome === "skipped") {
      assert.equal(plan.message, PROTECTED_ADMIN_IDENTITY_PRESERVED_MESSAGE);
    }
  });

  it("updates non-identity roster fields for a protected admin with matching identity", () => {
    const plan = planTeamRosterProfileUpdate(protectedAdmin, {
      hr_code: "A-1271",
      full_name: "Mohamed Nour",
      email: "mohamed.nour@hudl.com",
      phone: "111",
      team: "Core",
      status: "Active",
    });
    assert.equal(plan.outcome, "update");
    if (plan.outcome === "update") {
      assert.equal(plan.authEmail, undefined);
      assert.equal("email" in plan.fields, false);
      assert.equal("hr_code" in plan.fields, false);
      assert.equal(plan.fields.full_name, "Mohamed Nour");
      assert.equal(plan.fields.phone, "111");
    }
  });

  it("leaves temporary admin and collector team-sheet updates unchanged", () => {
    const tempPlan = planTeamRosterProfileUpdate(temporaryAdmin, incoming);
    assert.equal(tempPlan.outcome, "update");
    if (tempPlan.outcome === "update") {
      assert.equal(tempPlan.authEmail, "changed@example.com");
      assert.equal(tempPlan.fields.email, "changed@example.com");
      assert.equal(tempPlan.fields.hr_code, "A-9999");
    }

    const collectorPlan = planTeamRosterProfileUpdate(collector, {
      ...incoming,
      hr_code: "C-1",
      email: "collector@example.com",
    });
    assert.equal(collectorPlan.outcome, "update");
    if (collectorPlan.outcome === "update") {
      assert.equal(collectorPlan.authEmail, undefined);
      assert.equal(collectorPlan.fields.email, "collector@example.com");
      assert.equal(collectorPlan.fields.hr_code, "C-1");
    }
  });
});
