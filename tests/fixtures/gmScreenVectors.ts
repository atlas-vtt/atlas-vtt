/**
 * Fixed vectors of the GM screen's channel, worked out with Node's own HKDF and AES-GCM (not Web
 * Crypto): the link's key is the bytes 0 to 31, Atlas's opening value 0xa0 to 0xaf, the device's 0xd0
 * to 0xdf. Any implementation of the channel, in any browser, must seal and number exactly so.
 */
export const GM_SCREEN_VECTORS = {
  link: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
  gmOpening: 'oKGio6SlpqeoqaqrrK2urw==',
  deviceOpening: '0NHS09TV1tfY2drb3N3e3w==',
  /** Atlas's first frame: `{"t":"press-answer","id":1,"refused":null}`, counter 1. */
  gmMessage: { t: 'press-answer', id: 1, refused: null },
  gmFrame: { t: 'sealed', n: 1, d: 'qDNrxyrNDX1tXCv5K9tJ9lJsTnFxvS02eSmumXkywrA2AsZX+CMC5dyVDx1uP9cZrxxlr8I/9z6yEg==' },
  /** The device's first frame: `{"t":"statblock-view","id":null}`, counter 1. */
  deviceMessage: { t: 'statblock-view', id: null },
  deviceFrame: { t: 'sealed', n: 1, d: 'eMLOyJqWjnVWyb9cONgR/wXW3uzfCYx46CSZwMt/W+Cg5R24h68OktnXbWabuIwA' },
  /** Check numbers of two knocks under the link. */
  checks: { abcdefghijklmnopqrst: '6484', abcdefghijklmnopqrsu: '3507' },
} as const;
