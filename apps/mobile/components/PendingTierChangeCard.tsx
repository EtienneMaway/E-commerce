import { View, Text, Pressable } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, employmentsApi } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { getErrorMessage } from '../lib/utils';
import { useT } from '../lib/i18n';
import { showAlert } from '../lib/alert';

/**
 * Surfaces an employer's pending tier-change proposal (mini ↔ full) to
 * whichever employee it is about — unlike custody or handovers, this can hit
 * a full employee just as easily as a mini, so it renders on the shared home
 * tab rather than inside `MiniEmployeeHome`. Renders nothing when there is
 * nothing pending.
 */
export function PendingTierChangeCard() {
  const t = useT();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const pendingTier = user?.activeEmployment?.pendingTier;

  const refreshMe = async () => {
    const token = useAuthStore.getState().token;
    if (token) {
      const me = await authApi.me();
      await login(token, me);
    }
    qc.invalidateQueries();
  };

  const acceptM = useMutation({
    mutationFn: (id: string) => employmentsApi.acceptTierChange(id),
    onSuccess: () => {
      refreshMe();
      showAlert(t.tierChange.acceptedTitle, t.tierChange.acceptedBody);
    },
    onError: (err) => showAlert(t.common.error, getErrorMessage(err)),
  });
  const declineM = useMutation({
    mutationFn: (id: string) => employmentsApi.rejectTierChange(id),
    onSuccess: () => {
      refreshMe();
      showAlert(t.tierChange.declinedTitle, t.tierChange.declinedBody);
    },
    onError: (err) => showAlert(t.common.error, getErrorMessage(err)),
  });

  if (!pendingTier || !user?.activeEmployment) return null;

  const tierName = pendingTier === 'FULL' ? t.tierChange.tierFULL : t.tierChange.tierSALES_ONLY;
  const busy = acceptM.isPending || declineM.isPending;
  const employmentId = user.activeEmployment.id;

  return (
    <View className="bg-primary/10 border border-primary/30 rounded-2xl px-4 py-4 mb-4">
      <Text className="text-text font-bold text-base">{t.tierChange.title}</Text>
      <Text className="text-muted text-sm mt-1">{t.tierChange.body(tierName)}</Text>
      <View className="flex-row gap-2 mt-3">
        <Pressable
          onPress={() => acceptM.mutate(employmentId)}
          disabled={busy}
          className="flex-1 bg-primary rounded-xl py-2.5 items-center"
          style={{ opacity: busy ? 0.5 : 1 }}
        >
          <Text className="text-white font-semibold text-sm">{t.tierChange.accept}</Text>
        </Pressable>
        <Pressable
          onPress={() => declineM.mutate(employmentId)}
          disabled={busy}
          className="px-4 rounded-xl py-2.5 items-center justify-center border border-danger"
          style={{ opacity: busy ? 0.5 : 1 }}
        >
          <Text className="text-danger font-semibold text-sm">{t.tierChange.decline}</Text>
        </Pressable>
      </View>
    </View>
  );
}
