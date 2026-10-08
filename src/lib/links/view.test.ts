import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { groupLinksCellsByRow, isLinksHttpHref } from "./view";
import type { LinksCell } from "./types";

describe("isLinksHttpHref", () => {
  it("accepts only http and https", () => {
    assert.equal(isLinksHttpHref("https://example.com"), true);
    assert.equal(isLinksHttpHref("http://example.com"), true);
    assert.equal(isLinksHttpHref("javascript:alert(1)"), false);
    assert.equal(isLinksHttpHref(null), false);
  });
});

describe("groupLinksCellsByRow", () => {
  it("groups cells by sheet row and keeps column order", () => {
    const cells: LinksCell[] = [
      { row: 21, column: 8, text: "Right", href: null },
      { row: 8, column: 2, text: "Left", href: "https://example.com/a" },
      { row: 8, column: 10, text: "Right", href: null },
      { row: 21, column: 2, text: "Left", href: null },
    ];
    const grouped = groupLinksCellsByRow(cells);
    assert.equal(grouped.length, 2);
    assert.deepEqual(
      grouped[0]?.map((cell) => cell.column),
      [2, 10]
    );
    assert.deepEqual(
      grouped[1]?.map((cell) => cell.text),
      ["Left", "Right"]
    );
  });
});

describe("Links UI is read-only", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));

  it("opens external links with noopener noreferrer and has Refresh", () => {
    const client = readFileSync(join(dir, "../../app/links/LinksClient.tsx"), "utf8");
    const board = readFileSync(join(dir, "../../components/LinksBoard.tsx"), "utf8");
    assert.match(board, /noopener noreferrer/);
    assert.match(board, /target="_blank"/);
    assert.match(client, /Refresh/);
    assert.match(client, /\/api\/links/);
  });

  it("adds Links to admin and collector nav", () => {
    const admin = readFileSync(join(dir, "../../app/admin/layout.tsx"), "utf8");
    const collector = readFileSync(join(dir, "../../app/collector/layout.tsx"), "utf8");
    assert.match(admin, /label: "Links"/);
    assert.match(admin, /href: "\/admin\/links"/);
    assert.match(collector, /label: "Links"/);
    assert.match(collector, /href: "\/collector\/links"/);
  });
});
