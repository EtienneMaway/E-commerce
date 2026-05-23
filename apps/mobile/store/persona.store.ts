import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { setActingAs, type ActingAs } from '../lib/api';

const PERSONA_KEY = 'ta_persona';

interface PersonaState {
  kind: ActingAs;
  /** True until `hydrate()` has read the persisted value at app boot. */
  hydrated: boolean;
  setKind: (kind: ActingAs) => Promise<void>;
  hydrate: () => Promise<void>;
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
}));
