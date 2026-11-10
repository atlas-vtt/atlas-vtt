import { describe, expect, it } from 'vitest';
import type { InstalledTemplate } from '../../../../src/app/services/collectionBundle/installRecord';
import type { PackedTemplate, VaultTemplate } from '../../../../src/app/statblocks/bundles/bundleTemplates';
import {
  installedTemplates,
  notesToSwitch,
  planTemplates,
  rewriteNoteTemplate,
  templateIdMap,
  withRoleTemplates,
  type TemplatePlanRules,
} from '../../../../src/app/statblocks/bundles/bundleTemplateIds';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';

const MARSH = 'marsh-creature-k7m2qa';
const COPY = 'marsh-creature-c0py01';
const LIBRARY = 'atlas-vtt/statblock-templates';

function packed(fingerprint: string, id = MARSH, name = 'Marsh creature'): PackedTemplate {
  const json = { format: 'atlas-statblock-template', version: 1, id, fields: [], layout: { maxColumns: 2, blocks: [] } };
  return {
    path: `${LIBRARY}/${name}.atlastemplate`, name, id, json, fingerprint, text: `${JSON.stringify(json)}\n`,
    entry: { template: { ...MARSH_CREATURE, id }, name, status: 'ok', builtIn: false, path: `${LIBRARY}/${name}.atlastemplate` },
  };
}

const vaultOf = (...templates: VaultTemplate[]): Map<string, VaultTemplate> => new Map(templates.map((template) => [template.id, template]));
const here = (fingerprint: string, id = MARSH, path = `${LIBRARY}/Marsh creature.atlastemplate`): VaultTemplate => ({ id, path, fingerprint });
const installed = (entry: Partial<InstalledTemplate>): Record<string, InstalledTemplate> =>
  ({ [MARSH]: { localId: MARSH, target: `${LIBRARY}/Marsh creature.atlastemplate`, source: 'v1', installed: 'v1', ...entry } });

function rules(ids: string[] = [COPY]): TemplatePlanRules & { placed: string[] } {
  const placed: string[] = [];
  return {
    placed,
    place: (name) => {
      const path = `${LIBRARY}/${name}${placed.length > 0 ? ` ${placed.length + 1}` : ''}.atlastemplate`;
      placed.push(path);
      return path;
    },
    newId: () => ids.shift() ?? 'fallback-zzzzzz',
  };
}

describe('placing a bundle\'s templates by id', () => {
  it('brings in a template the vault lacks under its own id, in the library folder', () => {
    const [planned] = planTemplates([packed('v1')], vaultOf(), undefined, rules());
    expect(planned).toMatchObject({ outcome: 'new', localId: MARSH, target: `${LIBRARY}/Marsh creature.atlastemplate`, mine: null });
    expect(planned?.text).toBe(packed('v1').text);
  });

  it('reuses the same template, wherever the vault keeps it', () => {
    const [planned] = planTemplates([packed('v1')], vaultOf(here('v1', MARSH, 'Homebrew/Marsh.atlastemplate')), undefined, rules());
    expect(planned).toMatchObject({ outcome: 'reuse', localId: MARSH, target: 'Homebrew/Marsh.atlastemplate' });
    expect(planned?.text).toBeUndefined();
  });

  it('updates a template the vault holds as installed, in place and silently', () => {
    const [planned] = planTemplates([packed('v2')], vaultOf(here('v1')), installed({}), rules());
    expect(planned).toMatchObject({ outcome: 'update', localId: MARSH, target: `${LIBRARY}/Marsh creature.atlastemplate`, mine: 'v1' });
    expect(planned?.text).toBe(packed('v2').text);
  });

  it('keeps the vault\'s changes when the bundle\'s version is the one installed last time', () => {
    const [planned] = planTemplates([packed('v1')], vaultOf(here('edited')), installed({}), rules());
    expect(planned).toMatchObject({ outcome: 'keep', localId: MARSH });
    expect(planned?.text).toBeUndefined();
  });

  it('never overwrites a diverged template: the bundle\'s version comes in as a copy with a new id', () => {
    const fresh = rules(['marsh-creature-k7m2qa', COPY]);
    const [unknownOrigin] = planTemplates([packed('v2')], vaultOf(here('mine')), undefined, fresh);
    // A new id never takes one the vault has
    expect(unknownOrigin).toMatchObject({ outcome: 'copy', localId: COPY, target: `${LIBRARY}/Marsh creature.atlastemplate`, mine: null });
    expect(JSON.parse(unknownOrigin!.text!)).toMatchObject({ id: COPY });

    const [editedSinceInstall] = planTemplates([packed('v2')], vaultOf(here('edited')), installed({}), rules());
    expect(editedSinceInstall).toMatchObject({ outcome: 'copy', localId: COPY });
  });

  it('follows the copy an earlier import made, and makes it again under its id when it is gone', () => {
    const record = installed({ localId: COPY, target: `${LIBRARY}/Marsh creature (Fen).atlastemplate` });
    const copyHere = here('v1', COPY, `${LIBRARY}/Marsh creature (Fen).atlastemplate`);
    const [updated] = planTemplates([packed('v2')], vaultOf(here('mine'), copyHere), record, rules());
    expect(updated).toMatchObject({ outcome: 'update', localId: COPY, target: copyHere.path });

    const [remade] = planTemplates([packed('v2')], vaultOf(), record, rules());
    expect(remade).toMatchObject({ outcome: 'new', localId: COPY });
    // With the copy gone, the vault's template of the bundle's id is compared, without the record
    const [byId] = planTemplates([packed('v2')], vaultOf(here('v2')), record, rules());
    expect(byId).toMatchObject({ outcome: 'reuse', localId: MARSH });
  });

  it('ignores an install record entry that names no template id', () => {
    const [planned] = planTemplates([packed('v2')], vaultOf(here('v1')), installed({ localId: 'builtin:generic-creature' }), rules());
    expect(planned).toMatchObject({ outcome: 'copy' });
  });

  it('maps every template whose id differs here, and records each as installed', () => {
    const planned = planTemplates([packed('v2'), packed('b1', 'bog-hag-b0g001', 'Bog hag')], vaultOf(here('mine')), undefined, rules());
    expect(templateIdMap(planned)).toEqual(new Map([[MARSH, COPY]]));
    expect(installedTemplates(planned, undefined)).toEqual({
      [MARSH]: { localId: COPY, target: planned[0]!.target, source: 'v2', installed: 'v2' },
      'bog-hag-b0g001': { localId: 'bog-hag-b0g001', target: planned[1]!.target, source: 'b1', installed: 'b1' },
    });
    const kept = planTemplates([packed('v1')], vaultOf(here('edited', MARSH, 'Moved/Marsh.atlastemplate')), installed({}), rules());
    expect(installedTemplates(kept, installed({}))[MARSH]).toEqual({ localId: MARSH, target: 'Moved/Marsh.atlastemplate', source: 'v1', installed: 'v1' });
  });
});

