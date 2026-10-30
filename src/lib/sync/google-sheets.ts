import "server-only";

import { createSign } from "crypto";
import { DISTRIBUTION_TASK_OPTIONS } from "@/lib/distribution-options";
import {
  normalizeDistributionHalf as normalizeDistributionHalfValue,
  normalizeDistributionTask as normalizeDistributionTaskValue,
  normalizeMatchId as normalizeMatchIdValue,
} from "@/lib/sync/distribution-identity";
import { PREVIEW_LIMITS, PreviewInputError } from "@/lib/sync/preview";
import { normalizeEtaDate } from "@/lib/match-master-date";

export const normalizeMatchId = normalizeMatchIdValue;
export const normalizeDistributionTask = normalizeDistributionTaskValue;
export const normalizeDistributionHalf = normalizeDistributionHalfValue;

export type SourceRows = {
  sheetName: string;
  headers: string[];
  rows: unknown[][];
};

export type GoogleSheetsPull = {
  source: "google_sheets";
  spreadsheetId: string;
  sheetName: string;
  pulledAt: string;
  rows: SourceRows;
};

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new PreviewInputError("Google Sheets integration is not configured.");
  return value;
}

function normalizedSheetName(value?: string | null): string {
  return (value ?? "").trim();
}

function safeGoogleError(status: number): never {
  if (status === 401 || status === 403) {
    throw new PreviewInputError("Google Sheets authorization failed.");
  }
  if (status === 404) throw new PreviewInputError("The configured Google Sheet was not found.");
  if (status === 429) throw new PreviewInputError("Google Sheets rate limit reached. Try again later.");
  throw new PreviewInputError("Google Sheets could not be read.");
}

let cachedGoogleAccessToken: { token: string; expiresAt: number } | null = null;
let googleAccessTokenRequest: Promise<string> | null = null;

async function requestServiceAccountToken(): Promise<{ token: string; expiresIn: number }> {
  const email = required("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = required("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(privateKey, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!response.ok) safeGoogleError(response.status);
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new PreviewInputError("Google Sheets authorization failed.");
  return { token: data.access_token, expiresIn: Number.isFinite(data.expires_in) ? Number(data.expires_in) : 3600 };
}

async function serviceAccountToken(): Promise<string> {
  const now = Date.now();
  // Refresh one minute before expiry to avoid racing a token that is about to expire.
  if (cachedGoogleAccessToken && cachedGoogleAccessToken.expiresAt > now + 60_000) {
    return cachedGoogleAccessToken.token;
  }
  if (googleAccessTokenRequest) return googleAccessTokenRequest;

  googleAccessTokenRequest = requestServiceAccountToken()
    .then(({ token, expiresIn }) => {
      cachedGoogleAccessToken = {
        token,
        expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
      };
      return token;
    })
    .finally(() => {
      googleAccessTokenRequest = null;
    });

  return googleAccessTokenRequest;
}

type SpreadsheetSheet = { properties?: { sheetId?: number; title?: string } };

export async function googleRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await serviceAccountToken();
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!response.ok) safeGoogleError(response.status);
  return (await response.json()) as T;
}

async function findSheetByGid(spreadsheetId: string, gid: number): Promise<{ title: string; sheetId: number }> {
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  url.searchParams.set("fields", "sheets(properties(sheetId,title))");
  const payload = await googleRequest<{ sheets?: SpreadsheetSheet[] }>(url.toString());
  const sheet = (payload.sheets ?? []).find((item) => item.properties?.sheetId === gid);
  if (!sheet?.properties?.title || sheet.properties.sheetId === undefined) {
    throw new PreviewInputError("The configured Team sheet tab was not found.");
  }
  const configuredTitle = normalizedSheetName(process.env.GOOGLE_SHEETS_TEAM_TAB);
  if (configuredTitle && configuredTitle.toLowerCase() !== sheet.properties.title.trim().toLowerCase()) {
    throw new PreviewInputError("The configured Team sheet tab does not match the configured gid.");
  }
  return { title: sheet.properties.title, sheetId: sheet.properties.sheetId };
}

