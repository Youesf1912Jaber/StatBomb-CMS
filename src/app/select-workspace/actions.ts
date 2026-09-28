"use server";

import { redirect } from "next/navigation";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import {
  isWorkspaceMode,
  setWorkspaceMode,
  workspacePath,
  type WorkspaceMode,
} from "@/lib/auth/workspace-mode";

export async function chooseWorkspace(formData: FormData): Promise<void> {
  const profile = await getProfileOrRedirect();
  if (profile.role !== "admin") {
    redirect("/collector");
  }

  const mode = String(formData.get("mode") ?? "");
  if (!isWorkspaceMode(mode)) {
    redirect("/select-workspace");
  }

  const workspace: WorkspaceMode = mode;
  setWorkspaceMode(workspace);
  redirect(workspacePath(workspace));
}
