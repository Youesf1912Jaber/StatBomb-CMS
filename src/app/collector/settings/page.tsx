import { ChangePasswordForm } from "../ChangePasswordForm";

export default function CollectorAccountSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-chalk-50">Account Settings</h1>
        <p className="mt-1 text-sm text-chalk-200">
          Manage your collector account securely.
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
