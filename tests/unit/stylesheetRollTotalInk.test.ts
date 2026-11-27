import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import * as sass from 'sass';

/**
 * A roll's total is written in the text's ink wherever Atlas shows it: the dice panel, its result card, the dice log and
 * the table log. The accent is the GM's pick from Appearance settings and may be any colour: a red total reads as a
 * failure and a pale one barely reads at all. Only a critical's total takes a colour, the crit's own.
 */

const MAIN = fileURLToPath(new URL('../../styles/main.scss', import.meta.url));
const TOTALS = ['atlas-dice-toast__total', 'dice-log-entry__total', 'atlas-online-log__roll-total'];
/** A total in a state where it may take another ink: a critical, or dice still in the air. */
const STATE = /crit|is-rolling/;

/** The ink each resting total is given, as `selector: value`. */
function restingInks(css: string): string[] {
  const inks: string[] = [];
  postcss.parse(css).walkDecls('color', (declaration) => {
    const rule = declaration.parent;
    if (rule?.type !== 'rule') return;
    for (const selector of (rule as postcss.Rule).selectors) {
      if (STATE.test(selector) || !TOTALS.some((total) => new RegExp(`\\.${total}$`).test(selector))) continue;
      inks.push(`${selector.split(' ').pop() ?? selector}: ${declaration.value}`);
    }
  });
  return inks;
}

describe("a roll's total", { timeout: 30_000 }, () => {
  it('is found with the ink its rule gives it', () => {
    expect(restingInks('.a .dice-log-entry__total { color: var(--interactive-accent); }'))
      .toEqual(['.dice-log-entry__total: var(--interactive-accent)']);
    expect(restingInks('.a--crit-fail .dice-log-entry__total { color: red; } .x__total.is-rolling { color: grey; }')).toEqual([]);
  });

  it("is written in the text's ink everywhere Atlas shows one", () => {
    const inks = restingInks(sass.compile(MAIN, { logger: sass.Logger.silent }).css);
    expect(inks.length).toBeGreaterThanOrEqual(TOTALS.length);
    expect(inks.filter((ink) => !ink.endsWith(': var(--text-normal)'))).toEqual([]);
  });
});
