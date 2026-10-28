import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { classifyCollectorImport, parseCollectorImport, provisionCollectors } from "@/lib/admin/collector-import";
import {
  assertCanChangeRole,
  assertCanDeleteProfile,
  assertCanSaveProfile,
  assertCanSuspendProfile,
  isCollectorAuthorizationError,
  planTeamRosterProfileUpdate,
} from "@/lib/admin/protected-admins";
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
        const profileResult = await admin.service.from("profiles").select("id,role,suspended_at,is_protected_admin").eq("id", body.id).single();
        if (profileResult.error || !profileResult.data) throw new Error("Collector profile not found.");
        assertCanSuspendProfile(profileResult.data);
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
        assertCanDeleteProfile(profile);
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
      if (body.action === "bulk-activate-unconfirmed" || body.action === "bulk-set-temporary-password") {
        if (typeof body.password !== "string" || typeof body.confirmPassword !== "string") throw new Error("A temporary password and confirmation are required.");
        if (body.password.length < 8) throw new Error("Temporary password must be at least 8 characters.");
        if (body.password !== body.confirmPassword) throw new Error("Temporary passwords do not match.");
        const { data: profiles, error: profilesError } = await admin.service.from("profiles").select("id,email,full_name,hr_code,role,suspended_at").is("deleted_at", null).eq("role", "collector");
        if (profilesError) throw new Error("Unable to load collector accounts.");
        const targets = (profiles ?? []).filter((profile) => !profile.suspended_at);
        const succeeded: Array<{ id: string; name: string; hr_code: string | null; email: string }> = [];
        const failed: Array<{ name: string; hr_code: string | null; email: string; message: string }> = [];
        for (const profile of targets) {
          const updated = await admin.service.auth.admin.updateUserById(profile.id, { password: body.password, email_confirm: true });
          if (updated.error) { failed.push({ name: profile.full_name ?? "Unknown", hr_code: profile.hr_code, email: profile.email, message: "Unable to update account." }); continue; }
          succeeded.push({ id: profile.id, name: profile.full_name ?? "Unknown", hr_code: profile.hr_code, email: profile.email });
          const audit = await admin.service.from("activity_logs").insert({ user_id: admin.user.id, assignment_id: null, action: "collector_bulk_temporary_password_set", old_value: { profile_id: profile.id, hr_code: profile.hr_code }, new_value: { profile_id: profile.id, hr_code: profile.hr_code, activation_method: "temporary_shared_password" } });
          if (audit.error) console.error("Bulk collector password audit log failed", { profileId: profile.id, error: audit.error.message });
        }
        return NextResponse.json({ result: { attempted: targets.length, activated: succeeded.length, failed: failed.length, accounts: succeeded.map(({ id, name, hr_code, email }) => ({ id, name, hr_code, email })), failures: failed } });
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
        admin.service.from("profiles").select("*"),
      ]);
      if (profilesResult.error) throw new Error("Unable to inspect team members.");

      const allProfiles = profilesResult.data ?? [];
      const activeProfiles = allProfiles.filter((profile) => !profile.deleted_at);
      const profilesByHr = new Map(activeProfiles.filter((profile) => profile.hr_code).map((profile) => [profile.hr_code!.replace(/[\\u200b-\\u200f\\u202a-\\u202e]/g, "").trim().toUpperCase(), profile]));
      const profilesByEmail = new Map(activeProfiles.map((profile) => [profile.email.trim().toLowerCase(), profile]));
      const archivedByHr = new Map(allProfiles.filter((profile) => profile.deleted_at && profile.hr_code).map((profile) => [profile.hr_code!.trim().toUpperCase(), profile]));
      const archivedByEmail = new Map(allProfiles.filter((profile) => profile.deleted_at).map((profile) => [profile.email.trim().toLowerCase(), profile]));
      const authUsers: Array<{ id: string; email: string }> = [];
      for (let page = 1; page <= 20; page += 1) {
        const users = await admin.service.auth.admin.listUsers({ page, perPage: 1000 });
        if (users.error) throw new Error("Unable to inspect Auth accounts for Team Sheet sync.");
        authUsers.push(...users.data.users.filter((user) => user.email).map((user) => ({ id: user.id, email: user.email!.trim().toLowerCase() })));
        if (users.data.users.length < 1000) break;
      }
      const authByEmail = new Map(authUsers.map((user) => [user.email, user]));

      const seenHr = new Set<string>();
      const seenEmail = new Set<string>();
      const rows: Array<{ hr_code: string; full_name?: string; outcome: "created" | "updated" | "skipped" | "error"; message: string }> = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      for (const row of sheetRows) {
        const hrCode = row.hr_code.replace(/[\\u200b-\\u200f\\u202a-\\u202e]/g, "").trim().toUpperCase();
        const email = row.email.trim().toLowerCase();
        const fullName = row.full_name.replace(/\\s+/g, " ").trim();
        if (!hrCode || seenHr.has(hrCode)) {
          errors += 1;
          rows.push({ hr_code: hrCode, full_name: fullName, outcome: "error", message: !hrCode ? "Missing HR-Code in the Team sheet." : "Duplicate HR-Code in the Team sheet." });
          continue;
        }
        seenHr.add(hrCode);
        if (!fullName || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
          errors += 1;
          rows.push({ hr_code: hrCode, full_name: fullName, outcome: "error", message: !fullName ? "Name is required." : "A valid email is required to create or sync this member." });
          continue;
        }
        if (seenEmail.has(email)) {
          errors += 1;
          rows.push({ hr_code: hrCode, full_name: fullName, outcome: "error", message: "Duplicate email in the Team sheet." });
          continue;
        }
        seenEmail.add(email);

        const existingByHr = profilesByHr.get(hrCode);
        const existingByEmail = profilesByEmail.get(email);
        if (existingByHr && existingByEmail && existingByHr.id !== existingByEmail.id) {
          errors += 1;
          rows.push({ hr_code: hrCode, full_name: fullName, outcome: "error", message: "HR-Code and email belong to different existing profiles." });
          continue;
        }
        const existing = existingByHr ?? existingByEmail;
        if (!existing && (archivedByHr.has(hrCode) || archivedByEmail.has(email))) {
          skipped += 1;
          rows.push({ hr_code: hrCode, full_name: fullName, outcome: "skipped", message: "This HR-Code or email belongs to an archived member. Restore that profile manually before syncing." });
          continue;
        }

        if (existing) {
          const plan = planTeamRosterProfileUpdate(existing, { ...row, hr_code: hrCode, full_name: fullName, email });
          if (plan.outcome === "skipped") {
            skipped += 1;
            rows.push({ hr_code: hrCode, full_name: fullName, outcome: "skipped", message: plan.message });
            continue;
          }
          if (plan.outcome === "error") {
            errors += 1;
            rows.push({ hr_code: hrCode, full_name: fullName, outcome: "error", message: plan.message });
            continue;
          }
          if (plan.authEmail) {
            const authUpdate = await admin.service.auth.admin.updateUserById(existing.id, { email: plan.authEmail, email_confirm: true });
            if (authUpdate.error) {
              errors += 1;
              rows.push({ hr_code: hrCode, full_name: fullName, outcome: "error", message: "Unable to update the Auth email." });
              continue;
            }
          }
          const saved = await admin.service.from("profiles").update(plan.fields).eq("id", existing.id).select("*").single();
          if (saved.error) {
            errors += 1;
            rows.push({ hr_code: hrCode, full_name: fullName, outcome: "error", message: "Unable to update the profile roster fields." });
            continue;
          }
          profilesByHr.delete(existing.hr_code?.trim().toUpperCase() ?? "");
          profilesByEmail.delete(existing.email.trim().toLowerCase());
          if (saved.data.hr_code) profilesByHr.set(saved.data.hr_code.replace(/[\\u200b-\\u200f\\u202a-\\u202e]/g, "").trim().toUpperCase(), saved.data);
          profilesByEmail.set(saved.data.email.trim().toLowerCase(), saved.data);
          updated += 1;
          rows.push({ hr_code: hrCode, full_name: fullName, outcome: "updated", message: plan.message });
          const audit = await admin.service.from("activity_logs").insert({ user_id: admin.user.id, assignment_id: null, action: "collector_updated", old_value: { profile_id: existing.id }, new_value: { profile_id: existing.id, hr_code: hrCode, source: "Team sheet" } });
          if (audit.error) console.error("Team roster update audit failed", audit.error.message);
          continue;
        }

        let authUser = authByEmail.get(email);
        let createdAuthId: string | null = null;
        if (!authUser) {
          const authCreated = await admin.service.auth.admin.createUser({ email, email_confirm: true, password: randomBytes(32).toString("base64url") });
          if (authCreated.error || !authCreated.data.user) {
            errors += 1;
            rows.push({ hr_code: hrCode, full_name: fullName, outcome: "error", message: "Unable to create the Auth account for this member." });
            continue;
          }
          authUser = { id: authCreated.data.user.id, email };
          createdAuthId = authUser.id;
          authByEmail.set(email, authUser);
        }
        const profileSaved = await admin.service.from("profiles").upsert({
          id: authUser.id, email, full_name: fullName, hr_code: hrCode,
          phone: row.phone, team: row.team, status: row.status, role: "collector",
        }, { onConflict: "id" }).select("*").single();
        if (profileSaved.error || !profileSaved.data) {
          if (createdAuthId) {
            const rollback = await admin.service.auth.admin.deleteUser(createdAuthId);
            if (rollback.error) console.error("Unable to roll back orphan Auth user after Team Sheet sync failure.", rollback.error.message);
          }
          errors += 1;
          rows.push({ hr_code: hrCode, full_name: fullName, outcome: "error", message: "Unable to create the profile from this Team Sheet row. Check duplicate HR-Code/email constraints." });
          continue;
        }
        profilesByHr.set(hrCode, profileSaved.data);
        profilesByEmail.set(email, profileSaved.data);
        created += 1;
        rows.push({ hr_code: hrCode, full_name: fullName, outcome: "created", message: "Created a new collector account and profile from the Team sheet. Set the team temporary password if needed." });
        const audit = await admin.service.from("activity_logs").insert({ user_id: admin.user.id, assignment_id: null, action: "collector_profile_provisioned", old_value: null, new_value: { profile_id: authUser.id, hr_code: hrCode, email, source: "Team sheet" } });
        if (audit.error) console.error("Team roster creation audit failed", audit.error.message);
      }
      return NextResponse.json({ result: { created, updated, skipped, errors, rows } });
    } catch (error) {
      if (isCollectorAuthorizationError(error)) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
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
      is_protected_admin?: boolean | null;
    };
    const profilesResult = await admin.service.from("profiles").select("*");
    if (profilesResult.error) throw new Error("Unable to inspect team members.");
    const profiles = profilesResult.data ?? [];
    const existing = body.id ? profiles.find((profile) => profile.id === body.id) : undefined;

    if (body.action === "role") {
      if (!existing || (body.role !== "admin" && body.role !== "collector")) throw new Error("A valid team member and role are required.");
      assertCanChangeRole(existing, body.role, profiles);
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
    assertCanSaveProfile(existing, {
      role: body.role,
      hr_code: hrCode,
      email,
      is_protected_admin: body.is_protected_admin,
    });
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
    if (isCollectorAuthorizationError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Team member operation failed." }, { status: 422 });
  }
}
