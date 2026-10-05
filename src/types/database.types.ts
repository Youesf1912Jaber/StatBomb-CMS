/**
 * Hand-written types for the Phase 1 + Phase 2 schema slice (profiles,
 * matches, assignments) plus Phase 5 sync types (sync_runs, sync_row_issues).
 *
 * Once the sync pipeline and remaining tables land, regenerate this with the
 * Supabase CLI instead of editing by hand:
 *
 *   supabase gen types typescript --project-id <ref> --schema public > src/types/database.types.ts
 */

export type UserRole = "admin" | "collector";
// Phase 3 adds 'Overdue' — set only by the service-role SLA scanner
// (evaluate_assignment_sla_states), never by a client.
export type AssignmentStatus = "Not Started" | "In Progress" | "Completed" | "Overdue";
export type AssignmentHalf = "Half 1" | "Half 2" | "Half 3" | "Half 4" | "Full Match";
export type NotificationType =
  | "assignment_created"
  | "assignment_reassigned"
  | "assignment_started"
  | "sla_warning"
  | "assignment_overdue"
  | "assignment_completed";

// Phase 5: sync enums
export type SyncRunStatus = 'preview' | 'running' | 'success' | 'failed';
export type SyncIssueSeverity = 'warning' | 'error';
export type SyncIssueType =
  | 'validation_error'
  | 'task_normalization_warning'
  | 'duplicate_logical_key_conflict'
  | 'unknown_hr_code'
  | 'hr_code_belongs_to_admin'
  | 'invalid_date_time'
  | 'invalid_url'
  | 'other';

// NOTE: this is a `type`, not an `interface`, on purpose. postgrest-js's
// generic select-string parser fails to infer column types (falls back to
// `never`) when a Table's `Row` is a named `interface` instead of a `type`
// alias / inline object literal — verified against @supabase/supabase-js
// 2.116 while debugging this file. Keep every Row/Insert/Update type below
// as a `type`, never an `interface`.
export type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  hr_code: string | null;
  phone: string | null;
  team: string | null;
  status: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  suspended_at: string | null;
};

export type MatchRow = {
  id: string;
  external_id: string;
  home_team: string;
  away_team: string;
  competition: string | null;
  match_date: string;
  kickoff_time: string | null;
  official_website_url: string | null;
  created_at: string;
  updated_at: string;
};

export type AssignmentRow = {
  id: string;
  match_id: string;
  collector_id: string;
  previous_collector_id: string | null;
  raw_task_value: string;
  task: string;
  half: AssignmentHalf;
  sla: string;
  shift_date: string | null;
  status: AssignmentStatus;
  started_at: string | null;
  completed_at: string | null;
  sla_warning_sent_at: string | null;
  overdue_notified_at: string | null;
  notes: string | null;
  distribution_present: boolean;
  hidden_from_admin_dashboard: boolean;
  created_at: string;
  updated_at: string;
};

export type AssignmentTaskTimerRow = {
  id: string;
  assignment_id: string;
  task_name: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
};

export type NotificationRow = {
  id: string;
  recipient_id: string;
  assignment_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  sent_at: string;
  read_at: string | null;
  pushed_at: string | null;
  push_claimed_at: string | null;
};

export type PushSubscriptionRow = {
  id: string;
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  created_at: string;
};

export type ActivityLogRow = {
  id: string;
  user_id: string | null;
  assignment_id: string | null;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
};

export type DeductionRow = {
  id: string;
  source_key: string;
  content_fingerprint: string;
  occurrence_ordinal: number;
  match_external_id: string;
  app: string | null;
  hr_code: string;
  collector_name: string | null;
  collector_id: string | null;
  squad: string | null;
  side: string | null;
  half: string | null;
  event_timestamp: string | null;
  event_timestamp_raw: string | null;
  event: string | null;
  comment: string | null;
  review_date: string | null;
  review_date_raw: string | null;
  link: string | null;
  source_present: boolean;
  last_seen_at: string;
  first_synced_at: string;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
};

export type FfShotRow = {
  id: string;
  source_key: string;
  content_fingerprint: string;
  occurrence_ordinal: number;
  match_external_id: string;
  app: string | null;
  hr_code: string;
  collector_name: string | null;
  collector_id: string | null;
  squad: string | null;
  side: string | null;
  half: string | null;
  event_timestamp: string | null;
  event_timestamp_raw: string | null;
  player_id: string | null;
  review_date: string | null;
  review_date_raw: string | null;
  comment: string | null;
  link: string | null;
  correct_collector: string | null;
  changed: string | null;
  source_present: boolean;
  last_seen_at: string;
  first_synced_at: string;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
};