describe('the template-id map', () => {
  const ids = new Map([[MARSH, COPY]]);

  it('rewrites a note\'s template in place and leaves every other byte', () => {
    const note = '---\nstatblock: true\natlas-template: marsh-creature-k7m2qa\nname: Hag\n---\natlas-template: marsh-creature-k7m2qa\n';
    expect(rewriteNoteTemplate(note, ids)).toBe(note.replace('atlas-template: marsh-creature-k7m2qa\nname', `atlas-template: ${COPY}\nname`));
    expect(rewriteNoteTemplate('---\r\natlas-template: "marsh-creature-k7m2qa" # mine\r\n---\r\n', ids)).toBe(`---\r\natlas-template: "${COPY}" # mine\r\n---\r\n`);
    expect(rewriteNoteTemplate("---\natlas-template: 'marsh-creature-k7m2qa'\n---\n", ids)).toBe(`---\natlas-template: '${COPY}'\n---\n`);
  });

  it('leaves notes alone that name another template, none, or one only in their body', () => {
    for (const note of [
      '---\natlas-template: bog-hag-b0g001\n---\n',
      '---\nstatblock: true\n---\n',
      'atlas-template: marsh-creature-k7m2qa\n',
      '---\nnested:\n  atlas-template: marsh-creature-k7m2qa\n---\n',
      '---\natlas-template: marsh-creature-k7m2qa#x\n---\n',
    ]) expect(rewriteNoteTemplate(note, ids)).toBe(note);
    const note = '---\natlas-template: marsh-creature-k7m2qa\n---\n';
    expect(rewriteNoteTemplate(note, new Map())).toBe(note);
  });

  it('points the roles at the templates\' ids here', () => {
    const settings = { conditions: [], statblockRoles: [{ id: 'hag', name: 'Hag', templateId: MARSH }, { id: 'npc', name: 'NPC', templateId: 'builtin:generic-npc' }] };
    expect(withRoleTemplates(settings, ids).statblockRoles).toEqual([{ id: 'hag', name: 'Hag', templateId: COPY }, settings.statblockRoles[1]]);
    expect(withRoleTemplates(settings, new Map())).toBe(settings);
  });

  it('lists the vault\'s notes that name a template whose bundle version came in as a copy', () => {
    const planned = planTemplates([packed('v2')], vaultOf(here('mine')), undefined, rules());
    expect(notesToSwitch([
      { path: 'Bestiary/Hag.md', templateId: MARSH },
      { path: 'Bestiary/Imp.md', templateId: 'other-aaaaaa' },
      { path: 'Lore/Fen.md', templateId: null },
    ], planned)).toEqual([{ path: 'Bestiary/Hag.md', name: 'Hag', from: MARSH, to: COPY }]);
  });
});
