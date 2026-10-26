// Shared access rules used by both the client (UI gating) and the server
// (enforcement). Keep these in one place so the two never drift apart.

// Only these users may import/export client data — matched by exact full name.
export const IMPORT_EXPORT_ALLOWED_NAMES = [
  "Цілюрик Юрій Вікторович",
  "Безугла Людмила Анатоліївна",
];

// Roles allowed to manage users, passwords and CRM settings.
export const MANAGER_ROLES = ["director", "executive_director", "admin"];

export function isImportExportAllowed(fullName?: string | null): boolean {
  return !!fullName && IMPORT_EXPORT_ALLOWED_NAMES.includes(fullName);
}

export function isManagerRole(role?: string | null): boolean {
  return !!role && MANAGER_ROLES.includes(role);
}