async function findConfiguredSheet(
    spreadsheetId: string,
    gidVariable: string,
    tabVariable: string,
    fallbackGid: string,
    fallbackTitle: string
  ): Promise<{ title: string; sheetId: number }> {
    const configuredGid = Number(process.env[gidVariable] ?? fallbackGid);
    if (!Number.isSafeInteger(configuredGid) || configuredGid < 0) {
      throw new PreviewInputError("Google Sheets tab configuration is invalid.");
    }

    const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
    url.searchParams.set("fields", "sheets(properties(sheetId,title))");
    const payload = await googleRequest<{ sheets?: SpreadsheetSheet[] }>(url.toString());
    const sheet = (payload.sheets ?? []).find((item) => item.properties?.sheetId === configuredGid);
    const title = sheet?.properties?.title;
    if (!title || sheet?.properties?.sheetId === undefined) {
      throw new PreviewInputError(`The configured ${tabVariable} sheet tab was not found.`);
    }

    const configuredTitle = normalizedSheetName(process.env[tabVariable] ?? fallbackTitle);
    if (configuredTitle.toLowerCase() !== title.trim().toLowerCase()) {
      throw new PreviewInputError(`The configured ${tabVariable} sheet tab does not match its GID.`);
    }
    return { title, sheetId: sheet.properties.sheetId };
  }

  export type MatchMasterRow = {
    match_id: string;
    home_team_priority: string | null;
    away_team_priority: string | null;
    competition_season_priority: string | null;
    competition_name: string | null;
    season_name: string | null;
    home_team: string | null;
    away_team: string | null;
    match_date: string | null;
    kick_off_time: string | null;
    match_day: string | null;
    match_status: string | null;
    eta: string | null;
    sla: string | null;
    sla_status: string | null;
    team: string | null;
    shift_type: string | null;
    country: string | null;
    video_eta: string | null;
    diff: string | null;
    match_type: string | null;
    diff_sla: string | null;
  };

  export type MatchMasterPreviewRow = MatchMasterRow & {
    source_row: number;
    raw_match_id: string | null;
    match_id_valid: boolean;
  };

  function cleanSheetValue(value: unknown): string | null {
    const text = String(value ?? "").trim();
    return text || null;
  }

  export async function readMatchesMasterSheet(): Promise<MatchMasterRow[]> {
    const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
    const sheet = await findConfiguredSheet(
      spreadsheetId,
      "GOOGLE_SHEETS_MATCHES_GID",
      "GOOGLE_SHEETS_MATCHES_TAB",
      "1180574881",
      "Matches (T)"
    );
    const payload = await googleRequest<{ values?: unknown[][] }>(
      `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheet.title}!A:V`)}`
    );
    const matrix = payload.values ?? [];
    if (matrix.length === 0) throw new PreviewInputError("The Matches (T) sheet is empty.");

    const headers = (matrix[0] ?? []).map((value) =>
      String(value ?? "").trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ")
    );
    const indexes = {
      id: headers.indexOf("id"),
      homeTeamPriority: headers.indexOf("home team priority"),
      awayTeamPriority: headers.indexOf("away team priority"),
      competitionSeasonPriority: headers.indexOf("comp season priority"),
      competitionName: headers.indexOf("competition name"),
      seasonName: headers.indexOf("season name"),
      homeTeam: headers.indexOf("home team"),
      awayTeam: headers.indexOf("away team"),
      matchDate: headers.indexOf("match date"),
      kickOffTime: headers.indexOf("kick off time2"),
      matchDay: headers.indexOf("match day"),
      matchStatus: headers.indexOf("match status"),
      eta: headers.indexOf("eta"),
      sla: headers.indexOf("sla"),
      slaStatus: headers.indexOf("sla status"),
      team: headers.indexOf("team"),
      shiftType: headers.indexOf("shift type"),
      country: headers.indexOf("country"),
      videoEta: headers.indexOf("video eta"),
      diff: headers.indexOf("diff"),
      matchType: headers.indexOf("match type"),
      diffSla: headers.indexOf("diff sla"),
    };
    if (indexes.id < 0) throw new PreviewInputError("The Matches (T) sheet is missing its ID header.");

    return matrix.slice(1).flatMap((row): MatchMasterRow[] => {
      const matchId = normalizeMatchId(row[indexes.id]);
      if (!matchId) return [];
      const value = (index: number) => (index >= 0 ? cleanSheetValue(row[index]) : null);
      return [{
        match_id: matchId,
        home_team_priority: value(indexes.homeTeamPriority),
        away_team_priority: value(indexes.awayTeamPriority),
        competition_season_priority: value(indexes.competitionSeasonPriority),
        competition_name: value(indexes.competitionName),
        season_name: value(indexes.seasonName),
        home_team: value(indexes.homeTeam),
        away_team: value(indexes.awayTeam),
        match_date: value(indexes.matchDate),
        kick_off_time: value(indexes.kickOffTime),
        match_day: value(indexes.matchDay),
        match_status: value(indexes.matchStatus),
        eta: value(indexes.eta),
        sla: value(indexes.sla),
        sla_status: value(indexes.slaStatus),
        team: value(indexes.team),
        shift_type: value(indexes.shiftType),
        country: value(indexes.country),
        video_eta: value(indexes.videoEta),
        diff: value(indexes.diff),
        match_type: value(indexes.matchType),
        diff_sla: value(indexes.diffSla),
      }];
    });
}

export async function readMatchesMasterSheetForPreview(): Promise<MatchMasterPreviewRow[]> {
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheet = await findConfiguredSheet(
    spreadsheetId,
    "GOOGLE_SHEETS_MATCHES_GID",
    "GOOGLE_SHEETS_MATCHES_TAB",
    "1180574881",
    "Matches (T)"
  );
  const payload = await googleRequest<{ values?: unknown[][] }>(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheet.title}!A:V`)}`
  );
  const matrix = payload.values ?? [];
  if (matrix.length === 0) throw new PreviewInputError("The Matches (T) sheet is empty.");
  const headers = (matrix[0] ?? []).map((value) =>
    String(value ?? "").trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ")
  );
  const indexes = {
    id: headers.indexOf("id"),
    homeTeamPriority: headers.indexOf("home team priority"),
    awayTeamPriority: headers.indexOf("away team priority"),
    competitionSeasonPriority: headers.indexOf("comp season priority"),
    competitionName: headers.indexOf("competition name"),
    seasonName: headers.indexOf("season name"),
    homeTeam: headers.indexOf("home team"),
    awayTeam: headers.indexOf("away team"),
    matchDate: headers.indexOf("match date"),
    kickOffTime: headers.indexOf("kick off time2"),
    matchDay: headers.indexOf("match day"),
    matchStatus: headers.indexOf("match status"),
    eta: headers.indexOf("eta"),
    sla: headers.indexOf("sla"),
    slaStatus: headers.indexOf("sla status"),
    team: headers.indexOf("team"),
    shiftType: headers.indexOf("shift type"),
    country: headers.indexOf("country"),
    videoEta: headers.indexOf("video eta"),
    diff: headers.indexOf("diff"),
    matchType: headers.indexOf("match type"),
    diffSla: headers.indexOf("diff sla"),
  };
  if (indexes.id < 0) throw new PreviewInputError("The Matches (T) sheet is missing its ID header.");
  return matrix.slice(1).map((row, index) => {
    const value = (column: number) => column >= 0 ? String(row[column] ?? "").trim() || null : null;
    const rawMatchId = value(indexes.id);
    const matchId = normalizeMatchId(rawMatchId);
    return {
      source_row: index + 2,
      raw_match_id: rawMatchId,
      match_id_valid: Boolean(matchId),
      match_id: matchId ?? "",
      home_team_priority: value(indexes.homeTeamPriority),
      away_team_priority: value(indexes.awayTeamPriority),
      competition_season_priority: value(indexes.competitionSeasonPriority),
      competition_name: value(indexes.competitionName),
      season_name: value(indexes.seasonName),
      home_team: value(indexes.homeTeam),
      away_team: value(indexes.awayTeam),
      match_date: value(indexes.matchDate),
      kick_off_time: value(indexes.kickOffTime),
      match_day: value(indexes.matchDay),
      match_status: value(indexes.matchStatus),
      eta: value(indexes.eta),
      sla: value(indexes.sla),
      sla_status: value(indexes.slaStatus),
      team: value(indexes.team),
      shift_type: value(indexes.shiftType),
      country: value(indexes.country),
      video_eta: value(indexes.videoEta),
      diff: value(indexes.diff),
      match_type: value(indexes.matchType),
      diff_sla: value(indexes.diffSla),
    };
  });
}

export type CollectorSheetValues = {
  hr_code: string;
  previous_hr_code?: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  team: string | null;
  status: string | null;
};

export type TeamSheetCollector = CollectorSheetValues;

export async function pullTeamSheet(): Promise<TeamSheetCollector[]> {
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const gid = Number(process.env.GOOGLE_SHEETS_TEAM_GID ?? "1216279434");
  if (!Number.isInteger(gid)) throw new PreviewInputError("Google Sheets Team tab configuration is invalid.");
  const sheet = await findSheetByGid(spreadsheetId, gid);
  const payload = await googleRequest<{ values?: unknown[][] }>(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheet.title}!A:Z`)}`
  );
  const matrix = payload.values ?? [];
  const normalizeHeader = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  const headers = (matrix[0] ?? []).map(normalizeHeader);
  const indexFor = (aliases: string[]) => headers.findIndex((header) => aliases.includes(header));
  const indexes = {
    hr_code: indexFor(["hr code", "hrcode", "hr-code"]),
    full_name: indexFor(["name", "collector", "collector name", "full name"]),
    email: indexFor(["email", "email address", "e mail"]),
    phone: indexFor(["phone", "phone num", "phone number", "phone no"]),
    team: indexFor(["team", "team name"]),
    status: indexFor(["status"]),
  };
  if (indexes.hr_code < 0 || indexes.full_name < 0 || indexes.email < 0) {
    throw new PreviewInputError("The Team sheet is missing HR-Code, Name, or Email headers.");
  }
  const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  return matrix.slice(1)
    .filter((row) => row.some((value) => clean(value)))
    .map((row) => ({
      hr_code: clean(row[indexes.hr_code]).toUpperCase(),
      full_name: clean(row[indexes.full_name]),
      email: clean(row[indexes.email]).toLowerCase(),
      phone: indexes.phone >= 0 ? clean(row[indexes.phone]) || null : null,
      team: indexes.team >= 0 ? clean(row[indexes.team]) || null : null,
      status: indexes.status >= 0 ? clean(row[indexes.status]) || null : null,
    }));
}

export async function upsertCollectorToTeamSheet(values: CollectorSheetValues): Promise<void> {
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const gid = Number(process.env.GOOGLE_SHEETS_TEAM_GID ?? "1216279434");
  if (!Number.isInteger(gid)) throw new PreviewInputError("Google Sheets Team tab configuration is invalid.");
  const sheet = await findSheetByGid(spreadsheetId, gid);
  const encodedRange = encodeURIComponent(`${sheet.title}!A:Z`);
  const readUrl = `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodedRange}`;
  const payload = await googleRequest<{ values?: unknown[][] }>(readUrl);
  const matrix = payload.values ?? [];
  const headers = (matrix[0] ?? []).map((value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " "));
  const hrIndex = headers.findIndex((header) => ["hr-code", "hr code", "hrcode"].includes(header));
  if (hrIndex < 0) throw new PreviewInputError("The Team sheet does not contain an HR-Code column.");
  const rowIndex = matrix.slice(1).findIndex((row) => {
    const sheetHrCode = String(row[hrIndex] ?? "").trim().toUpperCase();
    return sheetHrCode === values.hr_code || Boolean(values.previous_hr_code && sheetHrCode === values.previous_hr_code);
  });
  const output = [...(rowIndex >= 0 ? matrix[rowIndex + 1] ?? [] : [])];
  const fields: Array<[string[], string]> = [
    [["hr-code", "hr code", "hrcode"], values.hr_code],
    [["name", "collector", "collector name", "full name"], values.full_name],
    [["email", "email address", "e mail"], values.email],
    [["phone", "phone num", "phone number", "phone no"], values.phone ?? ""],
    [["team", "team name"], values.team ?? ""],
    [["status"], values.status ?? ""],
  ];
  fields.forEach(([aliases, value]) => {
    const index = headers.findIndex((header) => aliases.includes(header));
    if (index >= 0) output[index] = value;
  });
  if (rowIndex >= 0) {
    const range = encodeURIComponent(`${sheet.title}!A${rowIndex + 2}:Z${rowIndex + 2}`);
    await googleRequest(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      body: JSON.stringify({ range: `${sheet.title}!A${rowIndex + 2}:Z${rowIndex + 2}`, majorDimension: "ROWS", values: [output] }),
    });
    return;
  }

  const appendUrl = `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheet.title}!A:Z`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await googleRequest(appendUrl, {
    method: "POST",
    body: JSON.stringify({ majorDimension: "ROWS", values: [output] }),
  });
}

export async function deleteCollectorFromTeamSheetByHrCode(hrCode: string): Promise<void> {
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const gid = Number(process.env.GOOGLE_SHEETS_TEAM_GID ?? "1216279434");
  if (!Number.isInteger(gid)) throw new PreviewInputError("Google Sheets Team tab configuration is invalid.");
  const sheet = await findSheetByGid(spreadsheetId, gid);
  const range = encodeURIComponent(`${sheet.title}!A:Z`);
  const payload = await googleRequest<{ values?: unknown[][] }>(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}`
  );
  const matrix = payload.values ?? [];
  const headers = (matrix[0] ?? []).map((value) => String(value ?? "").trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " "));
  const hrIndex = headers.findIndex((header) => ["hr code", "hrcode", "hr-code"].includes(header));
  if (hrIndex < 0) throw new PreviewInputError("The Team sheet does not contain an HR-Code column.");
  const rowIndex = matrix.slice(1).findIndex((row) => String(row[hrIndex] ?? "").trim().toUpperCase() === hrCode.trim().toUpperCase());
  if (rowIndex < 0) return;
  await googleRequest(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: { sheetId: sheet.sheetId, dimension: "ROWS", startIndex: rowIndex + 1, endIndex: rowIndex + 2 },
        },
      }],
    }),
  });
}

