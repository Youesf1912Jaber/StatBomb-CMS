# Match Master incremental sheet updates

This integration replaces repeated full-sheet polling with row-level push events.

## 1. Configure the webhook secret in Vercel

Create a long random secret (at least 32 bytes) and add this Production/Preview environment variable to the Vercel project:

- `MATCH_MASTER_DELTA_WEBHOOK_SECRET`

Use the exact same secret in the Apps Script project properties. Redeploy after adding the environment variable.

## 2. Add the Apps Script

Open the Google spreadsheet, then Extensions -> Apps Script. Copy the contents of:

`scripts/google-apps-script/match-master-delta-sync.gs`

In Apps Script, open Project Settings -> Script Properties and add:

- `MATCH_MASTER_DELTA_WEBHOOK_URL`: `https://stat-bomb-cms.vercel.app/api/webhooks/match-master-delta`
- `MATCH_MASTER_DELTA_WEBHOOK_SECRET`: the same secret configured in Vercel
- `MATCH_MASTER_TAB_NAME`: `Matches (T)`

Save, select `installMatchMasterDeltaTrigger`, and Run once. Approve the spreadsheet and external-request permissions.

## 3. What it captures

- Manual edits and pasted ranges intersecting columns A:V.
- Each changed row is sent with its original sheet row number and header/value pairs.
- The webhook validates the shared secret and stores only the latest change per sheet row in Supabase.
- Blank rows are marked as deleted events.

## Limitations to understand

Google Apps Script `onEdit` triggers run for human edits, not for changes made by another script or by the Sheets API. Those writers must call the webhook themselves (or be updated to emit the same event). Moving/deleting entire sheet rows and formula recalculations also need explicit handling. The legacy full-sheet read must remain as a bootstrap/reconciliation path until all writers emit deltas and the incremental consumer has been verified.

Do not remove the existing full-sync safety path until the first delta events have been received and tested.
