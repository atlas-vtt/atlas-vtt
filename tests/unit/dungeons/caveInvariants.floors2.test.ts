import { vi } from 'vitest';
import { describeCaveInvariants } from './caveInvariants';

// Every kind is offered, as once every kind has its drawing; cave/caveUndrawn.test.ts holds the real offer.
vi.mock('../../../src/app/dungeons/drawnKinds', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/app/dungeons/drawnKinds')>();
  const { ALL_PROP_KINDS } = await import('../../../src/app/dungeons/props/propKinds');
  const { ALL_TERRAIN_KINDS } = await import('../../../src/app/dungeons/terrain/catalog');
  return { ...original, DRAWN_PROP_KINDS: ALL_PROP_KINDS, DRAWN_TERRAIN_KINDS: ALL_TERRAIN_KINDS };
});

describeCaveInvariants(2);
