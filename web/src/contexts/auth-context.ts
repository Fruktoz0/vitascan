import { createContext } from 'react';
import type { ProfileUser } from '../api/profile';

export type AuthContextValue = {
  user: ProfileUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
