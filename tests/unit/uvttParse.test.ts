import { describe, expect, it } from 'vitest';
import { parseUvtt } from '../../src/app/import/uvtt/parseUvtt';
import { isUvttFileName, uvttSceneName } from '../../src/app/import/uvtt/uvttFileNames';
import { UVTT_LIMITS, type UvttMap } from '../../src/app/import/uvtt/uvttTypes';
import { GIF_START, JPEG_START, WEBP_START, base64Of, cryptFile, cryptSetting, cryptWith, pngHeader } from '../fixtures/uvttFiles';

function read(file: unknown): UvttMap {
  const result = parseUvtt(JSON.stringify(file));
  if (!result.ok) throw new Error(`Refused: ${result.problem}`);
  return result.map;
}

function problemOf(file: unknown): string {
  const result = parseUvtt(typeof file === 'string' ? file : JSON.stringify(file));
  if (result.ok) throw new Error('The file was accepted');
  return result.problem;
}

/** `count` segments as one wall line. */
const lineOf = (count: number): Array<{ x: number; y: number }> => Array.from({ length: count + 1 }, (_, index) => ({ x: index % 10, y: Math.floor(index / 10) % 8 }));

describe('reading a Universal VTT file', () => {
  it('reads every field of a file', () => {
    const map = read(cryptFile());

    expect(map.origin).toEqual({ x: 0, y: 0 });
    expect(map.size).toEqual({ x: 10, y: 8 });
    expect(map.polylines).toHaveLength(4);
    expect(map.polylines[1]).toEqual([{ x: 4.5, y: 1 }, { x: 4.5, y: 3.25 }]);
    expect(map.polylines[3]).toEqual([{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }]);
    expect(map.portals).toEqual([{ bounds: [{ x: 4.5, y: 3.25 }, { x: 4.5, y: 4.25 }], closed: true }]);
    expect(map.lights).toEqual([{ position: { x: 2.5, y: 2.5 }, range: 6, intensity: 1, color: '#eccd8b' }]);
    expect(map.ambientLight).toBe('#808080');
    expect(map.bakedLighting).toBe(false);
    expect(map.image.type).toBe('image/png');
    expect([...map.image.bytes]).toEqual([...pngHeader(1000, 800)]);
  });

  it('reads a file that holds only a map size and an image', () => {
    const map = read({ resolution: { map_size: { x: 4, y: 3 }, pixels_per_grid: 70 }, image: base64Of(pngHeader(280, 210)) });

    expect(map).toMatchObject({ origin: { x: 0, y: 0 }, polylines: [], portals: [], lights: [], ambientLight: null, bakedLighting: false });
  });

  it('takes fields set to null as left out', () => {
    const map = read({ ...cryptFile(), format: null, line_of_sight: null, objects_line_of_sight: null, portals: null, lights: null, environment: null });

    expect(map).toMatchObject({ polylines: [], portals: [], lights: [], ambientLight: null, bakedLighting: false });
  });

  it('ignores fields it does not know', () => {
    expect(read({ ...cryptFile(), software: 'Dungeondraft', creator: { name: 'x' } }).size).toEqual({ x: 10, y: 8 });
  });

  it.each([
    ['text that is not JSON', '{"resolution": ', 'not valid JSON'],
    ['a list', '[]', 'content is missing or not an object'],
    ['null', 'null', 'content is missing or not an object'],
    ['a number', '12', 'content is missing or not an object'],
    ['a string', '"map"', 'content is missing or not an object'],
  ])('refuses %s', (_label, text, problem) => {
    expect(problemOf(text)).toContain(problem);
  });

  it('refuses a text longer than 150 MB before parsing it', () => {
    expect(problemOf('x'.repeat(UVTT_LIMITS.fileBytes + 1))).toBe('The file is larger than 150 MB.');
  });

  it.each([
    ['resolution', undefined, 'The map\'s resolution is missing or not an object.'],
    ['resolution', [], 'The map\'s resolution is missing or not an object.'],
    ['resolution.map_size', undefined, 'The map size is missing or not an object.'],
    ['resolution.map_size', '10x8', 'The map size is missing or not an object.'],
    ['resolution.map_size.x', undefined, 'The map\'s width is missing or not a number.'],
    ['resolution.map_size.x', '10', 'The map\'s width is missing or not a number.'],
    ['resolution.map_size.x', 0, 'The map\'s width is out of range.'],
    ['resolution.map_size.x', -10, 'The map\'s width is out of range.'],
    ['resolution.map_size.x', 0.5, 'The map\'s width is out of range.'],
    ['resolution.map_size.y', 1e-300, 'The map\'s height is out of range.'],
    ['resolution.map_size.y', 4097, 'The map\'s height is out of range.'],
    ['resolution.map_size.y', null, 'The map\'s height is missing or not a number.'],
    ['resolution.map_origin', 3, 'The map\'s origin is missing or not a position.'],
    ['resolution.map_origin.y', 'top', 'The map\'s origin (y) is missing or not a number.'],
    ['resolution.map_origin.x', 1e7, 'The map\'s origin (x) is out of range.'],
    ['line_of_sight', {}, 'The list of wall lines is not a list.'],
    ['line_of_sight.1', { x: 1, y: 1 }, 'Wall line 2 is not a list of positions.'],
    ['line_of_sight.0.2', [9, 7], 'Point 3 of wall line 1 is missing or not a position.'],
    ['line_of_sight.0.2', null, 'Point 3 of wall line 1 is missing or not a position.'],
    ['line_of_sight.0.2.x', '9', 'Point 3 of wall line 1 (x) is missing or not a number.'],
    ['line_of_sight.0.2.y', undefined, 'Point 3 of wall line 1 (y) is missing or not a number.'],
    ['line_of_sight.0.2.y', -1e9, 'Point 3 of wall line 1 (y) is out of range.'],
    ['objects_line_of_sight', 'none', 'The list of object outlines is not a list.'],
    ['objects_line_of_sight.0.0.x', true, 'Point 1 of object outline 1 (x) is missing or not a number.'],
    ['portals', {}, 'The list of doors is not a list.'],
    ['portals.0', 'door', 'Door 1 is missing or not an object.'],
    ['portals.0.bounds', undefined, 'Door 1 does not have two ends.'],
    ['portals.0.bounds', [{ x: 1, y: 1 }], 'Door 1 does not have two ends.'],
    ['portals.0.bounds', [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }], 'Door 1 does not have two ends.'],
    ['portals.0.bounds.1', [4.5, 4.25], 'The second end of door 1 is missing or not a position.'],
    ['portals.0.bounds.0.x', 'left', 'The first end of door 1 (x) is missing or not a number.'],
    ['lights', 'torch', 'The list of lights is not a list.'],
    ['lights.0', 5, 'Light 1 is missing or not an object.'],
    ['lights.0.position', undefined, 'The position of light 1 is missing or not a position.'],
    ['lights.0.position.x', {}, 'The position of light 1 (x) is missing or not a number.'],
    ['lights.0.range', undefined, 'The range of light 1 is missing or not a number.'],
    ['lights.0.range', '6', 'The range of light 1 is missing or not a number.'],
    ['lights.0.range', -1, 'The range of light 1 is out of range.'],
    ['lights.0.range', 1e12, 'The range of light 1 is out of range.'],
    ['image', undefined, 'The file holds no map image.'],
    ['image', '', 'The file holds no map image.'],
    ['image', { data: 'x' }, 'The file holds no map image.'],
    ['image', 'not*base64!', 'The map image in the file is damaged (it is not valid base64).'],
    ['image', 'maps/crypt.png', 'This file refers to its image instead of containing it.'],
    ['image', 'C:\\maps\\Crypt of the Lich.JPG', 'This file refers to its image instead of containing it.'],
    ['image', 'https://example.com/maps/crypt.webp?size=full', 'This file refers to its image instead of containing it.'],
    ['image', 'file:///Users/gm/maps/crypt', 'This file refers to its image instead of containing it.'],
    ['image', base64Of(GIF_START), 'The map image in the file is not a PNG, WebP or JPEG image.'],
    ['image', base64Of(new TextEncoder().encode('<svg onload="alert(1)"/>')), 'The map image in the file is not a PNG, WebP or JPEG image.'],
    ['image', `data:image/png;base64,${base64Of(GIF_START)}`, 'The map image in the file is not a PNG, WebP or JPEG image.'],
  ])('refuses a file whose %s is %j', (path, value, problem) => {
    expect(problemOf(cryptSetting(path, value))).toBe(problem);
  });

  it.each([
    ['a number too large for JSON', '1e999'],
    ['a number below every range', '-1e999'],
  ])('refuses %s wherever a number stands', (_label, number) => {
    const text = JSON.stringify(cryptFile());
    expect(problemOf(text.replace('"range":6', `"range":${number}`))).toBe('The range of light 1 is missing or not a number.');
    expect(problemOf(text.replace('"x":4.5,"y":1}', `"x":${number},"y":1}`))).toBe('Point 1 of wall line 2 (x) is missing or not a number.');
  });

  it.each([
    ['format', '0.3'],
    ['format', { major: 0, minor: 3 }],
    ['resolution.pixels_per_grid', '100'],
    ['resolution.pixels_per_grid', undefined],
    ['resolution.pixels_per_grid', -5],
    ['portals.0.position', 'middle'],
    ['portals.0.rotation', '90'],
    ['portals.0.freestanding', 'no'],
    ['lights.0.shadows', 'soft'],
  ])('is not put off by %s being %j, which it has no use for', (path, value) => {
    expect(read(cryptSetting(path, value))).toEqual(read(cryptFile()));
  });

  it.each([
    [true, true], [1, true], ['true', true], ['yes', true], [undefined, true], [null, true], [{}, true],
    [false, false], [0, false], ['false', false], ['FALSE', false], ['0', false], ['', false],
  ])('reads a door whose "closed" is %j as closed: %s', (written, closed) => {
    expect(read(cryptSetting('portals.0.closed', written)).portals[0]!.closed).toBe(closed);
  });

  it.each([
    [true, true], ['true', true], [1, true],
    [false, false], [0, false], ['false', false], [undefined, false], [null, false], [[], false],
  ])('reads "baked_lighting" of %j as %s', (written, baked) => {
    expect(read(cryptSetting('environment.baked_lighting', written)).bakedLighting).toBe(baked);
  });

  it.each(['', 'fff', 'orange', 'ffeccd8', 0xffffff, null, {}])('gives a light whose colour is %j white light', (written) => {
    expect(read(cryptSetting('lights.0.color', written)).lights[0]!.color).toBe('#ffffff');
  });

  it.each(['bright', -0.5, null, [], '2'])('gives a light whose intensity is %j the usual one', (written) => {
    expect(read(cryptSetting('lights.0.intensity', written)).lights[0]!.intensity).toBe(1);
  });

  it.each([
    ['environment', []], ['environment', 'night'], ['environment.ambient_light', 0.5], ['environment.ambient_light', 'dark'], ['environment.ambient_light', ''],
  ])('reads no ambient light where %s is %j', (path, value) => {
    expect(read(cryptSetting(path, value)).ambientLight).toBeNull();
  });

  it('reads the defaults of what a door and a light may leave out', () => {
    const map = read(cryptWith((file) => {
      file.portals = [{ bounds: [{ x: 1, y: 2 }, { x: 2, y: 2 }] }];
      file.lights = [{ position: { x: 1, y: 1 }, range: 0 }];
    }));

    expect(map.portals).toEqual([{ bounds: [{ x: 1, y: 2 }, { x: 2, y: 2 }], closed: true }]);
    expect(map.lights).toEqual([{ position: { x: 1, y: 1 }, range: 0, intensity: 1, color: '#ffffff' }]);
  });

  it.each([
    ['ffeccd8b', '#eccd8b'],
    ['ECCD8B', '#eccd8b'],
    ['#00102030', '#102030'],
    [' 80ffffff ', '#ffffff'],
  ])('reads the colour %j as %s', (written, color) => {
    expect(read(cryptSetting('lights.0.color', written)).lights[0]!.color).toBe(color);
    expect(read(cryptSetting('environment.ambient_light', written)).ambientLight).toBe(color);
  });

  it('reads an open door and baked lighting', () => {
    expect(read(cryptSetting('portals.0.closed', false)).portals[0]!.closed).toBe(false);
    expect(read(cryptSetting('environment.baked_lighting', true)).bakedLighting).toBe(true);
  });
});

