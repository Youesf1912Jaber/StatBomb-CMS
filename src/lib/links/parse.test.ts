import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { extractLinksHref, parseLinksSheet } from "./parse";

describe("extractLinksHref", () => {
  it("accepts http and https URLs", () => {
    assert.equal(extractLinksHref("https://example.com/path"), "https://example.com/path");
    assert.equal(extractLinksHref("http://example.com"), "http://example.com/");
  });

  it("normalizes protocol-relative URLs", () => {
    assert.equal(
      extractLinksHref("//docs.google.com/presentation/d/abc/edit"),
      "https://docs.google.com/presentation/d/abc/edit"
    );
  });

  it("rejects non-http schemes", () => {
    assert.equal(extractLinksHref("javascript:alert(1)"), null);
    assert.equal(extractLinksHref("ftp://files.example.com"), null);
  });
});

describe("parseLinksSheet", () => {
  it("skips blank cells and preserves sheet order", () => {
    const data = parseLinksSheet([
      ["", "Links", ""],
      [],
      ["https://left.example/a", "", "Label"],
    ]);
    assert.deepEqual(
      data.cells.map((cell) => ({ row: cell.row, column: cell.column, text: cell.text })),
      [
        { row: 1, column: 1, text: "Links" },
        { row: 3, column: 0, text: "https://left.example/a" },
        { row: 3, column: 2, text: "Label" },
      ]
    );
  });

  it("preserves Arabic text", () => {
    const data = parseLinksSheet([["سياسة السكور كارد (تقييم الأداء)"]]);
    assert.equal(data.cells[0]?.text, "سياسة السكور كارد (تقييم الأداء)");
    assert.equal(data.cells[0]?.href, null);
  });

  it("reads href from the cell text when it contains a URL", () => {
    const data = parseLinksSheet([
      ["https://lookerstudio.google.com/u/0/reporting/abc/page/pUQVF"],
    ]);
    assert.equal(data.cells[0]?.href, "https://lookerstudio.google.com/u/0/reporting/abc/page/pUQVF");
  });

  it("reads href from HYPERLINK formulas when formatted text has no URL", () => {
    const data = parseLinksSheet([["Facts Policy"]], [['=HYPERLINK("https://example.com/facts","Facts Policy")']]);
    assert.equal(data.cells[0]?.text, "Facts Policy");
    assert.equal(data.cells[0]?.href, "https://example.com/facts");
  });

  it("prefers an explicit structured href over formula and text", () => {
    const data = parseLinksSheet(
      [[{ text: "Label", href: "https://structured.example/path" }]],
      [['=HYPERLINK("https://formula.example/path","Label")']]
    );
    assert.equal(data.cells[0]?.text, "Label");
    assert.equal(data.cells[0]?.href, "https://structured.example/path");
  });

  it("does not invent columns or treat the first row as headers", () => {
    const data = parseLinksSheet([["Links"], ["https://example.com/a", "Name"]]);
    assert.equal("headers" in data, false);
    assert.equal(data.cells.length, 3);
    assert.equal(data.cells[0]?.text, "Links");
    assert.equal(data.cells[1]?.href, "https://example.com/a");
    assert.equal(data.cells[2]?.href, null);
  });
});

describe("Links sheet reader is read-only", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));

  it("reads Links by GID and title with FORMATTED_VALUE and FORMULA and no writes", () => {
    const source = readFileSync(join(dir, "sheet.ts"), "utf8");
    assert.match(source, /server-only/);
    assert.match(source, /googleRequest/);
    assert.match(source, /Links/);
    assert.match(source, /490955441/);
    assert.match(source, /1gT8xUWKw-83xIYCXtYXJZU1S4M87JpapM-ROBqF_KgQ/);
    assert.match(source, /FORMATTED_VALUE/);
    assert.match(source, /FORMULA/);
    assert.match(source, /quotedSheetTitle/);
    assert.equal(source.includes("batchUpdate"), false);
    assert.equal(source.includes(":append"), false);
    assert.equal(source.includes("valueInputOption"), false);
    assert.equal(source.includes('method: "POST"'), false);
    assert.equal(source.includes('method: "PUT"'), false);
    assert.equal(source.includes('method: "PATCH"'), false);
  });
});
