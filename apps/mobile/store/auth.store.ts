import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOKEN_KEY } from '../lib/api';
import { usePersonaStore } from './persona.store';
import { useShopStore, type OrganizationSummary, type ShopSummary } from './shop.store';

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
    /** Tier the employer has proposed changing this employment to, awaiting accept/reject. */
    pendingTier?: 'FULL' | 'SALES_ONLY' | null;
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
  /** The business these books belong to — the employer's for an employee. */
  organization?: OrganizationSummary | null;
  /** Branches this account can work in: every branch for an owner, one for an employee. */
  shops?: ShopSummary[];
  defaultShopId?: string | null;
}

/** Hand the branch context from `/auth/me` to the shop store. */
/**
 * The last profile from /auth/me, kept on the device so a cold start (and an
 * offline one) knows the name, the employment and its granted services at once
 * — before this, the profile only existed in memory and the app opened with no
 * name, no persona switcher and no role limits until /auth/me answered.
 */
const USER_KEY = 'auth_user_profile';

function saveProfile(user: UserProfile): void {
  void AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {
    /* storage full / unavailable — the in-memory profile still works */
  });
}

function applyShopContext(user: UserProfile): Promise<void> {
  return useShopStore.getState().setContext({
    shops: user.shops ?? [],
    organization: user.organization ?? null,
    defaultShopId: user.defaultShopId ?? null,
    employed: !!user.activeEmployment,
  });
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

  setUser: (user) => {
    set({ user });
    saveProfile(user);
    // A refreshed profile can carry a new branch (a transfer accepted, a branch
    // closed) — keep the header in step with it.
    void applyShopContext(user);
  },

  login: async (token, user) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    set({ token, user });
    saveProfile(user);
    // Resolve persona now that we know whether the user has an active
    // employment. Mobile defaults to 'employer' when employed so an employee's
    // first action (sale, expense, etc.) lands on the employer's books rather
    // than the employee's own (empty) account.
    await usePersonaStore.getState().applyDefaultForUser(user);
    // Same reasoning for the branch: resolve it before the first query leaves.
    await applyShopContext(user);
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY).catch(() => undefined);
    // Clear the persisted persona choice (not just reset it to 'self') so the
    // next login — same employee or a different user on a shared device —
    // isn't treated as if 'self' were an explicit prior choice. That would
    // permanently skip the "default employees to employer" rule in
    // applyDefaultForUser from this point on. See resetForLogout's own comment.
    await usePersonaStore.getState().resetForLogout();
    // A shared phone must not carry one merchant's branch into the next login.
    await useShopStore.getState().resetForLogout();
    set({ token: null, user: null });
  },

  hydrate: async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) {
      // Restore the saved profile at once; the layout refreshes it from
      // /auth/me in the background.
      let user: UserProfile | null = null;
      try {
        const raw = await AsyncStorage.getItem(USER_KEY);
        user = raw ? (JSON.parse(raw) as UserProfile) : null;
      } catch {
        user = null;
      }
      set({ token, user, isLoading: false });
    } else {
      set({ isLoading: false });
    }
  },
}));
