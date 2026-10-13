import type { TokenEntity } from '../../src/app/types';
import type { LightEmission, LightSource } from '../../src/app/types/lightingTypes';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { fuzzRooms, rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import type { PictureScene } from './visibilityPictureScene';
import { wall } from './visibilityScenes';

const SIZE = 2048;

function token(id: string, at: Point, extra: Pick<TokenEntity, 'rotation' | 'vision'> | Record<string, never> = {}): TokenEntity {
  return { id, kind: 'token', imagePath: '', x: at.x, y: at.y, size: 1, layer: 0, rotation: 0, isHidden: false, vision: { enabled: true }, ...extra };
}

function light(id: string, at: Point, emission: Partial<LightEmission> = {}, rotation?: number): LightSource {
  return { id, kind: 'light', x: at.x, y: at.y, emission: { bright: 20, dim: 40, color: '#ffcc88', intensity: 1, animation: 'none', ...emission }, ...(rotation !== undefined && { rotation }) };
}

/** Turns points by `degrees` about the middle of the map. */
function turner(degrees: number): (p: Point) => Point {
  const a = (degrees * Math.PI) / 180, c = SIZE / 2, cos = Math.cos(a), sin = Math.sin(a);
  return (p) => ({ x: c + (p.x - c) * cos - (p.y - c) * sin, y: c + (p.x - c) * sin + (p.y - c) * cos });
}

function turnedScene(scene: PictureScene, degrees: number): PictureScene {
  const turn = turner(degrees);
  const walls = scene.walls.map((w) => ({ ...w, p1: turn(w.p1), p2: turn(w.p2) }));
  const tokens = Object.fromEntries(Object.entries(scene.tokens).map(([id, t]) => [id, { ...t, ...turn(t) }]));
  const lights = Object.fromEntries(Object.entries(scene.lights).map(([id, l]) => [id, { ...l, ...turn(l) }]));
  return { ...scene, name: `${scene.name} turned ${degrees}°`, walls, tokens, lights, focus: turn(scene.focus) };
}

/** The leak fuzz's rooms with doors and one-way walls; tokens with cones, darkvision and one standing in magical darkness; beams and lamps. */
function rooms(): PictureScene {
  const list = fuzzRooms(5, 6);
  const walls = list.flatMap((room) => room.walls);
  const centres = list.map((room) => ({ x: room.centre[0], y: room.centre[1] }));
  const at = (i: number): Point => centres[i % centres.length]!;
  const tokens: Record<string, TokenEntity> = {
    open: token('open', at(0)),
    cone: token('cone', at(1), { rotation: 30, vision: { enabled: true, angle: 90 } }),
    dark: token('dark', at(2), { vision: { enabled: true, range: 20, senses: [{ id: 'darkvision', range: 60 }] } }),
    lost: token('lost', { x: at(3).x + 5, y: at(3).y }, { vision: { enabled: true, range: 30 } }),
  };
  const lights: Record<string, LightSource> = {
    lamp: light('lamp', list[0]!.lights[0] ? { x: list[0]!.lights[0][0], y: list[0]!.lights[0][1] } : at(0)),
    beam: light('beam', { x: at(4).x + 10, y: at(4).y - 10 }, { bright: 30, dim: 60, angle: 60 }, 120),
    shade: light('shade', at(3), { darkness: true, bright: 0, dim: 15 }),
    far: light('far', at(5), { bright: 10, dim: 25 }),
  };
  return { name: 'rooms', size: SIZE, walls, tokens, lights, focus: at(0) };
}

/** A slanted corridor drawn in short pieces, with side walls beyond it. */
function corridor(): PictureScene {
  const rand = rng(77);
  const walls: WallSegment[] = [];
  const at = (s: number, d: number): Point => ({ x: 200 + s * 0.96 - d * 0.28, y: 900 + s * 0.28 + d * 0.96 });
  for (let s = 0; s + 48 <= 1600; s += 48) walls.push(wall(at(s, 0), at(s + 48, 0)), wall(at(s, 90), at(s + 48, 90)));
  for (let i = 0; i < 150; i++) {
    const p = { x: rand() * SIZE, y: rand() * SIZE }, a = rand() * Math.PI * 2, l = 30 + rand() * 120;
    walls.push(wall(p, { x: p.x + Math.cos(a) * l, y: p.y + Math.sin(a) * l }));
  }
  const tokens = { walker: token('walker', at(300, 45)), side: token('side', at(800, 0.75), { rotation: 75, vision: { enabled: true, angle: 120 } }) };
  const lights = { torch: light('torch', at(500, 30), { bright: 25, dim: 50 }) };
  return { name: 'corridor', size: SIZE, walls, tokens, lights, focus: at(300, 45) };
}

/** An open hall of square pillars, seen from among them. */
function pillars(): PictureScene {
  const rand = rng(91);
  const walls: WallSegment[] = [];
  const clear = [{ x: 1000, y: 1010 }, { x: 700, y: 1300 }, { x: 1100, y: 980 }];
  for (let i = 0; i < 300; i++) {
    const cx = 60 + rand() * (SIZE - 120), cy = 60 + rand() * (SIZE - 120), s = 8 + rand() * 20;
    if (clear.some((p) => Math.hypot(p.x - cx, p.y - cy) < 60)) continue;
    const c = [{ x: cx - s, y: cy - s }, { x: cx + s, y: cy - s }, { x: cx + s, y: cy + s }, { x: cx - s, y: cy + s }];
    c.forEach((p, k) => walls.push(wall(p, c[(k + 1) % 4]!)));
  }
  const tokens = { hall: token('hall', { x: 1000, y: 1010 }), watcher: token('watcher', { x: 700, y: 1300 }, { rotation: 200, vision: { enabled: true, angle: 45 } }) };
  const lights = { brazier: light('brazier', { x: 1100, y: 980 }, { bright: 40, dim: 80 }) };
  return { name: 'pillars', size: SIZE, walls, tokens, lights, focus: { x: 1000, y: 1010 } };
}

export function pictureScenes(): PictureScene[] {
  return [rooms(), corridor(), pillars(), turnedScene(rooms(), 17), turnedScene(corridor(), 31)];
}
