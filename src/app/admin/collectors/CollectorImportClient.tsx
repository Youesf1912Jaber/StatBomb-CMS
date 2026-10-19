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
        ["Total team", profiles.length, "text-chalk-50"],
        ["Admins", stats.admins, "text-fuchsia-200"],
        ["Collectors", stats.collectors, "text-sky-200"],
        ["Active", stats.active, "text-emerald-200"],
      ].map(([label, value, color]) => <div key={label} className="relative min-w-0 overflow-hidden rounded-xl border border-pitch-700 bg-pitch-900/90 p-4 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-pitch-400"><p className="text-xs uppercase tracking-wide text-chalk-400">{label}</p><p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p></div>)}
    </div>
    <section className="min-w-0 rounded-xl border border-pitch-700 bg-pitch-900/95 p-4 shadow-xl shadow-black/20 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl text-chalk-50">Team members</h2><span className="rounded-full border border-pitch-600 bg-pitch-950 px-2.5 py-1 text-xs text-chalk-200">{filtered.length} of {profiles.length}</span></div><p className="mt-1 text-sm text-chalk-300">Manage collector roster fields and application roles.</p></div><div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center"><button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-pitch-500 bg-pitch-800 px-4 py-2.5 text-sm font-semibold text-chalk-50 shadow-sm transition hover:border-pitch-400 hover:bg-pitch-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-300 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={syncTeamRoster}><span aria-hidden="true">↻</span>{busy ? "Working..." : "Sync Team Sheet"}</button><button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-950/60 px-4 py-2.5 text-sm font-semibold text-emerald-100 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || pendingActivationCount === 0} onClick={() => { setBulkResult(null); setBulkActivationOpen(true); }}><span aria-hidden="true">🔑</span>Set team temporary password ({pendingActivationCount})</button><button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-300 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:border-amber-200 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={() => openForm()}><span aria-hidden="true">+</span>Add Collector</button></div></div>
      <input className="mt-5 min-h-11 w-full rounded-lg border border-pitch-600 bg-pitch-950/80 px-4 py-2.5 text-sm text-chalk-50 outline-none transition placeholder:text-chalk-400 focus:border-pitch-400 focus:ring-2 focus:ring-pitch-400/20" placeholder="Search name, HR-Code, or email" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="mt-4 max-w-full overflow-x-auto rounded-xl border border-pitch-700"><table className="w-full min-w-[1180px] text-left text-sm"><thead className="sticky top-0 z-10 bg-pitch-800 text-xs uppercase tracking-wide text-chalk-300"><tr>{["Name", "HR-Code", "Email", "Phone", "Team", "Status", "Role", "Account", "Actions"].map((header) => <th key={header} className="whitespace-nowrap px-3 py-3 font-medium">{header}</th>)}</tr></thead><tbody className="divide-y divide-pitch-700/80">{filtered.map((profile) => <tr key={profile.id} className="bg-pitch-900 text-chalk-100 transition-colors hover:bg-pitch-800/80"><td className="px-3 py-3 font-medium text-chalk-50">{profile.full_name ?? "—"}</td><td className="px-3 py-3 font-mono text-chalk-50">{profile.hr_code ?? "—"}</td><td className="px-3 py-3 text-chalk-200">{profile.email}</td><td className="px-3 py-3 text-chalk-200">{profile.phone ?? "—"}</td><td className="px-3 py-3 text-chalk-200">{profile.team ?? "—"}</td><td className="px-3 py-3"><span className="rounded-full border border-pitch-500 px-2 py-1 text-xs text-chalk-200">{profile.status ?? "Unspecified"}</span></td><td className="px-3 py-3 align-middle"><span className="inline-flex items-center gap-2 whitespace-nowrap"><span className={`whitespace-nowrap rounded-full border px-2 py-1 text-xs font-semibold ${profile.role === "admin" ? "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200" : "border-sky-400/30 bg-sky-400/10 text-sky-200"}`}>{profile.role.toUpperCase()}</span>{shouldShowProtectedAdminBadge(profile) && <span className="whitespace-nowrap rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-200">{PROTECTED_ADMIN_BADGE_LABEL}</span>}</span></td><td className="px-3 py-3 text-xs">{profile.suspended_at ? <span className="text-amber-200">Deactivated</span> : profile.auth_confirmed ? <span className="text-emerald-200">Account Active</span> : <span className="text-amber-200">{profile.auth_user_exists ? "Waiting for activation" : "Auth user missing"}</span>}</td><td className="whitespace-nowrap px-3 py-3"><div className="grid w-[min(100%,340px)] grid-cols-2 items-stretch gap-2"><button className="inline-flex min-h-9 items-center justify-center rounded-md border border-pitch-500 bg-pitch-950 shadow-inner shadow-black/20 px-3 py-2 text-center text-xs font-semibold text-chalk-100 transition hover:border-sky-400/70 hover:bg-pitch-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300" onClick={() => openForm(profile)}>Edit</button>{profile.role === "collector" && <button className="inline-flex min-h-9 items-center justify-center rounded-md border border-amber-400/30 bg-pitch-950 shadow-inner shadow-black/20 px-3 py-2 text-center text-xs font-semibold text-amber-200 transition hover:border-amber-300/60 hover:bg-pitch-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={() => toggleSuspension(profile)}>{profile.suspended_at ? "Reactivate" : "Deactivate"}</button>}{profile.role === "collector" && profile.auth_user_exists && <button className="inline-flex min-h-9 items-center justify-center rounded-md border border-pitch-600 bg-pitch-950 px-3 py-2 text-center text-xs font-semibold text-chalk-200 shadow-inner shadow-black/20 transition hover:border-pitch-400 hover:bg-pitch-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-300 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={() => { setActivationProfile(profile); setActivationPassword(""); setActivationConfirm(""); }}>{profile.auth_confirmed ? "Set Password" : "Activate Account"}</button>}{(shouldShowChangeToCollector(profile) || shouldShowChangeToAdmin(profile)) && <button className="inline-flex min-h-9 items-center justify-center rounded-md border border-pitch-600 bg-pitch-950 px-3 py-2 text-center text-xs font-semibold text-chalk-200 shadow-sm shadow-black/20 transition hover:border-pitch-400 hover:bg-pitch-800 hover:text-chalk-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-300 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={() => changeRole(profile)}>{profile.role === "admin" ? "Change to Collector" : "Change to Admin"}</button>}{profile.role === "collector" && <button className="inline-flex min-h-9 items-center justify-center rounded-md border border-red-500/40 bg-pitch-950 shadow-inner shadow-black/20 px-3 py-2 text-center text-xs font-semibold text-red-200 transition hover:border-red-400/70 hover:bg-red-950/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={() => deleteCollector(profile)}>Delete Collector</button>}</div></td></tr>)}</tbody></table></div>
      {rosterSync && <p role="status" className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-950/50 p-3 text-sm text-emerald-200">Team sheet synchronization complete. Updated: {rosterSync.updated}; skipped: {rosterSync.skipped}; errors: {rosterSync.errors}.</p>}
    </section>
    <section className="min-w-0 space-y-4 rounded-xl border border-pitch-700 bg-pitch-900/95 p-4 shadow-xl shadow-black/20 sm:p-5"><div><h2 className="font-display text-xl text-chalk-50">Import / Provision Collectors</h2><p className="mt-2 text-sm leading-6 text-chalk-300">Required columns: HR-Code, Name, Email, Phone, Team, Status. No emails will be sent.</p></div><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-pitch-500 bg-pitch-800 px-4 py-2 text-sm font-medium text-chalk-50">Choose CSV or XLSX<input className="sr-only" type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><span className="truncate text-sm text-chalk-200">{file?.name ?? "No file selected"}</span></div><button className="rounded-lg bg-pitch-500 px-4 py-2 text-sm font-semibold text-pitch-950 disabled:bg-pitch-700 disabled:text-chalk-400" disabled={!file || busy} onClick={() => submitPreview()}>Preview Import</button>
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
