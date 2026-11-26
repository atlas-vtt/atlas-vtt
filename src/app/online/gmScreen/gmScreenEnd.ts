import { CLOSE } from '../protocol/index.ts';
import { NO_HOSTING_TEXT } from '../gm/account/accountView.ts';
import { OUTDATED_TEXT } from '../gm/gmLevel.ts';
import { t } from '../../i18n';

const NAME = t('gmScreen.name');

/**
 * What the GM reads when the relay closed the GM screen's room for good: it was started in another
 * vault or on another computer (one per account), the account may not host, this Atlas is too old, or
 * the server ended it for any other reason.
 */
export function gmScreenEndText(closeCode: number | null): string {
  if (closeCode === CLOSE.superseded || closeCode === CLOSE.replaced) return t('gmScreen.end.elsewhere', { name: NAME });
  if (closeCode === CLOSE.noAccess) return t('gmScreen.end.noAccess', { name: NAME, reason: NO_HOSTING_TEXT });
  if (closeCode === CLOSE.version) return OUTDATED_TEXT;
  return t('gmScreen.end.refused', { name: NAME });
}
