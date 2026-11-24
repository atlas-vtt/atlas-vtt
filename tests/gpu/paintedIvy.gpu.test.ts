import { afterEach, expect, it } from 'vitest';
import css from '../../styles/looks/atlas-looks.css?inline';
import { PAINTED_IVY_CLASS, paintIvy } from '../../src/app/appearance/paintedIvy';
import { ivyPalette } from '../../src/app/appearance/ivyPaint';

const sheet = document.head.createEl('style', { text: css });
afterEach(() => {
  paintIvy(document, '');
  document.body.className = '';
  document.body.querySelectorAll('.atlas-asset-manager-modal, .atlas-command-palette-window').forEach((panel) => panel.remove());
});

const drawingOf = (panelClass: string, name: string): string => {
  const panel = document.body.createDiv({ cls: panelClass });
  return getComputedStyle(panel).getPropertyValue(`--atlas-theme-ivy-${name}`);
};

it('has the Medieval look\'s panels draw the ivy in the colour picked, and its own greens again after', () => {
  expect(sheet.sheet?.cssRules.length).toBeGreaterThan(0);
  document.body.addClass('atlas-look');
  const own = drawingOf('atlas-asset-manager-modal', 'corner-back');
  expect(own).toContain('%23789532');

  paintIvy(document, '#8b5cf6');
  expect(document.body.hasClass(PAINTED_IVY_CLASS)).toBe(true);
  const leaf = ivyPalette('#8b5cf6').get('#789532')!.slice(1);
  for (const [panel, name] of [['atlas-asset-manager-modal', 'garland-front'], ['atlas-command-palette-window', 'top-back']] as const) {
    const painted = drawingOf(panel, name);
    expect(painted).toContain(`%23${leaf}`);
    expect(painted).not.toContain('%23789532');
  }

  paintIvy(document, '');
  expect(document.body.hasClass(PAINTED_IVY_CLASS)).toBe(false);
  expect(drawingOf('atlas-asset-manager-modal', 'corner-back')).toBe(own);
});
