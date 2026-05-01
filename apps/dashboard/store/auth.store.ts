'use client';

import { create } from 'zustand';
import { setAuthToken } from '../lib/api';

export interface ActiveEmployment {
  id: string;
  tier: 'FULL' | 'SALES_ONLY';
  status: 'ACTIVE' | 'TERMINATION_REQUESTED';
  employer: { id: string; username: string };
  terminationRequestedBy: string | null;
}

interface User {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  isMiniEmployee?: boolean;
  activeEmployment?: ActiveEmployment | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  login: (token, user) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    setAuthToken(token);
    set({ token, user });
  },
  setUser: (user) => {
    localStorage.setItem('auth_user', JSON.stringify(user));
    set({ user });
  },
  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setAuthToken(null);
    set({ token: null, user: null });
  },
  hydrate: () => {
    const token = localStorage.getItem('auth_token');
    const userJson = localStorage.getItem('auth_user');
    if (token) {
      setAuthToken(token);
      const user = userJson ? (JSON.parse(userJson) as User) : null;
      set({ token, user });
    }
  },
}));
