// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { BUILT_IN_SENSES } from '../../../../src/app/gameSystems/senses';
import { creatureSenses } from '../../../../src/app/creatures/creatureSenses';
import { sensesTextOf } from '../../../../src/app/creatures/sensesText';
import { difficultyLabel, statblockDisplayName, statblockRating } from '../../../../src/app/creatures/statblockRating';
import { statblockEntry } from '../../../../src/app/packages/components/asset-manager/statblock-link/statblockEntries';
import { statblockTokenChanges } from '../../../../src/app/pixi/token-renderer/statblockTokenSync';
import { buildStatblockLinkUpdates } from '../../../../src/app/pixi/token-renderer/statblockFrontmatter';
import { tokenSizeFromStatblock } from '../../../../src/app/pixi/token-renderer/tokenSizing';
import { statblockImportCandidate, statblockLookup } from '../../../../src/app/services/statblockImportCandidates';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { addNote, creatureVault, type CreatureVault } from '../../../mocks/creatureVault';

const FEET = { unitType: 'feet', unitDistance: 5 } as const;
const DND = BUILT_IN_SENSES['builtin:dnd5e']!;

describe('senses: the template\'s senses field first', () => {
  it('reads the senses a template keeps under another key before `senses` and `perception`', () => {
    const fields = { perceives: 'darkvision 60 ft.', senses: 'passive Perception 9', perception: '+4; tremorsense' };
    expect(sensesTextOf(fields, { senses: 'perceives' })).toBe('darkvision 60 ft.');
    expect(sensesTextOf(fields)).toBe('passive Perception 9');
  });

  it('falls back as before where the meant field is empty', () => {
    expect(sensesTextOf({ perceives: '', senses: 'blindsight 10 ft.' }, { senses: 'perceives' })).toBe('blindsight 10 ft.');
    expect(sensesTextOf({ perceives: [], perception: 'Perception +2; darkvision' }, { senses: 'perceives' })).toBe('darkvision');
  });

  it('gives a token the senses of a native statblock as the index holds it', () => {
    const creature = { fields: { perceives: 'darkvision 60 ft.' }, meanings: { senses: 'perceives' } };
    const parsed = creatureSenses(creature, DND, FEET);
    expect(parsed.senses.map((sense) => [DND.find((definition) => definition.id === sense.id)?.name, sense.range])).toEqual([['Darkvision', 60]]);
  });
});

describe('size and rating: the template\'s fields first', () => {
  it('sizes a token by the field the template means as its size', () => {
    expect(tokenSizeFromStatblock({ bulk: 'Huge', size: 'Medium' }, { size: 'bulk' })).toBe(2);
    expect(tokenSizeFromStatblock({ bulk: '3', size: 'Large' }, { size: 'bulk' })).toBe(1.5);
    expect(tokenSizeFromStatblock({ size: 'Large' }, {})).toBe(1.5);
  });

  it('labels a token by the template\'s rating, then by challenge rating, tier and difficulty', () => {
    expect(difficultyLabel({ threat: 4, cr: 2 }, { rating: 'threat' })).toBe('Threat 4');
    expect(difficultyLabel({ level: 3 }, { rating: 'level' })).toBe('Level 3');
    expect(difficultyLabel({ cr: '1/4' }, { rating: 'cr' })).toBe('CR 1/4');
    expect(difficultyLabel({ threat: '', tier: 2 }, { rating: 'threat' })).toBe('T2');
    expect(difficultyLabel({ difficulty: 14 }, {})).toBe('14');
    expect(statblockRating({ hit_dice: '3+1*' }, { rating: 'hit_dice' }, ['cr'])).toEqual({ key: 'hit_dice', value: '3+1*' });
  });
});

describe('display name: the template\'s display name first, `name` as the identity', () => {
  const fields = { name: 'Aranea (Cairn)', title: 'Aranea' };
  const meanings = { 'display-name': 'title' } as const;

  it('names a statblock by the field the template means as its display name, else by `name`', () => {
    expect(statblockDisplayName(fields, meanings)).toBe('Aranea');
    expect(statblockDisplayName({ name: 'Aranea (Cairn)', title: ' ' }, meanings)).toBe('Aranea (Cairn)');
    expect(statblockDisplayName(fields, {})).toBe('Aranea (Cairn)');
    expect(statblockDisplayName({}, meanings)).toBeNull();
  });

  it('lists it, names its linked tokens and a token that links it by that name', () => {
    expect(statblockEntry('Bestiary/Aranea.md', fields, meanings, 'Aranea').name).toBe('Aranea');
    const token = { id: 't1', kind: 'character', x: 0, y: 0, imagePath: 'art/aranea.webp', name: 'Aranea (Cairn)', statblockPath: 'Bestiary/Aranea.md' } as const;
    expect(statblockTokenChanges({ t1: token }, 'Bestiary/Aranea.md', { fields, meanings }, [], null)).toEqual([{ id: 't1', changes: { name: 'Aranea' } }]);
    expect(buildStatblockLinkUpdates({ fields, meanings }, 'Spider', [], undefined).name).toBe('Aranea');
  });
});

describe('bulk import of a native statblock', () => {
  const WARDEN = 'Bestiary/Iron Guard.md';
  let current: CreatureVault;
  beforeEach(() => {
    current = creatureVault();
    current.files.set('Art/guard.webp', 'image');
    addNote(current, WARDEN, { statblock: true, 'atlas-template': 'builtin:draw-steel-monster', name: 'Iron Guard', size: 'Large', image: 'Art/guard.webp' });
  });
  afterEach(() => {
    TemplateLibrary.release(current.app);
    Reflect.deleteProperty(window, 'FantasyStatblocks');
  });

  it('names the template in the layout column and sizes the token by the template\'s size', async () => {
    // Fantasy Statblocks parses native notes too; its copy is stale and its layout is not what draws the note
    current.bestiary.push({ name: 'Old Guard', path: WARDEN, layout: 'Basic 5e Layout', size: 'Tiny' });
    const lookup = statblockLookup([], current.bestiary);
    expect(await statblockImportCandidate(current.app, new TFile(WARDEN), lookup)).toMatchObject({
      name: 'Iron Guard',
      layoutName: 'Draw Steel',
      status: 'ready',
      imagePath: 'Art/guard.webp',
      size: 1.5,
    });
  });

  it('keeps the requested Fantasy Statblocks layout for a Fantasy Statblocks note', async () => {
    current.bestiary.push({ name: 'Goblin', path: 'Bestiary/Goblin.md', layout: 'Basic 5e Layout', image: 'Art/guard.webp' });
    const lookup = statblockLookup([], current.bestiary);
    expect(await statblockImportCandidate(current.app, new TFile('Bestiary/Goblin.md'), lookup)).toMatchObject({ layoutName: 'Basic 5e Layout' });
  });
});
