import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { linksPayload, resolveLinksAccess } from "./access";
import type { LinksSheetData } from "./types";

describe("resolveLinksAccess", () => {
  it("rejects unauthenticated users", () => {
    assert.deepEqual(resolveLinksAccess(null, { role: "admin" }), {
      ok: false,
      status: 401,
      error: "Authentication required.",
    });
  });

  it("rejects other roles", () => {
    assert.deepEqual(resolveLinksAccess({ id: "u1" }, { role: "other" }), {
      ok: false,
      status: 403,
      error: "Links access required.",
    });
  });

  it("rejects a missing profile", () => {
    assert.deepEqual(resolveLinksAccess({ id: "u1" }, null), {
      ok: false,
      status: 403,
      error: "Links access required.",
    });
  });

  it("allows admin", () => {
    assert.deepEqual(resolveLinksAccess({ id: "u1" }, { role: "admin" }), { ok: true });
  });

  it("allows collector", () => {
    assert.deepEqual(resolveLinksAccess({ id: "u1" }, { role: "collector" }), { ok: true });
  });
});

describe("linksPayload", () => {
  it("returns cells in sheet order", () => {
    const data: LinksSheetData = {
      cells: [
        { row: 3, column: 1, text: "Links", href: null },
        { row: 8, column: 2, text: "Dash", href: "https://example.com/dash" },
      ],
    };
    assert.deepEqual(linksPayload(data), { cells: data.cells });
  });
});

describe("Links APIs are read-only", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));

  it("does not write to Google Sheets from the Links API layer", () => {
    const api = readFileSync(join(dir, "api.ts"), "utf8");
    const access = readFileSync(join(dir, "access.ts"), "utf8");
    const route = readFileSync(join(dir, "../../app/api/links/route.ts"), "utf8");
    for (const source of [api, access, route]) {
      assert.equal(source.includes("batchUpdate"), false);
      assert.equal(source.includes(":append"), false);
      assert.equal(source.includes("valueInputOption"), false);
      assert.equal(source.includes('method: "POST"'), false);
      assert.equal(source.includes('method: "PUT"'), false);
      assert.equal(source.includes('method: "PATCH"'), false);
    }
    assert.match(api, /readLinksSheet/);
    assert.match(route, /loadLinks/);
    assert.match(route, /requireLinksAccess/);
  });
});
