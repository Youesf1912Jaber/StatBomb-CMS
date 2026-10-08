import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LAST_ADMIN_DEMOTION_MESSAGE,
  PROTECTED_ADMIN_DELETE_MESSAGE,
  PROTECTED_ADMIN_DEMOTION_MESSAGE,
  PROTECTED_ADMIN_EMAIL_MESSAGE,
  PROTECTED_ADMIN_HR_CODE_MESSAGE,
  PROTECTED_ADMIN_SUSPEND_MESSAGE,
  assertCanChangeRole,
  assertCanDeleteProfile,
  assertCanSaveProfile,
  assertCanSuspendProfile,
  isCollectorAuthorizationError,
} from "./protected-admins";

const dir = fileURLToPath(new URL(".", import.meta.url));
const route = readFileSync(join(dir, "../../app/api/admin/collectors/route.ts"), "utf8");

const protectedAdmin = {
  id: "protected-1",
  role: "admin" as const,
  hr_code: "A-1271",
  email: "mohamed.nour@hudl.com",
  is_protected_admin: true,
};

const temporaryAdmin = {
  id: "temp-1",
  role: "admin" as const,
  hr_code: "T-100",
  email: "temp.admin@example.com",
  is_protected_admin: false,
};

const collector = {
  id: "collector-1",
  role: "collector" as const,
  hr_code: "C-1",
  email: "collector@example.com",
  is_protected_admin: false,
};

function expectAuthorization(fn: () => void, message: string) {
  try {
    fn();
    assert.fail("expected CollectorAuthorizationError");
  } catch (error) {
    assert.equal(isCollectorAuthorizationError(error), true);
    if (isCollectorAuthorizationError(error)) {
      assert.equal(error.status, 403);
      assert.equal(error.message, message);
    }
  }
}

describe("admin collectors protected-admin API", () => {
  it("wires explicit is_protected_admin checks into the collectors route", () => {
    assert.match(route, /assertCanChangeRole\(existing, body\.role, profiles\)/);
    assert.match(route, /assertCanSaveProfile\(existing,/);
    assert.match(route, /assertCanSuspendProfile\(profileResult\.data\)/);
    assert.match(route, /assertCanDeleteProfile\(profile\)/);
    assert.match(route, /isCollectorAuthorizationError\(error\)/);
    assert.match(route, /status: error\.status/);
    assert.match(route, /from "@\/lib\/admin\/protected-admins"/);
    assert.match(route, /Only collector accounts can be suspended here/);
    assert.match(route, /Admin accounts must be managed separately/);
  });

  it("rejects demotion of a protected admin", () => {
    expectAuthorization(
      () => assertCanChangeRole(protectedAdmin, "collector", [protectedAdmin, temporaryAdmin]),
      PROTECTED_ADMIN_DEMOTION_MESSAGE
    );
  });

  it("rejects role change away from admin through save", () => {
    expectAuthorization(
      () => assertCanSaveProfile(protectedAdmin, { role: "collector", hr_code: protectedAdmin.hr_code, email: protectedAdmin.email }),
      PROTECTED_ADMIN_DEMOTION_MESSAGE
    );
  });

  it("rejects HR-Code change for a protected admin", () => {
    expectAuthorization(
      () => assertCanSaveProfile(protectedAdmin, { hr_code: "A-9999", email: protectedAdmin.email }),
      PROTECTED_ADMIN_HR_CODE_MESSAGE
    );
  });

  it("rejects email/identity change for a protected admin", () => {
    expectAuthorization(
      () => assertCanSaveProfile(protectedAdmin, { hr_code: protectedAdmin.hr_code, email: "other@example.com" }),
      PROTECTED_ADMIN_EMAIL_MESSAGE
    );
  });

  it("rejects suspension of a protected admin", () => {
    expectAuthorization(
      () => assertCanSuspendProfile(protectedAdmin),
      PROTECTED_ADMIN_SUSPEND_MESSAGE
    );
  });

  it("rejects deletion of a protected admin", () => {
    expectAuthorization(
      () => assertCanDeleteProfile(protectedAdmin),
      PROTECTED_ADMIN_DELETE_MESSAGE
    );
  });

  it("allows a temporary admin to be demoted when another admin remains", () => {
    assert.doesNotThrow(() => assertCanChangeRole(temporaryAdmin, "collector", [protectedAdmin, temporaryAdmin]));
  });

  it("allows a temporary admin to be managed", () => {
    assert.doesNotThrow(() => assertCanSaveProfile(temporaryAdmin, {
      role: "admin",
      hr_code: "T-200",
      email: "temp.renamed@example.com",
    }));
    assert.doesNotThrow(() => assertCanChangeRole(temporaryAdmin, "admin", [protectedAdmin, temporaryAdmin]));
    assert.doesNotThrow(() => assertCanSuspendProfile(temporaryAdmin));
    assert.doesNotThrow(() => assertCanDeleteProfile(temporaryAdmin));
    assert.doesNotThrow(() => assertCanSuspendProfile(collector));
    assert.doesNotThrow(() => assertCanDeleteProfile(collector));
  });

  it("keeps last-admin protection for unprotected admins", () => {
    try {
      assertCanChangeRole(temporaryAdmin, "collector", [temporaryAdmin]);
      assert.fail("expected last-admin error");
    } catch (error) {
      assert.equal(isCollectorAuthorizationError(error), false);
      assert.equal(error instanceof Error, true);
      assert.equal((error as Error).message, LAST_ADMIN_DEMOTION_MESSAGE);
    }
  });

  it("allows saving a protected admin when identity and role are unchanged", () => {
    assert.doesNotThrow(() => assertCanSaveProfile(protectedAdmin, {
      role: "admin",
      hr_code: " a-1271 ",
      email: "Mohamed.Nour@hudl.com",
    }));
  });
});
