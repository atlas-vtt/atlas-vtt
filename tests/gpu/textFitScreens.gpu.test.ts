import '../setup/obsidianDom';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { setLocale } from '../../src/app/i18n';
import { TRANSLATIONS } from '../../src/app/i18n/languages';
import { THEME } from './sidePanesHarness';
import { LANGUAGES, describeMisfits, textMisfits } from './textFit';
import { DICE_SURFACES } from './textFitScreensDice';
import { PALETTE_SURFACES } from './textFitScreensPalette';
import { SOUND_SURFACES } from './textFitScreensSound';
import { STATBLOCK_SURFACES } from './textFitScreensStatblocks';

// Services reached from the statblocks load Node's events module.
vi.mock('events', async () => import('eventemitter3'));
// Dice links reach the map view and the token link service; nothing here rolls from a statblock.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

/**
 * Every language Atlas speaks, on the DM screen, the statblock surfaces, the dice and the command palette, at a wide
 * and a narrow window: no text spills out of its box, is cut off without an ellipsis, or lies on a control or on
 * other text.
 */
const SURFACES = [...PALETTE_SURFACES, ...DICE_SURFACES, ...STATBLOCK_SURFACES, ...SOUND_SURFACES];
const WINDOWS = [{ width: 1440, height: 900 }, { width: 760, height: 900 }] as const;

describe('text fits the screens in every language', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => {
    MotionGlobalConfig.skipAnimations = false;
    setLocale('en', TRANSLATIONS);
  });
  beforeEach(() => {
    document.body.className = 'theme-dark';
    document.head.append(style);
  });
  afterEach(() => {
    cleanup();
    style.remove();
  });

  for (const language of LANGUAGES) {
    it(`fits in ${language}`, async () => {
      setLocale(language, TRANSLATIONS);
      const found: string[] = [];
      for (const size of WINDOWS) {
        await page.viewport(size.width, size.height);
        for (const surface of SURFACES) {
          const opened = await surface.open(size);
          try {
            for (const [part, root] of Object.entries(opened.parts)) {
              const name = part ? `${surface.name}, ${part}` : surface.name;
              const roots = [await root()].flat();
              if (roots.length === 0) found.push(`${name} @${size.width}: did not open`);
              for (const element of roots) found.push(...describeMisfits(textMisfits(element)).map((line) => `${name} @${size.width}: ${line}`));
            }
          } finally {
            await opened.close();
            cleanup();
          }
        }
      }
      expect([...new Set(found)]).toEqual([]);
    }, 600_000);
  }
});
