import { addCustomLook, type CustomDiceLook, type FaceArtSet } from '../app/dice3d/customLooks';
import { parseHex } from '../app/dice3d/diceLook';
import type { DieBody } from '../app/dice3d/dieBody';
import type { DisposerSet } from './disposers';
import type { Disposer } from './types/common';
import type { DiceLookSpec } from './types/dice';

/** The longest look name Atlas shows in its settings. */
export const MAX_LOOK_NAME = 64;

function fail(what: string): never {
  throw new Error(`[Atlas API] dice.registerLook: ${what}.`);
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isColour = (value: unknown): value is string => typeof value === 'string' && parseHex(value) !== null && value.trim() === value;

/** A guarded call of the extension's `faces` or `bump`: a throw becomes a rejection, so one face set failing paints Atlas's numerals. */
function guarded(ask: (sides: DieBody) => unknown, owner: object): (body: DieBody) => Promise<FaceArtSet> {
  return (body) => {
    try {
      return Promise.resolve(ask.call(owner, body) as FaceArtSet);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

/** The spec read once and checked; the result holds the extension's functions, guarded, and nothing else of it. */
function checkedLook(extensionId: string, spec: unknown): CustomDiceLook {
  if (typeof spec !== 'object' || spec === null) fail('the look must be a DiceLookSpec');
  const given = spec as Record<string, unknown>;
  const { id, name, faces, bump, body, preview, fill } = given;
  if (!isText(id)) fail('"id" must be a non-empty string');
  if (!isText(name)) fail('"name" must be a non-empty string');
  if (name.trim().length > MAX_LOOK_NAME) fail(`"name" must be at most ${MAX_LOOK_NAME} characters`);
  if (typeof faces !== 'function') fail('"faces" must be a function');
  if (bump !== undefined && typeof bump !== 'function') fail('"bump" must be a function when given');
  if (preview !== undefined && typeof preview !== 'string') fail('"preview" must be a URL when given');
  if (fill !== undefined && fill !== 'numeral' && fill !== 'face') fail('"fill" must be "numeral" or "face" when given');
  let colour: unknown;
  let ink: unknown;
  if (body !== undefined) {
    if (typeof body !== 'object' || body === null) fail('"body" must be { colour?, ink? } when given');
    ({ colour, ink } = body as Record<string, unknown>);
    if (colour !== undefined && !isColour(colour)) fail('"body.colour" must be #rrggbb when given');
    if (ink !== undefined && !isColour(ink)) fail('"body.ink" must be #rrggbb when given');
  }
  return Object.freeze({
    id: `${extensionId}:${id}`,
    name: name.trim(),
    faces: guarded(faces as (sides: DieBody) => unknown, given),
    ...(typeof bump === 'function' ? { bump: guarded(bump as (sides: DieBody) => unknown, given) } : {}),
    body: typeof colour === 'string' ? colour : null,
    ink: typeof ink === 'string' ? ink : null,
    preview: typeof preview === 'string' && preview !== '' ? preview : null,
    ...(fill === 'face' ? { fill: 'face' as const } : {}),
  });
}

/** `dice.registerLook` for one extension: each look is removed by its disposer, or when the extension or Atlas unloads. */
export function registerLookFor(extensionId: string, disposers: DisposerSet): (spec: DiceLookSpec) => Disposer {
  return (spec: DiceLookSpec): Disposer => {
    const look = checkedLook(extensionId, spec);
    let remove: () => void;
    try {
      remove = addCustomLook(look);
    } catch {
      fail(`this extension already registered a look "${look.id.slice(extensionId.length + 1)}"`);
    }
    return disposers.add(remove);
  };
}
