import { describe, expect, it } from 'vitest';
import { parseFeedback } from '../../../../src/app/online/protocol/diagnostics.ts';
import { CLOSE, MAX_GM_FRAME } from '../../../../src/app/online/protocol/relay.ts';
import {
  BEAT_LINE, MAX_STREAM_BATCH, MAX_STREAM_LINE, PONG_LINE, StreamReader, closeLine, frameLine, parseStreamSend, sessionLine, streamPath, streamSendBody, streamSendPath,
  type StreamLine,
} from '../../../../src/app/online/protocol/stream.ts';

const CODE = 'abcdefghijklmnopqrstuvwxyz';
const SECRET = 'Zk3_pL9xQ2-vB7nM4tR8wY1cE5hJ6uA0ZZZZZZZZZZZ';
const WELCOME = '{"v":1,"t":"welcome","role":"player","id":"aaaaaaaaaaaaaaaaaaaa","key":"k","gmOnline":true}';

const readAll = (text: string): StreamLine[] | null => new StreamReader().read(text);

describe('the stream\'s paths', () => {
  it('name the table and nothing else: no secret, no key', () => {
    expect(streamPath(CODE)).toBe(`/api/tables/${CODE}/stream`);
    expect(streamSendPath(CODE)).toBe(`/api/tables/${CODE}/stream/send`);
  });
});

describe('the stream\'s lines', () => {
  it('are read back as they were written: the session, frames, a pong, a beat and the close', () => {
    const stream = sessionLine(SECRET) + frameLine(WELCOME) + PONG_LINE + BEAT_LINE + frameLine('{"v":1,"t":"gm","online":false}') + closeLine(CLOSE.kicked, 'removed by the GM');
    expect(readAll(stream)).toEqual([
      { kind: 'session', secret: SECRET },
      { kind: 'frame', text: WELCOME },
      { kind: 'pong' },
      { kind: 'beat' },
      { kind: 'frame', text: '{"v":1,"t":"gm","online":false}' },
      { kind: 'close', code: CLOSE.kicked, reason: 'removed by the GM' },
    ]);
  });

  it('are read the same however the network cut the stream into pieces', () => {
    const stream = sessionLine(SECRET) + frameLine(WELCOME) + BEAT_LINE + PONG_LINE + closeLine(CLOSE.ended, 'table ended');
    const whole = readAll(stream);
    for (const size of [1, 2, 3, 7, 16, 61]) {
      const reader = new StreamReader();
      const lines: StreamLine[] = [];
      for (let at = 0; at < stream.length; at += size) lines.push(...(reader.read(stream.slice(at, at + size)) ?? []));
      expect(lines, `pieces of ${size}`).toEqual(whole);
    }
  });

  it('keep a frame whole whatever it holds: a line break in it never ends it or starts another event', () => {
    const odd = 'a\nevent: close\r\ndata: {"code":4008}\rb';
    expect(readAll(frameLine(odd))).toEqual([{ kind: 'frame', text: 'a\nevent: close\ndata: {"code":4008}\nb' }]);
    // The relay's frames are JSON, where a line break is always escaped: they come through to the letter.
    const frame = JSON.stringify({ v: 1, t: 'game', body: { text: 'two\nlines\r\n: no comment' } });
    expect(readAll(frameLine(frame))).toEqual([{ kind: 'frame', text: frame }]);
  });

  it('read the largest frame a GM sends, and give up a line longer than any the relay writes', () => {
    const large = 'x'.repeat(MAX_GM_FRAME);
    expect(readAll(frameLine(large))).toEqual([{ kind: 'frame', text: large }]);
    const reader = new StreamReader();
    expect(reader.read(`data: ${'x'.repeat(MAX_STREAM_LINE)}`)).toBeNull();
  });

  it('pass over what they do not know, and take nothing malformed for a session or a close', () => {
    expect(readAll('event: later\ndata: {"more":true}\n\nid: 7\nretry: 100\n\nevent: pong\n\n')).toEqual([]);
    for (const text of ['event: session\ndata: short\n\n', 'event: session\ndata: has spaces in the secret here\n\n', 'event: session\n\n']) expect(readAll(text), text).toEqual([]);
    for (const data of ['', 'x', '{}', '{"code":"4008"}', '{"code":4008.5}', '{"code":12}', '{"code":70000}', 'null', '[4008]']) expect(readAll(`event: close\ndata: ${data}\n\n`), data).toEqual([]);
    expect(readAll('event: close\ndata: {"code":4003}\n\n')).toEqual([{ kind: 'close', code: 4003, reason: '' }]);
    expect(readAll(closeLine(4003, 'r'.repeat(500)))?.[0]).toMatchObject({ reason: 'r'.repeat(200) });
  });

  it('tolerate the line ends and the missing space that other writers of this framing use', () => {
    expect(readAll(`event:session\r\ndata:${SECRET}\r\n\r\ndata:{}\r\n\r\n`)).toEqual([{ kind: 'session', secret: SECRET }, { kind: 'frame', text: '{}' }]);
  });
});

