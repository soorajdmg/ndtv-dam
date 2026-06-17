"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSession, signOut as nextAuthSignOut } from "next-auth/react";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "ndtv_dam_token";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_admin: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Track the last googleIdToken we processed so re-renders with the same
  // token (but a new session object reference) don't trigger a second sync.
  const lastGoogleIdToken = useRef<string | undefined>(undefined);

  const fetchMe = useCallback(async (jwt: string): Promise<AuthUser | null> => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) return null;
      return res.json() as Promise<AuthUser>;
    } catch {
      return null;
    }
  }, []);

  const exchangeGoogleToken = useCallback(
    async (googleIdToken: string): Promise<string | null> => {
      try {
        const res = await fetch(`${BASE_URL}/api/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_token: googleIdToken }),
        });
        if (!res.ok) return null;
        const { access_token } = await res.json();
        return access_token as string;
      } catch {
        return null;
      }
    },
    []
  );

  // Use the googleIdToken string (primitive) as a dependency instead of the
  // full session object, which gets a new reference on every NextAuth refresh
  // even when the underlying data hasn't changed.
  const googleIdToken = session?.googleIdToken;

  useEffect(() => {
    if (sessionStatus === "loading") return;

    // Skip if the authenticated session has the same googleIdToken as the
    // last run — nothing meaningful has changed.
    if (sessionStatus === "authenticated" && googleIdToken === lastGoogleIdToken.current) {
      return;
    }

    async function syncAuth() {
      setIsLoading(true);

      if (sessionStatus === "unauthenticated") {
        lastGoogleIdToken.current = undefined;
        // No Google session — check for a still-valid backend JWT in localStorage.
        const stored = localStorage.getItem(TOKEN_KEY);
        if (stored) {
          const u = await fetchMe(stored);
          if (u) {
            setToken(stored);
            setUser(u);
            setIsLoading(false);
            return;
          }
          localStorage.removeItem(TOKEN_KEY);
        }
        setToken(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      // sessionStatus === "authenticated"
      // Try to reuse an existing backend JWT first (avoids an extra exchange on page refresh).
      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored) {
        const u = await fetchMe(stored);
        if (u) {
          lastGoogleIdToken.current = googleIdToken;
          setToken(stored);
          setUser(u);
          setIsLoading(false);
          return;
        }
        localStorage.removeItem(TOKEN_KEY);
      }

      // Exchange the Google ID token for a backend JWT.
      if (!googleIdToken) {
        // Google session exists but id_token wasn't captured — force re-login.
        await nextAuthSignOut({ redirect: false });
        setToken(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      const backendJwt = await exchangeGoogleToken(googleIdToken);
      if (!backendJwt) {
        // Backend rejected the token (account disabled, server error, etc.).
        await nextAuthSignOut({ redirect: false });
        setToken(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      localStorage.setItem(TOKEN_KEY, backendJwt);
      setToken(backendJwt);
      const u = await fetchMe(backendJwt);
      if (u) setUser(u);
      lastGoogleIdToken.current = googleIdToken;
      setIsLoading(false);
    }

    syncAuth();
  }, [sessionStatus, googleIdToken, fetchMe, exchangeGoogleToken]);

  const logout = useCallback(async () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    await nextAuthSignOut({ redirect: false });
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
