"use client";

import { useEffect, useMemo, useState } from "react";
import {
  isProtectedAdminProfile,
  isProtectedIdentityFieldLocked,
  PROTECTED_ADMIN_BADGE_LABEL,
  shouldShowChangeToAdmin,
  shouldShowChangeToCollector,
  shouldShowProtectedAdminBadge,
} from "@/lib/admin/protected-admins";
import type { ProfileRow } from "@/types/database.types";

type Profile = Pick<ProfileRow, "id" | "full_name" | "email" | "hr_code" | "phone" | "team" | "status" | "role" | "is_protected_admin" | "created_at" | "updated_at" | "suspended_at"> & {
  auth_user_exists: boolean;
  auth_confirmed: boolean;
};

type Preview = {
  rows: Array<{ row_number: number; hr_code: string; full_name: string; email: string; outcome: string; error_type: string | null; message: string }>;
  counts: { total: number; valid: number; new_collectors: number; existing_collectors: number; duplicates: number; invalid: number; admin_conflicts: number };
};

const outcomeStyles: Record<string, string> = {
  "new-collector": "border-sky-400/30 bg-sky-400/10 text-sky-200",
  "existing-collector": "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  "duplicate-hr-code": "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "duplicate-email": "border-orange-400/30 bg-orange-400/10 text-orange-200",
  "invalid-row": "border-red-400/30 bg-red-400/10 text-red-200",
};
const errorTypeLabels: Record<string, string> = {
  duplicate_hr_code_within_file: "Duplicate HR-Code within file",
  duplicate_email_within_file: "Duplicate email within file",
  hr_code_belongs_to_another_collector: "HR-Code belongs to another collector",
  email_belongs_to_another_collector: "Email belongs to another collector",
  email_belongs_to_existing_admin: "Email belongs to existing admin",
  hr_code_belongs_to_existing_admin: "HR-Code belongs to existing admin",
  missing_hr_code: "Missing HR-Code",
  missing_name: "Missing Name",
  missing_email: "Missing Email",
  invalid_email: "Invalid email",
  conflicting_hr_code_email_mapping: "Conflicting HR-Code/email mapping",
  other_validation_error: "Other validation error",
};

type CollectorForm = { full_name: string; hr_code: string; email: string; phone: string; team: string; status: string; role: "admin" | "collector" };
const blankForm: CollectorForm = { full_name: "", hr_code: "", email: "", phone: "", team: "", status: "", role: "collector" };
const FORM_FIELDS: Array<[keyof Omit<CollectorForm, "role">, string]> = [["full_name", "Full Name"], ["hr_code", "HR-Code"], ["email", "Email"], ["phone", "Phone"], ["team", "Team"], ["status", "Status"]];

