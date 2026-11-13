import { Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useT } from '../../lib/i18n';
import { usePermissions } from '../../lib/permissions';
import { useAuthStore } from '../../store/auth.store';
import { Button } from './Button';
import { Sheet, SheetPoint } from './Sheet';

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** What they tried to do, e.g. t.denied.featureRecordSale. Omit when unknown (server refusal). */
  readonly feature?: string;
  /** True when the server refused an attempt — adds "nothing was recorded". */
  readonly afterAttempt?: boolean;
}

/**
 * The "your role does not include this" refusal. Deliberately louder than an
 * info sheet: red lit halo with a lock, and a permit slip showing the feature
 * and the role with a NOT INCLUDED stamp landing on it — so an employee reads
 * it as "ask my employer", not as a bug.
 *
 * Opened up-front by forms the role cannot use (RecordSaleModal,
 * SellSizedProductModal), and by AlertHost when a server 403 slips through.
 */
export function RoleDeniedSheet({ visible, onClose, feature, afterAttempt }: Props) {
  const t = useT();
  const { roleName } = usePermissions();
  const employer = useAuthStore((s) => s.user?.activeEmployment?.employer.username);
  const employerLabel = employer ? `@${employer}` : null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      icon="lock"
      tone="danger"
      title={t.denied.title}
      subtitle={employerLabel ? t.denied.subtitle(employerLabel) : t.denied.subtitleNoEmployer}
      actions={<Button label={t.denied.ok} variant="ink" icon="check" onPress={onClose} />}
    >
      <View
        className="rounded-3xl border border-dashed px-5 py-4 mb-4"
        style={{ borderColor: 'rgba(178, 58, 43, 0.45)', backgroundColor: 'rgba(178, 58, 43, 0.06)' }}
      >
        {feature ? (
          <View className="mb-3">
            <Text className="font-mono text-[10px] tracking-[1.5px] text-muted uppercase">{t.denied.featureLabel}</Text>
            <Text className="font-bold text-[19px] text-text mt-0.5">{feature}</Text>
          </View>
        ) : null}
        <View>
          <Text className="font-mono text-[10px] tracking-[1.5px] text-muted uppercase">{t.denied.roleLabel}</Text>
          <Text className="font-bold text-[19px] text-text mt-0.5">{roleName ?? t.denied.defaultRole}</Text>
        </View>

        {/* The stamp: lands a beat after the sheet, slightly askew. */}
        <Animated.View
          entering={ZoomIn.delay(280).springify().damping(9).stiffness(180)}
          className="absolute right-4 top-4 rounded-lg px-2.5 py-1.5"
          style={{ borderWidth: 2, borderColor: '#B23A2B', transform: [{ rotate: '-8deg' }] }}
        >
          <Text className="font-mono-bold text-[11px] tracking-[1.5px]" style={{ color: '#B23A2B' }}>
            {t.denied.stamp}
          </Text>
        </Animated.View>
      </View>

      <SheetPoint
        icon="user-check"
        tone="danger"
        text={employerLabel ? t.denied.pointAsk(employerLabel) : t.denied.pointAskGeneric}
      />
      <SheetPoint
        icon={afterAttempt ? 'shield' : 'refresh-cw'}
        tone="danger"
        text={afterAttempt ? t.denied.pointNothing : t.denied.pointRefresh}
      />
    </Sheet>
  );
}
