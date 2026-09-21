import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { classifyCollectorImport, parseCollectorImport, provisionCollectors } from "@/lib/admin/collector-import";
import { deleteCollectorFromTeamSheetByHrCode, pullTeamSheet, upsertCollectorToTeamSheet } from "@/lib/sync/google-sheets";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database.types";

export const runtime = "nodejs";

async function requireAdmin() {
  const client = createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  return { user, service: createServiceRoleClient() };
}

export async function GET() {
  const admin = await requireAdmin();
  if ("response" in admin) return admin.response;
  const { data, error } = await admin.service.from("profiles").select("*").is("deleted_at", null).order("full_name");
  if (error) return NextResponse.json({ error: "Unable to load team members." }, { status: 500 });
  const users = await admin.service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) return NextResponse.json({ error: "Unable to load Auth account state." }, { status: 500 });
  const authById = new Map(users.data.users.map((user) => [user.id, {
    exists: true,
    confirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
  }]));
  return NextResponse.json({
    profiles: (data ?? []).map((profile) => ({
      ...profile,
      auth_user_exists: authById.get(profile.id)?.exists ?? false,
      auth_confirmed: authById.get(profile.id)?.confirmed ?? false,
    })),
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if ("response" in admin) return admin.response;
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = (await request.json()) as { action?: string; id?: string; password?: string; confirmPassword?: string };
      if (body.action === "suspend-collector" || body.action === "resume-collector") {
        if (!body.id) throw new Error("A collector is required.");
        const profileResult = await admin.service.from("profiles").select("id,role,suspended_at").eq("id", body.id).single();
        if (profileResult.error || !profileResult.data) throw new Error("Collector profile not found.");
        if (profileResult.data.role !== "collector") throw new Error("Only collector accounts can be suspended here.");
        const suspended = body.action === "suspend-collector";
        const updated = await admin.service.from("profiles").update({ suspended_at: suspended ? new Date().toISOString() : null }).eq("id", body.id).is("deleted_at", null);
        if (updated.error) throw new Error("Unable to update the collector suspension state.");
        const auth = await admin.service.auth.admin.updateUserById(body.id, { ban_duration: suspended ? "876000h" : "none" });
        if (auth.error) throw new Error("Collector suspension state was saved, but the login state could not be updated.");
        await admin.service.from("activity_logs").insert({
          user_id: admin.user.id, assignment_id: null, action: suspended ? "collector_deactivated" : "collector_reactivated",
          old_value: null, new_value: { profile_id: body.id },
        });
        return NextResponse.json({ suspended });
      }
      if (body.action === "delete-collector") {
        if (!body.id) throw new Error("A collector is required.");
        const profileResult = await admin.service.from("profiles").select("*").eq("id", body.id).single();
        if (profileResult.error || !profileResult.data) throw new Error("Collector profile not found.");
        const profile = profileResult.data;
        if (profile.role === "admin") throw new Error("Admin accounts must be managed separately.");
        if (profile.id === admin.user.id) throw new Error("You cannot delete the currently logged-in account.");
        const audit = await admin.service.from("activity_logs").insert({
          user_id: admin.user.id, assignment_id: null, action: "collector_deleted",
          old_value: null, new_value: { profile_id: profile.id, hr_code: profile.hr_code, name: profile.full_name, email: profile.email },
        });
        if (audit.error) throw new Error("Unable to record the deletion audit event.");
        const archived = await admin.service.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", profile.id).is("deleted_at", null);
        if (archived.error) throw new Error("Unable to remove the collector from the operational roster.");
        const auth = await admin.service.auth.admin.updateUserById(profile.id, { ban_duration: "876000h" });
        if (auth.error) throw new Error("Collector was removed from the roster, but the login could not be disabled.");
        try {
          if (profile.hr_code) await deleteCollectorFromTeamSheetByHrCode(profile.hr_code);
        } catch (error) {
          return NextResponse.json({ deleted: true, sheetSync: { ok: false, message: error instanceof Error ? error.message : "Team Sheet deletion failed." } });
        }
        return NextResponse.json({ deleted: true, sheetSync: { ok: true } });
      }
      if (body.action === "activate-account") {
        if (!body.id || typeof body.password !== "string" || typeof body.confirmPassword !== "string") {
          throw new Error("A collector and password confirmation are required.");
        }
        if (body.password.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
        if (body.password !== body.confirmPassword) throw new Error("Passwords do not match.");
        const profileResult = await admin.service.from("profiles").select("id,email,role,hr_code").eq("id", body.id).single();
        if (profileResult.error || !profileResult.data) throw new Error("Collector profile not found.");
        if (profileResult.data.role !== "collector") throw new Error("Only collector accounts can be activated here.");
        const updated = await admin.service.auth.admin.updateUserById(profileResult.data.id, {
          password: body.password,
          email_confirm: true,
        });
        if (updated.error) throw new Error("Unable to activate the collector account.");
        const users = await admin.service.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const authUser = users.data?.users.find((user) => user.id === profileResult.data.id);
        if (!authUser?.email_confirmed_at && !authUser?.confirmed_at) throw new Error("The account password was not saved as confirmed.");
        await admin.service.from("activity_logs").insert({
          user_id: admin.user.id, assignment_id: null, action: "collector_account_activated",
          old_value: { profile_id: profileResult.data.id, hr_code: profileResult.data.hr_code },
          new_value: { profile_id: profileResult.data.id, hr_code: profileResult.data.hr_code },
        });
        return NextResponse.json({ account: { id: profileResult.data.id, confirmed: true } });
      }
      if (body.action === "retry-team-sheet-sync") {
        if (!body.id) throw new Error("A collector profile is required.");
        const profileResult = await admin.service.from("profiles").select("*").eq("id", body.id).single();
        if (profileResult.error || !profileResult.data) throw new Error("Collector profile not found.");
        const profile = profileResult.data;
        try {
          await upsertCollectorToTeamSheet({
            hr_code: profile.hr_code ?? "",
            full_name: profile.full_name ?? "",
            email: profile.email,
            phone: profile.phone,
            team: profile.team,
            status: profile.status,
          });
          await admin.service.from("activity_logs").insert({
            user_id: admin.user.id, assignment_id: null, action: "collector_team_sheet_synced",
            old_value: null, new_value: { profile_id: profile.id, hr_code: profile.hr_code },
          });
          return NextResponse.json({ sheetSync: { ok: true } });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Google Sheets sync failed.";
          await admin.service.from("activity_logs").insert({
            user_id: admin.user.id, assignment_id: null, action: "collector_team_sheet_sync_failed",
            old_value: null, new_value: { profile_id: profile.id, hr_code: profile.hr_code, message },
          });
          return NextResponse.json({ sheetSync: { ok: false, message } }, { status: 502 });
        }
      }
      if (body.action !== "sync-team-roster") throw new Error("Unsupported collector operation.");
      const [sheetRows, profilesResult] = await Promise.all([
        pullTeamSheet(),
        admin.service.from("profiles").select("*").is("deleted_at", null),
      ]);
      if (profilesResult.error) throw new Error("Unable to inspect team members.");
      const profilesByHr = new Map((profilesResult.data ?? []).filter((profile) => profile.hr_code).map((profile) => [profile.hr_code!.trim().toUpperCase(), profile]));
      const seenHr = new Set<string>();
      const rows: Array<{ hr_code: string; outcome: "updated" | "skipped" | "error"; message: string }> = [];
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      for (const row of sheetRows) {
        if (!row.hr_code || seenHr.has(row.hr_code)) {
          errors += 1;
          rows.push({ hr_code: row.hr_code, outcome: "error", message: "Missing or duplicate HR-Code in the Team sheet." });
          continue;
        }
        seenHr.add(row.hr_code);
        const existing = profilesByHr.get(row.hr_code);
        if (!existing) {
          skipped += 1;
          rows.push({ hr_code: row.hr_code, outcome: "skipped", message: "No existing profile matched this HR-Code; no Auth user or profile was created." });
          continue;
        }
        if (!row.full_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
          errors += 1;
          rows.push({ hr_code: row.hr_code, outcome: "error", message: "Name and a valid email are required." });
          continue;
        }
        if (existing.email.toLowerCase() !== row.email) {
          const authUpdate = await admin.service.auth.admin.updateUserById(existing.id, { email: row.email, email_confirm: true });
          if (authUpdate.error) {
            errors += 1;
            rows.push({ hr_code: row.hr_code, outcome: "error", message: "Unable to update the Auth email." });
            continue;
          }
        }
        const saved = await admin.service.from("profiles").update({
          full_name: row.full_name,
          email: row.email,
          hr_code: row.hr_code,
          phone: row.phone,
          team: row.team,
          status: row.status,
        }).eq("id", existing.id).select("id").single();
        if (saved.error) {
          errors += 1;
          rows.push({ hr_code: row.hr_code, outcome: "error", message: "Unable to update the profile roster fields." });
          continue;
        }
        updated += 1;
        rows.push({ hr_code: row.hr_code, outcome: "updated", message: `Updated ${existing.role} profile roster fields.` });
        await admin.service.from("activity_logs").insert({
          user_id: admin.user.id,
          assignment_id: null,
          action: "collector_updated",
          old_value: { profile_id: existing.id },
          new_value: { profile_id: existing.id, hr_code: row.hr_code, source: "Team sheet" },
        });
      }
      return NextResponse.json({ result: { updated, skipped, errors, rows } });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Team roster synchronization failed." }, { status: 422 });
    }
  }
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "A CSV or XLSX file is required." }, { status: 400 });
  try {
    const rows = parseCollectorImport(Buffer.from(await file.arrayBuffer()));
    if (formData.get("confirm") === "true") return NextResponse.json({ result: await provisionCollectors(admin.service, rows, admin.user.id) });
    return NextResponse.json({ preview: await classifyCollectorImport(admin.service, rows) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Collector import failed." }, { status: 422 });
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if ("response" in admin) return admin.response;
  try {
    const body = (await request.json()) as {
      action?: "save" | "role";
      id?: string;
      role?: UserRole;
      full_name?: string;
      email?: string;
      hr_code?: string;
      phone?: string | null;
      team?: string | null;
      status?: string | null;
    };
    const profilesResult = await admin.service.from("profiles").select("*");
    if (profilesResult.error) throw new Error("Unable to inspect team members.");
    const profiles = profilesResult.data ?? [];
    const existing = body.id ? profiles.find((profile) => profile.id === body.id) : undefined;

    if (body.action === "role") {
      if (!existing || (body.role !== "admin" && body.role !== "collector")) throw new Error("A valid team member and role are required.");
      if (existing.role === "admin" && body.role === "collector" && profiles.filter((profile) => profile.role === "admin").length <= 1) {
        throw new Error("The last remaining admin cannot be downgraded.");
      }
      const updated = await admin.service.from("profiles").update({ role: body.role }).eq("id", existing.id).select("*").single();
      if (updated.error) throw new Error("Unable to change the team member role.");
      await admin.service.from("activity_logs").insert({
        user_id: admin.user.id, assignment_id: null, action: "collector_role_changed",
        old_value: { profile_id: existing.id, role: existing.role }, new_value: { profile_id: existing.id, role: body.role },
      });
      return NextResponse.json({ profile: updated.data });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const hrCode = String(body.hr_code ?? "").replace(/\s+/g, " ").trim().toUpperCase();
    const fullName = String(body.full_name ?? "").replace(/\s+/g, " ").trim();
    if (!fullName || !hrCode || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Full Name, HR-Code, and a valid Email are required.");
    if (profiles.some((profile) => profile.hr_code?.toUpperCase() === hrCode && profile.id !== body.id)) throw new Error("That HR-Code already belongs to another team member.");
    if (profiles.some((profile) => profile.email.toLowerCase() === email && profile.id !== body.id)) throw new Error("That email already belongs to another team member.");
    if (existing && existing.email.toLowerCase() !== email) {
      const updatedAuth = await admin.service.auth.admin.updateUserById(existing.id, { email, email_confirm: true });
      if (updatedAuth.error) throw new Error("Unable to update the Auth email.");
    }

    let profileId = existing?.id;
    if (!profileId) {
      const users = await admin.service.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (users.error) throw new Error("Unable to inspect Auth users.");
      const authUser = users.data.users.find((user) => user.email?.toLowerCase() === email);
      if (authUser) profileId = authUser.id;
      else {
        const created = await admin.service.auth.admin.createUser({ email, email_confirm: true, password: randomBytes(32).toString("base64url") });
        if (created.error || !created.data.user) throw new Error("Unable to create the Auth user.");
        profileId = created.data.user.id;
      }
    }
    const payload = {
      id: profileId, email, full_name: fullName, hr_code: hrCode,
      phone: body.phone?.trim() || null, team: body.team?.trim() || null, status: body.status?.trim() || null,
      role: existing?.role ?? body.role ?? "collector",
    };
    const saved = await admin.service.from("profiles").upsert(payload, { onConflict: "id" }).select("*").single();
    if (saved.error) throw new Error("Unable to save the team member profile.");
    await admin.service.from("activity_logs").insert({
      user_id: admin.user.id, assignment_id: null, action: existing ? "collector_updated" : "collector_created",
      old_value: existing ? { profile_id: existing.id } : null, new_value: { profile_id: saved.data.id, hr_code: hrCode, email },
    });
    let sheetSync: { ok: boolean; message?: string } = { ok: true };
    try {
      await upsertCollectorToTeamSheet({ previous_hr_code: existing?.hr_code, hr_code: hrCode, full_name: fullName, email, phone: payload.phone, team: payload.team, status: payload.status });
      await admin.service.from("activity_logs").insert({
        user_id: admin.user.id, assignment_id: null, action: "collector_team_sheet_synced",
        old_value: null, new_value: { profile_id: saved.data.id, hr_code: hrCode },
      });
    } catch (error) {
      const syncMessage = error instanceof Error ? error.message : "Google Sheets sync failed.";
      sheetSync = { ok: false, message: syncMessage };
      await admin.service.from("activity_logs").insert({
        user_id: admin.user.id, assignment_id: null, action: "collector_team_sheet_sync_failed",
        old_value: null, new_value: { profile_id: saved.data.id, hr_code: hrCode, message: syncMessage },
      });
    }
    return NextResponse.json({ profile: saved.data, sheetSync });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Team member operation failed." }, { status: 422 });
  }
}
