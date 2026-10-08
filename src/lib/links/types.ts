export type LinksCell = {
  row: number;
  column: number;
  text: string;
  href: string | null;
};

export type LinksSheetData = {
  cells: LinksCell[];
};

export type LinksApiPayload = {
  cells: LinksCell[];
};
