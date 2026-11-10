import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { characterRestOf } from '../../../src/app/recovery/characterRest';
import { fillFormula } from '../../../src/app/recovery/recoveryFormula';
import type { TokenAsset } from '../../../src/app/services/AssetService';
import { TEMPLATE_FORMAT, type StatblockTemplate, type TemplateField } from '../../../src/app/statblocks/model/templateTypes';

vi.mock('../../../src/app/services/AssetService', () => ({
  AssetService: { getInstance: () => ({ getCollectionSettings: () => ({ resources: [] }), loadedTokenAssets: () => [] }) },
}));
vi.mock('../../../src/app/services/collectionScenes', () => ({ openMapViews: () => [] }));
vi.mock('../../../src/app/campaigns/partyValues/PartySync', () => ({ PartySync: { forApp: () => null } }));
vi.mock('../../../src/app/campaigns/campaignPlay', () => ({ CampaignPlay: { forApp: () => ({ playing: () => null }) } }));

const FIELDS: TemplateField[] = [
  { key: 'x', label: 'Secret', type: 'number' },
  { key: 'X_', label: 'Shown', type: 'number' },
  { key: 'bonus', label: 'Bonus', type: 'text' },
];
const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT, version: 1, id: 'rest-abc123', fields: FIELDS, layout: { maxColumns: 1, columnWidth: 22, blocks: [] }, players: { x: 'hidden' },
};
// `bonus` holds what a player wrote before their references were checked: `@x` reads the shown `X_` on their sheet
const RECORD = { x: 9, X_: 2, bonus: '@x' };
const ASSET = { id: 'mira', name: 'Mira', imagePath: 'mira.png', collection: 'c' } as TokenAsset;

describe('a rest reading a value the player wrote', () => {
  const rest = characterRestOf({} as App, ASSET, { notePath: 'Mira.md', templateId: TEMPLATE.id, template: TEMPLATE, record: RECORD });

  it('fills its references from what the player may see, so the rest shows them no hidden number', () => {
    expect(rest.character.lookup('bonus')).toBe(2);
    const formula = fillFormula('1d8+@bonus', (path) => rest.character.lookup(path));
    expect(formula.ok && formula.formula).toBe('1d8+(2)');
  });

  it('still reads a field the GM\'s own formula names, hidden or not', () => {
    expect(rest.character.lookup('x')).toBe(9);
  });

  it('leaves a value unfilled once the GM hides the field it names, after the player wrote it', () => {
    const later = { ...TEMPLATE, players: { x: 'hidden', X_: 'hidden' } } satisfies StatblockTemplate;
    const hidden = characterRestOf({} as App, ASSET, { notePath: 'Mira.md', templateId: TEMPLATE.id, template: later, record: { ...RECORD, bonus: '@X_' } });
    expect(hidden.character.lookup('bonus')).toBe('@X_');
    expect(fillFormula('1d8+@bonus', (path) => hidden.character.lookup(path)).ok).toBe(false);
  });
});
