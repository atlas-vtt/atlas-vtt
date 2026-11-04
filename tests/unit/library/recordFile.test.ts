import { describe, expect, it } from 'vitest';
import type { Asset, CharacterAsset, EncounterAsset, MapAsset, TokenAsset } from '../../../src/app/services/AssetService';
import { isPayloadUnread, parseRecordFile, RECORD_KEY, serializeRecord } from '../../../src/app/services/library/recordFile';
import { parseCollectionFile, serializeCollection } from '../../../src/app/services/library/collectionFile';
import { recordFilePath } from '../../../src/app/services/library/libraryPaths';

const DIR = 'atlas-vtt/collections/Fen';

const token: TokenAsset = {
  id: 'token-1', type: 'token', name: 'Bog hag', tags: ['hag'], collection: 'Fen', imagePath: `${DIR}/tokens/hag.webp`,
  size: 2, statblockPath: 'Bestiary/Bog hag.md', createdAt: 10, modifiedAt: 20,
};

const encounter: EncounterAsset = {
  id: 'encounter-1', type: 'encounter', name: 'Ambush', tags: [], collection: 'Fen', filePath: `${DIR}/encounters/encounter-1.json`,
  tokens: [{ id: 'token-1', name: 'Bog hag', imagePath: token.imagePath }], difficulty: 'hard', createdAt: 1, modifiedAt: 2,
  data: { tokens: [{ id: 'token-1', name: 'Bog hag', imagePath: token.imagePath }], difficulty: 'hard', description: 'At the ford' },
};

/** Parses what `serializeRecord` wrote, as the file at the asset's place. */
function roundTrip(asset: Asset): Asset | null {
  return parseRecordFile(serializeRecord(asset), recordFilePath(asset))?.record ?? null;
}

describe('record files', () => {
  it('keep a token whole in tokens/<id>.json', () => {
    expect(recordFilePath(token)).toBe(`${DIR}/tokens/token-1.json`);
    expect(roundTrip(token)).toEqual(token);
  });

  it('write the payload at the top level as older versions read it, and the record beside it once', () => {
    const file = JSON.parse(serializeRecord(encounter));

    expect(file).toMatchObject({ tokens: encounter.data!.tokens, difficulty: 'hard', description: 'At the ford' });
    // Fields the payload holds are stored once.
    expect(file[RECORD_KEY]).not.toHaveProperty('tokens');
    expect(file[RECORD_KEY]).not.toHaveProperty('data');
    expect(roundTrip(encounter)).toEqual(encounter);
  });

  it('take the collection and place from where the file lies, and tell which collection they were written for', () => {
    const file = JSON.parse(serializeRecord(encounter));
    expect(file[RECORD_KEY]).toMatchObject({ collection: 'Fen' });
    expect(file[RECORD_KEY]).not.toHaveProperty('filePath');

    const moved = parseRecordFile(serializeRecord(encounter), 'atlas-vtt/collections/Hills/encounters/sub/encounter-1.json');
    expect(moved?.record).toMatchObject({ collection: 'Hills', filePath: 'atlas-vtt/collections/Hills/encounters/sub/encounter-1.json' });
    expect(moved?.writtenFor).toBe('Fen');
  });

  it('keep an opaque payload as it is, also where its keys look like the record\'s', () => {
    const character: CharacterAsset = {
      id: 'character-1', type: 'character', name: 'Wren', tags: [], collection: 'Fen', createdAt: 1, modifiedAt: 1,
      data: { name: 'Wren of the Reeds', level: 3, tags: ['ranger'] },
    };
    const parsed = parseRecordFile(serializeRecord(character), recordFilePath(character));

    expect(parsed?.payload).toEqual(character.data);
    expect(parsed?.record).toMatchObject({ name: 'Wren', data: character.data });
  });

  it('keep the fields older versions read from a map\'s JSON', () => {
    const map: MapAsset = { id: 'map-1', type: 'map', name: 'Fen', tags: [], collection: 'Fen', mapFilePath: 'atlas-vtt/assets/fen.webp', createdAt: 1, modifiedAt: 1 };
    expect(JSON.parse(serializeRecord(map))).toMatchObject({ id: 'map-1', name: 'Fen', mapFilePath: 'atlas-vtt/assets/fen.webp' });
    expect(roundTrip(map)).toMatchObject({ id: 'map-1', mapFilePath: 'atlas-vtt/assets/fen.webp', filePath: recordFilePath(map) });
  });

  it('keep fields a newer version wrote and report the format they were written in', () => {
    const text = JSON.stringify({ [RECORD_KEY]: { ...token, format: 7, aura: { radius: 3 } } });
    const parsed = parseRecordFile(text, recordFilePath(token));

    expect(parsed?.format).toBe(7);
    expect(parsed?.record).toMatchObject({ id: 'token-1', aura: { radius: 3 } });
    expect(JSON.parse(serializeRecord(parsed!.record!))[RECORD_KEY]).toMatchObject({ aura: { radius: 3 } });
  });

  it('read a file without a record as a payload, and refuse a record that names no file', () => {
    expect(parseRecordFile('{"tokens":[]}', `${DIR}/encounters/e.json`)).toEqual({ format: null, record: null, writtenFor: null, payload: { tokens: [] } });
    expect(parseRecordFile(JSON.stringify({ [RECORD_KEY]: { ...token, imagePath: undefined } }), recordFilePath(token))?.record).toBeNull();
    expect(parseRecordFile('not json', recordFilePath(token))).toBeNull();
  });

  it('tell a record whose payload only its file holds', () => {
    expect(isPayloadUnread({ ...encounter, data: undefined })).toBe(true);
    expect(isPayloadUnread(encounter)).toBe(false);
    expect(isPayloadUnread(token)).toBe(false);
  });
});

describe('collection files', () => {
  it('store neither id nor name, which the folder gives, and keep what they do not know', () => {
    const collection = {
      id: 'Fen', uid: 'uid-1', version: 2, name: 'Fen', tags: {}, settings: { conditions: [] }, createdAt: 1, modifiedAt: 2, cover: 'x',
    };
    const text = serializeCollection(collection);

    expect(JSON.parse(text)).not.toHaveProperty('id');
    expect(JSON.parse(text)).not.toHaveProperty('name');
    expect(parseCollectionFile(text, 'Marsh')?.value).toEqual({ ...collection, id: 'Marsh', name: 'Marsh' });
    expect(parseCollectionFile('{"name":"x"}', 'Fen')).toBeNull();
  });
});
