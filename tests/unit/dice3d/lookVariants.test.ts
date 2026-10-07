import { afterEach, describe, expect, it, vi } from 'vitest';

const art = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../../src/app/dice3d/customLookArt', () => ({ lookArt: art.load }));

import { addCustomLook, type CustomDiceLook } from '../../../src/app/dice3d/customLooks';
import { lookVariant, setVariantBase } from '../../../src/app/dice3d/lookVariants';
import { activeLook, resolveCustomLook, resolveLook, setActiveLook } from '../../../src/app/dice3d/dieSkin';
import { DEFAULT_DICE_LOOK } from '../../../src/app/dice3d/diceLook';

const EMPTY = { faces: new Map(), bump: new Map() };
const look = (id: string): CustomDiceLook => ({ id, name: id, faces: () => Promise.resolve({}), body: '#aa2211', ink: null, preview: null });
let removals: Array<() => void> = [];
const settle = async (): Promise<void> => { for (let i = 0; i < 3; i++) await Promise.resolve(); };

afterEach(() => {
  removals.forEach((remove) => remove());
  removals = [];
  setActiveLook(resolveLook(DEFAULT_DICE_LOOK, null));
  setVariantBase(DEFAULT_DICE_LOOK, null);
  art.load.mockReset();
});

describe("a collection's dice look on a stage", () => {
  it('paints the look in effect for no choice, the same choice, or a look not registered', () => {
    expect(lookVariant(undefined)).toBeNull();
    expect(lookVariant('')).toBeNull();
    expect(lookVariant('gone:look')).toBeNull();
  });

  it("gives the look in effect while a look's art loads, then that look; registered anew, it paints from the new art", async () => {
    art.load.mockResolvedValue(EMPTY);
    removals.push(addCustomLook(look('ext:fire')));
    expect(lookVariant('ext:fire')).toBeNull();
    await settle();
    const variant = lookVariant('ext:fire')!;
    expect(variant.look()).toMatchObject({ lookId: 'ext:fire', body: '#aa2211' });
    removals.pop()!();
    removals.push(addCustomLook(look('ext:fire')));
    expect(lookVariant('ext:fire')).toBeNull();
    await settle();
    expect(lookVariant('ext:fire')!.key).not.toBe(variant.key);
  });

  it("gives Atlas's own dice in the GM's colour where the default is an extension's look", () => {
    const wood = look('ext:wood');
    removals.push(addCustomLook(wood));
    setVariantBase({ colour: 'dark', font: 'scifi' }, null);
    setActiveLook(resolveCustomLook({ colour: 'dark', font: 'scifi' }, wood, EMPTY));
    expect(activeLook().lookId).toBe('ext:wood');
    expect(lookVariant('ext:wood')).toBeNull();
    expect(lookVariant('')!.look()).toMatchObject({ lookId: null, colour: 'dark', font: 'scifi' });
  });
});