describe('the image of a Universal VTT file', () => {
  it.each([
    ['PNG', pngHeader(10, 10), 'image/png'],
    ['WebP', WEBP_START, 'image/webp'],
    ['JPEG', JPEG_START, 'image/jpeg'],
  ])('knows a %s by its first bytes', (_label, bytes, type) => {
    expect(read(cryptSetting('image', base64Of(bytes))).image.type).toBe(type);
  });

  it('is read past white space, line breaks and the head of a data URL', () => {
    const image = base64Of(pngHeader(1000, 800));
    const wrapped = ` \n data:image/png;base64,${image.slice(0, 20)}\r\n${image.slice(20)}\n`;

    expect([...read(cryptSetting('image', wrapped)).image.bytes]).toEqual([...pngHeader(1000, 800)]);
  });

  it('is read from base64 written for URLs, without padding', () => {
    const bytes = new Uint8Array([...pngHeader(1000, 800), 0xfb, 0xff, 0xfe, 0xff]);
    const standard = base64Of(bytes);
    const forUrls = standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(standard).toMatch(/[+/]/);
    expect(forUrls).not.toBe(standard);

    expect([...read(cryptSetting('image', forUrls)).image.bytes]).toEqual([...bytes]);
  });

  it('goes by the bytes, not by the type a data URL claims', () => {
    expect(read(cryptSetting('image', `data:image/png;base64,${base64Of(JPEG_START)}`)).image.type).toBe('image/jpeg');
  });
});

