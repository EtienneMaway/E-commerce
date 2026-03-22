'use client';

import { create } from 'zustand';
import { setAuthToken } from '../lib/api';

interface User { id: string; username: string; email: string | null; phone: string | null; }

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  login: (token, user) => {
    localStorage.setItem('auth_token', token);
    setAuthToken(token);
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem('auth_token');
    setAuthToken(null);
    set({ token: null, user: null });
  },
  hydrate: () => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      setAuthToken(token);
      set({ token });
    }
  },
}));