export async function pullDistributionSheet(): Promise<GoogleSheetsPull> {
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheetName = normalizedSheetName(process.env.GOOGLE_SHEETS_DISTRIBUTION_TAB ?? "Distribution");
  const headerRow = Number(process.env.GOOGLE_SHEETS_HEADER_ROW ?? "1");
  const configuredMaxRows = Number(process.env.GOOGLE_SHEETS_MAX_ROWS ?? "10000");
  const maxRows =
    Number.isInteger(configuredMaxRows) && configuredMaxRows > 0
      ? Math.min(configuredMaxRows, PREVIEW_LIMITS.maxRows)
      : 500;
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 100) {
    throw new PreviewInputError("Google Sheets header row configuration is invalid.");
  }

  const serviceAccountConfigured =
    Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
    Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!serviceAccountConfigured && !apiKey) {
    throw new PreviewInputError("Google Sheets integration is not configured.");
  }

  const range = `${sheetName}!A${headerRow}:Z${headerRow + maxRows}`;
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`);
  if (!serviceAccountConfigured && apiKey) url.searchParams.set("key", apiKey);
  const headers: HeadersInit = serviceAccountConfigured
    ? { authorization: `Bearer ${await serviceAccountToken()}` }
    : {};
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) safeGoogleError(response.status);
  const payload = (await response.json()) as { values?: unknown[][] };
  const values = payload.values ?? [];
  if (values.length === 0) throw new PreviewInputError("The Distribution sheet is empty.");
  if (values.length > maxRows + 1) {
    throw new PreviewInputError("The Distribution sheet exceeds the allowed row limit.");
  }
  return {
    source: "google_sheets",
    spreadsheetId,
    sheetName,
    pulledAt: new Date().toISOString(),
    rows: {
      sheetName,
      headers: values[0]?.map((value) => String(value ?? "")) ?? [],
      rows: values.slice(1),
    },
  };
}

export type DistributionMatchRow = {
  match_id: string;
  collector_hr_code: string | null;
  collector_name: string | null;
  task: string | null;
  half: string | null;
  status: string | null;
  sla: string | null;
  shift_date: string | null;
  match_date: string | null;
  kick_off_time: string | null;
  hyper_care_notes: string | null;
  review_events: string | null;
  raw_row_number: number;
};

export type DistributionAppendInput = {
  matchId: string;
  collectorHrCode: string;
  collectorName?: string | null;
  task: string;
  half: string;
  competitionName?: string | null;
  country?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  matchDate?: string | null;
  kickOffTime?: string | null;
  shiftDate?: string | null;
};

export type DistributionCreateInput = {
  matchId: string;
  collectorHrCode: string;
  collectorName?: string | null;
  task: string;
  half: string;
  competitionName?: string | null;
  country?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  matchDate?: string | null;
  kickOffTime?: string | null;
  shiftDate?: string | null;
};

export type DistributionUpdateInput = {
  matchId: string;
  rowNumber: number;
  expectedCollectorHrCode: string;
  expectedTask: string;
  expectedHalf: string;
  collectorHrCode: string;
  collectorName?: string | null;
  task: string;
  half: string;
};

export class DistributionRowConflictError extends PreviewInputError {
  constructor() {
    super("This Distribution row was changed in Google Sheets. Refresh the page before editing it again.");
    this.name = "DistributionRowConflictError";
  }
}

async function readDistributionSheetRange(
  range: string,
  valueRenderOption: "FORMATTED_VALUE" | "FORMULA" = "FORMATTED_VALUE",
): Promise<unknown[][]> {
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("valueRenderOption", valueRenderOption);
  const payload = await googleRequest<{ values?: unknown[][] }>(url.toString());
  return payload.values ?? [];
}

function normalizeDistributionHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeDistributionCollectorHrCode(value: unknown): string | null {
  const hrCode = String(value ?? "").trim();
  return hrCode ? hrCode.toUpperCase() : null;
}

type DistributionHeaderIndexes = { id: number; hr: number; task: number; half: number };

function getDistributionHeaderIndexes(headers: string[]): DistributionHeaderIndexes {
  const indexes = {
    id: headers.findIndex((header) => header === "id" || header === "match id"),
    hr: headers.findIndex((header) => ["hr code", "hr-code", "collector hr code", "collector code"].includes(header)),
    task: headers.findIndex((header) => ["task", "task type", "work type", "assignment type"].includes(header)),
    half: headers.findIndex((header) => ["half", "period", "match half"].includes(header)),
  };
  if (Object.values(indexes).some((index) => index < 0)) {
    throw new PreviewInputError("The Distribution sheet is missing required assignment headers.");
  }
  return indexes;
}

function matchesDistributionIdentity(
  row: unknown[],
  indexes: DistributionHeaderIndexes,
  matchId: string,
  collectorHrCode: string,
  task: string,
  half: string,
): boolean {
  return normalizeMatchId(row[indexes.id] ?? null) === matchId &&
    normalizeDistributionCollectorHrCode(row[indexes.hr] ?? null) === collectorHrCode &&
    normalizeDistributionTask(row[indexes.task] ?? null).toLowerCase() === task.toLowerCase() &&
    normalizeDistributionHalf(row[indexes.half] ?? null).toLowerCase() === half.toLowerCase();
}

export async function appendDistributionRow(input: DistributionAppendInput): Promise<DistributionMatchRow> {
  const [created] = await createDistributionAssignments([input]);
  if (!created) {
    throw new PreviewInputError("The Distribution assignment could not be created.");
  }
  return created;
}

export async function createDistributionAssignments(inputs: DistributionCreateInput[]): Promise<DistributionMatchRow[]> {
  if (inputs.length === 0) {
    throw new PreviewInputError("Add at least one assignment before confirming.");
  }

  const prepared = inputs.map((input) => {
    const matchId = normalizeMatchId(input.matchId);
    const collectorHrCode = normalizeDistributionCollectorHrCode(input.collectorHrCode);
    const task = normalizeDistributionTask(input.task);
    const half = normalizeDistributionHalf(input.half);
    if (!matchId || !collectorHrCode || !task) {
      throw new PreviewInputError("Each assignment requires a valid Match ID, Collector, and Task.");
    }
    return { ...input, matchId, collectorHrCode, task, half };
  });

  const pendingKeys = new Set<string>();
  for (const item of prepared) {
    const key = `${item.matchId}|${item.collectorHrCode}|${item.task.toLowerCase()}|${item.half.toLowerCase()}`;
    if (pendingKeys.has(key)) {
      throw new PreviewInputError("Duplicate assignment detected in the pending list.");
    }
    pendingKeys.add(key);
  }

  const sheetName = normalizedSheetName(process.env.GOOGLE_SHEETS_DISTRIBUTION_TAB ?? "Distribution");
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const created: DistributionMatchRow[] = [];

  // Re-read after every insert/write so subsequent assignments use current row numbers.
  // Existing matches are extended directly below their last row instead of using an
  // unrelated blank row elsewhere in the sheet.
  for (const item of prepared) {
    const latestValues = await readDistributionSheetRange(`${sheetName}!A:Z`, "FORMULA");
    if (latestValues.length === 0) throw new PreviewInputError("The Distribution sheet is empty.");
    const headers = (latestValues[0] ?? []).map(normalizeDistributionHeader);
    const indexes = getDistributionHeaderIndexes(headers);

    if (latestValues.slice(1).some((row) =>
      matchesDistributionIdentity(row, indexes, item.matchId, item.collectorHrCode, item.task, item.half)
    )) {
      throw new PreviewInputError(`Assignment already exists: ${item.matchId} / ${item.collectorHrCode} / ${item.task} / ${item.half}.`);
    }

    const matchingRows = latestValues.flatMap((row, index) =>
      index > 0 && normalizeMatchId(row[indexes.id] ?? null) === item.matchId
        ? [index + 1]
        : []
    );
    const lastMatchRow = matchingRows.length > 0 ? (matchingRows[matchingRows.length - 1] ?? null) : null;
    const firstBlankRow = latestValues
      .slice(1)
      .findIndex((row) => String(row[indexes.id] ?? "").trim() === "");
    let targetRow: number;
    let mustInsertRow = false;

    if (lastMatchRow !== null) {
      // Row numbers are 1-based in Sheets. Insert immediately after the match
      // group only when the next row already belongs to another match or is
      // beyond the currently returned grid; otherwise reuse the blank row there.
      targetRow = lastMatchRow + 1;
      const nextRow = latestValues[targetRow - 1];
      if (nextRow && String(nextRow[indexes.id] ?? "").trim() !== "") {
        mustInsertRow = true;
      } else if (!nextRow) {
        mustInsertRow = true;
      }
    } else if (firstBlankRow >= 0) {
      targetRow = firstBlankRow + 2;
    } else {
      targetRow = latestValues.length + 1;
      mustInsertRow = true;
    }

    if (mustInsertRow) {
      const sheetId = await findDistributionSheetId(spreadsheetId, sheetName);
      const sourceRow = targetRow - 1;
      if (sourceRow < 2) {
        throw new PreviewInputError("A formatted Distribution row is not available to insert this assignment safely.");
      }
      await googleRequest(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              insertDimension: {
                range: {
                  sheetId,
                  dimension: "ROWS",
                  startIndex: targetRow - 1,
                  endIndex: targetRow,
                },
                inheritFromBefore: true,
              },
            },
            {
              copyPaste: {
                source: {
                  sheetId,
                  startRowIndex: sourceRow - 1,
                  endRowIndex: sourceRow,
                  startColumnIndex: 0,
                  endColumnIndex: 26,
                },
                destination: {
                  sheetId,
                  startRowIndex: targetRow - 1,
                  endRowIndex: targetRow,
                  startColumnIndex: 0,
                  endColumnIndex: 26,
                },
                pasteType: "PASTE_NORMAL",
                pasteOrientation: "NORMAL",
              },
            },
          ],
        }),
      });
    }

    const rowData = [
      { range: `${sheetName}!A${targetRow}:B${targetRow}`, majorDimension: "ROWS", values: [[item.matchId, item.shiftDate ?? ""]] },
      { range: `${sheetName}!K${targetRow}:K${targetRow}`, majorDimension: "ROWS", values: [[item.collectorHrCode]] },
      { range: `${sheetName}!M${targetRow}:O${targetRow}`, majorDimension: "ROWS", values: [[item.task, item.half, ""]] },
    ];
    await googleRequest(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: rowData }),
    });

    const verificationValues = await readDistributionSheetRange(`${sheetName}!A${targetRow}:Z${targetRow}`, "FORMULA");
    if (!verificationValues.some((row) => matchesDistributionIdentity(row, indexes, item.matchId, item.collectorHrCode, item.task, item.half))) {
      const recoveryValues = await readDistributionSheetRange(`${sheetName}!A:Z`, "FORMULA");
      if (!recoveryValues.slice(1).some((row) => matchesDistributionIdentity(row, indexes, item.matchId, item.collectorHrCode, item.task, item.half))) {
        throw new PreviewInputError(`Assignment verification failed for ${item.collectorHrCode} / ${item.task} / ${item.half}; no retry was attempted.`);
      }
      throw new PreviewInputError(`Assignment exists but could not be verified at row ${targetRow}; no retry was attempted.`);
    }

    created.push({
      match_id: item.matchId,
      collector_hr_code: item.collectorHrCode,
      collector_name: item.collectorName ?? null,
      task: item.task,
      half: item.half,
      status: null,
      sla: null,
      shift_date: item.shiftDate ?? null,
      match_date: item.matchDate ?? null,
      kick_off_time: item.kickOffTime ?? null,
      hyper_care_notes: null,
      review_events: null,
      raw_row_number: targetRow,
    });
  }

  await refreshDistributionMatchBorders();
  return created;
}
export async function updateDistributionRow(input: DistributionUpdateInput): Promise<DistributionMatchRow> {
  const matchId = normalizeMatchId(input.matchId);
  const expectedHrCode = normalizeDistributionCollectorHrCode(input.expectedCollectorHrCode);
  const collectorHrCode = normalizeDistributionCollectorHrCode(input.collectorHrCode);
  const expectedTask = normalizeDistributionTask(input.expectedTask);
  const task = normalizeDistributionTask(input.task);
  const expectedHalf = normalizeDistributionHalf(input.expectedHalf);
  const half = normalizeDistributionHalf(input.half);
  if (!matchId || !Number.isSafeInteger(input.rowNumber) || input.rowNumber < 2 || !expectedHrCode || !collectorHrCode || !task) {
    throw new PreviewInputError("The Distribution edit input is invalid.");
  }
  // Keep custom Distribution tasks editable; the sheet is the source of truth
  // for task scopes and they must not be rejected by a stale frontend options list.

  const sheetName = normalizedSheetName(process.env.GOOGLE_SHEETS_DISTRIBUTION_TAB ?? "Distribution");
  const values = await readDistributionSheetRange(`${sheetName}!A:Z`, "FORMULA");
  if (values.length === 0) throw new PreviewInputError("The Distribution sheet is empty.");
  const normalizedHeaders = (values[0] ?? []).map(normalizeDistributionHeader);
  const indexes = getDistributionHeaderIndexes(normalizedHeaders);
  const collectorNameColumn = normalizedHeaders.findIndex((header) =>
    ["collector", "collector name", "assigned collector", "name"].includes(header)
  );
  const originalRow = values[input.rowNumber - 1];
  if (!originalRow || !matchesDistributionIdentity(originalRow, indexes, matchId, expectedHrCode, expectedTask, expectedHalf)) {
    throw new DistributionRowConflictError();
  }

  const duplicate = values.slice(1).some((row, index) =>
    index + 2 !== input.rowNumber &&
    matchesDistributionIdentity(row, indexes, matchId, collectorHrCode, task, half)
  );
  if (duplicate) {
    throw new PreviewInputError("This assignment already exists for the selected Match, Collector, Task, and Half.");
  }

  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  await googleRequest(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${sheetName}!K${input.rowNumber}:K${input.rowNumber}`, majorDimension: "ROWS", values: [[collectorHrCode]] },
        ...(collectorNameColumn >= 0 && input.collectorName
          ? [{ range: `${sheetName}!${columnLetter(collectorNameColumn + 1)}${input.rowNumber}:${columnLetter(collectorNameColumn + 1)}${input.rowNumber}`, majorDimension: "ROWS" as const, values: [[input.collectorName]] }]
          : []),
        { range: `${sheetName}!M${input.rowNumber}:N${input.rowNumber}`, majorDimension: "ROWS", values: [[task, half]] },
      ],
    }),
  });

  const targetValues = await readDistributionSheetRange(`${sheetName}!A${input.rowNumber}:Z${input.rowNumber}`);
  if (!targetValues.some((row) => matchesDistributionIdentity(row, indexes, matchId, collectorHrCode, task, half))) {
    const recoveryValues = await readDistributionSheetRange(`${sheetName}!A:Z`);
    if (!recoveryValues.slice(1).some((row) => matchesDistributionIdentity(row, indexes, matchId, collectorHrCode, task, half))) {
      throw new PreviewInputError("The edited assignment could not be verified; no retry was attempted.");
    }
    throw new PreviewInputError("The edited assignment exists, but its source row could not be verified.");
  }

  await refreshDistributionMatchBorders();
  return {
    match_id: matchId,
    collector_hr_code: collectorHrCode,
    collector_name: input.collectorName ?? null,
    task,
    half,
    status: null,
    sla: null,
    shift_date: null,
    match_date: null,
    kick_off_time: null,
    hyper_care_notes: null,
    review_events: null,
    raw_row_number: input.rowNumber,
  };
}