export type ExpectedWeekRow = {
  id: string;
  week_key: string;
  week_start_date: string;
  week_end_date: string;
  shift_name: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  sheet_header_row: number;
  sheet_start_row: number;
  sheet_end_row: number;
  source_present: boolean;
  last_seen_at: string;
  first_synced_at: string;
  last_synced_at: string;
  summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ExpectedWeekCollectorRow = {
  id: string;
  week_id: string;
  hr_code: string;
  collector_name: string | null;
  collector_type: string | null;
  sunday: string | null;
  monday: string | null;
  tuesday: string | null;
  wednesday: string | null;
  thursday: string | null;
  friday: string | null;
  saturday: string | null;
  sheet_row_number: number;
  created_at: string;
  updated_at: string;
};

export type MatchCollaboratorRow = {
  assignment_id: string;
  collector_id: string;
  full_name: string | null;
  task: string;
  half: AssignmentHalf;
  status: AssignmentStatus;
};

// Phase 5: sync table rows
export type SyncRunRow = {
  id: string;
  created_by: string | null;
  source: string;
  file_name: string | null;
  file_size: number | null;
  sheets: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  status: SyncRunStatus;
  total_rows: number;
  rows_imported: number;
  rows_updated: number;
  rows_reassigned: number;
  rows_skipped: number;
  rows_errored: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type SyncRowIssueRow = {
  id: string;
  sync_run_id: string;
  row_number: number | null;
  row_key: string | null;
  match_id: string | null;
  assignment_id: string | null;
  row_data: Record<string, unknown> | null;
  severity: SyncIssueSeverity;
  issue_type: SyncIssueType;
  message: string | null;
  created_at: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          hr_code?: string | null;
          phone?: string | null;
          team?: string | null;
          status?: string | null;
          deleted_at?: string | null;
          suspended_at?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          hr_code?: string | null;
          phone?: string | null;
          team?: string | null;
          status?: string | null;
          deleted_at?: string | null;
          suspended_at?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      matches: {
        Row: MatchRow;
        Insert: {
          id?: string;
          external_id: string;
          home_team: string;
          away_team: string;
          competition?: string | null;
          match_date: string;
          kickoff_time?: string | null;
          official_website_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<MatchRow>;
        Relationships: [];
      };
      assignments: {
        Row: AssignmentRow;
        Insert: {
          id?: string;
          match_id: string;
          collector_id: string;
          previous_collector_id?: string | null;
          raw_task_value: string;
          task: string;
          half?: AssignmentHalf;
          sla: string;
          shift_date?: string | null;
          status?: AssignmentStatus;
          started_at?: string | null;
          completed_at?: string | null;
          sla_warning_sent_at?: string | null;
          overdue_notified_at?: string | null;
          notes?: string | null;
          distribution_present?: boolean;
          hidden_from_admin_dashboard?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<AssignmentRow>;
        Relationships: [];
      };
      assignment_task_timers: {
        Row: AssignmentTaskTimerRow;
        Insert: {
          id?: string;
          assignment_id: string;
          task_name: string;
          started_at: string;
          ended_at?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<AssignmentTaskTimerRow>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: {
          id?: string;
          recipient_id: string;
          assignment_id?: string | null;
          type: NotificationType;
          title: string;
          message: string;
          sent_at?: string;
          read_at?: string | null;
          pushed_at?: string | null;
          push_claimed_at?: string | null;
        };
        Update: Partial<NotificationRow>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: {
          id?: string;
          profile_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          created_at?: string;
        };
        Update: Partial<PushSubscriptionRow>;
        Relationships: [];
      };
      activity_logs: {
        Row: ActivityLogRow;
        Insert: {
          id?: string;
          user_id?: string | null;
          assignment_id?: string | null;
          action: string;
          old_value?: Record<string, unknown> | null;
          new_value?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: Partial<ActivityLogRow>;
        Relationships: [];
      };
      deductions: {
        Row: DeductionRow;
        Insert: {
          id?: string;
          source_key: string;
          content_fingerprint: string;
          occurrence_ordinal: number;
          match_external_id?: string;
          app?: string | null;
          hr_code?: string;
          collector_name?: string | null;
          collector_id?: string | null;
          squad?: string | null;
          side?: string | null;
          half?: string | null;
          event_timestamp?: string | null;
          event_timestamp_raw?: string | null;
          event?: string | null;
          comment?: string | null;
          review_date?: string | null;
          review_date_raw?: string | null;
          link?: string | null;
          source_present?: boolean;
          last_seen_at?: string;
          first_synced_at?: string;
          last_synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<DeductionRow>;
        Relationships: [];
      };
      ff_shots: {
        Row: FfShotRow;
        Insert: {
          id?: string;
          source_key: string;
          content_fingerprint: string;
          occurrence_ordinal: number;
          match_external_id?: string;
          app?: string | null;
          hr_code?: string;
          collector_name?: string | null;
          collector_id?: string | null;
          squad?: string | null;
          side?: string | null;
          half?: string | null;
          event_timestamp?: string | null;
          event_timestamp_raw?: string | null;
          player_id?: string | null;
          review_date?: string | null;
          review_date_raw?: string | null;
          comment?: string | null;
          link?: string | null;
          correct_collector?: string | null;
          changed?: string | null;
          source_present?: boolean;
          last_seen_at?: string;
          first_synced_at?: string;
          last_synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<FfShotRow>;
        Relationships: [];
      };
      expected_weeks: {
        Row: ExpectedWeekRow;
        Insert: {
          id?: string;
          week_key: string;
          week_start_date: string;
          week_end_date: string;
          shift_name?: string | null;
          shift_start_time?: string | null;
          shift_end_time?: string | null;
          sheet_header_row: number;
          sheet_start_row: number;
          sheet_end_row: number;
          source_present?: boolean;
          last_seen_at?: string;
          first_synced_at?: string;
          last_synced_at?: string;
          summary?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ExpectedWeekRow>;
        Relationships: [];
      };
      expected_week_collectors: {
        Row: ExpectedWeekCollectorRow;
        Insert: {
          id?: string;
          week_id: string;
          hr_code: string;
          collector_name?: string | null;
          collector_type?: string | null;
          sunday?: string | null;
          monday?: string | null;
          tuesday?: string | null;
          wednesday?: string | null;
          thursday?: string | null;
          friday?: string | null;
          saturday?: string | null;
          sheet_row_number: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<ExpectedWeekCollectorRow>;
        Relationships: [];
      };
      sync_runs: {
        Row: SyncRunRow;
        Insert: {
          id?: string;
          created_by?: string | null;
          source?: string;
          file_name?: string | null;
          file_size?: number | null;
          sheets?: Record<string, unknown> | null;
          metadata?: Record<string, unknown> | null;
          status?: SyncRunStatus;
          total_rows?: number;
          rows_imported?: number;
          rows_updated?: number;
          rows_reassigned?: number;
          rows_skipped?: number;
          rows_errored?: number;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: Partial<SyncRunRow>;
        Relationships: [];
      };
      sync_row_issues: {
        Row: SyncRowIssueRow;
        Insert: {
          id?: string;
          sync_run_id: string;
          row_number?: number | null;
          row_key?: string | null;
          match_id?: string | null;
          assignment_id?: string | null;
          row_data?: Record<string, unknown> | null;
          severity: SyncIssueSeverity;
          issue_type: SyncIssueType;
          message?: string | null;
          created_at?: string;
        };
        Update: Partial<SyncRowIssueRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_assignable_collector_target: {
        Args: { p_profile_id: string };
        Returns: boolean;
      };
      start_assignment: {
        Args: { p_assignment_id: string };
        Returns: AssignmentRow;
      };
      complete_assignment: {
        Args: { p_assignment_id: string };
        Returns: AssignmentRow;
      };
      start_assignment_task: {
        Args: { p_assignment_id: string; p_task_name: string };
        Returns: AssignmentTaskTimerRow;
      };
      end_assignment_task: {
        Args: { p_assignment_id: string; p_task_name: string };
        Returns: AssignmentTaskTimerRow;
      };
      create_assignment: {
        Args: {
          p_match_id: string;
          p_collector_id: string;
          p_raw_task_value: string;
          p_task: string;
          p_half: string;
          p_sla: string;
          p_shift_date: string | null;
        };
        Returns: AssignmentRow;
      };
      update_assignment_task_half: {
        Args: {
          p_assignment_id: string;
          p_task: string;
          p_half: string;
          p_raw_task_value: string;
        };
        Returns: AssignmentRow;
      };
      get_match_collaborators: {
        Args: { p_match_id: string };
        Returns: MatchCollaboratorRow[];
      };
      // Service-role only (global SLA scanner); not callable from the client.
      evaluate_assignment_sla_states: {
        Args: Record<string, never>;
        Returns: { warnings_fired: number; overdue_fired: number }[];
      };
      // Service-role only (push fan-out claim/lease); not callable from the client.
      claim_pending_push_notifications: {
        Args: { p_limit?: number; p_lease_seconds?: number };
        Returns: NotificationRow[];
      };
      reassign_assignment: {
        Args: {
          p_assignment_id: string;
          p_new_collector_id: string;
          p_mode: string;
        };
        Returns: AssignmentRow;
      };
      update_assignment: {
        Args: {
          p_assignment_id: string;
          p_task: string;
          p_half: string;
          p_sla: string;
          p_notes: string | null;
        };
        Returns: AssignmentRow;
      };
      update_distribution_details: {
        Args: {
          p_assignment_id: string;
          p_shift_date: string | null;
          p_official_website_url: string | null;
        };
        Returns: AssignmentRow;
      };
      reconcile_distribution_presence: {
        Args: {
          p_present_ids: string[];
          p_match_id?: string | null;
        };
        Returns: { updated_present: number; updated_missing: number }[];
      };
      hide_assignment_from_dashboard: {
        Args: { p_assignment_id: string };
        Returns: AssignmentRow;
      };
      admin_complete_assignment: {
        Args: { p_assignment_id: string };
        Returns: AssignmentRow;
      };
      admin_complete_current_distribution_assignments: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: {
      user_role: UserRole;
      assignment_status: AssignmentStatus;
      notification_type: NotificationType;
      sync_run_status: SyncRunStatus;
      sync_issue_severity: SyncIssueSeverity;
      sync_issue_type: SyncIssueType;
    };
    CompositeTypes: Record<string, never>;
  };
}
