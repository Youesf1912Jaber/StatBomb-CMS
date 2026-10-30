import type { AssignmentRow, MatchRow } from "@/types/database.types";

export type AssignmentMatchData = Pick<
  MatchRow,
  | "id"
  | "external_id"
  | "home_team"
  | "away_team"
  | "competition"
  | "match_date"
  | "kickoff_time"
  | "official_website_url"
>;

export type AssignmentWithMatch = AssignmentRow & { match: AssignmentMatchData };
