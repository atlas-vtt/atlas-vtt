import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROW_CLASS, START_CLASS } from '../../../../src/app/online/gm/dock/dockDom.ts';

const VENDOR = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const read = (file: string): string => fs.readFileSync(path.join(VENDOR, file), 'utf8');

/**
 * The control lives in Atlas's markup and reuses Atlas's classes without Atlas knowing: these are the
 * names it relies on, read from the vendor's source at the pin.
 */
describe("Atlas's markup the control relies on", () => {
  it('has the bottom row with its start slot, where the control and its spacer go', () => {
    const row = read('src/app/react/components/BottomToolbarRow.tsx');
    expect(row).toContain(`className="${ROW_CLASS}"`);
    expect(row).toContain(`className="${START_CLASS}"`);
    // The row measures the start slot, so the spacer's width reaches the toolbar's room.
    expect(row).toMatch(/observeResize\(\[row, startSlot, endSlot\]/);
  });

  it('has the token portrait the panel draws, and the bars the collapsed control stands level with', () => {
    expect(read('src/app/packages/components/shared/tokenPortraitElement.ts')).toContain("cls: 'atlas-token-portrait'");
    // dock.scss sizes the button as a 40 px control with $spacing-s around it, as Atlas's bars are.
    const styles = read('styles/main.scss');
    expect(styles).toMatch(/\.atlas-vtt-toolbar \{[^}]*padding: \$spacing-s;/);
    expect(styles).toMatch(/\.btn--icon \{\s*width: \$button-height-l;\s*height: \$button-height-l;/);
  });

  it('has the store flags the control gives way to', () => {
    const slice = read('src/app/stores/uiSlice.ts');
    expect(slice).toContain('setDiceLogOpen: (open) =>');
    expect(slice).toContain('isToolbarEditing: false');
    expect(read('src/app/storeFactory.ts')).toContain('setSelection: (ids) =>');
  });
});
