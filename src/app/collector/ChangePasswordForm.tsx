"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PasswordField = "current" | "next" | "confirm";

const fieldLabels: Record<PasswordField, string> = {
  current: "Current Password",
  next: "New Password",
  confirm: "Confirm New Password",
};

export function ChangePasswordForm() {
  const [passwords, setPasswords] = useState<Record<PasswordField, string>>({
    current: "",
    next: "",
    confirm: "",
  });
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    current: false,
    next: false,
    confirm: false,
  });
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = createClient();

  function updatePassword(field: PasswordField, value: string) {
    setPasswords((current) => ({ ...current, [field]: value }));
    setMessage(null);
  }

  function toggleVisibility(field: PasswordField) {
    setVisible((current) => ({ ...current, [field]: !current[field] }));
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { current, next, confirm } = passwords;

    if (!current || !next || !confirm) {
      setMessage({ type: "error", text: "Enter your current password and a new password." });
      return;
    }
    if (next.length < 8) {
      setMessage({ type: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (next !== confirm) {
      setMessage({ type: "error", text: "New passwords do not match." });
      return;
    }
    if (current === next) {
      setMessage({ type: "error", text: "New password must be different from your current password." });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.email) {
        setMessage({ type: "error", text: "Your session has expired. Please sign in again." });
        return;
      }

      const { error: verificationError } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: current,
      });
      if (verificationError) {
        setMessage({ type: "error", text: "Current password is incorrect." });
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) {
        setMessage({ type: "error", text: "Unable to change your password. Please try again." });
        return;
      }

      setPasswords({ current: "", next: "", confirm: "" });
      setMessage({ type: "success", text: "Password changed successfully." });
    } catch {
      setMessage({ type: "error", text: "Unable to change your password. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-pitch-700 bg-pitch-900 p-5">
      <div>
        <h2 className="font-display text-lg text-chalk-50">Change Password</h2>
        <p className="mt-1 text-sm text-chalk-200">
          Update the password for your collector account.
        </p>
      </div>
      <form className="mt-4 max-w-xl space-y-4" onSubmit={changePassword}>
        {(["current", "next", "confirm"] as PasswordField[]).map((field) => (
          <label key={field} className="block text-sm text-chalk-200">
            {fieldLabels[field]}
            <div className="mt-1 flex">
              <input
                className="min-w-0 flex-1 rounded-l-[8px] border border-pitch-600 bg-pitch-800 px-3 py-2 text-chalk-50 outline-none focus:border-clock-amber"
                type={visible[field] ? "text" : "password"}
                value={passwords[field]}
                onChange={(event) => updatePassword(field, event.target.value)}
                autoComplete={field === "current" ? "current-password" : "new-password"}
                disabled={busy}
                required
              />
              <button
                type="button"
                className="rounded-r-[8px] border border-l-0 border-pitch-600 bg-pitch-800 px-3 text-xs text-chalk-200 hover:text-chalk-50"
                onClick={() => toggleVisibility(field)}
                aria-label={`${visible[field] ? "Hide" : "Show"} ${fieldLabels[field]}`}
                disabled={busy}
              >
                {visible[field] ? "Hide" : "Show"}
              </button>
            </div>
          </label>
        ))}
        <button
          type="submit"
          className="rounded-[8px] bg-pitch-500 px-4 py-2 text-sm font-semibold text-pitch-950 transition-colors hover:bg-pitch-400 disabled:cursor-not-allowed disabled:bg-pitch-700 disabled:text-chalk-400"
          disabled={busy}
        >
          {busy ? "Changing Password..." : "Change Password"}
        </button>
        {message && (
          <p
            role="status"
            className={message.type === "success" ? "text-sm text-emerald-200" : "text-sm text-red-200"}
          >
            {message.text}
          </p>
        )}
      </form>
    </section>
  );
}
