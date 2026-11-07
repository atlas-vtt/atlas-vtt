import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ATLAS_VIEW_TYPE } from '../../../../src/app/online/gm/atlasView.ts';

const ROOT = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));

describe('the companion plugin', () => {
  it('finds Atlas map tabs by the view type the vendor registers them under', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/app/atlasViewType.ts'), 'utf8');
    const declared = /export const ATLAS_VIEW_TYPE = ["']([^"']+)["'];/.exec(source)?.[1];
    expect(declared).toBe(ATLAS_VIEW_TYPE);
  });
});
