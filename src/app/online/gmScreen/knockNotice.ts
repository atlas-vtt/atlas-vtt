import { t } from '../../i18n';
import type { GmScreenSession } from './GmScreenSession.ts';

/**
 * Tells the GM once about each device that asks to join while no DM screen shows the control that asks
 * about it: by its name, and where to allow it. Returns what stops it.
 */
export function noticeKnocks(session: Pick<GmScreenSession, 'view' | 'onChange'>, controlShown: () => boolean, notice: (text: string) => void): () => void {
  let told: string | null = null;
  return session.onChange(() => {
    const knock = session.view().knock;
    if (knock === null || knock.id === told) return;
    told = knock.id;
    if (!controlShown()) notice(t('gmScreen.knockNotice', { device: knock.name, name: t('gmScreen.name') }));
  });
}
