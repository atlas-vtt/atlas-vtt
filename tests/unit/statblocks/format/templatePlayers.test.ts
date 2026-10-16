import { describe, expect, it } from 'vitest';
import { templateFingerprint } from '../../../../src/app/services/collectionBundle/fingerprints';
import { cleanTemplate } from '../../../../src/app/statblocks/bundles/bundleTemplates';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate, templateToJson } from '../../../../src/app/statblocks/format/templateFormat';
import { removeField, renameFieldKey } from '../../../../src/app/statblocks/model/fieldOps';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { MARSH_CREATURE, MARSH_CREATURE_JSON } from '../../../fixtures/statblockTemplateFixtures';

const withPlayers = (players: unknown): string => JSON.stringify({ ...JSON.parse(MARSH_CREATURE_JSON) as object, players }, null, 2);

function read(text: string): { template: StatblockTemplate; problems: string[] } {
  const result = parseTemplate(text);
  if (result.template === null) throw new Error(result.problems.join(' '));
  return { template: result.template, problems: result.problems };
}

describe('what players may do with a template\'s fields', () => {
  it('reads and writes the settings, after the layout, keys in order whatever order they were set in', () => {
    const { template, problems } = read(withPlayers({ speed: 'read', actions: 'hidden', ac: 'edit' }));
    expect(problems).toEqual([]);
    expect(template.players).toEqual({ speed: 'read', actions: 'hidden', ac: 'edit' });
    const json = templateToJson(template);
    expect(Object.keys(json).indexOf('players')).toBe(Object.keys(json).indexOf('layout') + 1);
    expect(Object.keys(json.players as object)).toEqual(['ac', 'actions', 'speed']);
    const text = serializeTemplate(template);
    expect(serializeTemplate(read(text).template)).toBe(text);
    expect(serializeTemplate({ ...template, players: { speed: 'read', ac: 'edit', actions: 'hidden' } })).toBe(text);
  });

  it('writes nothing for a template without settings', () => {
    expect(serializeTemplate(MARSH_CREATURE)).not.toContain('players');
    expect(read(serializeTemplate(MARSH_CREATURE)).template.players).toBeUndefined();
  });

  it('keeps a setting it does not know as written, reads one that is no text as hidden, and writes the file\'s settings back until they are edited', () => {
    const { template, problems } = read(withPlayers({ speed: 'read', actions: 'private', ac: 3 }));
    expect(template.players).toEqual({ speed: 'read', actions: 'private', ac: 'hidden' });
    expect(problems).toEqual(['The template: "players" holds 1 settings that are not edit, read or hidden; they read as hidden.']);
    expect(templateToJson(template).players).toEqual({ ac: 3, actions: 'private', speed: 'read' });
    expect(templateToJson({ ...template, players: { speed: 'hidden' } }).players).toEqual({ speed: 'hidden' });
    const known = read(withPlayers({ actions: 'private' }));
    expect(known.problems).toEqual([]);
    expect(serializeTemplate(read(serializeTemplate(known.template)).template)).toContain('"actions": "private"');
  });

  it('reads settings that are no object as none, and keeps them', () => {
    const { template, problems } = read(withPlayers(['speed']));
    expect(template.players).toBeUndefined();
    expect(problems).toHaveLength(1);
    expect(templateToJson(template).players).toEqual(['speed']);
  });

  it('follow a field\'s key when it is renamed, and go with a field that is removed', () => {
    const template: StatblockTemplate = { ...MARSH_CREATURE, players: { speed: 'read', ac: 'hidden' } };
    expect(renameFieldKey(template, 'speed', 'movement').players).toEqual({ ac: 'hidden', movement: 'read' });
    const unbound: StatblockTemplate = { ...template, layout: { ...template.layout, blocks: template.layout.blocks.filter((block) => block.type !== 'stat' || block.field !== 'speed') } };
    expect(removeField(unbound, 'speed').players).toEqual({ ac: 'hidden' });
    expect(removeField(unbound, 'speed').fields.some((field) => field.key === 'speed')).toBe(false);
  });

  it('count in the template\'s fingerprint', async () => {
    const plain = templateToJson(MARSH_CREATURE);
    const set = templateToJson({ ...MARSH_CREATURE, players: { speed: 'read' } });
    expect(await templateFingerprint(set)).not.toBe(await templateFingerprint(plain));
    expect(await templateFingerprint(set)).toBe(await templateFingerprint(templateToJson({ ...MARSH_CREATURE, players: { speed: 'read' } })));
  });

  it('travel in a bundle with their template', async () => {
    const packed = await cleanTemplate('atlas-vtt/statblock-templates/Marsh creature.atlastemplate', withPlayers({ speed: 'read' }));
    expect(JSON.parse(packed!.text)).toMatchObject({ players: { speed: 'read' } });
    expect(packed!.entry.template.players).toEqual({ speed: 'read' });
  });
});