async function findDistributionSheetId(spreadsheetId: string, title: string): Promise<number> {
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  url.searchParams.set("fields", "sheets(properties(sheetId,title))");
  const payload = await googleRequest<{ sheets?: SpreadsheetSheet[] }>(url.toString());
  const sheet = (payload.sheets ?? []).find((item) => item.properties?.title?.trim().toLowerCase() === title.trim().toLowerCase());
  if (sheet?.properties?.sheetId === undefined) {
    throw new PreviewInputError("The configured Distribution sheet tab was not found.");
  }
  return sheet.properties.sheetId;
}

export type DistributionDeleteInput = {
  matchId: string;
  collectorHrCode: string;
  task: string;
  half: string;
};

/**
 * Permanently removes one uniquely identified assignment row from the live
 * Distribution sheet. The caller must authenticate and authorize the admin.
 * Refuses to delete if the identity is missing or ambiguous.
 */
export async function deleteDistributionRowFromSheet(input: DistributionDeleteInput): Promise<{ rowNumber: number }> {
  const matchId = normalizeMatchId(input.matchId);
  const collectorHrCode = normalizeDistributionCollectorHrCode(input.collectorHrCode);
  const task = normalizeDistributionTask(input.task);
  const half = normalizeDistributionHalf(input.half);
  if (!matchId || !collectorHrCode || !task || !half) {
    throw new PreviewInputError("The Distribution assignment identity is incomplete.");
  }

  const sheetName = normalizedSheetName(process.env.GOOGLE_SHEETS_DISTRIBUTION_TAB ?? "Distribution");
  const values = await readDistributionSheetRange(`${sheetName}!A:Z`, "FORMULA");
  if (values.length < 2) throw new PreviewInputError("No assignment rows were found in the Distribution sheet.");
  const indexes = getDistributionHeaderIndexes((values[0] ?? []).map(normalizeDistributionHeader));
  const matchingRows = values.slice(1).flatMap((row, index) =>
    matchesDistributionIdentity(row, indexes, matchId, collectorHrCode, task, half)
      ? [index + 2]
      : []
  );

  if (matchingRows.length === 0) {
    throw new DistributionRowConflictError();
  }
  if (matchingRows.length > 1) {
    throw new PreviewInputError("More than one matching row exists in Distribution. No row was deleted; resolve the duplicate rows first.");
  }

  const rowNumber = matchingRows[0];
  if (rowNumber === undefined) throw new DistributionRowConflictError();
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheetId = await findDistributionSheetId(spreadsheetId, sheetName);
  await googleRequest(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber },
        },
      }],
    }),
  });

  const remaining = await readDistributionSheetRange(`${sheetName}!A:Z`, "FORMULA");
  const remainingIndexes = getDistributionHeaderIndexes((remaining[0] ?? []).map(normalizeDistributionHeader));
  const stillExists = remaining.slice(1).some((row) =>
    matchesDistributionIdentity(row, remainingIndexes, matchId, collectorHrCode, task, half)
  );
  if (stillExists) {
    throw new PreviewInputError("The row deletion could not be verified. Refresh Distribution before trying again.");
  }

  await refreshDistributionMatchBorders();
  return { rowNumber };
}

