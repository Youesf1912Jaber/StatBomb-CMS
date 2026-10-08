import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROTECTED_ADMIN_BADGE_LABEL,
  isProtectedIdentityFieldLocked,
  shouldShowChangeToAdmin,
  shouldShowChangeToCollector,
  shouldShowProtectedAdminBadge,
} from "./protected-admins";

const dir = fileURLToPath(new URL(".", import.meta.url));
const client = readFileSync(join(dir, "../../app/admin/collectors/CollectorImportClient.tsx"), "utf8");

const protectedAdmin = {
  role: "admin" as const,
  is_protected_admin: true,
};

const temporaryAdmin = {
  role: "admin" as const,
  is_protected_admin: false,
};

const collector = {
  role: "collector" as const,
  is_protected_admin: false,
};

describe("protected admin UI helpers", () => {
  it("shows Protected Admin only when is_protected_admin is true", () => {
    assert.equal(shouldShowProtectedAdminBadge(protectedAdmin), true);
    assert.equal(shouldShowProtectedAdminBadge(temporaryAdmin), false);
    assert.equal(shouldShowProtectedAdminBadge(collector), false);
    assert.equal(shouldShowProtectedAdminBadge({ is_protected_admin: null }), false);
    assert.equal(shouldShowProtectedAdminBadge(undefined), false);
  });

  it("hides Change to Collector for protected admins and keeps it for temporary admins", () => {
    assert.equal(shouldShowChangeToCollector(protectedAdmin), false);
    assert.equal(shouldShowChangeToCollector(temporaryAdmin), true);
    assert.equal(shouldShowChangeToCollector(collector), false);
  });

  it("keeps Change to Admin for collectors", () => {
    assert.equal(shouldShowChangeToAdmin(collector), true);
    assert.equal(shouldShowChangeToAdmin(protectedAdmin), false);
    assert.equal(shouldShowChangeToAdmin(temporaryAdmin), false);
  });

  it("locks role, HR-Code, email, and protected flag only for protected admins", () => {
    assert.equal(isProtectedIdentityFieldLocked(protectedAdmin, "role"), true);
    assert.equal(isProtectedIdentityFieldLocked(protectedAdmin, "hr_code"), true);
    assert.equal(isProtectedIdentityFieldLocked(protectedAdmin, "email"), true);
    assert.equal(isProtectedIdentityFieldLocked(protectedAdmin, "is_protected_admin"), true);

    assert.equal(isProtectedIdentityFieldLocked(temporaryAdmin, "role"), false);
    assert.equal(isProtectedIdentityFieldLocked(temporaryAdmin, "hr_code"), false);
    assert.equal(isProtectedIdentityFieldLocked(temporaryAdmin, "email"), false);

    assert.equal(isProtectedIdentityFieldLocked(collector, "role"), false);
    assert.equal(isProtectedIdentityFieldLocked(collector, "hr_code"), false);
    assert.equal(isProtectedIdentityFieldLocked(collector, "email"), false);
  });
});

describe("CollectorImportClient protected admin UI", () => {
  it("identifies protected admins from is_protected_admin only", () => {
    assert.match(client, /is_protected_admin/);
    assert.match(client, /shouldShowProtectedAdminBadge\(profile\)/);
    assert.match(client, /isProtectedAdminProfile/);
    assert.equal(client.includes("full_name ==="), false);
    assert.equal(client.includes("hr_code ==="), false);
    assert.equal(/email === ["']/.test(client), false);
  });

  it("displays Protected Admin without removing the ADMIN role badge", () => {
    assert.match(client, /profile\.role\.toUpperCase\(\)/);
    assert.match(client, new RegExp(`\\{PROTECTED_ADMIN_BADGE_LABEL\\}`));
    assert.match(client, /shouldShowProtectedAdminBadge\(profile\) &&/);
    assert.equal(PROTECTED_ADMIN_BADGE_LABEL, "Protected Admin");
  });

  it("does not expose Change to Collector for protected admins", () => {
    assert.match(client, /shouldShowChangeToCollector\(profile\)/);
    assert.match(client, /Change to Collector/);
    assert.match(client, /\(shouldShowChangeToCollector\(profile\) \|\| shouldShowChangeToAdmin\(profile\)\) &&/);
    assert.match(client, /if \(isProtectedAdminProfile\(profile\) && profile\.role === "admin"\) return;/);
  });

  it("keeps Change to Admin for collectors", () => {
    assert.match(client, /shouldShowChangeToAdmin\(profile\)/);
    assert.match(client, /Change to Admin/);
    assert.match(client, /profile\.role === "collector" && <button className="mr-3 text-amber-300/);
    assert.match(client, /toggleSuspension\(profile\)/);
    assert.match(client, /Delete Collector/);
  });

  it("locks protected identity fields in the shared edit form", () => {
    assert.match(client, /isProtectedIdentityFieldLocked\(editingProfile, key\)/);
    assert.match(client, /isProtectedIdentityFieldLocked\(editingProfile, "role"\)/);
    assert.match(client, /disabled=\{\(key === "hr_code" \|\| key === "email"\) && isProtectedIdentityFieldLocked\(editingProfile, key\)\}/);
    assert.match(client, /disabled=\{Boolean\(editing\) \|\| isProtectedIdentityFieldLocked\(editingProfile, "role"\)\}/);
  });

  it("does not set is_protected_admin on create or save", () => {
    assert.equal(client.includes("is_protected_admin: true"), false);
    assert.equal(client.includes("is_protected_admin:true"), false);
    assert.match(client, /JSON\.stringify\(\{ action: "save", id: editing, \.\.\.form \}\)/);
    assert.equal(/blankForm[\s\S]*is_protected_admin/.test(client), false);
  });

  it("preserves existing API error handling", () => {
    assert.match(client, /if \(!response\.ok\) throw new Error\(body\.error \?\? "Unable to change role\."\)/);
    assert.match(client, /if \(!response\.ok\) throw new Error\(body\.error \?\? "Unable to save team member\."\)/);
    assert.match(client, /setMessage\(error instanceof Error \? error\.message : "Unable to change role\."\)/);
  });
});
