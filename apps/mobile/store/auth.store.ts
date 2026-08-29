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
    /** The employer-assigned role, or null when the employee has their tier's defaults. */
    role?: { id: string; name: string } | null;
    /**
     * Every service this employee holds, already expanded and tier-trimmed by the
     * API. Drives what the UI shows; the API enforces the same set independently,
     * so hiding a control is a convenience, never the security boundary.
     */
    services?: string[];
  } | null;
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isLoading: boolean;
  login: (token: string, user: UserProfile) => Promise<void>;
  /**
   * Replace the cached profile without touching the token or persona. Used to
   * pick up a role the employer changed mid-session — the granted services ride
   * on this object, so refreshing it is what re-opens or closes UI.
   */
  setUser: (user: UserProfile) => void;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isLoading: true,

  setUser: (user) => set({ user }),

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
    // Clear the persisted persona choice (not just reset it to 'self') so the
    // next login — same employee or a different user on a shared device —
    // isn't treated as if 'self' were an explicit prior choice. That would
    // permanently skip the "default employees to employer" rule in
    // applyDefaultForUser from this point on. See resetForLogout's own comment.
    await usePersonaStore.getState().resetForLogout();
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
