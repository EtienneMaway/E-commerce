import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { usePersonaStore } from '../../store/persona.store';
import { useT } from '../../lib/i18n';
import type { ActingAs } from '../../lib/api';

/**
 * Header chip that opens a Self / Employer modal. Renders nothing for users
 * without an active employment. On switch:
 *   1. Persists new persona (via persona store).
 *   2. Updates the axios interceptor's module-level _actingAs.
 *   3. Calls `qc.resetQueries()` so mounted screens refetch with the new
 *      X-Acting-As header — prevents stale Self data from bleeding into an
 *      Employer view (or vice versa).
 */
export function PersonaSwitcher() {
  const t = useT();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { kind, setKind } = usePersonaStore();
  const [open, setOpen] = useState(false);

  const employment = user?.activeEmployment;
  if (!employment) return null;

  const employerName = employment.employer.username;
  const isEmployerMode = kind === 'employer';

  const choose = async (next: ActingAs) => {
    setOpen(false);
    if (next === kind) return;
    await setKind(next);
    qc.resetQueries();
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${
          isEmployerMode
            ? 'bg-indigo-100 dark:bg-indigo-950 border border-indigo-300 dark:border-indigo-800'
            : 'bg-card dark:bg-slate-800 border border-border dark:border-slate-700'
        }`}
        accessibilityLabel={t.persona.switchTo}
      >
        <Text className="text-xs">{isEmployerMode ? '🪪' : '👤'}</Text>
        <Text
          numberOfLines={1}
          className={`text-xs font-semibold max-w-[100px] ${
            isEmployerMode ? 'text-indigo-700 dark:text-indigo-300' : 'text-muted dark:text-slate-400'
          }`}
        >
          {isEmployerMode ? t.persona.actingBanner(employerName) : t.persona.self}
        </Text>
        <Text className={`text-[10px] ${isEmployerMode ? 'text-indigo-700 dark:text-indigo-300' : 'text-muted dark:text-slate-500'}`}>
          ▾
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/40 items-center justify-center px-6"
          onPress={() => setOpen(false)}
        >
          <Pressable
            className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="px-4 py-3 border-b border-border dark:border-slate-700">
              <Text className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-slate-500">
                {t.persona.viewAs}
              </Text>
            </View>

            <Pressable
              onPress={() => choose('self')}
              className={`flex-row items-start gap-3 px-4 py-3.5 ${
                kind === 'self' ? 'bg-surface dark:bg-slate-900' : ''
              }`}
            >
              <Text className="text-lg mt-0.5">👤</Text>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-text dark:text-slate-100">
                  {t.persona.self}
                </Text>
                <Text className="text-xs text-muted dark:text-slate-400 mt-0.5">
                  {t.persona.selfSub}
                </Text>
              </View>
              {kind === 'self' && <Text className="text-primary text-base">✓</Text>}
            </Pressable>

            <Pressable
              onPress={() => choose('employer')}
              className={`flex-row items-start gap-3 px-4 py-3.5 border-t border-border dark:border-slate-700 ${
                kind === 'employer' ? 'bg-indigo-50 dark:bg-indigo-950' : ''
              }`}
            >
              <Text className="text-lg mt-0.5">🪪</Text>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-text dark:text-slate-100">
                  {t.persona.employer(employerName)}
                </Text>
                <Text className="text-xs text-muted dark:text-slate-400 mt-0.5">
                  {t.persona.employerSub(employerName)}
                </Text>
                {employment.status === 'TERMINATION_REQUESTED' && (
                  <Text className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    · {t.persona.terminationPending}
                  </Text>
                )}
              </View>
              {kind === 'employer' && (
                <Text className="text-indigo-600 dark:text-indigo-300 text-base">✓</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