export async function refreshDistributionMatchBorders(): Promise<void> {
  const sheetName = normalizedSheetName(process.env.GOOGLE_SHEETS_DISTRIBUTION_TAB ?? "Distribution");
  const values = await readDistributionSheetRange(`${sheetName}!A:Z`, "FORMULA");
  if (values.length < 2) return;
  const headers = (values[0] ?? []).map(normalizeDistributionHeader);
  const idIndex = headers.findIndex((header) => header === "id" || header === "match id");
  if (idIndex < 0) throw new PreviewInputError("The Distribution sheet does not contain an ID column.");

  const groupEndRows: number[] = [];
  let currentMatchId: string | null = null;
  let currentRowNumber: number | null = null;
  values.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const rowMatchId = normalizeMatchId(row[idIndex] ?? null);
    if (!rowMatchId) {
      if (currentRowNumber !== null) groupEndRows.push(currentRowNumber);
      currentMatchId = null;
      currentRowNumber = null;
      return;
    }
    if (currentMatchId !== rowMatchId && currentRowNumber !== null) {
      groupEndRows.push(currentRowNumber);
    }
    currentMatchId = rowMatchId;
    currentRowNumber = rowNumber;
  });
  if (currentRowNumber !== null) groupEndRows.push(currentRowNumber);

  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheetId = await findDistributionSheetId(spreadsheetId, sheetName);
  const requests = [
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: values.length, startColumnIndex: 0, endColumnIndex: 18 },
        cell: { userEnteredFormat: { borders: { bottom: { style: "NONE" } } } },
        fields: "userEnteredFormat.borders.bottom",
      },
    },
    ...groupEndRows.map((rowNumber) => ({
      updateBorders: {
        range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: 0, endColumnIndex: 18 },
        bottom: { style: "SOLID_MEDIUM", color: { red: 0.35, green: 0.35, blue: 0.35 } },
      },
    })),
  ];
  await googleRequest(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

export async function readDistributionRowsForMatch(matchId: string): Promise<DistributionMatchRow[]> {
  const normalizedMatchId = normalizeMatchId(matchId);
  if (!normalizedMatchId) {
    return [];
  }

  const pull = await pullDistributionSheet();
  const headers = pull.rows.headers.map(normalizeDistributionHeader);
  const findHeaderIndex = (...aliases: string[]) => {
    const normalizedAliases = aliases.map((alias) => normalizeDistributionHeader(alias));
    return headers.findIndex((header) => normalizedAliases.includes(header));
  };

  const indexes = {
    id: findHeaderIndex("id", "match id"),
    hrCode: findHeaderIndex("hr code", "hr-code", "collector hr code", "collector code"),
    collectorName: findHeaderIndex("collector", "collector name", "assigned collector", "name"),
    task: findHeaderIndex("task", "task type", "work type", "assignment type"),
    half: findHeaderIndex("half", "period", "match half"),
    status: findHeaderIndex("status"),
    sla: findHeaderIndex("sla", "deadline", "time"),
    shiftDate: findHeaderIndex("shift date", "date", "assignment date"),
    matchDate: findHeaderIndex("match date"),
    kickOffTime: findHeaderIndex("kick off time", "kick-off time", "kick off"),
    hyperCareNotes: findHeaderIndex("hyper care notes", "hyper-care notes", "notes"),
    reviewEvents: findHeaderIndex("review events"),
  };

  const asText = (value: unknown): string | null => {
    const text = String(value ?? "").trim();
    return text || null;
  };

  const mapRows = (rows: unknown[][], rowOffset: number): DistributionMatchRow[] => rows
    .map((row, index) => {
      const rowMatchId = normalizeMatchId(row[indexes.id] ?? null);
      if (rowMatchId !== normalizedMatchId) return null;

      return {
        match_id: normalizedMatchId,
        collector_hr_code: indexes.hrCode >= 0 ? asText(row[indexes.hrCode]) : null,
        collector_name: indexes.collectorName >= 0 ? asText(row[indexes.collectorName]) : null,
        task: indexes.task >= 0 ? asText(row[indexes.task]) : null,
        half: indexes.half >= 0 ? asText(row[indexes.half]) : null,
        status: indexes.status >= 0 ? asText(row[indexes.status]) : null,
        sla: indexes.sla >= 0 ? asText(row[indexes.sla]) : null,
        shift_date: indexes.shiftDate >= 0 ? asText(row[indexes.shiftDate]) : null,
        match_date: indexes.matchDate >= 0 ? asText(row[indexes.matchDate]) : null,
        kick_off_time: indexes.kickOffTime >= 0 ? asText(row[indexes.kickOffTime]) : null,
        hyper_care_notes: indexes.hyperCareNotes >= 0 ? asText(row[indexes.hyperCareNotes]) : null,
        review_events: indexes.reviewEvents >= 0 ? asText(row[indexes.reviewEvents]) : null,
        raw_row_number: index + rowOffset,
      } satisfies DistributionMatchRow;
    })
    .filter((row): row is DistributionMatchRow => row !== null);
  const previewRows = mapRows(pull.rows.rows, 2);
  if (previewRows.length > 0) return previewRows;

  const fullValues = await readDistributionSheetRange(`${pull.sheetName}!A:Z`);
  return mapRows(fullValues.slice(1), 2);
}

export async function readDistributionRowsForPreview(
  existingPull?: GoogleSheetsPull,
): Promise<DistributionMatchRow[]> {
  // Reuse the caller's successful pull when the same request already read the sheet.
  const pull = existingPull ?? await pullDistributionSheet();
  // pullDistributionSheet already fetched the configured range including headers.
  // Reuse that response instead of making a second full-sheet API request.
  const matrix = [pull.rows.headers, ...pull.rows.rows];
  const headers = (matrix[0] ?? []).map(normalizeDistributionHeader);
  const findHeaderIndex = (...aliases: string[]) => {
    const normalizedAliases = aliases.map(normalizeDistributionHeader);
    return headers.findIndex((header) => normalizedAliases.includes(header));
  };
  const indexes = {
    id: findHeaderIndex("id", "match id"),
    hrCode: findHeaderIndex("hr code", "hr-code", "collector hr code", "collector code"),
    collectorName: findHeaderIndex("collector", "collector name", "assigned collector", "name"),
    task: findHeaderIndex("task", "task type", "work type", "assignment type"),
    half: findHeaderIndex("half", "period", "match half"),
    status: findHeaderIndex("status"),
    sla: findHeaderIndex("sla", "deadline", "time"),
    shiftDate: findHeaderIndex("shift date", "date", "assignment date"),
    matchDate: findHeaderIndex("match date"),
    kickOffTime: findHeaderIndex("kick off time", "kick-off time", "kick off"),
    hyperCareNotes: findHeaderIndex("hyper care notes", "hyper-care notes", "notes"),
    reviewEvents: findHeaderIndex("review events"),
  };
  if (indexes.id < 0 || indexes.hrCode < 0 || indexes.task < 0 || indexes.half < 0) {
    throw new PreviewInputError("The Distribution sheet is missing required assignment headers.");
  }
  const asText = (value: unknown): string | null => {
    const text = String(value ?? "").trim();
    return text || null;
  };
  const spreadsheetError = /^#(?:N\/A|REF!|VALUE!|ERROR!|DIV\/0!|NAME\?|NUM!|NULL!)$/i;
  return matrix.slice(1).flatMap((row, index): DistributionMatchRow[] => {
    const rawMatchId = asText(row[indexes.id]);
    const matchId = normalizeMatchId(rawMatchId);
    const hrCode = asText(row[indexes.hrCode]);
    const collectorName = asText(row[indexes.collectorName]);
    const task = asText(row[indexes.task]);
    const half = asText(row[indexes.half]);

    // A row is an actual distribution only when all five identity fields
    // are present and valid. Distribution contains many formula/template
    // rows (including #N/A collector names); don't reconcile those into the
    // dashboard or count them as missing/invalid assignments.
    if (
      !matchId ||
      !hrCode ||
      spreadsheetError.test(hrCode) ||
      !collectorName ||
      spreadsheetError.test(collectorName) ||
      !task ||
      spreadsheetError.test(task) ||
      !half ||
      spreadsheetError.test(half)
    ) return [];

    return [{
      match_id: matchId,
      collector_hr_code: hrCode,
      collector_name: collectorName,
      task,
      half,
      status: indexes.status >= 0 ? asText(row[indexes.status]) : null,
      sla: indexes.sla >= 0 ? asText(row[indexes.sla]) : null,
      shift_date: indexes.shiftDate >= 0 ? asText(row[indexes.shiftDate]) : null,
      match_date: indexes.matchDate >= 0 ? asText(row[indexes.matchDate]) : null,
      kick_off_time: indexes.kickOffTime >= 0 ? asText(row[indexes.kickOffTime]) : null,
      hyper_care_notes: indexes.hyperCareNotes >= 0 ? asText(row[indexes.hyperCareNotes]) : null,
      review_events: indexes.reviewEvents >= 0 ? asText(row[indexes.reviewEvents]) : null,
      raw_row_number: index + 2,
    }];
  });
}


export type DistributionStatusUpdate = {
  matchId: string;
  collectorHrCode: string;
  task: string;
  half: string;
  status: "Complete" | "In Progress";
};

function columnLetter(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

/**
 * Writes assignment completion states back to the live Distribution sheet.
 * Each update must match exactly one row by Match ID + collector HR code +
 * task + half. Ambiguous or missing identities fail safely without writing.
 */
export async function updateDistributionStatuses(
  updates: DistributionStatusUpdate[],
): Promise<{ updated: number }> {
  if (updates.length === 0) return { updated: 0 };

  const sheetName = normalizedSheetName(process.env.GOOGLE_SHEETS_DISTRIBUTION_TAB ?? "Distribution");
  // Always re-read the live sheet immediately before resolving row numbers.
  // Rows can move when a collector/task is added or edited during a match.
  const values = await readDistributionSheetRange(`${sheetName}!A:Z`, "FORMULA");
  if (values.length < 2) throw new PreviewInputError("No assignment rows were found in the Distribution sheet.");

  const headers = (values[0] ?? []).map(normalizeDistributionHeader);
  const indexes = getDistributionHeaderIndexes(headers);
  const statusIndex = headers.findIndex((header) => header === "status");
  if (statusIndex < 0) throw new PreviewInputError("The Distribution sheet is missing the Status column.");

  const writes: Array<{ rowNumber: number; status: DistributionStatusUpdate["status"] }> = [];
  const seenRows = new Set<number>();

  for (const update of updates) {
    const matchId = normalizeMatchId(update.matchId);
    const hrCode = normalizeDistributionCollectorHrCode(update.collectorHrCode);
    const task = normalizeDistributionTask(update.task);
    const half = normalizeDistributionHalf(update.half);
    if (!matchId || !hrCode || !task || !half) {
      throw new PreviewInputError("A Distribution status update has incomplete assignment identity.");
    }

    const allRows = values.slice(1).map((row, index) => ({
      row,
      rowNumber: index + 2,
    }));
    const exactMatches = allRows.filter(({ row }) =>
      matchesDistributionIdentity(row, indexes, matchId, hrCode, task, half)
    );

    // If the task was edited in the app/sheet and one side did not finish
    // syncing, recover only when Match ID + current HR-Code + Half uniquely
    // identifies a row. Never guess between multiple tasks or collectors.
    const matches = exactMatches.length > 0
      ? exactMatches
      : allRows.filter(({ row }) =>
          normalizeMatchId(row[indexes.id] ?? null) === matchId &&
          normalizeDistributionCollectorHrCode(row[indexes.hr] ?? null) === hrCode &&
          normalizeDistributionHalf(row[indexes.half] ?? null).toLowerCase() === half.toLowerCase()
        );

    if (matches.length !== 1) {
      throw new PreviewInputError(
        matches.length === 0
          ? `No matching Distribution row was found for Match ID ${matchId}, HR code ${hrCode}, task ${task}, half ${half}. Check that the current collector and task exist in the Distribution sheet.`
          : `Multiple Distribution rows match Match ID ${matchId}, HR code ${hrCode}, and half ${half}. No status was changed because the row is ambiguous.`
      );
    }

    const match = matches[0];
    if (!match) throw new PreviewInputError("The matching Distribution row could not be resolved.");
    if (seenRows.has(match.rowNumber)) {
      throw new PreviewInputError("Multiple status updates target the same Distribution row.");
    }
    seenRows.add(match.rowNumber);
    const currentStatus = String(match.row[statusIndex] ?? "").trim();
    if (currentStatus.toLowerCase() !== update.status.toLowerCase()) {
      writes.push({ rowNumber: match.rowNumber, status: update.status });
    }
  }

  if (writes.length === 0) return { updated: 0 };

  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const statusColumn = columnLetter(statusIndex);
  await googleRequest(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: writes.map((write) => ({
        range: `${sheetName}!${statusColumn}${write.rowNumber}:${statusColumn}${write.rowNumber}`,
        majorDimension: "ROWS",
        values: [[write.status]],
      })),
    }),
  });

  // Verify against the latest status column values after the write.
  const verification = await readDistributionSheetRange(
    `${sheetName}!${statusColumn}:${statusColumn}`,
    "FORMATTED_VALUE",
  );
  for (const write of writes) {
    const actual = String(verification[write.rowNumber - 1]?.[0] ?? "").trim();
    if (actual.toLowerCase() !== write.status.toLowerCase()) {
      throw new PreviewInputError("The Distribution status update could not be verified.");
    }
  }

  return { updated: writes.length };
}

