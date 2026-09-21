import "server-only";

import { randomBytes } from "crypto";
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProfileRow } from "@/types/database.types";
import { upsertCollectorToTeamSheet } from "@/lib/sync/google-sheets";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;
const HEADER_ALIASES: Record<string, string[]> = {
  hr_code: ["hr code", "hrcode"],
  name: ["name", "collector", "collector name", "full name"],
  email: ["email", "email address", "e mail"],
  phone: ["phone", "phone num", "phone number", "phone no"],
  status: ["status"],
  team: ["team", "team name"],
} as const;

type Client = SupabaseClient<Database>;

function safeSupabaseError(error: { code?: string; message?: string }): string {
  const code = error.code ? ` (${error.code})` : "";
  const message = (error.message ?? "database operation failed")
    .replace(/\s+/g, " ")
    .slice(0, 240);
  return `${message}${code}`;
}

export type CollectorImportRow = {
  row_number: number;
  hr_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  team: string | null;
  status: string | null;
};

export type CollectorImportResult = {
  rows: Array<CollectorImportRow & {
    outcome: "new-collector" | "existing-collector" | "duplicate-hr-code" | "duplicate-email" | "invalid-row";
    error_type: CollectorImportErrorType | null;
    message: string;
  }>;
  counts: {
    total: number;
    valid: number;
    new_collectors: number;
    existing_collectors: number;
    duplicates: number;
    invalid: number;
    admin_conflicts: number;
  };
};

export type CollectorImportErrorType =
  | "duplicate_hr_code_within_file"
  | "duplicate_email_within_file"
  | "hr_code_belongs_to_another_collector"
  | "email_belongs_to_another_collector"
  | "email_belongs_to_existing_admin"
  | "hr_code_belongs_to_existing_admin"
  | "missing_hr_code"
  | "missing_name"
  | "missing_email"
  | "invalid_email"
  | "conflicting_hr_code_email_mapping"
  | "other_validation_error";

