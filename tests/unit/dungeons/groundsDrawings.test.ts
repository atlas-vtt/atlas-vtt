import { describe, expect, it } from 'vitest';
import { DRAWN_GROUNDS_KINDS } from '../../../src/app/dungeons/drawnKinds';
import { GROUNDS_KINDS } from '../../../src/app/dungeons/houseModel';
import { drawnGroundsKinds } from '../../../src/app/dungeons/render/grounds';

describe("a house's grounds", () => {
  it('offer the generator exactly the kinds the grounds drawing draws', () => {
    expect([...DRAWN_GROUNDS_KINDS].sort()).toEqual(drawnGroundsKinds().sort());
  });

  it('draw every kind the grounds hold', () => {
    expect(drawnGroundsKinds().sort()).toEqual([...GROUNDS_KINDS].sort());
  });
});