export default function CollectorImportClient() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(blankForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [rosterSync, setRosterSync] = useState<{ updated: number; skipped: number; errors: number } | null>(null);
  const [sheetFailure, setSheetFailure] = useState<{ profileId: string; message: string } | null>(null);
  const [activationProfile, setActivationProfile] = useState<Profile | null>(null);
  const [activationPassword, setActivationPassword] = useState("");
  const [activationConfirm, setActivationConfirm] = useState("");
  const [bulkActivationOpen, setBulkActivationOpen] = useState(false);
  const [bulkPassword, setBulkPassword] = useState("");
  const [bulkPasswordConfirm, setBulkPasswordConfirm] = useState("");
  const [bulkResult, setBulkResult] = useState<{ attempted: number; activated: number; failed: number; accounts: Array<{ id: string; name: string; hr_code: string | null; email: string }>; failures: Array<{ name: string; hr_code: string | null; email: string; message: string }> } | null>(null);

  async function loadProfiles() {
    const response = await fetch("/api/admin/collectors");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load team members.");
    setProfiles(body.profiles);
  }
  useEffect(() => { loadProfiles().catch((error) => setMessage(error.message)); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return profiles.filter((profile) => !query || [profile.full_name, profile.hr_code, profile.email].some((value) => value?.toLowerCase().includes(query)));
  }, [profiles, search]);
  const pendingActivationCount = profiles.filter((profile) => profile.role === "collector" && !profile.suspended_at).length;
  const stats = {
    admins: profiles.filter((profile) => profile.role === "admin").length,
    collectors: profiles.filter((profile) => profile.role === "collector").length,
    active: profiles.filter((profile) => profile.auth_confirmed && !profile.suspended_at).length,
  };

  function openForm(profile?: Profile) {
    setEditing(profile?.id ?? null);
    setForm(profile ? { full_name: profile.full_name ?? "", hr_code: profile.hr_code ?? "", email: profile.email, phone: profile.phone ?? "", team: profile.team ?? "", status: profile.status ?? "", role: profile.role } : blankForm);
    setModal(true);
    setMessage("");
  }
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/admin/collectors", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", id: editing, ...form }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save team member.");
      setModal(false);
      if (body.sheetSync?.ok) {
        setMessage(editing ? "Collector updated. Team Sheet updated." : "Collector created. Team Sheet updated.");
        setSheetFailure(null);
      } else {
        setMessage(editing ? "Collector updated, but Team Sheet sync failed." : "Collector created, but Team Sheet sync failed.");
        setSheetFailure({ profileId: body.profile.id, message: body.sheetSync?.message ?? "Google Sheets sync failed." });
      }
      await loadProfiles();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save team member."); }
    finally { setBusy(false); }
  }
  async function changeRole(profile: Profile) {
    if (isProtectedAdminProfile(profile) && profile.role === "admin") return;
    const role = profile.role === "admin" ? "collector" : "admin";
    setBusy(true);
    try {
      const response = await fetch("/api/admin/collectors", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "role", id: profile.id, role }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to change role.");
      await loadProfiles();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to change role."); }
    finally { setBusy(false); }
  }
  async function deleteCollector(profile: Profile) {
    if (profile.role === "admin") {
      setMessage("Admin accounts must be managed separately.");
      return;
    }
    const confirmed = window.confirm(
      `Delete this collector permanently?\n\nName: ${profile.full_name ?? "—"}\nHR-Code: ${profile.hr_code ?? "—"}\nEmail: ${profile.email}\n\nThis will remove the collector's account and roster entry. Historical assignment records will be preserved.`
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/collectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-collector", id: profile.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to delete collector.");
      if (body.sheetSync?.ok === false) {
        setMessage(`Collector deleted, but Batch roster removal failed: ${body.sheetSync.message}`);
      } else {
        setMessage("Collector deleted successfully.");
      }
      await loadProfiles();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete collector.");
    } finally {
      setBusy(false);
    }
  }
  async function toggleSuspension(profile: Profile) {
    setBusy(true);
    setMessage("");
    try {
      const action = profile.suspended_at ? "resume-collector" : "suspend-collector";
      const response = await fetch("/api/admin/collectors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id: profile.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update collector availability.");
      setMessage(profile.suspended_at ? "Collector reactivated." : "Collector deactivated.");
      await loadProfiles();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update collector availability."); }
    finally { setBusy(false); }
  }
  async function syncTeamRoster() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/collectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sync-team-roster" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to synchronize Team roster.");
      setRosterSync(body.result);
      await loadProfiles();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to synchronize Team roster.");
    } finally {
      setBusy(false);
    }
  }
  async function retrySheetSync() {
    if (!sheetFailure) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/collectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "retry-team-sheet-sync", id: sheetFailure.profileId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.sheetSync?.message ?? body.error ?? "Google Sheets sync failed.");
      setSheetFailure(null);
      setMessage("Collector saved. Team Sheet updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google Sheets sync failed.");
    } finally {
      setBusy(false);
    }
  }
  async function activateAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!activationProfile) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/collectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "activate-account",
          id: activationProfile.id,
          password: activationPassword,
          confirmPassword: activationConfirm,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to activate the collector account.");
      setActivationProfile(null);
      setActivationPassword("");
      setActivationConfirm("");
      setMessage("Account active.");
      await loadProfiles();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to activate the collector account.");
    } finally {
      setBusy(false);
    }
  }
  async function activatePendingAccounts(event: React.FormEvent) {
    event.preventDefault();
    if (bulkPassword.length < 8 || bulkPassword !== bulkPasswordConfirm) {
      setMessage(bulkPassword.length < 8 ? "Temporary password must be at least 8 characters." : "Temporary passwords do not match.");
      return;
    }
    const confirmed = window.confirm(`Set this temporary password for all ${pendingActivationCount} active collector account(s)? This will replace their current passwords. Admin and suspended accounts will not be changed.`);
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    setBulkResult(null);
    try {
      const response = await fetch("/api/admin/collectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "bulk-set-temporary-password", password: bulkPassword, confirmPassword: bulkPasswordConfirm }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Bulk account activation failed.");
      setBulkResult(body.result);
      setBulkActivationOpen(false);
      setBulkPassword("");
      setBulkPasswordConfirm("");
      setMessage(`Bulk password update finished: ${body.result.activated} updated, ${body.result.failed} failed.`);
      await loadProfiles();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk account activation failed.");
    } finally { setBusy(false); }
  }
  async function submitPreview(confirm = false) {
    if (!file) return;
    setBusy(true); setMessage("");
    const data = new FormData(); data.append("file", file); if (confirm) data.append("confirm", "true");
    try {
      const response = await fetch("/api/admin/collectors", { method: "POST", body: data });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Collector import failed.");
      if (confirm) { await loadProfiles(); setPreview(null); } else setPreview(body.preview);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Collector import failed."); }
    finally { setBusy(false); }
  }
  const blocked = preview?.rows.some((row) => ["invalid-row", "duplicate-hr-code", "duplicate-email"].includes(row.outcome));
  const editingProfile = editing ? profiles.find((profile) => profile.id === editing) : undefined;

  return <div className="w-full min-w-0 space-y-6">
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Squad size", value: profiles.length, color: "text-chalk-50", mark: "XI", note: "Registered members", accent: "from-emerald-300/25" },
        { label: "Staff", value: stats.admins, color: "text-clock-amber", mark: "★", note: "Admin access", accent: "from-clock-amber/20" },
        { label: "Collectors", value: stats.collectors, color: "text-sky-200", mark: "⚽", note: "On the roster", accent: "from-sky-300/20" },
        { label: "Active accounts", value: stats.active, color: "text-emerald-200", mark: "✓", note: "Ready for kick-off", accent: "from-emerald-300/25" },
      ].map((item) => <div key={item.label} className={`group relative min-w-0 overflow-hidden rounded-xl border border-pitch-600/70 bg-gradient-to-br ${item.accent} via-pitch-900/95 to-pitch-950 p-4 shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-clock-amber/50`}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-chalk-300">{item.label}</p><p className={`mt-2 font-display text-3xl ${item.color}`}>{item.value}</p></div>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-pitch-950/70 font-mono text-sm font-bold text-clock-amber shadow-inner">{item.mark}</span>
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-xs text-chalk-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />{item.note}</div>
        <div className="absolute -bottom-7 -right-4 h-20 w-20 rounded-full border border-white/5 transition-transform group-hover:scale-125" aria-hidden="true" />
      </div>)}
    </div>
    <section className="min-w-0 rounded-2xl border border-pitch-600/70 bg-pitch-900/90 p-4 shadow-2xl shadow-black/20 sm:p-6">
      <div className="mb-5 flex flex-col gap-4 border-b border-pitch-700/80 pb-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-clock-amber">01 / Squad roster</p><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl text-chalk-50">Team members</h2><span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 font-mono text-[11px] text-emerald-100">{filtered.length} / {profiles.length}</span></div><p className="mt-1 text-sm text-chalk-300">Squad directory, account status and staff permissions.</p></div><div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center"><button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-pitch-500 bg-pitch-800/80 px-4 py-2.5 text-sm font-semibold text-chalk-50 shadow-sm transition hover:border-emerald-300/60 hover:bg-pitch-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-300 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={syncTeamRoster}><span aria-hidden="true">↻</span>{busy ? "Working..." : "Sync Team Sheet"}</button><button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-clock-amber/50 bg-clock-amber/10 px-4 py-2.5 text-sm font-semibold text-clock-amber shadow-sm transition hover:border-clock-amber hover:bg-clock-amber/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clock-amber disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || pendingActivationCount === 0} onClick={() => { setBulkResult(null); setBulkActivationOpen(true); }}><span aria-hidden="true">♜</span>Team password ({pendingActivationCount})</button><button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-300 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:border-amber-200 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={() => openForm()}><span aria-hidden="true">＋</span>Add team member</button></div></div>
      <input className="mt-5 min-h-12 w-full rounded-xl border border-pitch-600/80 bg-pitch-950/80 px-4 py-3 text-sm text-chalk-50 outline-none transition placeholder:text-chalk-400 focus:border-clock-amber/70 focus:ring-2 focus:ring-clock-amber/15" placeholder="Search squad by name, HR-Code, or email…" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="mt-5 space-y-3">
        {filtered.map((profile, index) => {
          const initials = (profile.full_name ?? "Collector").trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
          const squadNumber = profile.hr_code?.match(/\d+/)?.[0]?.slice(-3).padStart(3, "0") ?? "—";
          const accountLabel = profile.suspended_at ? "Deactivated" : profile.auth_confirmed ? "Account Active" : profile.auth_user_exists ? "Waiting for activation" : "Auth user missing";
          const accountTone = profile.suspended_at ? "border-slate-500/40 bg-slate-500/10 text-slate-300" : profile.auth_confirmed ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200";
          const protectedAdmin = shouldShowProtectedAdminBadge(profile);
          const actionButton = "inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-center text-[11px] font-semibold leading-tight transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-45";
          return <article key={profile.id} className={"group relative overflow-hidden rounded-xl border bg-pitch-950/55 shadow-lg shadow-black/10 transition duration-200 hover:bg-pitch-900/80 " + (protectedAdmin ? "border-clock-amber/55 hover:border-clock-amber/80" : "border-pitch-700/90 hover:border-emerald-300/45")}>
            <div className={"absolute inset-y-0 left-0 w-1 " + (profile.suspended_at ? "bg-slate-500/60" : profile.auth_confirmed ? "bg-emerald-300/70" : "bg-clock-amber/70")} aria-hidden="true" />
            <div className="grid min-w-0 gap-4 p-3.5 pl-4 sm:p-4 sm:pl-5 xl:grid-cols-[minmax(220px,0.95fr)_minmax(240px,1.1fr)_minmax(205px,0.95fr)] xl:items-center xl:gap-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-[76px] w-[54px] shrink-0 flex-col items-center justify-center rounded-md border border-pitch-600 bg-pitch-900 shadow-inner">
                  <span className="text-sm text-clock-amber" aria-hidden="true">♜</span>
                  <span className="font-mono text-xl font-bold leading-6 text-chalk-50">{squadNumber}</span>
                  <span className="mt-1 text-[7px] uppercase tracking-wider text-chalk-400">HR-Code</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-emerald-300/20 bg-emerald-300/10 font-mono text-[9px] font-bold text-emerald-100">{initials || "C"}</span>
                    <h3 className="min-w-0 break-words text-sm font-bold leading-5 text-chalk-50">{profile.full_name ?? "Unnamed team member"}</h3>
                  </div>
                  <p className="mt-1.5 break-all font-mono text-[10px] text-chalk-400">{profile.hr_code ?? "No HR-Code"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={"rounded border px-2 py-1 text-[9px] font-bold uppercase tracking-wide " + (profile.role === "admin" ? "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200" : "border-sky-400/30 bg-sky-400/10 text-sky-200")}>{profile.role}</span>
                    <span className="rounded border border-pitch-600 bg-pitch-900 px-2 py-1 text-[9px] font-semibold text-chalk-200">{profile.status ?? "Unspecified"}</span>
                    {profile.team && <span className="inline-flex max-w-full items-center gap-1 rounded border border-pitch-600/80 bg-pitch-900/70 px-2 py-1 text-[9px] text-chalk-300"><span className="text-clock-amber" aria-hidden="true">◇</span><span className="break-words">{profile.team}</span></span>}
                  </div>
                  {protectedAdmin && <span className="mt-2 inline-flex rounded border border-clock-amber/40 bg-clock-amber/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-clock-amber">{PROTECTED_ADMIN_BADGE_LABEL}</span>}
                </div>
              </div>
              <div className="min-w-0 space-y-3 border-y border-pitch-700/70 py-3 xl:border-y-0 xl:border-l xl:py-1 xl:pl-5">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 w-4 shrink-0 text-center text-xs text-chalk-400" aria-hidden="true">✉</span>
                  <div className="min-w-0 flex-1"><p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-chalk-500">Email</p><p className="mt-0.5 break-all text-xs leading-4 text-chalk-200">{profile.email || "No email"}</p></div>
                </div>
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 w-4 shrink-0 text-center text-xs text-chalk-400" aria-hidden="true">☎</span>
                  <div className="min-w-0 flex-1"><p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-chalk-500">Phone</p><p className="mt-0.5 break-words text-xs leading-4 text-chalk-200">{profile.phone || "No phone number"}</p></div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span className={"inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-semibold " + accountTone}><span className={"h-1.5 w-1.5 rounded-full " + (profile.suspended_at ? "bg-slate-400" : profile.auth_confirmed ? "bg-emerald-300" : "bg-clock-amber")} />{accountLabel}</span>
                  {protectedAdmin && <span className="text-[9px] text-clock-amber">Protected access</span>}
                </div>
              </div>
              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between xl:hidden">
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-chalk-500">Member actions</span>
                  <span className="text-[9px] text-chalk-500">#{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button className={actionButton + " col-span-2 border-clock-amber/60 bg-clock-amber px-3 text-pitch-950 hover:bg-amber-200 focus-visible:ring-clock-amber sm:col-span-1"} onClick={() => openForm(profile)}><span aria-hidden="true">✎</span>Edit Profile</button>
                  {profile.role === "collector" && profile.auth_user_exists && <button className={actionButton + " border-pitch-600 bg-pitch-900/70 text-chalk-200 hover:border-clock-amber/50 hover:text-clock-amber focus-visible:ring-clock-amber"} disabled={busy} onClick={() => { setActivationProfile(profile); setActivationPassword(""); setActivationConfirm(""); }}>{profile.auth_confirmed ? "Set Password" : "Activate Account"}</button>}
                  {(shouldShowChangeToCollector(profile) || shouldShowChangeToAdmin(profile)) && <button className={actionButton + " border-pitch-600 bg-pitch-900/70 text-chalk-200 hover:border-pitch-400 hover:text-chalk-50 focus-visible:ring-pitch-300"} disabled={busy} onClick={() => changeRole(profile)}>{profile.role === "admin" ? "Change to Collector" : "Change to Admin"}</button>}
                  {profile.role === "collector" && <button className={actionButton + " border-pitch-600 bg-pitch-900/70 text-chalk-200 hover:border-clock-amber/50 hover:text-clock-amber focus-visible:ring-clock-amber"} disabled={busy} onClick={() => toggleSuspension(profile)}>{profile.suspended_at ? "↻ Reactivate" : "⊘ Deactivate"}</button>}
                  {profile.role === "collector" && <button className={actionButton + " col-span-2 border-red-500/35 bg-red-950/10 text-red-200 hover:border-red-400/70 hover:bg-red-950/30 focus-visible:ring-red-300"} disabled={busy} onClick={() => deleteCollector(profile)}><span aria-hidden="true">♲</span>Delete Collector</button>}
                </div>
                {protectedAdmin && <p className="mt-2 text-[9px] leading-4 text-clock-amber/80"><span aria-hidden="true">♙ </span>Protected account · restricted actions</p>}
              </div>
            </div>
          </article>;
        })}
        {filtered.length === 0 && <div className="rounded-xl border border-dashed border-pitch-600 bg-pitch-950/40 px-4 py-12 text-center"><p className="font-display text-lg text-chalk-100">No squad members found</p><p className="mt-1 text-sm text-chalk-400">Try another name, HR-Code, or email.</p></div>}
      </div>
      {rosterSync && <p role="status" className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-950/50 p-3 text-sm text-emerald-200">Team sheet synchronization complete. Updated: {rosterSync.updated}; skipped: {rosterSync.skipped}; errors: {rosterSync.errors}.</p>}
    </section>
    <section className="relative min-w-0 space-y-4 overflow-hidden rounded-2xl border border-pitch-600/70 bg-pitch-900/90 p-4 shadow-2xl shadow-black/20 sm:p-6"><div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full border-b border-l border-clock-amber/10" aria-hidden="true" /><div className="relative"><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-clock-amber">02 / Squad recruitment</p><h2 className="font-display text-2xl text-chalk-50">Import team roster</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-chalk-300">Bring the full squad in from a CSV or XLSX sheet. Review every row before provisioning. Required columns: HR-Code, Name, Email, Phone, Team, Status. No emails will be sent.</p></div><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-pitch-500 bg-pitch-800 px-4 py-2 text-sm font-medium text-chalk-50">Choose CSV or XLSX<input className="sr-only" type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><span className="truncate text-sm text-chalk-200">{file?.name ?? "No file selected"}</span></div><button className="rounded-lg border border-emerald-300/50 bg-emerald-300/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50" disabled={!file || busy} onClick={() => submitPreview()}>Preview roster import →</button>
      {preview && <div className="space-y-4 border-t border-pitch-700 pt-5"><div className="grid gap-2 text-sm text-chalk-200 sm:grid-cols-4"><span>Total rows: {preview.counts.total}</span><span>Valid: {preview.counts.valid}</span><span>New: {preview.counts.new_collectors}</span><span>Existing: {preview.counts.existing_collectors}</span><span>Duplicates: {preview.counts.duplicates}</span><span>Invalid: {preview.counts.invalid}</span><span>Admin conflicts: {preview.counts.admin_conflicts}</span></div><div className="max-w-full overflow-x-auto rounded-xl border border-pitch-700"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-pitch-800 text-xs uppercase tracking-wide text-chalk-300"><tr>{["Row", "HR-Code", "Name", "Email", "Outcome", "Error type", "Message"].map((header) => <th key={header} className="whitespace-nowrap px-3 py-3 font-medium">{header}</th>)}</tr></thead><tbody className="divide-y divide-pitch-700/80">{preview.rows.map((row) => <tr key={row.row_number} className="bg-pitch-900 text-chalk-100"><td className="px-3 py-3">{row.row_number}</td><td className="px-3 py-3 font-mono">{row.hr_code || "—"}</td><td className="px-3 py-3">{row.full_name || "—"}</td><td className="px-3 py-3">{row.email || "—"}</td><td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-xs ${outcomeStyles[row.outcome] ?? ""}`}>{row.outcome}</span></td><td className="px-3 py-3 text-amber-200">{row.error_type ? errorTypeLabels[row.error_type] ?? "Other validation error" : "—"}</td><td className="px-3 py-3 text-chalk-300">{row.message}</td></tr>)}</tbody></table></div><button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-pitch-700 disabled:text-chalk-400" disabled={busy || blocked} onClick={() => submitPreview(true)}>Import Team (No Emails)</button>{blocked && <p className="rounded-lg border border-amber-400/30 bg-amber-950/40 p-3 text-sm text-amber-200">Resolve duplicate and invalid rows before provisioning.</p>}</div>}
    </section>
    {message && <div role="status" className={`rounded-lg border p-3 text-sm ${sheetFailure ? "border-amber-400/30 bg-amber-950/50 text-amber-200" : "border-emerald-400/30 bg-emerald-950/50 text-emerald-200"}`}><p>{message}</p>{sheetFailure && <><p className="mt-1 text-xs text-amber-300">{sheetFailure.message}</p><button className="mt-3 rounded-lg border border-amber-300/40 px-3 py-1.5 text-xs font-semibold text-amber-100 disabled:text-chalk-500" disabled={busy} onClick={retrySheetSync}>Retry Sheet Sync</button></>}</div>}
    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={saveProfile} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border border-pitch-600 bg-pitch-900 p-6"><h2 className="font-display text-xl text-chalk-50">{editing ? "Edit team member" : "Add Collector"}</h2><div className="grid gap-3 sm:grid-cols-2">{FORM_FIELDS.map(([key, label]) => <label key={key} className="text-sm text-chalk-300">{label}<input required={["full_name", "hr_code", "email"].includes(key)} className="mt-1 w-full rounded-lg border border-pitch-600 bg-pitch-800 px-3 py-2 text-chalk-50 disabled:cursor-not-allowed disabled:text-chalk-400" value={form[key]} disabled={(key === "hr_code" || key === "email") && isProtectedIdentityFieldLocked(editingProfile, key)} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}</div><label className="block text-sm text-chalk-300">Role<select className="mt-1 w-full rounded-lg border border-pitch-600 bg-pitch-800 px-3 py-2 text-chalk-50 disabled:cursor-not-allowed disabled:text-chalk-400" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as "admin" | "collector" })} disabled={Boolean(editing) || isProtectedIdentityFieldLocked(editingProfile, "role")}><option value="collector">Collector</option><option value="admin">Admin</option></select></label><div className="flex justify-end gap-3"><button type="button" className="rounded-lg border border-pitch-500 px-4 py-2 text-chalk-200" onClick={() => setModal(false)}>Cancel</button><button className="rounded-lg bg-pitch-500 px-4 py-2 font-semibold text-pitch-950" disabled={busy}>{busy ? "Saving..." : "Save"}</button></div></form></div>}
    {bulkActivationOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form onSubmit={activatePendingAccounts} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl border border-emerald-400/30 bg-pitch-900 p-6">
        <h2 className="font-display text-xl text-chalk-50">Set team temporary password</h2>
        <p className="text-sm leading-6 text-chalk-300">This will set the same temporary password for <strong className="text-chalk-50">{pendingActivationCount}</strong> active collector account(s), including accounts already marked active. Their current passwords will be replaced. Admin and suspended accounts will not be changed. No email will be sent.</p>
        <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-pitch-700 bg-pitch-950 p-3">{profiles.filter((profile) => profile.role === "collector" && !profile.suspended_at).map((profile) => <div key={profile.id} className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-chalk-100">{profile.full_name || "Unnamed collector"} <span className="font-mono text-xs text-chalk-400">{profile.hr_code || ""}</span></span><span className="text-chalk-300">{profile.email}</span></div>)}</div>
        <label className="block text-sm text-chalk-300">Temporary password<input required minLength={8} type="password" autoComplete="new-password" className="mt-1 w-full rounded-lg border border-pitch-600 bg-pitch-800 px-3 py-2 text-chalk-50" value={bulkPassword} onChange={(event) => setBulkPassword(event.target.value)} /></label>
        <label className="block text-sm text-chalk-300">Confirm temporary password<input required minLength={8} type="password" autoComplete="new-password" className="mt-1 w-full rounded-lg border border-pitch-600 bg-pitch-800 px-3 py-2 text-chalk-50" value={bulkPasswordConfirm} onChange={(event) => setBulkPasswordConfirm(event.target.value)} /></label>
        <p className="rounded-lg border border-amber-400/25 bg-amber-950/30 p-3 text-xs leading-5 text-amber-100">Share the temporary password privately with the team, and ask each collector to change it after signing in. Since this password is shared, avoid using it for any other service.</p>
        <div className="flex justify-end gap-3"><button type="button" className="rounded-lg border border-pitch-500 px-4 py-2 text-chalk-200" onClick={() => setBulkActivationOpen(false)}>Cancel</button><button className="rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-pitch-950 disabled:opacity-50" disabled={busy || pendingActivationCount === 0}>{busy ? "Activating..." : `Activate ${pendingActivationCount} accounts`}</button></div>
      </form>
    </div>}
    {bulkResult && <div role="status" className="rounded-lg border border-pitch-700 bg-pitch-900 p-4 text-sm"><p className="font-semibold text-chalk-50">Bulk password update report</p><p className="mt-1 text-chalk-200">Attempted: {bulkResult.attempted} · Password updated: {bulkResult.activated} · Failed: {bulkResult.failed}</p>{bulkResult.accounts.length > 0 && <div className="mt-3 space-y-1">{bulkResult.accounts.map((account) => <p key={account.id} className="text-emerald-200">{account.name} · {account.hr_code || "No HR-Code"} · {account.email}</p>)}</div>}{bulkResult.failures.length > 0 && <div className="mt-3 space-y-1">{bulkResult.failures.map((failure, index) => <p key={`${failure.email}-${index}`} className="text-red-200">{failure.name} · {failure.hr_code || "No HR-Code"} · {failure.email}: {failure.message}</p>)}</div>}</div>}
    {activationProfile && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={activateAccount} className="w-full max-w-md space-y-4 rounded-xl border border-pitch-600 bg-pitch-900 p-6"><h2 className="font-display text-xl text-chalk-50">{activationProfile.auth_confirmed ? "Set Login Password" : "Activate Account"}</h2><p className="text-sm text-chalk-300">Email: <span className="text-chalk-50">{activationProfile.email}</span></p><label className="block text-sm text-chalk-300">New Password<input required minLength={8} type="password" autoComplete="new-password" className="mt-1 w-full rounded-lg border border-pitch-600 bg-pitch-800 px-3 py-2 text-chalk-50" value={activationPassword} onChange={(event) => setActivationPassword(event.target.value)} /></label><label className="block text-sm text-chalk-300">Confirm Password<input required minLength={8} type="password" autoComplete="new-password" className="mt-1 w-full rounded-lg border border-pitch-600 bg-pitch-800 px-3 py-2 text-chalk-50" value={activationConfirm} onChange={(event) => setActivationConfirm(event.target.value)} /></label><p className="text-xs text-chalk-400">Use at least 8 characters. No email will be sent.</p><div className="flex justify-end gap-3"><button type="button" className="rounded-lg border border-pitch-500 px-4 py-2 text-chalk-200" onClick={() => setActivationProfile(null)}>Cancel</button><button className="rounded-lg bg-pitch-500 px-4 py-2 font-semibold text-pitch-950" disabled={busy}>{busy ? "Saving..." : "Activate Account"}</button></div></form></div>}
  </div>;
}