export type CollectorProvisionResult = {
  counts: {
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  rows: Array<CollectorImportRow & {
    outcome: "created" | "updated" | "skipped" | "error";
    message: string;
  }>;
};

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHrCode(value: unknown): string {
  return clean(value).replace(/[\u200b-\u200f\u202a-\u202e]/g, "").toUpperCase();
}

function normalizeEmail(value: unknown): string {
  return clean(value).toLowerCase();
}

function normalizeHeader(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function parseCollectorImport(buffer: Buffer): CollectorImportRow[] {
  if (buffer.length > MAX_FILE_BYTES) throw new Error("The collector file exceeds the 5 MB limit.");
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false });
  } catch {
    throw new Error("The collector file is not a valid CSV or XLSX file.");
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error("The collector file is empty.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: null, blankrows: false });
  if (matrix.length < 2) throw new Error("The collector file contains no data rows.");
  const headers = (matrix[0] ?? []).map(normalizeHeader);
  const indices = (["hr_code", "name", "email", "phone", "status"] as const).map((field) =>
    headers.findIndex((header) => HEADER_ALIASES[field]?.includes(header) ?? false)
  );
  if (indices.some((index) => index < 0)) throw new Error("The collector file must contain HR-Code, Name, Email, Phone, and Status columns.");
  const [hrCodeIndex, nameIndex, emailIndex, phoneIndex, statusIndex] = indices;
  if (
    hrCodeIndex === undefined ||
    nameIndex === undefined ||
    emailIndex === undefined ||
    phoneIndex === undefined ||
    statusIndex === undefined
  ) {
    throw new Error("The collector file headers could not be read.");
  }
  const rows = matrix.slice(1).filter((row) => row.some((value) => clean(value)));
  if (rows.length > MAX_ROWS) throw new Error("The collector file exceeds the 500-row limit.");
  return rows.map((row, index) => ({
    row_number: index + 2,
    hr_code: normalizeHrCode(row[hrCodeIndex]),
    full_name: clean(row[nameIndex]),
    email: normalizeEmail(row[emailIndex]),
    phone: clean(row[phoneIndex]) || null,
    team: clean(row[headers.findIndex((header) => (HEADER_ALIASES.team ?? []).includes(header))]) || null,
    status: clean(row[statusIndex]) || null,
  }));
}

async function listAuthUsers(client: Client) {
  const users: Array<{ id: string; email?: string }> = [];
  for (let page = 1; page <= 20; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error("Unable to inspect existing Auth users.");
    users.push(...result.data.users.map((user) => ({ id: user.id, email: user.email })));
    if (result.data.users.length < 1000) break;
  }
  return users;
}

export async function classifyCollectorImport(client: Client, rows: CollectorImportRow[]): Promise<CollectorImportResult> {
  const [profilesResult, users] = await Promise.all([
    client.from("profiles").select("*"),
    listAuthUsers(client),
  ]);
  if (profilesResult.error) throw new Error("Unable to inspect existing collector profiles.");
  const profiles = profilesResult.data ?? [];
  const byHr = new Map<string, ProfileRow>();
  const byEmail = new Map<string, ProfileRow>();
  profiles.forEach((profile) => {
    if (profile.hr_code) byHr.set(normalizeHrCode(profile.hr_code), profile);
    byEmail.set(normalizeEmail(profile.email), profile);
  });
  const authByEmail = new Map(users.filter((user) => user.email).map((user) => [normalizeEmail(user.email), user]));
  const seenHr = new Set<string>();
  const seenEmail = new Set<string>();
  const resultRows = rows.map((row) => {
    let outcome: CollectorImportResult["rows"][number]["outcome"] = "new-collector";
    let error_type: CollectorImportErrorType | null = null;
    let message = "Ready to provision.";
    const profileByHr = row.hr_code ? byHr.get(row.hr_code) : undefined;
    const profileByEmail = row.email ? byEmail.get(row.email) : undefined;
    if (!row.hr_code) {
      outcome = "invalid-row";
      error_type = "missing_hr_code";
      message = "HR-Code is missing.";
    } else if (!row.full_name) {
      outcome = "invalid-row";
      error_type = "missing_name";
      message = "Name is missing.";
    } else if (!row.email) {
      outcome = "invalid-row";
      error_type = "missing_email";
      message = "Email is missing.";
    } else if (!validEmail(row.email)) {
      outcome = "invalid-row";
      error_type = "invalid_email";
      message = "Email is not valid.";
    } else if (seenHr.has(row.hr_code)) {
      outcome = "duplicate-hr-code";
      error_type = "duplicate_hr_code_within_file";
      message = "HR-Code is duplicated in this file.";
    } else if (seenEmail.has(row.email)) {
      outcome = "duplicate-email";
      error_type = "duplicate_email_within_file";
      message = "Email is duplicated in this file.";
    } else if (profileByHr && profileByEmail && profileByHr.id !== profileByEmail.id) {
      outcome = "invalid-row";
      error_type = "conflicting_hr_code_email_mapping";
      message = "HR-Code and email belong to different existing profiles.";
    } else if (profileByHr && profileByEmail && profileByHr.id !== profileByEmail.id) {
      outcome = "invalid-row";
      error_type = "conflicting_hr_code_email_mapping";
      message = "HR-Code and email belong to different existing profiles.";
    } else if (profileByHr && normalizeEmail(profileByHr.email) !== row.email) {
      outcome = "invalid-row";
      error_type = "hr_code_belongs_to_another_collector";
      message = "HR-Code already belongs to another collector.";
    } else if (profileByEmail && normalizeHrCode(profileByEmail.hr_code) !== row.hr_code) {
      outcome = "invalid-row";
      error_type = "email_belongs_to_another_collector";
      message = "Email already belongs to another collector.";
    } else if (profileByHr || profileByEmail) {
      outcome = "existing-collector";
      message = "An existing collector profile will be updated.";
    } else if (authByEmail.has(row.email)) {
      outcome = "new-collector";
      message = "An existing Auth user will receive a collector profile.";
    }
    if (outcome !== "invalid-row") seenHr.add(row.hr_code);
    if (outcome !== "invalid-row") seenEmail.add(row.email);
    return { ...row, outcome, error_type, message };
  });
  const counts = {
    total: resultRows.length,
    valid: resultRows.filter((row) => row.outcome === "new-collector" || row.outcome === "existing-collector").length,
    new_collectors: resultRows.filter((row) => row.outcome === "new-collector").length,
    existing_collectors: resultRows.filter((row) => row.outcome === "existing-collector").length,
    duplicates: resultRows.filter((row) => row.outcome === "duplicate-hr-code" || row.outcome === "duplicate-email").length,
    invalid: resultRows.filter((row) => row.outcome === "invalid-row").length,
    admin_conflicts: 0,
  };
  return { rows: resultRows, counts };
}

export async function provisionCollectors(client: Client, rows: CollectorImportRow[], adminId: string) {
  const preview = await classifyCollectorImport(client, rows);
  const blockedRows = preview.rows.filter((row) =>
    row.outcome === "invalid-row" ||
    row.outcome === "duplicate-hr-code" ||
    row.outcome === "duplicate-email"
  );
  if (blockedRows.length > 0) {
    throw new Error(`Resolve ${blockedRows.length} invalid or duplicate roster row(s) before importing.`);
  }
  const users = await listAuthUsers(client);
  const profilesResult = await client.from("profiles").select("*");
  if (profilesResult.error) throw new Error("Unable to load collector profiles.");
  const usersByEmail = new Map(users.filter((user) => user.email).map((user) => [normalizeEmail(user.email), user]));
  const profilesByEmail = new Map((profilesResult.data ?? []).map((profile) => [normalizeEmail(profile.email), profile]));
  const profilesByHr = new Map((profilesResult.data ?? []).filter((profile) => profile.hr_code).map((profile) => [normalizeHrCode(profile.hr_code), profile]));
  const resultRows: CollectorProvisionResult["rows"] = [];
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const existingByHr = profilesByHr.get(row.hr_code);
    const existingByEmail = profilesByEmail.get(row.email);
    let user = existingByHr
      ? { id: existingByHr.id, email: existingByHr.email }
      : existingByEmail
        ? { id: existingByEmail.id, email: existingByEmail.email }
        : usersByEmail.get(row.email);
    if (!user) {
      const createdUser = await client.auth.admin.createUser({
        email: row.email,
        email_confirm: true,
        password: randomBytes(32).toString("base64url"),
      });
      if (createdUser.error || !createdUser.data.user) {
        resultRows.push({ ...row, outcome: "error", message: `Failed to create collector Auth user: ${safeSupabaseError(createdUser.error ?? { message: "Auth user creation returned no user." })}` });
        continue;
      }
      user = { id: createdUser.data.user.id, email: createdUser.data.user.email };
      usersByEmail.set(row.email, user);
      created += 1;
    }
    const existing = existingByHr ?? existingByEmail;
    const profile = await client.from("profiles").upsert({
      id: user.id,
      email: row.email,
      full_name: row.full_name,
      hr_code: row.hr_code,
      phone: row.phone,
      team: row.team,
      status: row.status,
      role: existing?.role ?? "collector",
    }, { onConflict: "id" }).select("id").single();
    if (profile.error) {
      resultRows.push({ ...row, outcome: "error", message: `Failed to save collector profile: ${safeSupabaseError(profile.error)}` });
      continue;
    }
    const activity = await client.from("activity_logs").insert({
      user_id: adminId,
      assignment_id: null,
      action: existing ? "collector_profile_updated" : "collector_profile_provisioned",
      old_value: existing ? { profile_id: existing.id } : null,
      new_value: { profile_id: profile.data.id, hr_code: row.hr_code, email: row.email },
    });
    if (activity.error) {
      resultRows.push({ ...row, outcome: "error", message: `Failed to record provisioning activity: ${safeSupabaseError(activity.error)}` });
      continue;
    }
    try {
      await upsertCollectorToTeamSheet(row);
      await client.from("activity_logs").insert({
        user_id: adminId,
        assignment_id: null,
        action: "collector_sheet_synced",
        old_value: null,
        new_value: { profile_id: profile.data.id, hr_code: row.hr_code },
      });
    } catch (error) {
      await client.from("activity_logs").insert({
        user_id: adminId,
        assignment_id: null,
        action: "collector_sheet_sync_failed",
        old_value: null,
        new_value: { profile_id: profile.data.id, hr_code: row.hr_code, message: error instanceof Error ? error.message : "Google Sheets sync failed." },
      });
    }
    const wasUpdated = Boolean(existing);
    if (wasUpdated) updated += 1;
    resultRows.push({
      ...row,
      outcome: wasUpdated ? "updated" : "created",
      message: wasUpdated ? "Collector profile updated." : "Collector profile created.",
    });
  }
  return {
    counts: {
      created,
      updated,
      skipped: 0,
      errors: resultRows.filter((row) => row.outcome === "error").length,
    },
    rows: resultRows,
  };
}
