import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import glassCss from '../../src/app/packages/components/true-scale/glass.scss?inline';

const BUTTON = '<div class="atlas-tool-button"><span style="display: inline-flex"><button class="btn btn--toolbar btn--icon"><svg></svg></button></span></div>';

/** The glass's chip as `GlassChip` draws it, styled by the plugin's real stylesheet. */
const CHIP = `
  <div class="atlas-vtt-plugin">
    <div class="atlas-vtt-toolbar atlas-glass-chip">
      <span class="atlas-glass-chip__grip"><svg class="atlas-glass-chip__icon"></svg></span>
      ${BUTTON}${BUTTON}
    </div>
  </div>
`;

/**
 * A chip stands over the map at any zoom, so at a low one it is as large as the frame it stands
 * on: it must stay far smaller than a toolbar, whose capsule is 58 px high, and cover little.
 */
describe("the glass's chips", () => {
  const style = document.createElement('style');
  style.textContent = css + glassCss;

  beforeEach(async () => {
    document.head.append(style);
    document.body.insertAdjacentHTML('beforeend', CHIP);
    await page.viewport(800, 600);
  });

  afterEach(() => {
    document.querySelector('.atlas-vtt-plugin')?.remove();
    style.remove();
  });

  it('are small, with their padding and gaps alike', () => {
    const chip = document.querySelector<HTMLElement>('.atlas-glass-chip')!;
    const { width, height } = chip.getBoundingClientRect();
    expect(height).toBeLessThanOrEqual(32);
    expect(width).toBeLessThanOrEqual(90);
    const look = getComputedStyle(chip);
    expect(look.paddingTop).toBe(look.columnGap);
    expect(look.paddingLeft).toBe(look.columnGap);
    expect(chip.querySelector('button')!.getBoundingClientRect().height).toBe(24);
    expect(chip.querySelector('svg')!.getBoundingClientRect().height).toBe(16);
  });

  it('are quiet until the pointer comes to them', () => {
    const chip = document.querySelector<HTMLElement>('.atlas-glass-chip')!;
    expect(Number(getComputedStyle(chip).opacity)).toBeLessThan(1);
  });
});
