/** Who is signed in, and what they are allowed to do.
 *
 * The token is the only thing stored; the role inside it is a convenience for hiding controls the
 * server would refuse anyway. Every gate here has a matching gate in `backend/auth.py` — hiding a
 * button is presentation, not access control, and the two must never be confused.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, clearToken, readToken, storeToken } from "@/api/client";
import type { AuthUser, Role } from "@/api/types";

type AuthState = {
  user: AuthUser | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  /** True when the signed-in user holds one of these roles. */
  can: (...roles: Role[]) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // A stored token is only trusted once the server confirms it still resolves to a live account.
  useEffect(() => {
    if (!readToken()) {
      setReady(true);
      return;
    }
    let cancelled = false;
    api.me()
      .then((me) => !cancelled && setUser(me))
      .catch(() => {
        if (cancelled) return;
        clearToken();
        setUser(null);
      })
      .finally(() => !cancelled && setReady(true));
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await api.login(email, password);
    storeToken(session.token);
    setUser(session.user);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, ready, signIn, signOut, can: (...roles) => Boolean(user && roles.includes(user.role)) }),
    [user, ready, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