export type DeductionSheetSourceRow = {
  source_row_number: number;
  match_id: string;
  app: string;
  code: string;
  collector_name: string;
  squad: string;
  side: string;
  half: string;
  timestamp: string;
  event: string;
  comment: string;
  review_date: string;
  link: string;
};

async function findSheetByTitle(
  spreadsheetId: string,
  title: string,
  tabVariable = "GOOGLE_SHEETS_DEDUCTIONS_TAB"
): Promise<{ title: string; sheetId: number }> {
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  url.searchParams.set("fields", "sheets(properties(sheetId,title))");
  const payload = await googleRequest<{ sheets?: SpreadsheetSheet[] }>(url.toString());
  const wanted = title.trim().toLowerCase();
  const sheet = (payload.sheets ?? []).find(
    (item) => (item.properties?.title ?? "").trim().toLowerCase() === wanted
  );
  if (!sheet?.properties?.title || sheet.properties.sheetId === undefined) {
    throw new PreviewInputError(`The configured ${tabVariable} sheet tab was not found.`);
  }
  return { title: sheet.properties.title, sheetId: sheet.properties.sheetId };
}

async function resolveDeductionSheet(
  spreadsheetId: string
): Promise<{ title: string; sheetId: number }> {
  const configuredTitle = normalizedSheetName(process.env.GOOGLE_SHEETS_DEDUCTIONS_TAB ?? "Deduction2026");
  if (!configuredTitle) {
    throw new PreviewInputError("Google Sheets tab configuration is invalid.");
  }
  const gidRaw = process.env.GOOGLE_SHEETS_DEDUCTIONS_GID?.trim();
  if (gidRaw) {
    return findConfiguredSheet(
      spreadsheetId,
      "GOOGLE_SHEETS_DEDUCTIONS_GID",
      "GOOGLE_SHEETS_DEDUCTIONS_TAB",
      gidRaw,
      configuredTitle
    );
  }
  return findSheetByTitle(spreadsheetId, configuredTitle);
}

function normalizeDeductionHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function deductionCellText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export async function readDeduction2026Sheet(): Promise<DeductionSheetSourceRow[]> {
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheet = await resolveDeductionSheet(spreadsheetId);
  const payload = await googleRequest<{ values?: unknown[][] }>(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheet.title}!A:Z`)}`
  );
  const matrix = payload.values ?? [];
  if (matrix.length === 0) return [];

  const headers = (matrix[0] ?? []).map(normalizeDeductionHeader);
  const indexFor = (...aliases: string[]) => headers.findIndex((header) => aliases.includes(header));
  const indexes = {
    // Match ID is anchored to column A even if its header is renamed.
    matchId: 0,
    code: indexFor("collector hr code", "collector code", "hr code", "hrcode", "code"),
    collectorName: indexFor("collector name", "collector", "name"),
    // Error Code is the deduction category shown in the UI. Final Event is kept
    // in the app field for source fidelity, but does not replace the error code.
    event: indexFor("error code (col i)", "error code", "deduction", "deduction type", "event"),
    app: indexFor("final event (col o)", "final event", "app"),
    comment: indexFor("comment", "comments"),
    side: indexFor("side"),
    half: indexFor("half"),
    reviewDate: indexFor("review date"),
    squad: indexFor("squad"),
    timestamp: indexFor("timestamp", "event timestamp", "time"),
    link: indexFor("match link", "link", "url"),
  };
  if (indexes.code < 0 || indexes.event < 0) {
    throw new PreviewInputError("The Deductions2026 sheet is missing Collector HR Code or Error Code headers.");
  }

  const cell = (row: unknown[], index: number): string =>
    index >= 0 ? deductionCellText(row[index]) : "";

  return matrix.slice(1).flatMap((row, index) => {
    const mapped: DeductionSheetSourceRow = {
      source_row_number: index + 2,
      match_id: cell(row, indexes.matchId),
      app: cell(row, indexes.app),
      code: cell(row, indexes.code),
      collector_name: cell(row, indexes.collectorName),
      squad: cell(row, indexes.squad),
      side: cell(row, indexes.side),
      half: cell(row, indexes.half),
      timestamp: cell(row, indexes.timestamp),
      event: cell(row, indexes.event),
      comment: cell(row, indexes.comment),
      review_date: cell(row, indexes.reviewDate),
      link: cell(row, indexes.link),
    };
    const hasValue = [
      mapped.match_id, mapped.app, mapped.code, mapped.collector_name,
      mapped.squad, mapped.side, mapped.half, mapped.timestamp, mapped.event,
      mapped.comment, mapped.review_date, mapped.link,
    ].some((value) => value !== "");
    return hasValue ? [mapped] : [];
  });
}

export type FfShotSheetSourceRow = {
  source_row_number: number;
  match_id: string;
  app: string;
  code: string;
  collector_name: string;
  squad: string;
  side: string;
  half: string;
  timestamp: string;
  player_id: string;
  review_date: string;
  comment: string;
  link: string;
  correct_collector: string;
  changed: string;
};

