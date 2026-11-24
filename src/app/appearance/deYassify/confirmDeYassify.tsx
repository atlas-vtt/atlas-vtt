import React from 'react';
import { createRoot } from 'react-dom/client';
import { createDialogShell } from '../../ui/dialogShell';
import { t } from '../../i18n';
import { DeYassifyGauntlet } from './DeYassifyGauntlet';
import type { DealRound } from './MimicCaptcha';

/**
 * Runs the de-yassify gauntlet in an Atlas dialog. True only once the GM got through all of it; any No, the close
 * button, a press beside the dialog or Escape keeps Yassify on.
 */
export function confirmDeYassify({ random, deal }: { random?: () => number; deal?: DealRound } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const shell = createDialogShell(t('appearance.deYassify.title'), { icon: 'sparkles', onDismiss: () => close(false) });
    const root = createRoot(shell.dialog);
    function close(deYassify: boolean): void {
      if (done) return;
      done = true;
      root.unmount();
      shell.root.remove();
      resolve(deYassify);
    }
    shell.root.addEventListener('click', (event) => {
      if (event.target === shell.root) close(false);
    });
    shell.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close(false);
    });
    root.render(<DeYassifyGauntlet footer={shell.footer} onDone={close} {...(random && { random })} {...(deal && { deal })} />);
  });
}
