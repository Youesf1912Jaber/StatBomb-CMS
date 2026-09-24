import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityLogRow, Database } from "@/types/database.types";

type Client = SupabaseClient<Database>;

export type ActivityLogFilters = {
  search?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  assignmentId?: string;
};

export type ActivityLogDisplayItem = {
  id: string;
  user_id: string | null;
  userName: string;
  created_at: string;
  action: string;
  actionLabel: string;
  assignmentId: string | null;
  assignmentTask: string | null;
  assignmentHalf: string | null;
  matchLabel: string | null;
  changeSummary: string;
};

const FIELD_LABELS: Record<string, string> = {
  collector_id: "Collector",
  previous_collector_id: "Previous Collector",
  task: "Task",
  half: "Half",
  sla: "SLA",
  notes: "Notes",
  status: "Status",
  started_at: "Started At",
  completed_at: "Completed At",
  hidden_from_admin_dashboard: "Dashboard Visibility",
  mode: "Mode",
};

function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildActionLabel(action: string): string {
  if (action === "assignment_reassigned") return "Assignment Reassigned";
  if (action === "assignment_updated") return "Assignment Updated";
  if (action === "assignment_removed_from_dashboard") return "Removed From Dashboard";
  if (action === "assignment_completed_by_admin") return "Completed By Admin";
  return toTitleCase(action.replace(/_/g, " "));
}

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    return value.trim() || "—";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((entry) => safeStringify(entry)).join(", ") : "—";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "—";
    }
  }
  return String(value);
}

function formatValueForDisplay(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
      }
    }
    return value;
  }
  return safeStringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeDiff(
  action: string,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
  profileMap: Map<string, string>
): string {
  const oldRecord = isRecord(oldValue) ? oldValue : {};
  const newRecord = isRecord(newValue) ? newValue : {};
  const keys = Array.from(new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)])).sort();

  const parts: string[] = [];

  for (const key of keys) {
    const oldRaw = oldRecord[key];
    const newRaw = newRecord[key];
    if (oldRaw === undefined && newRaw === undefined) continue;

    const label = FIELD_LABELS[key] ?? toTitleCase(key);
    let oldText = formatValueForDisplay(oldRaw);
    let newText = formatValueForDisplay(newRaw);

    if (key === "collector_id" || key === "previous_collector_id") {
      const oldId = typeof oldRaw === "string" ? oldRaw : null;
      const newId = typeof newRaw === "string" ? newRaw : null;
      oldText = oldId ? profileMap.get(oldId) ?? oldId : "—";
      newText = newId ? profileMap.get(newId) ?? newId : "—";
    }

    if (oldText === newText) continue;
    parts.push(`${label}: ${oldText} → ${newText}`);
  }

  if (parts.length === 0) {
    if (action === "assignment_reassigned") {
      return "Assignment reassigned";
    }
    if (action === "assignment_updated") {
      return "Assignment updated";
    }
    return buildActionLabel(action);
  }

  return parts.join("; ");
}

