/**
 * Match Master incremental sync.
 *
 * Configure Script Properties:
 *   MATCH_MASTER_DELTA_WEBHOOK_URL = https://YOUR_DOMAIN/api/webhooks/match-master-delta
 *   MATCH_MASTER_DELTA_WEBHOOK_SECRET = same value as Vercel MATCH_MASTER_DELTA_WEBHOOK_SECRET
 *   MATCH_MASTER_TAB_NAME = Matches (T)
 *
 * Run installMatchMasterDeltaTrigger() once as the spreadsheet owner.
 */
function installMatchMasterDeltaTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("MATCH_MASTER_DELTA_WEBHOOK_URL") ||
      !props.getProperty("MATCH_MASTER_DELTA_WEBHOOK_SECRET")) {
    throw new Error("Set MATCH_MASTER_DELTA_WEBHOOK_URL and MATCH_MASTER_DELTA_WEBHOOK_SECRET in Script Properties first.");
  }

  ScriptApp.getProjectTriggers()
    .filter(function (trigger) { return trigger.getHandlerFunction() === "matchMasterOnEdit"; })
    .forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });

  ScriptApp.newTrigger("matchMasterOnEdit")
    .forSpreadsheet(ss)
    .onEdit()
    .create();
}

function matchMasterOnEdit(e) {
  if (!e || !e.range) return;
  const props = PropertiesService.getScriptProperties();
  const tabName = props.getProperty("MATCH_MASTER_TAB_NAME") || "Matches (T)";
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== tabName) return;

  const firstColumn = range.getColumn();
  const lastColumn = firstColumn + range.getNumColumns() - 1;
  if (lastColumn < 1 || firstColumn > 22) return;

  const firstRow = Math.max(2, range.getRow());
  const lastRow = range.getLastRow();
  if (lastRow < 2) return;

  const url = props.getProperty("MATCH_MASTER_DELTA_WEBHOOK_URL");
  const secret = props.getProperty("MATCH_MASTER_DELTA_WEBHOOK_SECRET");
  if (!url || !secret) throw new Error("Match Master delta webhook Script Properties are missing.");

  const headers = sheet.getRange(1, 1, 1, 22).getDisplayValues()[0];
  const rows = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, 22).getDisplayValues();
  rows.forEach(function (values, index) {
    const payload = {
      sheetName: tabName,
      sourceRow: firstRow + index,
      headers: headers,
      values: values,
      editedAt: new Date().toISOString()
    };
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "x-match-master-secret": secret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      console.error("Match Master delta push failed for row " + payload.sourceRow +
        ": " + response.getResponseCode() + " " + response.getContentText());
    }
  });
}
