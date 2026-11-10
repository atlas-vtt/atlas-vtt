import { describe, expect, it } from 'vitest';
import {
  fieldByKey, fieldKeysOf, keyProblem, labelFromKey, labelToKey,
} from '../../../../src/app/statblocks/model/fieldKeys';
import { isReservedKey } from '../../../../src/app/statblocks/model/reservedKeys';
import type { TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { int, mulberry32, pick } from './treeFixtures';

describe('labelToKey', () => {
  it.each([
    ['Hit Points', 'hp'], ['HP', 'hp'], ['hit points', 'hp'],
    ['Armor Class', 'ac'], ['AC', 'ac'], ['Armor', 'ac'], ['Armour Class', 'ac'],
    ['Hit Dice', 'hit_dice'], ['Speed', 'speed'], ['Senses', 'senses'], ['Languages', 'languages'],
    ['Challenge', 'cr'], ['Challenge Rating', 'cr'], ['CR', 'cr'],
    ['Saving Throws', 'saves'], ['Saves', 'saves'], ['Skills', 'skillsaves'],
    ['Abilities', 'stats'], ['Ability Scores', 'stats'],
    ['Damage Resistances', 'damage_resistances'], ['Damage Immunities', 'damage_immunities'],
    ['Damage Vulnerabilities', 'damage_vulnerabilities'], ['Condition Immunities', 'condition_immunities'],
    ['Traits', 'traits'], ['Actions', 'actions'], ['Bonus Actions', 'bonus_actions'], ['Reactions', 'reactions'],
    ['Legendary Actions', 'legendary_actions'], ['Size', 'size'], ['Type', 'type'], ['Alignment', 'alignment'],
    ['Level', 'level'], ['Name', 'name'], ['Image', 'image'], ['Portrait', 'image'], ['Token', 'image'],
    ['Description', 'description'],
  ])('%s → %s', (label, key) => {
    expect(labelToKey(label, [])).toBe(key);
  });

  it.each([
    ['Morale Rating', 'morale_rating'],
    ['  Créature   Größe! ', 'creature_grosse'],
    ['Armor Class (AC)', 'armor_class_ac'],
    ['1st-level slots', 'field_1st_level_slots'],
    ['damageResistances', 'damage_resistances'],
    ['★ ☆', 'field'],
    ['', 'field'],
    ['体力', 'field'],
  ])('snake-cases %j as %s', (label, key) => {
    expect(labelToKey(label, [])).toBe(key);
  });

  it('caps long labels', () => {
    const key = labelToKey('A very long label that goes on and on about the creature', []);
    expect(key.length).toBeLessThanOrEqual(40);
    expect(key).not.toMatch(/_$/);
  });

  it('numbers a key that is taken, case-insensitively', () => {
    expect(labelToKey('Speed', ['speed'])).toBe('speed_2');
    expect(labelToKey('Speed', ['Speed', 'speed_2'])).toBe('speed_3');
    expect(labelToKey('Armor Class', ['ac'])).toBe('ac_2');
  });

  it('never gives a reserved or code key', () => {
    expect(labelToKey('Tags', [])).toBe('tags_2');
    expect(labelToKey('Layout', [])).toBe('layout_2');
    expect(labelToKey('Statblock', [])).toBe('statblock_2');
    expect(labelToKey('Note', [])).toBe('note_2');
    expect(labelToKey('Callback', [])).toBe('callback_2');
    expect(labelToKey('Dice Callback', [])).toBe('dice_callback');
  });

  it('gives keys that keyProblem accepts and no field holds, whatever the label', () => {
    const random = mulberry32(7);
    const alphabet = ['a', 'Z', '9', ' ', '-', '_', 'é', 'ß', '!', '.', '体', '\n', 'tags', 'hp', 'Hit Points', 'layout', 'name'];
    for (let i = 0; i < 2000; i++) {
      const label = Array.from({ length: int(random, 0, 8) }, () => pick(random, alphabet)).join('');
      const existing = Array.from({ length: int(random, 0, 5) }, () => labelToKey(pick(random, alphabet), []));
      const key = labelToKey(label, existing);
      expect(keyProblem(key, existing), `${JSON.stringify(label)} with ${existing.join(',')}`).toBeNull();
      expect(isReservedKey(key)).toBe(false);
    }
  });
});

describe('keyProblem', () => {
  it.each([
    ['', 'Give the field a key.'],
    ['  ', 'Give the field a key.'],
    ['hit points', 'A key starts with a letter and holds only letters, digits, _ and -.'],
    ['stats.1', 'A key starts with a letter and holds only letters, digits, _ and -.'],
    ['1st', 'A key starts with a letter and holds only letters, digits, _ and -.'],
    ['größe', 'A key starts with a letter and holds only letters, digits, _ and -.'],
    ['tags', 'Obsidian reads “tags” as the note’s tags. Choose another key.'],
    ['Tags', 'Obsidian reads “tags” as the note’s tags. Choose another key.'],
    ['layout', '“layout” is used by Obsidian, Fantasy Statblocks or Atlas. Choose another key.'],
    ['atlas-template', '“atlas-template” is used by Obsidian, Fantasy Statblocks or Atlas. Choose another key.'],
    ['Statblock', '“Statblock” is used by Obsidian, Fantasy Statblocks or Atlas. Choose another key.'],
    ['diceCallback', 'Fantasy Statblocks reads “diceCallback” as code. Choose another key.'],
    ['Speed', 'Another field already uses “Speed”.'],
  ])('%j: %s', (key, problem) => {
    expect(keyProblem(key, ['speed', 'hp'])).toBe(problem);
  });

  it('accepts ordinary keys, name and image', () => {
    for (const key of ['speed_2', 'hit-dice', 'Saves', 'name', 'image', 'modifier', 'code']) expect(keyProblem(key, ['speed'])).toBeNull();
  });
});

describe('labelFromKey', () => {
  it.each([
    ['hit_dice', 'Hit dice'], ['damageResistances', 'Damage resistances'], ['token-image', 'Token image'],
    ['hp', 'Hit points'], ['ac', 'Armor class'], ['cr', 'Challenge rating'], ['stats', 'Abilities'],
    ['skillsaves', 'Skills'], ['saves', 'Saving throws'], ['speed', 'Speed'], ['stress_1', 'Stress 1'], ['__', '__'],
  ])('%s → %s', (key, label) => {
    expect(labelFromKey(key)).toBe(label);
  });
});

describe('keys and former keys', () => {
  const fields: TemplateField[] = [
    { key: 'hp', label: 'HP', type: 'number', formerKeys: ['hit_points', 'health'] },
    { key: 'speed', label: 'Speed', type: 'text' },
  ];

  it('lists every key fields hold or held', () => {
    expect(fieldKeysOf(fields)).toEqual(new Set(['hp', 'hit_points', 'health', 'speed']));
    expect(labelToKey('Health', fieldKeysOf(fields))).toBe('health_2');
  });

  it('finds a field by its key, else by a former key', () => {
    expect(fieldByKey(fields, 'speed')?.key).toBe('speed');
    expect(fieldByKey(fields, 'health')?.key).toBe('hp');
    expect(fieldByKey(fields, 'ac')).toBeUndefined();
  });
});
