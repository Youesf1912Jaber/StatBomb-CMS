import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeHyperCareTeamName,
  parseHyperCareSheet,
  resolveHyperCareSections,
} from "./parse";

function sampleSheet(): unknown[][] {
  return [
    ["Customer", "Review Type", "Review events", "Who makes the match complete?"],
    ["Bristol City", "Passive", "90 Mins", "Quality"],
    ["Arsenal", "Active", "Full Match", "Ops"],
    [],
    ["Team", "Request", "Gender"],
    ["Chelsea", "Starting XI is 3-4-2-1", "Men"],
    ["Bristol City", "Pressing trigger on goal kick", "Women"],
    ["Manchester United", "Mark set pieces", "Men"],
  ];
}

describe("normalizeHyperCareTeamName", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    assert.equal(normalizeHyperCareTeamName("  Bristol   City "), "bristol city");
    assert.equal(normalizeHyperCareTeamName("BRISTOL CITY"), "bristol city");
  });

  it("does not fuzzy-match similar names", () => {
    assert.notEqual(normalizeHyperCareTeamName("Bristol City"), normalizeHyperCareTeamName("Bristol City Women"));
    assert.notEqual(normalizeHyperCareTeamName("Arsenal"), normalizeHyperCareTeamName("Arsenal U21"));
  });
});

describe("parseHyperCareSheet", () => {
  it("reads Customer and Team tables from the same tab using their headers", () => {
    const catalog = parseHyperCareSheet(sampleSheet());
    assert.equal(catalog.customers.length, 2);
    assert.equal(catalog.teams.length, 3);
    assert.equal(catalog.customers[0]?.customer, "Bristol City");
    assert.equal(catalog.customers[0]?.review_type, "Passive");
    assert.equal(catalog.customers[0]?.review_events, "90 Mins");
    assert.equal(catalog.customers[0]?.completed_by, "Quality");
    assert.equal(catalog.teams[0]?.team, "Chelsea");
    assert.equal(catalog.teams[0]?.request, "Starting XI is 3-4-2-1");
    assert.equal(catalog.teams[0]?.gender, "Men");
  });

  it("reads two tables placed side by side on the same header row", () => {
    const catalog = parseHyperCareSheet([
      ["Customer", "Review Type", "Review events", "Who makes the match complete?", "", "Team", "Request", "Gender"],
      ["Arsenal", "Active", "Full Match", "Ops", "", "Chelsea", "Starting XI is 3-4-2-1", "Men"],
    ]);
    assert.equal(catalog.customers.length, 1);
    assert.equal(catalog.teams.length, 1);
    assert.equal(catalog.customers[0]?.customer, "Arsenal");
    assert.equal(catalog.teams[0]?.team, "Chelsea");
  });
});

