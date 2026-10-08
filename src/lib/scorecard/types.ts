export type ScorecardIdentity = {
  month: string;
  hr_code: string;
  name: string;
  team: string;
  type: string;
};

export type ScorecardRow = {
  identity: ScorecardIdentity;
  cells: string[];
};

export type ScorecardSheetData = {
  headers: string[];
  rows: ScorecardRow[];
};

export type ScorecardIdentityIndexes = {
  month: number;
  hrCode: number;
  name: number;
  team: number;
  type: number;
};
