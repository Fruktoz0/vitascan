import {
  request,
  setAccessToken,
  setStoredRefreshToken,
  getStoredRefreshToken,
} from './client';

export type LoginUser = {
  id: string;
  username: string;
  email: string;
  role: string;
};

export async function login(email: string, password: string) {
  return request<{
    accessToken: string;
    refreshToken: string;
    user: LoginUser;
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logoutApi() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return;
  try {
    await request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    /* best effort */
  }
}

export function persistSession(access: string, refresh: string) {
  setAccessToken(access);
  setStoredRefreshToken(refresh);
}

export function clearTokens() {
  setAccessToken(null);
  setStoredRefreshToken(null);
}
