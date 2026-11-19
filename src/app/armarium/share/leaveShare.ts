import { t } from '../../i18n';
import { showNotice } from '../../ui/notice';
import type { ShareSession } from '../upload/ShareSession';

/** Leaves a share as Close does: its upload is discarded from the Armarium, and the GM hears when that happens. */
export async function leaveShare(session: ShareSession): Promise<void> {
  const outcome = await session.abandon();
  if (outcome === 'discarded') showNotice(t('armariumShare.leftDiscarded'));
  else if (outcome === 'after-checks') showNotice(t('armariumShare.leftAfterChecks'));
}
