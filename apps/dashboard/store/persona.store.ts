'use client';

import { create } from 'zustand';
import { setActingAs } from '../lib/api';

export type PersonaKind = 'self' | 'employer';

const STORAGE_KEY = 'ta_persona';

interface PersonaState {
  kind: PersonaKind;
  setKind: (kind: PersonaKind) => void;
  hydrate: () => void;
}

function readStored(): PersonaKind {
  if (typeof window === 'undefined') return 'self';
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === 'employer' ? 'employer' : 'self';
}

export const usePersonaStore = create<PersonaState>((set) => ({
  kind: 'self',
  setKind: (kind) => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, kind);
    setActingAs(kind);
    set({ kind });
  },
  hydrate: () => {
    const kind = readStored();
    setActingAs(kind);
    set({ kind });
  },
}));
