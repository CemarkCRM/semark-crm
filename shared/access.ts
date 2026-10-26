// Shared access rules used by both the client (UI gating) and the server
// (enforcement). Keep these in one place so the two never drift apart.

// Only these roles may import/export client data.
export const IMPORT_EXPORT_ROLES = ["director", "executive_director"];

export const MIN_PASSWORD_LENGTH = 10;

// Roles allowed to manage users, passwords and CRM settings.
export const MANAGER_ROLES = ["director", "executive_director", "admin"];

export function isImportExportAllowed(role?: string | null): boolean {
  return !!role && IMPORT_EXPORT_ROLES.includes(role);
}

export function isManagerRole(role?: string | null): boolean {
  return !!role && MANAGER_ROLES.includes(role);
}