describe('what a page posts', () => {
  it('is read back as it was written: the secret, the frames in order, a ping, a goodbye', () => {
    expect(parseStreamSend(streamSendBody(SECRET, ['a', 'b', 'c']))).toEqual({ v: 1, s: SECRET, frames: ['a', 'b', 'c'] });
    expect(parseStreamSend(streamSendBody(SECRET, [], { ping: true }))).toEqual({ v: 1, s: SECRET, frames: [], ping: true });
    expect(parseStreamSend(streamSendBody(SECRET, [], { bye: true }))).toEqual({ v: 1, s: SECRET, frames: [], bye: true });
    expect(parseStreamSend(streamSendBody(SECRET, Array.from({ length: MAX_STREAM_BATCH }, () => 'x')))?.frames).toHaveLength(MAX_STREAM_BATCH);
  });

  it('is refused when it is malformed', () => {
    const body = { v: 1, s: SECRET, frames: ['a'] };
    for (const broken of [
      { ...body, v: 2 }, { ...body, s: 'short' }, { ...body, s: 7 }, { ...body, s: `${SECRET} ` }, { v: 1, frames: [] }, { v: 1, s: SECRET },
      { ...body, frames: 'a' }, { ...body, frames: [1] }, { ...body, frames: [{ v: 1 }] }, { ...body, frames: [['a']] }, { ...body, frames: Array.from({ length: MAX_STREAM_BATCH + 1 }, () => 'x') },
      { ...body, ping: false }, { ...body, ping: 'yes' }, { ...body, bye: false }, { ...body, bye: 1 }, null, [], 'x', 3,
    ]) expect(parseStreamSend(JSON.stringify(broken)), JSON.stringify(broken)?.slice(0, 80)).toBeNull();
    for (const text of ['', '{', 'undefined', `{"v":1,"s":"${SECRET}","frames":["a"]`]) expect(parseStreamSend(text), text).toBeNull();
  });
});

describe('the lane in feedback\'s diagnostics', () => {
  const attempt = { socket: 'answered', tries: 0, sinceFirstMs: null, lastEnd: null, offline: false, hidden: false, site: 'site' };
  const post = (lane: unknown): unknown => ({
    v: 1, source: 'play', text: 'stuck',
    diagnostics: { build: 'dev', browser: 'Safari 26', os: 'iOS', table: null, errors: [], connection: { status: 'connected', reconnects: 0, lastClose: null, latencyMs: 40, players: null, attempt: lane === undefined ? attempt : { ...attempt, lane } } },
  });

  it('is read for both lanes, left out by an older page, and refused when it is neither', () => {
    expect(parseFeedback(post('stream'))?.diagnostics?.connection?.attempt?.lane).toBe('stream');
    expect(parseFeedback(post('socket'))?.diagnostics?.connection?.attempt?.lane).toBe('socket');
    const older = parseFeedback(post(undefined))?.diagnostics?.connection?.attempt;
    expect(older).toEqual(attempt);
    for (const lane of ['polling', '', 3, null]) expect(parseFeedback(post(lane)), String(lane)).toBeNull();
  });
});
