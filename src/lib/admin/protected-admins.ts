export const PROTECTED_ADMIN_DEMOTION_MESSAGE = "Protected core admins cannot be demoted.";
export const PROTECTED_ADMIN_HR_CODE_MESSAGE = "Protected core admins cannot have their HR-Code changed.";
export const PROTECTED_ADMIN_EMAIL_MESSAGE = "Protected core admins cannot have their email changed.";
export const PROTECTED_ADMIN_SUSPEND_MESSAGE = "Protected core admins cannot be suspended.";
export const PROTECTED_ADMIN_DELETE_MESSAGE = "Protected core admins cannot be deleted.";
export const PROTECTED_ADMIN_FLAG_MESSAGE = "Protected-admin status cannot be changed.";
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
