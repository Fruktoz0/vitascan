import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ApiError,
  refreshAccessTokenFromStorage,
  getStoredRefreshToken,
} from '../api/client';
import * as authApi from '../api/auth';
import { getMe, type ProfileUser } from '../api/profile';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getStoredRefreshToken()) {
        const ok = await refreshAccessTokenFromStorage();
        if (cancelled) return;
        if (ok) {
          try {
            const me = await getMe();
            if (cancelled) return;
            if (me.role === 'ADMIN') setUser(me);
            else authApi.clearTokens();
          } catch {
            authApi.clearTokens();
          }
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    authApi.persistSession(res.accessToken, res.refreshToken);
    const me = await getMe();
    if (me.role !== 'ADMIN') {
      authApi.clearTokens();
      setUser(null);
      throw new ApiError(403, 'Nincs admin jogosultság ehhez a fiókhoz.');
    }
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logoutApi();
    authApi.clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, logout }),
    [user, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