async function resolveFfShotsSheet(
  spreadsheetId: string
): Promise<{ title: string; sheetId: number }> {
  const configuredTitle = normalizedSheetName(process.env.GOOGLE_SHEETS_FF_SHOTS_TAB ?? "FF - Shots 2026");
  if (!configuredTitle) {
    throw new PreviewInputError("Google Sheets tab configuration is invalid.");
  }
  const gidRaw = process.env.GOOGLE_SHEETS_FF_SHOTS_GID?.trim();
  if (gidRaw) {
    return findConfiguredSheet(
      spreadsheetId,
      "GOOGLE_SHEETS_FF_SHOTS_GID",
      "GOOGLE_SHEETS_FF_SHOTS_TAB",
      gidRaw,
      configuredTitle
    );
  }
  return findSheetByTitle(spreadsheetId, configuredTitle, "GOOGLE_SHEETS_FF_SHOTS_TAB");
}

export async function readFfShots2026Sheet(): Promise<FfShotSheetSourceRow[]> {
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheet = await resolveFfShotsSheet(spreadsheetId);
  const payload = await googleRequest<{ values?: unknown[][] }>(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheet.title}!A:Z`)}`
  );
  const matrix = payload.values ?? [];
  if (matrix.length === 0) {
    return [];
  }

  const headers = (matrix[0] ?? []).map(normalizeDeductionHeader);
  const indexFor = (...aliases: string[]) =>
    headers.findIndex((header) => aliases.includes(header));
  const indexes = {
    matchId: indexFor("match id", "id", "matchid"),
    app: indexFor("app"),
    code: indexFor("code", "hr code", "hrcode", "collector hr code", "collector code"),
    collectorName: indexFor("collector name", "collector", "name"),
    squad: indexFor("squad"),
    side: indexFor("side"),
    half: indexFor("half"),
    timestamp: indexFor("timestamp", "time", "event time"),
    playerId: indexFor("player id", "playerid", "player"),
    reviewDate: indexFor("review date"),
    comment: indexFor("comment", "comments"),
    link: indexFor("link", "url"),
    correctCollector: indexFor("correct collector"),
    changed: indexFor("changed", "changed?"),
  };
  if (indexes.matchId < 0 || indexes.code < 0) {
    throw new PreviewInputError("The FF - Shots 2026 sheet is missing Match ID or Code headers.");
  }

  const cell = (row: unknown[], index: number): string =>
    index >= 0 ? deductionCellText(row[index]) : "";

  return matrix.slice(1).flatMap((row, index) => {
    const mapped: FfShotSheetSourceRow = {
      source_row_number: index + 2,
      match_id: cell(row, indexes.matchId),
      app: cell(row, indexes.app),
      code: cell(row, indexes.code),
      collector_name: cell(row, indexes.collectorName),
      squad: cell(row, indexes.squad),
      side: cell(row, indexes.side),
      half: cell(row, indexes.half),
      timestamp: cell(row, indexes.timestamp),
      player_id: cell(row, indexes.playerId),
      review_date: cell(row, indexes.reviewDate),
      comment: cell(row, indexes.comment),
      link: cell(row, indexes.link),
      correct_collector: cell(row, indexes.correctCollector),
      changed: cell(row, indexes.changed),
    };
    const hasValue = [
      mapped.match_id,
      mapped.app,
      mapped.code,
      mapped.collector_name,
      mapped.squad,
      mapped.side,
      mapped.half,
      mapped.timestamp,
      mapped.player_id,
      mapped.review_date,
      mapped.comment,
      mapped.link,
      mapped.correct_collector,
      mapped.changed,
    ].some((value) => value !== "");
    return hasValue ? [mapped] : [];
  });
}

/**
 * Read only Match Master rows whose ETA falls in the latest seven ETA calendar
 * days. The ETA column is scanned as a narrow single-column range; A:V is
 * fetched only for qualifying rows using one values:batchGet request.
 */
export async function readMatchesMasterSheetForEtaWindow(days = 7): Promise<MatchMasterPreviewRow[]> {
  const spreadsheetId = required("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheet = await findConfiguredSheet(
    spreadsheetId, "GOOGLE_SHEETS_MATCHES_GID", "GOOGLE_SHEETS_MATCHES_TAB",
    "1180574881", "Matches (T)"
  );
  const base = `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values`;
  const [headerPayload, etaPayload] = await Promise.all([
    googleRequest<{ values?: unknown[][] }>(`${base}/${encodeURIComponent(`${sheet.title}!A1:V1`)}`),
    googleRequest<{ values?: unknown[][] }>(`${base}/${encodeURIComponent(`${sheet.title}!N:N`)}`),
  ]);
  const rawHeaders = headerPayload.values?.[0] ?? [];
  const headers = rawHeaders.map((value) =>
    String(value ?? "").trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\\s+/g, " ")
  );
  const etaIndex = headers.indexOf("eta");
  const idIndex = headers.indexOf("id");
  if (etaIndex < 0 || idIndex < 0) throw new PreviewInputError("The Matches (T) sheet must contain ID and ETA headers.");

  // Column N is the known ETA column in Matches (T); retain header-driven
  // validation so a moved ETA column fails safely rather than reading wrong data.
  if (etaIndex !== 13) throw new PreviewInputError("The ETA column moved from column N. Update the narrow ETA scan before syncing.");

  const etaValues = etaPayload.values ?? [];
  const datedRows = etaValues.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    etaDate: normalizeEtaDate(String(row[0] ?? "").trim()),
  })).filter((item) => item.etaDate);
  if (!datedRows.length) return [];

  const newestEta = datedRows.reduce((latest, item) => item.etaDate! > latest ? item.etaDate! : latest, datedRows[0]!.etaDate!);
  const end = new Date(`${newestEta}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() - Math.max(1, days) + 1);
  const windowStart = end.toISOString().slice(0, 10);
  const selectedRows = datedRows.filter((item) => item.etaDate! >= windowStart && item.etaDate! <= newestEta);
  if (!selectedRows.length) return [];

  const ranges = selectedRows.map((item) => `${sheet.title}!A${item.rowNumber}:V${item.rowNumber}`);
  const batchUrl = new URL(`${base}:batchGet`);
  batchUrl.searchParams.set("ranges", ranges.join("&ranges="));
  batchUrl.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  const batch = await googleRequest<{ valueRanges?: Array<{ values?: unknown[][] }> }>(batchUrl.toString());

  const value = (row: unknown[], key: string) => {
    const index = headers.indexOf(key);
    if (index < 0) return null;
    const text = String(row[index] ?? "").trim();
    return text || null;
  };
  return selectedRows.map((selected, index) => {
    const row = batch.valueRanges?.[index]?.values?.[0] ?? [];
    const rawMatchId = value(row, "id");
    const matchId = normalizeMatchId(rawMatchId);
    return {
      source_row: selected.rowNumber,
      raw_match_id: rawMatchId,
      match_id_valid: Boolean(matchId),
      match_id: matchId ?? "",
      home_team_priority: value(row, "home team priority"),
      away_team_priority: value(row, "away team priority"),
      competition_season_priority: value(row, "comp season priority"),
      competition_name: value(row, "competition name"),
      season_name: value(row, "season name"),
      home_team: value(row, "home team"),
      away_team: value(row, "away team"),
      match_date: value(row, "match date"),
      kick_off_time: value(row, "kick off time2"),
      match_day: value(row, "match day"),
      match_status: value(row, "match status"),
      eta: value(row, "eta"),
      sla: value(row, "sla"),
      sla_status: value(row, "sla status"),
      team: value(row, "team"),
      shift_type: value(row, "shift type"),
      country: value(row, "country"),
      video_eta: value(row, "video eta"),
      diff: value(row, "diff"),
      match_type: value(row, "match type"),
      diff_sla: value(row, "diff sla"),
    };
  });
}
