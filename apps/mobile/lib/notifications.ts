import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Show alerts as banners while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Cancel all previously scheduled alerts and re-schedule based on current
 * alert state. Called once on app open after the user is authenticated.
 */
export async function scheduleAlertNotifications(alerts: AlertItem[]): Promise<void> {
  if (Platform.OS === 'web') return;

  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  // Cancel existing scheduled notifications to avoid duplicates
  await Notifications.cancelAllScheduledNotificationsAsync();

  const overdueDebtors = alerts.filter((a) => a.type === 'overdue_debtor');
  const lowStockItems = alerts.filter((a) => a.type === 'low_stock');

  // Schedule overdue debtor reminder — fires daily at 9am
  if (overdueDebtors.length > 0) {
    const names = overdueDebtors
      .slice(0, 3)
      .map((a) => `@${a.debtorUsername}`)
      .join(', ');
    const more = overdueDebtors.length > 3 ? ` +${overdueDebtors.length - 3} more` : '';

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ ${overdueDebtors.length} Overdue Debtor${overdueDebtors.length !== 1 ? 's' : ''}`,
        body: `${names}${more} still owe${overdueDebtors.length === 1 ? 's' : ''} you money — 30+ days overdue.`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 9,
        minute: 0,
      },
    });
  }

  // Schedule low-stock reminder — fires daily at 9:05am
  if (lowStockItems.length > 0) {
    const names = lowStockItems
      .slice(0, 3)
      .map((a) => a.productName)
      .join(', ');
    const more = lowStockItems.length > 3 ? ` +${lowStockItems.length - 3} more` : '';

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📦 ${lowStockItems.length} Low-Stock Item${lowStockItems.length !== 1 ? 's' : ''}`,
        body: `${names}${more} running low — restock soon.`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 9,
        minute: 5,
      },
    });
  }
}

export interface AlertItem {
  type: 'overdue_debtor' | 'low_stock';
  // overdue_debtor
  debtorUserId?: string;
  debtorUsername?: string;
  outstandingBalance?: string;
  daysSinceActivity?: number;
  // low_stock
  productName?: string;
  quantityRemaining?: number;
  source?: string;
}
