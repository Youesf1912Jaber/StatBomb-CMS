import "server-only";
import { cookies } from "next/headers";
import {
  WORKSPACE_COOKIE,
  isWorkspaceMode,
  type WorkspaceMode,
} from "./workspace-constants";

export {
  WORKSPACE_COOKIE,
  isWorkspaceMode,
  workspacePath,
  type WorkspaceMode,
} from "./workspace-constants";

export function getWorkspaceMode(): WorkspaceMode | null {
  const value = cookies().get(WORKSPACE_COOKIE)?.value;
  return isWorkspaceMode(value) ? value : null;
}

export function setWorkspaceMode(mode: WorkspaceMode): void {
  cookies().set(WORKSPACE_COOKIE, mode, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearWorkspaceMode(): void {
  cookies().set(WORKSPACE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}
