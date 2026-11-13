import type { AlertButton } from 'react-native';
import { useAlertStore, type QueuedAlert } from '../../lib/alert';
import { useT } from '../../lib/i18n';
import { Button } from './Button';
import { RoleDeniedSheet } from './RoleDeniedSheet';
import { Sheet } from './Sheet';

/**
 * Renders the alerts queued by `showAlert` (lib/alert.ts), one at a time, as
 * branded sheets. Mounted once in app/_layout.tsx.
 *
 * A button's onPress runs after the sheet is dismissed, so an alert raised from
 * inside it queues behind and shows next — the same order the system alert gave.
 */
export function AlertHost() {
  const current = useAlertStore((s) => s.queue[0]);
  const shift = useAlertStore((s) => s.shift);
  const t = useT();

  if (!current) return null;

  const press = (b?: AlertButton): void => {
    shift();
    if (b?.onPress) setTimeout(() => b.onPress?.(), 0);
  };

  // Back / tap outside: behave like the cancel button when there is one; a lone
  // OK is a plain dismissal; a real choice without cancel stays open.
  const dismiss = (): void => {
    if (!current.cancelable) return;
    const cancel = current.buttons.find((b) => b.style === 'cancel');
    if (cancel) return press(cancel);
    if (current.buttons.length === 1) return press(current.buttons[0]);
  };

  if (current.kind === 'denied') {
    return <RoleDeniedSheet key={current.id} visible onClose={() => press(current.buttons[0])} afterAttempt />;
  }

  return (
    <Sheet
      key={current.id}
      visible
      onClose={dismiss}
      icon={current.icon}
      tone={current.tone}
      title={current.title}
      subtitle={current.message}
      actions={<Actions alert={current} onPress={press} okLabel={t.denied.okShort} />}
    />
  );
}

function Actions({
  alert,
  onPress,
  okLabel,
}: {
  alert: QueuedAlert;
  onPress: (b: AlertButton) => void;
  okLabel: string;
}) {
  // Actions first, cancel last — a vertical stack reads top-down.
  const ordered = [
    ...alert.buttons.filter((b) => b.style !== 'cancel'),
    ...alert.buttons.filter((b) => b.style === 'cancel'),
  ];
  const single = ordered.length === 1;
  let primaryUsed = false;
  return (
    <>
      {ordered.map((b, i) => {
        let variant: 'primary' | 'danger' | 'ink' | 'ghost' | 'outline';
        if (b.style === 'cancel') variant = 'ghost';
        else if (b.style === 'destructive') variant = 'danger';
        else if (single) variant = alert.tone === 'primary' ? 'primary' : 'ink';
        else if (!primaryUsed) {
          variant = alert.tone === 'danger' ? 'ink' : 'primary';
          primaryUsed = true;
        } else variant = 'outline';
        return <Button key={`${i}-${b.text}`} label={b.text || okLabel} variant={variant} onPress={() => onPress(b)} />;
      })}
    </>
  );
}
