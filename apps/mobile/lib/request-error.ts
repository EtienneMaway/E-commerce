import { showAlert } from './alert';
import type { Translations } from './i18n';
import { EXPENSE_OVER_LIMIT, getErrorCode, getErrorMessage, isNetworkError, isTimeoutError } from './utils';

/**
 * Shows a failed request as a branded alert sheet, titled and coloured for
 * what went wrong: no connection, a slow server, a spending limit, or anything
 * else. The message itself comes from `getErrorMessage` — already translated
 * by the API, or plain EN/FR text for connection problems.
 */
export function showRequestError(t: Translations, error: unknown): void {
  const message = getErrorMessage(error);
  if (isTimeoutError(error)) {
    showAlert(t.common.timeoutTitle, message, undefined, { tone: 'warning', icon: 'clock' });
    return;
  }
  if (isNetworkError(error)) {
    showAlert(t.common.offlineTitle, message, undefined, { tone: 'warning', icon: 'wifi-off' });
    return;
  }
  if (getErrorCode(error) === EXPENSE_OVER_LIMIT) {
    showAlert(t.common.overLimitTitle, message, undefined, { tone: 'warning', icon: 'pocket' });
    return;
  }
  showAlert(t.common.errorTitle, message, undefined, { tone: 'danger', icon: 'x-circle' });
}
