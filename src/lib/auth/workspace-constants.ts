export const WORKSPACE_COOKIE = "statbomb_workspace";
export type WorkspaceMode = "admin" | "collector";

export function isWorkspaceMode(value: string | undefined | null): value is WorkspaceMode {
  return value === "admin" || value === "collector";
}

export function workspacePath(mode: WorkspaceMode): string {
  return mode === "admin" ? "/admin" : "/collector";
}