async function buildDisplayItems(
  client: Client,
  rows: ActivityLogRow[]
): Promise<ActivityLogDisplayItem[]> {
  if (rows.length === 0) {
    return [];
  }

  const profileIds = Array.from(
    new Set(
      rows
        .map((row) => row.user_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const profileMap = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profiles, error } = await client
      .from("profiles")
      .select("id, full_name, email")
      .in("id", profileIds);

    if (!error) {
      for (const profile of profiles ?? []) {
        profileMap.set(profile.id, profile.full_name ?? profile.email ?? "Unknown User");
      }
    }
  }

  const assignmentIds = Array.from(
    new Set(
      rows
        .map((row) => row.assignment_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const assignmentMap = new Map<string, { task: string; half: string; match_id: string | null }>();
  if (assignmentIds.length > 0) {
    const { data: assignments, error } = await client
      .from("assignments")
      .select("id, task, half, match_id")
      .in("id", assignmentIds);

    if (!error) {
      for (const assignment of assignments ?? []) {
        assignmentMap.set(assignment.id, {
          task: assignment.task,
          half: assignment.half,
          match_id: assignment.match_id,
        });
      }
    }
  }

  const matchIds = Array.from(
    new Set(
      Array.from(assignmentMap.values())
        .map((assignment) => assignment.match_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const matchMap = new Map<string, string>();
  if (matchIds.length > 0) {
    const { data: matches, error } = await client
      .from("matches")
      .select("id, home_team, away_team, competition")
      .in("id", matchIds);

    if (!error) {
      for (const match of matches ?? []) {
        const label = [match.home_team, match.away_team].filter(Boolean).join(" vs ");
        matchMap.set(match.id, match.competition ? `${match.competition} · ${label}` : label);
      }
    }
  }

  const allIdsForCollectorNames = new Set<string>();
  for (const row of rows) {
    if (row.old_value && isRecord(row.old_value)) {
      for (const key of Object.keys(row.old_value)) {
        if (key === "collector_id" || key === "previous_collector_id") {
          const value = row.old_value[key];
          if (typeof value === "string") allIdsForCollectorNames.add(value);
        }
      }
    }
    if (row.new_value && isRecord(row.new_value)) {
      for (const key of Object.keys(row.new_value)) {
        if (key === "collector_id" || key === "previous_collector_id") {
          const value = row.new_value[key];
          if (typeof value === "string") allIdsForCollectorNames.add(value);
        }
      }
    }
  }

  if (allIdsForCollectorNames.size > 0) {
    const missingIds = Array.from(allIdsForCollectorNames).filter((id) => !profileMap.has(id));
    if (missingIds.length > 0) {
      const { data: extraProfiles, error } = await client
        .from("profiles")
        .select("id, full_name, email")
        .in("id", missingIds);
      if (!error) {
        for (const profile of extraProfiles ?? []) {
          profileMap.set(profile.id, profile.full_name ?? profile.email ?? "Unknown User");
        }
      }
    }
  }

  return rows.map((row) => {
    const assignment = row.assignment_id ? assignmentMap.get(row.assignment_id) : null;
    const matchLabel = assignment?.match_id ? matchMap.get(assignment.match_id) ?? null : null;

    return {
      id: row.id,
      user_id: row.user_id,
      userName: row.user_id ? profileMap.get(row.user_id) ?? "Unknown User" : "Unknown User",
      created_at: row.created_at,
      action: row.action,
      actionLabel: buildActionLabel(row.action),
      assignmentId: row.assignment_id,
      assignmentTask: assignment?.task ?? null,
      assignmentHalf: assignment?.half ?? null,
      matchLabel,
      changeSummary: summarizeDiff(row.action, row.old_value, row.new_value, profileMap),
    };
  });
}

export async function getActivityLogActionOptions(client: Client): Promise<string[]> {
  const { data, error } = await client.from("activity_logs").select("action");
  if (error) throw error;

  const uniqueActions = new Set<string>();
  for (const row of data ?? []) {
    if (row.action) uniqueActions.add(row.action);
  }

  return Array.from(uniqueActions).sort();
}

export async function getActivityLogsForAssignment(
  client: Client,
  assignmentId: string
): Promise<ActivityLogDisplayItem[]> {
  const { data, error } = await client
    .from("activity_logs")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return buildDisplayItems(client, data ?? []);
}

export async function getActivityLogsPage(
  client: Client,
  filters: ActivityLogFilters = {}
): Promise<{
  items: ActivityLogDisplayItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const pageSize = Math.max(1, Number(filters.pageSize ?? 25));
  const page = Math.max(1, Number(filters.page ?? 1));
  const offset = (page - 1) * pageSize;

  let query = client.from("activity_logs").select("*", { count: "exact" });

  if (filters.action) {
    query = query.eq("action", filters.action);
  }

  if (filters.dateFrom) {
    query = query.gte("created_at", new Date(`${filters.dateFrom}T00:00:00.000Z`).toISOString());
  }

  if (filters.dateTo) {
    query = query.lte("created_at", new Date(`${filters.dateTo}T23:59:59.999Z`).toISOString());
  }

  if (filters.assignmentId) {
    query = query.eq("assignment_id", filters.assignmentId);
  }

  const search = (filters.search ?? "").trim();
  if (search) {
    const safeSearch = search.replace(/[\%_]/g, "\\$&");
    const uuidCandidate = /^[0-9a-fA-F-]{36}$/.test(search) ? search : null;

    const { data: matchingProfiles } = await client
      .from("profiles")
      .select("id")
      .ilike("full_name", `%${safeSearch}%`);

    const { data: matchingAssignments } = await client
      .from("assignments")
      .select("id")
      .or(`task.ilike.%${safeSearch}%,raw_task_value.ilike.%${safeSearch}%`);

    const { data: matchingMatches } = await client
      .from("matches")
      .select("id")
      .or(`home_team.ilike.%${safeSearch}%,away_team.ilike.%${safeSearch}%,competition.ilike.%${safeSearch}%`);

    const matchIds = Array.from(new Set((matchingMatches ?? []).map((match) => match.id)));
    let assignmentIdsFromMatches: string[] = [];
    if (matchIds.length > 0) {
      const { data: assignmentsForMatches } = await client
        .from("assignments")
        .select("id")
        .in("match_id", matchIds);
      assignmentIdsFromMatches = (assignmentsForMatches ?? []).map((assignment) => assignment.id);
    }

    const profileIds = (matchingProfiles ?? []).map((profile) => profile.id);
    const assignmentIds = Array.from(
      new Set([
        ...(matchingAssignments ?? []).map((assignment) => assignment.id),
        ...assignmentIdsFromMatches,
      ])
    );

    if (uuidCandidate) {
      query = query.eq("assignment_id", uuidCandidate);
    } else {
      if (profileIds.length > 0) {
        query = query.in("user_id", profileIds);
      }
      if (assignmentIds.length > 0) {
        query = query.in("assignment_id", assignmentIds);
      }
      if (profileIds.length === 0 && assignmentIds.length === 0) {
        query = query.ilike("action", `%${safeSearch}%`);
      }
    }
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  const items = await buildDisplayItems(client, (data ?? []) as ActivityLogRow[]);
  const totalCount = count ?? items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}
