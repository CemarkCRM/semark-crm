import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User } from "@shared/schema";
import {
  IMPORT_EXPORT_ALLOWED_NAMES,
  isImportExportAllowed,
  isManagerRole,
} from "@shared/access";
import {
  apiRequest,
  queryClient,
  setAuthToken,
  setUnauthorizedHandler,
} from "@/lib/queryClient";

export { IMPORT_EXPORT_ALLOWED_NAMES };
export const ADMIN_ROLES = ["director", "executive_director", "admin"];

export function canImportExport(user?: User | null) {
  return isImportExportAllowed(user?.fullName);
}

export function canManageUsers(user?: User | null) {
  return isManagerRole(user?.role);
}

export type LoginResult = { user: User; token: string; expiresAt: number };

export type CurrentUserContextValue = {
  currentUser: User | null;
  currentUserId: number | null;
  token: string | null;
  login: (result: LoginResult) => void;
  logout: () => void;
  canImportExport: boolean;
  canManageUsers: boolean;
};

export const CurrentUserContext = createContext<CurrentUserContextValue>({
  currentUser: null,
  currentUserId: null,
  token: null,
  login: () => {},
  logout: () => {},
  canImportExport: false,
  canManageUsers: false,
});

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}

// In-memory session only — no localStorage/sessionStorage/cookies. The token is
// kept in React state and mirrored into the query client so fetches can attach
// the Authorization header. Refresh clears the session (login required again).
export function useAuthProvider(): CurrentUserContextValue {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const logout = useCallback(() => {
    // Best-effort server-side revoke; ignore failures.
    apiRequest("POST", "/api/auth/logout").catch(() => {});
    setCurrentUser(null);
    setToken(null);
    setAuthToken(null);
    queryClient.clear();
  }, []);

  const login = useCallback((result: LoginResult) => {
    setAuthToken(result.token);
    setToken(result.token);
    setCurrentUser(result.user);
    // Drop any cached data fetched while logged out / as a previous user.
    queryClient.clear();
  }, []);

  // On 401 anywhere, clear the in-memory session so the login screen shows.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setCurrentUser(null);
      setToken(null);
      setAuthToken(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  return {
    currentUser,
    currentUserId: currentUser?.id ?? null,
    token,
    login,
    logout,
    canImportExport: canImportExport(currentUser),
    canManageUsers: canManageUsers(currentUser),
  };
}
