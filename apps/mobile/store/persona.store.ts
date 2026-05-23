import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { setActingAs, type ActingAs } from '../lib/api';

const PERSONA_KEY = 'ta_persona';

interface UserLike {
  activeEmployment?: { id: string } | null;
}

interface PersonaState {
  kind: ActingAs;
  /** True until `hydrate()` has read the persisted value at app boot. */
  hydrated: boolean;
  setKind: (kind: ActingAs) => Promise<void>;
  hydrate: () => Promise<void>;
  /**
   * Resolves the right persona for a freshly-loaded user. Called from
   * auth.store after /auth/me or /auth/login returns.
   *
   * Rules:
   *   - If the user has previously made an explicit choice (persisted in
   *     SecureStore), respect it.
   *   - Else, if the user currently has an activeEmployment, default to
   *     'employer'. This is the mobile-specific default: phones are mostly
   *     used by employees acting on the employer's behalf, so out-of-the-box
   *     the app should record actions on the employer's books unless the user
   *     deliberately flips to Self.
   *   - Else default to 'self'.
   *
   * The defaulted value is NOT persisted — so if the user later accepts or
   * leaves an employment, the next login re-applies the rule.
   */
  applyDefaultForUser: (user: UserLike | null | undefined) => Promise<void>;
}

export const usePersonaStore = create<PersonaState>((set) => ({
  kind: 'self',
  hydrated: false,

  setKind: async (kind) => {
    setActingAs(kind);
    await SecureStore.setItemAsync(PERSONA_KEY, kind);
    set({ kind });
  },

  hydrate: async () => {
    const raw = await SecureStore.getItemAsync(PERSONA_KEY);
    const kind: ActingAs = raw === 'employer' ? 'employer' : 'self';
    setActingAs(kind);
    set({ kind, hydrated: true });
  },

  applyDefaultForUser: async (user) => {
    const raw = await SecureStore.getItemAsync(PERSONA_KEY);
    let kind: ActingAs;
    if (raw === 'self' || raw === 'employer') {
      kind = raw;
    } else if (user?.activeEmployment) {
      kind = 'employer';
    } else {
      kind = 'self';
    }
    setActingAs(kind);
    set({ kind, hydrated: true });
  },
}));