describe("resolveHyperCareSections", () => {
  const catalog = parseHyperCareSheet(sampleSheet());

  it("matches Home team against the Customer table", () => {
    const sections = resolveHyperCareSections("Arsenal", "Everton", catalog);
    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.side, "home");
    assert.equal(sections[0]?.team_name, "Arsenal");
    assert.equal(sections[0]?.customer_care?.review_type, "Active");
    assert.equal(sections[0]?.customer_care?.review_events, "Full Match");
    assert.equal(sections[0]?.customer_care?.completed_by, "Ops");
    assert.equal(sections[0]?.team_request, null);
  });

  it("matches Home team against the Team table", () => {
    const sections = resolveHyperCareSections("Chelsea", "Everton", catalog);
    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.side, "home");
    assert.equal(sections[0]?.team_name, "Chelsea");
    assert.equal(sections[0]?.customer_care, null);
    assert.equal(sections[0]?.team_request?.request, "Starting XI is 3-4-2-1");
    assert.equal(sections[0]?.team_request?.gender, "Men");
  });

  it("matches Away team against the Customer table", () => {
    const sections = resolveHyperCareSections("Everton", "Arsenal", catalog);
    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.side, "away");
    assert.equal(sections[0]?.team_name, "Arsenal");
    assert.equal(sections[0]?.customer_care?.review_type, "Active");
    assert.equal(sections[0]?.team_request, null);
  });

  it("matches Away team against the Team table", () => {
    const sections = resolveHyperCareSections("Everton", "Chelsea", catalog);
    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.side, "away");
    assert.equal(sections[0]?.team_name, "Chelsea");
    assert.equal(sections[0]?.customer_care, null);
    assert.equal(sections[0]?.team_request?.request, "Starting XI is 3-4-2-1");
    assert.equal(sections[0]?.team_request?.gender, "Men");
  });

  it("shows both Home and Away when both are Hyper Care", () => {
    const sections = resolveHyperCareSections("Arsenal", "Chelsea", catalog);
    assert.equal(sections.length, 2);
    assert.equal(sections[0]?.side, "home");
    assert.equal(sections[0]?.team_name, "Arsenal");
    assert.equal(sections[0]?.customer_care?.review_type, "Active");
    assert.equal(sections[1]?.side, "away");
    assert.equal(sections[1]?.team_name, "Chelsea");
    assert.equal(sections[1]?.team_request?.request, "Starting XI is 3-4-2-1");
    assert.notEqual(sections[0]?.team_name, sections[1]?.team_name);
  });

  it("returns both Customer Care and Team Request when the same team exists in both tables", () => {
    const sections = resolveHyperCareSections("Bristol City", "Watford", catalog);
    assert.equal(sections.length, 1);
    assert.ok(sections[0]?.customer_care);
    assert.ok(sections[0]?.team_request);
    assert.equal(sections[0]?.customer_care?.review_type, "Passive");
    assert.equal(sections[0]?.team_request?.request, "Pressing trigger on goal kick");
  });

  it("returns no sections when the match has no Hyper Care teams", () => {
    const sections = resolveHyperCareSections("Watford", "Burnley", catalog);
    assert.deepEqual(sections, []);
  });

  it("matches after case and whitespace normalization while preserving sheet display text", () => {
    const sections = resolveHyperCareSections("  bristol   city ", "everton", catalog);
    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.team_name, "Bristol City");
  });

  it("does not incorrectly match similar but different team names", () => {
    const sections = resolveHyperCareSections("Bristol City Women", "Arsenal U21", catalog);
    assert.deepEqual(sections, []);
  });

  it("keeps two separate Hyper Care teams as separate sections", () => {
    const sections = resolveHyperCareSections("Bristol City", "Manchester United", catalog);
    assert.equal(sections.length, 2);
    assert.equal(sections[0]?.team_name, "Bristol City");
    assert.equal(sections[1]?.team_name, "Manchester United");
    assert.equal(sections[0]?.side, "home");
    assert.equal(sections[1]?.side, "away");
  });
});

describe("Collector Hyper Care page wiring", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));

  it("collector assignment detail loads Hyper Care server-side for the assigned match", () => {
    const source = readFileSync(join(dir, "../../app/collector/assignments/[id]/page.tsx"), "utf8");
    assert.match(source, /getHyperCareForMatch/);
    assert.match(source, /assignment\.match\.home_team/);
    assert.match(source, /assignment\.match\.away_team/);
    assert.match(source, /HyperCareSection/);
  });

  it("does not show Hyper Care when there are no matching teams", () => {
    const source = readFileSync(join(dir, "../../components/HyperCareSection.tsx"), "utf8");
    assert.match(source, /if \(sections\.length === 0\) return null/);
    assert.match(source, /HYPER CARE/);
    assert.match(source, /Customer Care/);
    assert.match(source, /Team Request/);
    assert.match(source, /Review Type/);
    assert.match(source, /Review Events/);
    assert.match(source, /Completed by/);
  });

  it("reads Hyper Care from the configured Google Sheet tab server-side only", () => {
    const sheet = readFileSync(join(dir, "sheet.ts"), "utf8");
    const lookup = readFileSync(join(dir, "lookup.ts"), "utf8");
    assert.match(sheet, /server-only/);
    assert.match(lookup, /server-only/);
    assert.match(sheet, /GOOGLE_SHEETS_HYPER_CARE_TAB/);
    assert.match(sheet, /GOOGLE_SHEETS_HYPER_CARE_GID/);
    assert.match(sheet, /Hyper Care list/);
    assert.match(sheet, /319293263/);
    assert.match(sheet, /googleRequest/);
  });

  it("does not modify Over Target", () => {
    const overTarget = readFileSync(join(dir, "../over-target/view.ts"), "utf8");
    assert.equal(overTarget.includes("getHyperCareForMatch"), false);
    assert.equal(overTarget.includes("HyperCareSection"), false);
  });
});

