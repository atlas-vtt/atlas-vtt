import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('dashboard tiles', () => {
  it('lets an odd last tile span the whole row', () => {
    const scss = readFileSync('src/app/react/components/dashboard.scss', 'utf8');
    expect(scss).toMatch(/>\s*\.action-card:last-child:nth-child\(odd\)\s*\{\s*grid-column:\s*1\s*\/\s*-1;/);
  });
});
