export type HyperCareCustomerRow = {
  customer: string;
  review_type: string | null;
  review_events: string | null;
  completed_by: string | null;
};

export type HyperCareTeamRow = {
  team: string;
  request: string | null;
  gender: string | null;
};

export type HyperCareCatalog = {
  customers: HyperCareCustomerRow[];
  teams: HyperCareTeamRow[];
};

export type HyperCareCustomerCare = {
  review_type: string | null;
  review_events: string | null;
  completed_by: string | null;
};

export type HyperCareTeamRequest = {
  request: string | null;
  gender: string | null;
};

export type HyperCareTeamSection = {
  team_name: string;
  side: "home" | "away";
  customer_care: HyperCareCustomerCare | null;
  team_request: HyperCareTeamRequest | null;
};

export function normalizeHyperCareTeamName(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function displayHyperCareText(value: unknown): string | null {
  const text = String(value ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[?]+/g, "")
    .replace(/\s+/g, " ");
}

function cellAt(row: unknown[] | undefined, index: number | undefined): unknown {
  if (!row || index == null || index < 0) return "";
  return row[index];
}

function findHeaderIndex(headers: string[], ...aliases: string[]): number {
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    if (header && aliases.includes(header)) return i;
  }
  return -1;
}

type CustomerHeader = {
  rowIndex: number;
  customer: number;
  reviewType: number;
  reviewEvents: number;
  completedBy: number;
};

type TeamHeader = {
  rowIndex: number;
  team: number;
  request: number;
  gender: number;
};

function detectCustomerHeader(row: unknown[], rowIndex: number): CustomerHeader | null {
  const headers = row.map((cell) => normalizeHeader(cell));
  const customer = findHeaderIndex(headers, "customer");
  const reviewType = findHeaderIndex(headers, "review type");
  const reviewEvents = findHeaderIndex(headers, "review events", "review event");
  const completedBy = findHeaderIndex(
    headers,
    "who makes the match complete",
    "who makes the match complete?",
    "completed by",
    "complete by"
  );
  if (customer < 0 || reviewType < 0 || reviewEvents < 0 || completedBy < 0) return null;
  return { rowIndex, customer, reviewType, reviewEvents, completedBy };
}

function detectTeamHeader(row: unknown[], rowIndex: number): TeamHeader | null {
  const headers = row.map((cell) => normalizeHeader(cell));
  const team = findHeaderIndex(headers, "team");
  const request = findHeaderIndex(headers, "request");
  const gender = findHeaderIndex(headers, "gender");
  if (team < 0 || request < 0 || gender < 0) return null;
  return { rowIndex, team, request, gender };
}

function dataRangeEnd(headerRow: number, otherHeaderRow: number | null, total: number): number {
  if (otherHeaderRow != null && otherHeaderRow > headerRow) return otherHeaderRow;
  return total;
}

export function parseHyperCareSheet(matrix: unknown[][]): HyperCareCatalog {
  let customerHeader: CustomerHeader | null = null;
  let teamHeader: TeamHeader | null = null;

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    if (!customerHeader) customerHeader = detectCustomerHeader(row, rowIndex);
    if (!teamHeader) teamHeader = detectTeamHeader(row, rowIndex);
    if (customerHeader && teamHeader) break;
  }

  const customers: HyperCareCustomerRow[] = [];
  if (customerHeader) {
    const end = dataRangeEnd(customerHeader.rowIndex, teamHeader?.rowIndex ?? null, matrix.length);
    for (let rowIndex = customerHeader.rowIndex + 1; rowIndex < end; rowIndex += 1) {
      const row = matrix[rowIndex] ?? [];
      if (detectCustomerHeader(row, rowIndex) || detectTeamHeader(row, rowIndex)) continue;
      const customer = displayHyperCareText(cellAt(row, customerHeader.customer));
      if (!customer) continue;
      customers.push({
        customer,
        review_type: displayHyperCareText(cellAt(row, customerHeader.reviewType)),
        review_events: displayHyperCareText(cellAt(row, customerHeader.reviewEvents)),
        completed_by: displayHyperCareText(cellAt(row, customerHeader.completedBy)),
      });
    }
  }

  const teams: HyperCareTeamRow[] = [];
  if (teamHeader) {
    const end = dataRangeEnd(teamHeader.rowIndex, customerHeader?.rowIndex ?? null, matrix.length);
    for (let rowIndex = teamHeader.rowIndex + 1; rowIndex < end; rowIndex += 1) {
      const row = matrix[rowIndex] ?? [];
      if (detectCustomerHeader(row, rowIndex) || detectTeamHeader(row, rowIndex)) continue;
      const team = displayHyperCareText(cellAt(row, teamHeader.team));
      if (!team) continue;
      teams.push({
        team,
        request: displayHyperCareText(cellAt(row, teamHeader.request)),
        gender: displayHyperCareText(cellAt(row, teamHeader.gender)),
      });
    }
  }

  return { customers, teams };
}

function findCustomer(catalog: HyperCareCatalog, teamName: string): HyperCareCustomerRow | null {
  const key = normalizeHyperCareTeamName(teamName);
  if (!key) return null;
  return catalog.customers.find((row) => normalizeHyperCareTeamName(row.customer) === key) ?? null;
}

function findTeam(catalog: HyperCareCatalog, teamName: string): HyperCareTeamRow | null {
  const key = normalizeHyperCareTeamName(teamName);
  if (!key) return null;
  return catalog.teams.find((row) => normalizeHyperCareTeamName(row.team) === key) ?? null;
}

function sectionForSide(
  teamName: string | null | undefined,
  side: "home" | "away",
  catalog: HyperCareCatalog
): HyperCareTeamSection | null {
  const displayName = displayHyperCareText(teamName);
  if (!displayName) return null;
  const customer = findCustomer(catalog, displayName);
  const team = findTeam(catalog, displayName);
  if (!customer && !team) return null;
  return {
    team_name: customer?.customer ?? team?.team ?? displayName,
    side,
    customer_care: customer
      ? {
          review_type: customer.review_type,
          review_events: customer.review_events,
          completed_by: customer.completed_by,
        }
      : null,
    team_request: team
      ? {
          request: team.request,
          gender: team.gender,
        }
      : null,
  };
}

export function resolveHyperCareSections(
  homeTeam: string | null | undefined,
  awayTeam: string | null | undefined,
  catalog: HyperCareCatalog
): HyperCareTeamSection[] {
  const sections: HyperCareTeamSection[] = [];
  const home = sectionForSide(homeTeam, "home", catalog);
  const away = sectionForSide(awayTeam, "away", catalog);
  if (home) sections.push(home);
  if (away) sections.push(away);
  return sections;
}
