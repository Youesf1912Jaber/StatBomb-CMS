export const PROTECTED_ADMIN_DEMOTION_MESSAGE = "Protected core admins cannot be demoted.";
export const PROTECTED_ADMIN_HR_CODE_MESSAGE = "Protected core admins cannot have their HR-Code changed.";
export const PROTECTED_ADMIN_EMAIL_MESSAGE = "Protected core admins cannot have their email changed.";
export const PROTECTED_ADMIN_SUSPEND_MESSAGE = "Protected core admins cannot be suspended.";
export const PROTECTED_ADMIN_DELETE_MESSAGE = "Protected core admins cannot be deleted.";
export const PROTECTED_ADMIN_FLAG_MESSAGE = "Protected-admin status cannot be changed.";
export const PROTECTED_ADMIN_IDENTITY_PRESERVED_MESSAGE = "Protected core admin identity was preserved.";
export const LAST_ADMIN_DEMOTION_MESSAGE = "The last remaining admin cannot be downgraded.";

export class CollectorAuthorizationError extends Error {
  readonly status = 403 as const;

  constructor(message: string) {
    super(message);
    this.name = "CollectorAuthorizationError";
  }
}

export function isCollectorAuthorizationError(error: unknown): error is CollectorAuthorizationError {
  return error instanceof CollectorAuthorizationError;
}

export function isProtectedAdminProfile(
  profile: { is_protected_admin?: boolean | null } | null | undefined
): boolean {
  return profile?.is_protected_admin === true;
}

export function normalizeProtectedHrCode(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

export function normalizeProtectedEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isLastAdminDemotion(
  existing: { role: string },
  nextRole: string,
  profiles: Array<{ role: string }>
): boolean {
  return existing.role === "admin"
    && nextRole === "collector"
    && profiles.filter((profile) => profile.role === "admin").length <= 1;
}

export function assertCanChangeRole(
  existing: { role: string; is_protected_admin?: boolean | null },
  nextRole: "admin" | "collector",
  profiles: Array<{ role: string }>
): void {
  if (isProtectedAdminProfile(existing) && nextRole !== "admin") {
    throw new CollectorAuthorizationError(PROTECTED_ADMIN_DEMOTION_MESSAGE);
  }
  if (isLastAdminDemotion(existing, nextRole, profiles)) {
    throw new Error(LAST_ADMIN_DEMOTION_MESSAGE);
  }
}

export function assertCanSaveProfile(
  existing: { role: string; hr_code: string | null; email: string; is_protected_admin?: boolean | null } | undefined,
  input: {
    role?: string | null;
    hr_code?: string | null;
    email?: string | null;
    is_protected_admin?: boolean | null;
  }
): void {
  if (input.is_protected_admin !== undefined && input.is_protected_admin !== (existing?.is_protected_admin ?? false)) {
    throw new CollectorAuthorizationError(PROTECTED_ADMIN_FLAG_MESSAGE);
  }
  if (!existing || !isProtectedAdminProfile(existing)) return;
  if (input.role != null && input.role !== "admin") {
    throw new CollectorAuthorizationError(PROTECTED_ADMIN_DEMOTION_MESSAGE);
  }
  if (normalizeProtectedHrCode(input.hr_code) !== normalizeProtectedHrCode(existing.hr_code)) {
    throw new CollectorAuthorizationError(PROTECTED_ADMIN_HR_CODE_MESSAGE);
  }
  if (normalizeProtectedEmail(input.email) !== normalizeProtectedEmail(existing.email)) {
    throw new CollectorAuthorizationError(PROTECTED_ADMIN_EMAIL_MESSAGE);
  }
}

export function assertCanSuspendProfile(
  profile: { is_protected_admin?: boolean | null } | null | undefined
): void {
  if (isProtectedAdminProfile(profile)) {
    throw new CollectorAuthorizationError(PROTECTED_ADMIN_SUSPEND_MESSAGE);
  }
}

export function assertCanDeleteProfile(
  profile: { is_protected_admin?: boolean | null } | null | undefined
): void {
  if (isProtectedAdminProfile(profile)) {
    throw new CollectorAuthorizationError(PROTECTED_ADMIN_DELETE_MESSAGE);
  }
}

type ProtectedRosterIdentity = {
  role: "admin" | "collector";
  hr_code: string | null;
  email: string;
  is_protected_admin?: boolean | null;
};

export type TeamRosterIncoming = {
  hr_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  team: string | null;
  status: string | null;
};

export type TeamRosterProfileUpdatePlan =
  | { outcome: "skipped"; message: string }
  | { outcome: "error"; message: string }
  | {
      outcome: "update";
      message: string;
      authEmail?: string;
      fields: {
        full_name: string;
        phone: string | null;
        team: string | null;
        status: string | null;
        email?: string;
        hr_code?: string;
      };
    };

export function protectedAdminIdentityWouldChange(
  existing: ProtectedRosterIdentity | null | undefined,
  incoming: { hr_code?: string | null; email?: string | null }
): boolean {
  if (!existing || !isProtectedAdminProfile(existing)) return false;
  return normalizeProtectedHrCode(incoming.hr_code) !== normalizeProtectedHrCode(existing.hr_code)
    || normalizeProtectedEmail(incoming.email) !== normalizeProtectedEmail(existing.email);
}

export function buildCollectorImportProfileWrite(
  existing: ProtectedRosterIdentity | null | undefined,
  row: { email: string; hr_code: string; full_name: string; phone: string | null; team: string | null; status: string | null }
) {
  if (existing && isProtectedAdminProfile(existing)) {
    return {
      email: existing.email,
      hr_code: existing.hr_code ?? row.hr_code,
      full_name: row.full_name,
      phone: row.phone,
      team: row.team,
      status: row.status,
      role: existing.role,
    };
  }
  return {
    email: row.email,
    hr_code: row.hr_code,
    full_name: row.full_name,
    phone: row.phone,
    team: row.team,
    status: row.status,
    role: existing?.role ?? "collector",
  };
}

export function planTeamRosterProfileUpdate(
  existing: ProtectedRosterIdentity | undefined,
  row: TeamRosterIncoming
): TeamRosterProfileUpdatePlan {
  if (!existing) {
    return {
      outcome: "skipped",
      message: "No existing profile matched this HR-Code; no Auth user or profile was created.",
    };
  }
  if (!row.full_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    return { outcome: "error", message: "Name and a valid email are required." };
  }
  if (protectedAdminIdentityWouldChange(existing, row)) {
    return { outcome: "skipped", message: PROTECTED_ADMIN_IDENTITY_PRESERVED_MESSAGE };
  }
  if (isProtectedAdminProfile(existing)) {
    return {
      outcome: "update",
      message: `Updated ${existing.role} profile roster fields.`,
      fields: {
        full_name: row.full_name,
        phone: row.phone,
        team: row.team,
        status: row.status,
      },
    };
  }
  return {
    outcome: "update",
    message: `Updated ${existing.role} profile roster fields.`,
    authEmail: normalizeProtectedEmail(existing.email) !== normalizeProtectedEmail(row.email) ? row.email : undefined,
    fields: {
      full_name: row.full_name,
      email: row.email,
      hr_code: row.hr_code,
      phone: row.phone,
      team: row.team,
      status: row.status,
    },
  };
}