describe('the limits of a Universal VTT file', () => {
  it('accepts 20,000 wall segments and refuses one more', () => {
    const full = cryptWith((file) => { file.line_of_sight = [lineOf(12_000), lineOf(7_999)]; file.objects_line_of_sight = []; });
    expect(read(full).polylines.map((line) => line.length - 1)).toEqual([12_000, 7_999]);

    const over = cryptWith((file) => { file.line_of_sight = [lineOf(12_000), lineOf(8_000)]; file.objects_line_of_sight = []; });
    expect(problemOf(over)).toBe('The file has more than 20,000 wall segments.');
  });

  it('counts object outlines and doors as wall segments', () => {
    const door = { bounds: [{ x: 1, y: 1 }, { x: 2, y: 1 }] };
    const file = cryptWith((crypt) => {
      crypt.line_of_sight = [lineOf(10_000)];
      crypt.objects_line_of_sight = [lineOf(9_990)];
      crypt.portals = Array.from({ length: 11 }, () => door);
    });

    expect(problemOf(file)).toBe('The file has more than 20,000 wall segments.');
  });

  it.each([
    ['one wall line with too many points', (file: Record<string, unknown>): void => { file.line_of_sight = [lineOf(20_001)]; }],
    ['too many wall lines', (file: Record<string, unknown>): void => { file.line_of_sight = Array.from({ length: 20_001 }, () => []); }],
    ['too many doors', (file: Record<string, unknown>): void => { file.portals = Array.from({ length: 20_001 }, () => null); }],
  ])('refuses %s before reading them', (_label, change) => {
    expect(problemOf(cryptWith(change))).toBe('The file has more than 20,000 wall segments.');
  });

  it('accepts 2,000 lights and refuses one more', () => {
    const light = { position: { x: 1, y: 1 }, range: 2 };
    expect(read(cryptSetting('lights', Array.from({ length: 2_000 }, () => light))).lights).toHaveLength(2_000);
    expect(problemOf(cryptSetting('lights', Array.from({ length: 2_001 }, () => light)))).toBe('The file has more than 2,000 lights.');
  });
});

