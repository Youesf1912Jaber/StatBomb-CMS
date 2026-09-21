import type { AssignmentRow, MatchRow } from "@/types/database.types";

export type AssignmentWithMatch = AssignmentRow & { match: MatchRow };
