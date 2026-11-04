import '../setup/obsidianDom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { mountRecoveryEditor, RECOVERY_THEME } from './recoveryPaneHarness';

vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const shot = (name: string): Promise<string> => page.screenshot({ path: `__screenshots__/recovery-editor/${name}.png` });

/**
 * The recovery buttons of the template editor through their states with real motion, for judging by eye: the screenshots land
 * in `tests/gpu/__screenshots__/recovery-editor/`. Its only assertion is that each state drew.
 */
describe('the recovery buttons in the template editor, as they look', () => {
  const style = document.createElement('style');
  style.textContent = RECOVERY_THEME + css;
  beforeEach(() => { document.head.append(style); });
  afterEach(() => { cleanup(); style.remove(); });

  for (const theme of ['dark', 'light'] as const) {
    it(`draws its states (${theme})`, async () => {
      await page.viewport(1440, 900);
      mountRecoveryEditor(theme);
      await wait(600);
      await shot(`1-short-rest-${theme}`);

      await userEvent.click(page.getByRole('button', { name: /^Long rest/ }));
      await wait(600);
      await shot(`2-long-rest-${theme}`);

      await userEvent.click(page.getByRole('button', { name: /^HP: Full/ }));
      await wait(600);
      await shot(`3-full-card-${theme}`);

      await userEvent.click(page.getByRole('radio', { name: 'Amount' }));
      await wait(600);
      await shot(`4-amount-card-${theme}`);

      // The card hangs over the rows under HP: Escape puts it away first
      await userEvent.keyboard('{Escape}');
      await userEvent.click(page.getByRole('button', { name: /^Stress: →/ }));
      await userEvent.click(page.getByRole('radio', { name: 'Spend' }));
      await wait(500);
      await shot(`5-spending-${theme}`);
      await userEvent.click(page.getByRole('button', { name: /^Hit Dice:/ }));
      await wait(600);
      await shot(`6-spend-card-${theme}`);

      await userEvent.keyboard('{Escape}{Escape}');
      await userEvent.click(page.getByRole('button', { name: /^Exhaustion:/ }));
      await wait(600);
      await shot(`7-condition-card-${theme}`);
      expect(document.querySelector('.atlas-rc-card')).not.toBeNull();
    }, 60_000);
  }
});
