import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { TOKEN_KEY } from '../lib/api';
import { usePersonaStore } from './persona.store';

interface UserProfile {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  name?: string | null;
  isMiniEmployee?: boolean;
  createdAt: string;
  activeEmployment?: {
    id: string;
    tier: 'FULL' | 'SALES_ONLY';
    status: 'ACTIVE' | 'TERMINATION_REQUESTED';
    employer: { id: string; username: string };
    terminationRequestedBy: string | null;
  } | null;
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isLoading: boolean;
  login: (token: string, user: UserProfile) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isLoading: true,

  login: async (token, user) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    set({ token, user });
    // Resolve persona now that we know whether the user has an active
    // employment. Mobile defaults to 'employer' when employed so an employee's
    // first action (sale, expense, etc.) lands on the employer's books rather
    // than the employee's own (empty) account.
    await usePersonaStore.getState().applyDefaultForUser(user);
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    // Reset persona so the next user logging in on this device starts in Self,
    // not whatever the previous user had selected.
    await usePersonaStore.getState().setKind('self');
    set({ token: null, user: null });
  },

  hydrate: async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) {
      // Token exists — user will be loaded via /auth/me in the layout
      set({ token, isLoading: false });
    } else {
      set({ isLoading: false });
    }
  },
}));