describe("Admin Hyper Care page wiring", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));

  it("Admin Distribution page loads Hyper Care server-side before Collector selection", () => {
    const source = readFileSync(join(dir, "../../app/admin/matches/[matchId]/distribution/page.tsx"), "utf8");
    assert.match(source, /getHyperCareForMatch/);
    assert.match(source, /match\.home_team/);
    assert.match(source, /match\.away_team/);
    assert.match(source, /HyperCareSection/);
    const hyperCareIndex = source.indexOf("<HyperCareSection");
    const formIndex = source.indexOf("<DistributionAssignmentForm");
    assert.ok(hyperCareIndex >= 0);
    assert.ok(formIndex >= 0);
    assert.ok(hyperCareIndex < formIndex);
  });

  it("Admin Distribution page does not auto-select a Collector or change Add Assignment", () => {
    const page = readFileSync(join(dir, "../../app/admin/matches/[matchId]/distribution/page.tsx"), "utf8");
    const form = readFileSync(
      join(dir, "../../app/admin/matches/[matchId]/distribution/DistributionAssignmentForm.tsx"),
      "utf8"
    );
    assert.match(form, /Add Assignment/);
    assert.match(form, /collectorHrCode/);
    assert.equal(form.includes("getHyperCareForMatch"), false);
    assert.equal(form.includes("HyperCareSection"), false);
    assert.match(page, /<DistributionAssignmentForm matchId=\{normalizedMatchId\} collectors=\{collectors\} \/>/);
  });

  it("Admin Assignment Detail loads Hyper Care server-side after assignment", () => {
    const source = readFileSync(join(dir, "../../app/admin/assignments/[id]/page.tsx"), "utf8");
    assert.match(source, /getHyperCareForMatch/);
    assert.match(source, /assignment\.match\.home_team/);
    assert.match(source, /assignment\.match\.away_team/);
    assert.match(source, /HyperCareSection/);
  });

  it("does not show an empty Hyper Care section when there are no matching teams", () => {
    const source = readFileSync(join(dir, "../../components/HyperCareSection.tsx"), "utf8");
    assert.match(source, /if \(sections\.length === 0\) return null/);
  });

  it("reuses the Collector Hyper Care lookup and does not duplicate parsing or matching", () => {
    const adminDistribution = readFileSync(
      join(dir, "../../app/admin/matches/[matchId]/distribution/page.tsx"),
      "utf8"
    );
    const adminAssignment = readFileSync(join(dir, "../../app/admin/assignments/[id]/page.tsx"), "utf8");
    const collector = readFileSync(join(dir, "../../app/collector/assignments/[id]/page.tsx"), "utf8");
    assert.match(adminDistribution, /from "@\/lib\/hyper-care\/lookup"/);
    assert.match(adminAssignment, /from "@\/lib\/hyper-care\/lookup"/);
    assert.match(collector, /from "@\/lib\/hyper-care\/lookup"/);
    assert.equal(adminDistribution.includes("parseHyperCareSheet"), false);
    assert.equal(adminAssignment.includes("parseHyperCareSheet"), false);
    assert.equal(adminDistribution.includes("resolveHyperCareSections"), false);
    assert.equal(adminAssignment.includes("resolveHyperCareSections"), false);
  });
});
