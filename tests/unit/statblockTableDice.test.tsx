// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TableBlock } from '../../src/app/react/components/statblock/StatblockBlocks';

afterEach(cleanup);

function links(values: unknown[], calculate: boolean): string[] {
  const { container } = render(
    <TableBlock
      item={{ type: 'table', id: 'cells', properties: ['cells'], headers: values.map((_, i) => `C${i}`), calculate }}
      monster={{ cells: values }}
    />,
  );
  return Array.from(container.querySelectorAll<HTMLElement>('.atlas-dice-link'), (link) => link.dataset.formula ?? '');
}

it('rolls the dice written in a table cell', () => {
  expect(links(['4d6+3', 'Damage'], false)).toEqual(['4d6+3']);
});

it('keeps numbers plain and rolls them only through their modifier', () => {
  expect(links([15], false)).toEqual([]);
  expect(links([15], true)).toEqual(['+2']);
});
