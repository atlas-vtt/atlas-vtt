// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EVERY_BLOCK, FIVE_E_2024 } from '../../../fixtures/statblockTemplateFixtures';
import { BlockChromeContext } from '../../../../src/app/statblocks/render/blockChrome';
import { StatblockSheet } from '../../../../src/app/statblocks/render/StatblockSheet';
import type { SheetMode } from '../../../../src/app/statblocks/render/sheetTypes';
import { ValueEditingContext, type ValueEditing } from '../../../../src/app/statblocks/render/valueSlot';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';

afterEach(cleanup);

const EVERY_VALUE: Record<string, unknown> = {
  name: 'Mossback', image: 'mossback.png', kind: 'Beast', level: '1/4', armor: 3, vigor: 9, vigor_dice: '2d8',
  stats: [12, 14, 9], saves: [{ dex: 4 }], keywords: ['moss', 'bog'], story: 'It waits.',
  moves: [{ name: 'Lunge', desc: 'It lunges.' }], stress: 3, spells: ['At will: fog'],
};

const FIVE_E_VALUES: Record<string, unknown> = {
  name: 'Marsh Warden', size: 'Large', type: 'plant', ac: 14, hp: 52, hit_dice: '7d10 + 14',
  stats: [18, 8, 15, 6, 12, 7], actions: [{ name: 'Bramble Lash', desc: 'Melee Attack Roll: +6.' }],
};

function sheet(template: StatblockTemplate, fields: Record<string, unknown>, mode: SheetMode): React.JSX.Element {
  return <StatblockSheet template={template} name="Test" fields={fields} variant="full" mode={mode} />;
}

/** The markup, with React's generated ids (which count up from render to render; `«r1»` before React 19.2, `_r_1_` since) made equal. */
function html(element: React.JSX.Element): string {
  const { container, unmount } = render(element);
  const markup = container.innerHTML.replace(/«[^»]+»|_[rR]_[0-9a-zA-Z]+_/g, '«id»');
  unmount();
  return markup;
}

describe('the value seam', () => {
  it.each([
    ['every block, at runtime', EVERY_BLOCK, EVERY_VALUE, 'view'],
    ['every block, empty, while editing', EVERY_BLOCK, {}, 'editing'],
    ['5E, at runtime', FIVE_E_2024, FIVE_E_VALUES, 'view'],
  ] as const)('leaves the card exactly as it was without an editing context: %s', (_name, template, fields, mode) => {
    const plain = html(sheet(template, fields, mode));
    const withoutContexts = html(
      <BlockChromeContext.Provider value={null}>
        <ValueEditingContext.Provider value={null}>{sheet(template, fields, mode)}</ValueEditingContext.Provider>
      </BlockChromeContext.Provider>,
    );
    const neutral: ValueEditing = { slot: (_block, values) => values };
    const throughNeutralSlot = html(<ValueEditingContext.Provider value={neutral}>{sheet(template, fields, mode)}</ValueEditingContext.Provider>);

    expect(plain).not.toBe('');
    expect(withoutContexts).toBe(plain);
    expect(throughNeutralSlot).toBe(plain);
  });

  it('reaches the values of every block that shows some, never their labels or headings', () => {
    const seen: string[] = [];
    const marking: ValueEditing = {
      slot: (block, values) => {
        seen.push(block.id);
        return <span data-slot={block.id}>{values}</span>;
      },
    };
    const { container } = render(<ValueEditingContext.Provider value={marking}>{sheet(EVERY_BLOCK, EVERY_VALUE, 'view')}</ValueEditingContext.Provider>);

    // The header's parts that show (the value has no description) and the layout's blocks.
    expect(new Set(seen)).toEqual(new Set([
      'header-name', 'header-token', 'header-level', 'header-type', 'header-hp',
      'a2title0', 'a3line00', 'a4image0', 'a6stat00', 'a7score0', 'a8pairs0', 'a9tags00', 'b1text00', 'b2text00', 'b3entr00', 'b4track0', 'b5spell0', 'b8metr00',
    ]));
    // The label of a stat stays outside its values.
    const vigor = container.querySelector('[data-block-id="a6stat00"]');
    expect(vigor?.querySelector('.atlas-sb-label')?.closest('[data-slot]')).toBeNull();
    expect(vigor?.querySelector('[data-slot] .atlas-sb-value')).not.toBeNull();
    // A Metric's numbers each have a slot of their own, their names outside it.
    const metric = container.querySelector('[data-block-id="b8metr00"]');
    expect(metric?.querySelectorAll('[data-slot]')).toHaveLength(2);
    for (const label of metric?.querySelectorAll('.atlas-sb-label') ?? []) expect(label.closest('[data-slot]')).toBeNull();
  });
});
