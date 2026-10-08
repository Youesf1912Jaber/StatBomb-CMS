import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  adminScorecardPayload,
  canonicalizeScorecardHrCode,
  collectorScorecardPayload,
  filterScorecardRowsForHrCode,
  resolveScorecardAdminAccess,
  resolveScorecardCollectorAccess,
} from "./access";
import type { ScorecardRow, ScorecardSheetData } from "./types";

function row(hrCode: string, extra: string[] = ["80%"]): ScorecardRow {
  return {
    identity: {
      month: "Oct 2026",
      hr_code: hrCode,
      name: "Ada",
      team: "Team A",
      type: "Full Time",
    },
    cells: ["Oct 2026", hrCode, "Ada", "Team A", "Full Time", ...extra],
  };
}

function sampleData(rows: ScorecardRow[]): ScorecardSheetData {
  return {
    headers: ["Month", "HR Code", "Name", "Team", "Type", "Base", "Quality Score"],
    rows,
  };
}

describe("canonicalizeScorecardHrCode", () => {
  it("trims and uppercases HR-Code", () => {
    assert.equal(canonicalizeScorecardHrCode(" a-2082 "), "A-2082");
    assert.equal(canonicalizeScorecardHrCode("A-2082"), "A-2082");
    assert.equal(canonicalizeScorecardHrCode(""), "");
    assert.equal(canonicalizeScorecardHrCode(null), "");
  });
});

describe("resolveScorecardAdminAccess", () => {
  it("rejects unauthenticated users", () => {
    assert.deepEqual(resolveScorecardAdminAccess(null, { role: "admin" }), {
      ok: false,
      status: 401,
      error: "Authentication required.",
    });
  });

  it("rejects non-admin users", () => {
    assert.deepEqual(resolveScorecardAdminAccess({ id: "u1" }, { role: "collector" }), {
      ok: false,
      status: 403,
      error: "Admin access required.",
    });
  });

  it("rejects a missing profile", () => {
    assert.deepEqual(resolveScorecardAdminAccess({ id: "u1" }, null), {
      ok: false,
      status: 403,
      error: "Admin access required.",
    });
  });

  it("allows admin", () => {
    assert.deepEqual(resolveScorecardAdminAccess({ id: "u1" }, { role: "admin" }), { ok: true });
  });
});

describe("resolveScorecardCollectorAccess", () => {
  it("rejects unauthenticated users", () => {
    assert.deepEqual(resolveScorecardCollectorAccess(null, { role: "collector", hr_code: "A-1" }), {
      ok: false,
      status: 401,
      error: "Authentication required.",
    });
  });

  it("accepts collector role", () => {
    assert.deepEqual(
      resolveScorecardCollectorAccess({ id: "u1" }, { role: "collector", hr_code: "A-2082" }),
      { ok: true, hr_code: "A-2082" }
    );
  });

  it("accepts admin role", () => {
    assert.deepEqual(
      resolveScorecardCollectorAccess({ id: "admin" }, { role: "admin", hr_code: "ADM-1" }),
      { ok: true, hr_code: "ADM-1" }
    );
  });

  it("rejects other roles", () => {
    assert.deepEqual(resolveScorecardCollectorAccess({ id: "u1" }, { role: "other" }), {
      ok: false,
      status: 403,
      error: "Collector access required.",
    });
  });
});

describe("filterScorecardRowsForHrCode", () => {
  const rows = [
    row("A-2082", ["80%", "90%"]),
    row("B-100", ["10%", "20%"]),
    row(" a-2082 ", ["81%", "91%"]),
    row("", ["1%", "2%"]),
  ];

  it("returns only matching HR-Code rows after trim + uppercase", () => {
    const filtered = filterScorecardRowsForHrCode(rows, " a-2082 ");
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0]?.identity.hr_code, "A-2082");
    assert.equal(filtered[1]?.identity.hr_code, " a-2082 ");
  });

  it("does not return all rows when the profile has no HR-Code", () => {
    assert.deepEqual(filterScorecardRowsForHrCode(rows, null), []);
    assert.deepEqual(filterScorecardRowsForHrCode(rows, ""), []);
    assert.deepEqual(filterScorecardRowsForHrCode(rows, "   "), []);
  });

  it("filters an admin caller to their own HR-Code only", () => {
    const filtered = filterScorecardRowsForHrCode(rows, "B-100");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.identity.hr_code, "B-100");
  });
});

describe("scorecard payloads", () => {
  it("admin payload returns all rows and dynamic headers", () => {
    const data = sampleData([row("A-2082", ["80%", "99%"]), row("B-100", ["10%", "11%"])]);
    const payload = adminScorecardPayload(data);
    assert.deepEqual(payload.headers, data.headers);
    assert.equal(payload.rows.length, 2);
    assert.equal(payload.rows[0]?.cells[5], "80%");
    assert.equal(payload.rows[0]?.cells[6], "99%");
  });

  it("collector payload keeps headers but only matching rows", () => {
    const data = sampleData([
      row("A-2082", ["80%", "99%"]),
      row("B-100", ["10%", "11%"]),
      row("A-2082", ["82%", "100%"]),
    ]);
    const payload = collectorScorecardPayload(data, "a-2082");
    assert.deepEqual(payload.headers, data.headers);
    assert.equal(payload.rows.length, 2);
    assert.equal(payload.rows[0]?.cells[5], "80%");
    assert.equal(payload.rows[1]?.cells[6], "100%");
    assert.ok(payload.rows.every((item) => canonicalizeScorecardHrCode(item.identity.hr_code) === "A-2082"));
  });

  it("collector with no HR-Code receives empty rows, not the full sheet", () => {
    const data = sampleData([row("A-2082"), row("B-100")]);
    const payload = collectorScorecardPayload(data, null);
    assert.deepEqual(payload.headers, data.headers);
    assert.deepEqual(payload.rows, []);
  });
});

describe("Scorecard APIs are read-only", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));

  it("does not write to Google Sheets from the Scorecard API layer", () => {
    const api = readFileSync(join(dir, "api.ts"), "utf8");
    const access = readFileSync(join(dir, "access.ts"), "utf8");
    const adminRoute = readFileSync(join(dir, "../../app/api/admin/scorecard/route.ts"), "utf8");
    const collectorRoute = readFileSync(join(dir, "../../app/api/collector/scorecard/route.ts"), "utf8");
    for (const source of [api, access, adminRoute, collectorRoute]) {
      assert.equal(source.includes("batchUpdate"), false);
      assert.equal(source.includes(":append"), false);
      assert.equal(source.includes("valueInputOption"), false);
      assert.equal(source.includes('method: "POST"'), false);
      assert.equal(source.includes('method: "PUT"'), false);
      assert.equal(source.includes('method: "PATCH"'), false);
    }
    assert.match(api, /readScorecardSheet/);
    assert.match(adminRoute, /loadAdminScorecard/);
    assert.match(collectorRoute, /loadCollectorScorecard/);
  });
});
