import { request } from './client';

export type ProfileUser = {
  id: string;
  username: string;
  email: string;
  role: string;
  reputation: number;
  createdAt: string;
  profile: unknown;
  badges?: string[];
};

export function getMe() {
  return request<ProfileUser>('/profile/me');
}
