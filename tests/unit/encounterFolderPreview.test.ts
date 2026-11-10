// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EncounterFolderPreview } from '../../src/app/services/EncounterFolderPreview';
import type { EncounterAsset } from '../../src/app/packages/components/asset-manager/types';
import type { NotePin } from '../../src/app/types';

const FOLDER = 'atlas-vtt/collections/cairn/encounters/Wilds/Forest';
const pin: NotePin = { id: 'p1', kind: 'pin', x: 0, y: 0, notePath: FOLDER };

function encounter(name: string, tokens: EncounterAsset['tokens']): EncounterAsset {
  return { id: name, name, type: 'encounters', tags: [], modifiedAt: 0, tokens, tokenPreviews: [{ url: 'app://wolf.webp' }] };
}

function open(encounters: EncounterAsset[]): { roll: ReturnType<typeof vi.fn>; place: ReturnType<typeof vi.fn>; onClosed: ReturnType<typeof vi.fn> } {
  const roll = vi.fn();
  const place = vi.fn();
  const onClosed = vi.fn();
  new EncounterFolderPreview({ folder: FOLDER, encounters, pin, position: { x: 10, y: 10 }, doc: document, roll, place, onClosed });
  return { roll, place, onClosed };
}

const card = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-encounter-folder-preview')!;

describe('the card of a pin that rolls encounters', () => {
  afterEach(() => { document.body.empty(); });

  it('names the folder and lists its encounters with their tokens', () => {
    const wolf = { id: 'wolf', name: 'Wolf', imagePath: 'wolf.webp' };
    open([encounter('Wolf pack', [{ ...wolf, quantity: '1d4+1' }]), encounter('Bandits', [wolf, wolf])]);
    expect(card().querySelector('.atlas-encounter-folder-preview__name')?.textContent).toBe('Forest');
    expect(card().querySelector('.atlas-encounter-folder-preview__meta')?.textContent).toBe('Wilds · 2 encounters');
    const rows = [...card().querySelectorAll('.atlas-encounter-folder-preview__row')];
    expect(rows.map((row) => row.querySelector('.atlas-encounter-folder-preview__row-count')?.textContent)).toEqual(['2 – 5 tokens', '2 tokens']);
  });

  it('places a clicked encounter or rolls, closing first', () => {
    const bandits = encounter('Bandits', []);
    const { roll, place, onClosed } = open([bandits]);
    card().querySelector<HTMLButtonElement>('.atlas-encounter-folder-preview__row')!.click();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(place).toHaveBeenCalledWith(bandits);

    const second = open([bandits]);
    document.querySelectorAll<HTMLButtonElement>('.atlas-encounter-folder-preview__roll')[1]!.click();
    expect(second.roll).toHaveBeenCalledTimes(1);
    expect(roll).not.toHaveBeenCalled();
  });

  it('offers no roll where the folder holds no encounters', () => {
    open([]);
    expect(card().querySelector<HTMLButtonElement>('.atlas-encounter-folder-preview__roll')!.disabled).toBe(true);
    expect(card().querySelector('.atlas-encounter-folder-preview__empty')).not.toBeNull();
  });
});