describe('what a Universal VTT file cannot do', () => {
  it('never throws, whatever the text', () => {
    const texts = [
      '', ' ', '{', '{}', '{"resolution":{}}', '{"__proto__":{"resolution":{"map_size":{"x":1,"y":1}}}}',
      '{"resolution":{"map_size":{"x":1,"y":1},"pixels_per_grid":70},"image":"AAAA","lights":[null]}',
      JSON.stringify({ resolution: { map_size: { x: 1, y: 1, toString: 'x' }, pixels_per_grid: 70 }, line_of_sight: [[[[[]]]]] }),
      `{"a":${'['.repeat(2000)}${']'.repeat(2000)}}`,
    ];
    for (const text of texts) {
      expect(parseUvtt(text).ok).toBe(false);
    }
  });

  it('reads only what the file itself holds, whatever other code has put on every object', () => {
    const polluted: Record<string, unknown> = {
      x: 3, y: 3, range: 6, position: { x: 1, y: 1 }, bounds: [{ x: 1, y: 1 }, { x: 2, y: 1 }],
      map_size: { x: 10, y: 8 }, resolution: { map_size: { x: 10, y: 8 } }, image: cryptFile().image,
      lights: [{ position: { x: 1, y: 1 }, range: 2 }], baked_lighting: true, ambient_light: 'ff000000', closed: false,
    };
    const prototype = Object.prototype as Record<string, unknown>;
    Object.assign(prototype, polluted);
    try {
      expect(problemOf(cryptSetting('lights.0.range', undefined))).toBe('The range of light 1 is missing or not a number.');
      expect(problemOf(cryptSetting('lights.0.position', undefined))).toBe('The position of light 1 is missing or not a position.');
      expect(problemOf(cryptSetting('line_of_sight.0.2.x', undefined))).toBe('Point 3 of wall line 1 (x) is missing or not a number.');
      expect(problemOf(cryptSetting('portals.0.bounds', undefined))).toBe('Door 1 does not have two ends.');
      expect(problemOf(cryptSetting('resolution.map_size', undefined))).toBe('The map size is missing or not an object.');
      expect(problemOf(cryptSetting('resolution', undefined))).toBe('The map\'s resolution is missing or not an object.');
      expect(problemOf(cryptSetting('image', undefined))).toBe('The file holds no map image.');
      const bare = read(cryptWith((file) => { delete file.lights; delete file.environment; delete (file.portals as Array<Record<string, unknown>>)[0]!.closed; }));
      expect(bare).toMatchObject({ lights: [], bakedLighting: false, ambientLight: null, portals: [{ closed: true }] });
    } finally {
      for (const key of Object.keys(polluted)) delete prototype[key];
    }
  });
});

describe('Universal VTT file names', () => {
  it.each(['crypt.dd2vtt', 'Crypt.UVTT', 'the.old.mill.df2vtt'])('knows %s as a map', (name) => {
    expect(isUvttFileName(name)).toBe(true);
  });

  it.each(['crypt.png', 'crypt.json', 'dd2vtt', 'crypt.dd2vtt.zip', ''])('does not take %j for one', (name) => {
    expect(isUvttFileName(name)).toBe(false);
  });

  it.each([
    ['Crypt of the Lich.dd2vtt', 'Crypt of the Lich'],
    ['the.old.mill.uvtt', 'the.old.mill'],
    ['Cave #3: [night]/v2?.df2vtt', 'Cave 3 night v2'],
    ['..hidden.dd2vtt', 'hidden'],
    ['.dd2vtt', 'dd2vtt'],
    ['???.uvtt', 'Imported map'],
  ])('names the scene of %j %j', (fileName, name) => {
    expect(uvttSceneName(fileName)).toBe(name);
  });
});
