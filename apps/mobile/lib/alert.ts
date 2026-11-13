import { Alert, Platform, type AlertButton } from 'react-native';
import { create } from 'zustand';
import type { IconName } from '../components/ui/Icon';
import type { SheetTone } from '../components/ui/Sheet';

/**
 * Branded replacement for `Alert.alert`: same arguments, rendered by
 * `components/ui/AlertHost.tsx` as a lit bottom sheet in the app's palette
 * instead of the bare white system dialog.
 *
 * Tone and icon are inferred (errors red, confirmations of destructive actions
 * red, successes green, everything else neutral) and can be forced with the
 * 4th argument. A server "your role does not include this feature" refusal is
 * recognised in any message and gets the dedicated denial sheet.
 *
 * iOS keeps the native alert: RN cannot present a second modal over an open
 * pageSheet form there, and most alerts fire from inside one. Android stacks
 * modal dialogs, so the sheet shows on top of forms.
 */
export type AlertKind = 'plain' | 'denied';

export interface AlertOptions {
  readonly cancelable?: boolean;
  readonly tone?: SheetTone;
  readonly icon?: IconName;
}

export interface QueuedAlert {
  readonly id: number;
  readonly kind: AlertKind;
  readonly title: string;
  readonly message?: string;
  readonly buttons: AlertButton[];
  readonly tone: SheetTone;
  readonly icon: IconName;
  readonly cancelable: boolean;
}

interface AlertState {
  queue: QueuedAlert[];
  push: (a: QueuedAlert) => void;
  shift: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  queue: [],
  push: (a) => set((s) => ({ queue: [...s.queue, a] })),
  shift: () => set((s) => ({ queue: s.queue.slice(1) })),
}));

let nextId = 1;

/** The API guard's refusals (EN + FR), matched anywhere in a message. */
const DENIED_PATTERNS = [
  /role does not include this feature/i,
  /rôle ne comprend pas cette fonctionnalité/i,
  /not permitted for mini employees/i,
  /pas autorisée pour les mini-employés/i,
  /not permitted while acting on behalf of an employer/i,
  /lorsque vous agissez pour le compte d'un employeur/i,
];

export function isRoleDenied(text: string | undefined): boolean {
  return !!text && DENIED_PATTERNS.some((p) => p.test(text));
}

const DANGER_TITLE = /error|erreur|fail|échou|impossible|could ?n[o']t|refus|declin|not handed|not approved/i;
/** Something to fix in the form rather than a failure: amber, not red. */
const VALIDATION_TITLE = /invalid|invalide|missing|manquant|required|requis|select|sélection|choose|choisi|no products|aucun produit|too large|trop/i;
const SUCCESS_TITLE = /✅|saved|enregistr|success|réussi|done|sent|envoy|received|reçu|approved|approuv|taken|pris|paid|payé|updated|mis à jour|accepted|accepté|queued|en attente|ok\b/i;

function infer(title: string, buttons: AlertButton[]): { tone: SheetTone; icon: IconName } {
  if (buttons.some((b) => b.style === 'destructive')) return { tone: 'danger', icon: 'alert-triangle' };
  if (DANGER_TITLE.test(title)) return { tone: 'danger', icon: 'x-circle' };
  if (VALIDATION_TITLE.test(title)) return { tone: 'warning', icon: 'alert-circle' };
  if (buttons.length > 1) return { tone: 'warning', icon: 'help-circle' };
  if (SUCCESS_TITLE.test(title)) return { tone: 'primary', icon: 'check-circle' };
  return { tone: 'primary', icon: 'info' };
}

/** Strip emoji used as a stand-in icon ('✅') — the sheet draws a real one. */
function cleanTitle(title: string): string {
  return title.replace(/[☀-➿\u{1F300}-\u{1FAFF}️]/gu, '').trim();
}

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
): void {
  if (Platform.OS === 'ios') {
    Alert.alert(title, message, buttons, options);
    return;
  }
  let t = cleanTitle(title ?? '');
  let m = message;
  // An emoji-only title ('✅', msg) — promote the message to the headline.
  if (!t && m) {
    t = m;
    m = undefined;
  }
  const list = buttons?.length ? buttons : [{ text: 'OK' }];
  const denied = isRoleDenied(m) || isRoleDenied(t);
  const inferred = infer(title ?? '', list);
  useAlertStore.getState().push({
    id: nextId++,
    kind: denied ? 'denied' : 'plain',
    title: t,
    message: m,
    buttons: list,
    tone: options?.tone ?? (denied ? 'danger' : inferred.tone),
    icon: options?.icon ?? (denied ? 'lock' : inferred.icon),
    // Matches what people expect from a sheet: back / tap outside closes it.
    cancelable: options?.cancelable ?? true,
  });
}
