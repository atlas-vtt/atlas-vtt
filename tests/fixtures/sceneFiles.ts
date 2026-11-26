/**
 * Scene files as Atlas saves them, with every branch a scene file holds filled. The shapes are
 * taken from scenes saved by Atlas in real vaults: tokens and initiative entries carry the
 * resource fields files keep (`resourceFileFormat.ts`), levels carry their alignment.
 */

export const RICH_SCENE_PATH = 'atlas-vtt/collections/Demo/scenes/Hallow Keep.atlasmap';
export const PLAIN_SCENE_PATH = 'atlas-vtt/collections/Demo/scenes/Stable.atlasmap';

const GROUND = 'level_ground';
const CELLAR = 'level_cellar';
const MASK_GROUND = 'data:image/png;base64,R1JPVU5E';
const MASK_CELLAR = 'data:image/png;base64,Q0VMTEFS';

const square = (x: number, y: number, side: number): Array<{ x: number; y: number }> => [
  { x, y }, { x: x + side, y }, { x: x + side, y: y + side }, { x, y: y + side },
];

const objects = {
  tokens: {
    tok_skeleton: {
      x: 750.14, y: 749.94, imagePath: 'atlas-vtt/assets/token_skeleton.png', kind: 'character', name: 'Skeleton', showRing: false,
      statblockPath: 'atlas-vtt/collections/Demo/statblocks/Skeleton.md', difficulty: 'CR 1/4', id: 'tok_skeleton', instanceNumber: 1, layer: 6,
      hp: { current: 9, max: 13 }, conditions: ['builtin:5e:frightened'], conditionValues: { 'builtin:5e:frightened': 2 }, level: GROUND,
    },
    tok_rogue: {
      x: 420, y: 315, imagePath: 'atlas-vtt/assets/token_rogue.png', kind: 'token', name: 'Rogue', id: 'tok_rogue', instanceNumber: 1, layer: 7,
      ringColor: '#e5a22e', vision: { enabled: true, range: 60 }, light: { bright: 20, dim: 40, color: '#ff9a3c', intensity: 1, kind: 'torch' }, level: CELLAR,
    },
  },
  fog: {
    fog_brush: { id: 'fog_brush', kind: 'fog', timestamp: 1795217911157, type: 'brush', points: [{ x: 1918.12, y: 3058.93 }, { x: 1894.15, y: 3077.58 }], radius: 40, level: GROUND },
  },
  pins: {
    pin_note: { id: 'pin_note', kind: 'pin', x: 850.68, y: 57.44, notePath: 'atlas-vtt/collections/Demo/notes/README.md', icon: 'note', level: GROUND },
  },
  texts: {
    text_read: {
      id: 'text_read', kind: 'text', x: 2842.67, y: 796.48, text: 'Read the note!', fontSize: 24, fontFamily: 'Arial', color: '#FFFFFF', backgroundColor: '#000000',
      padding: 8, borderRadius: 4, opacity: 0.7, align: 'center', bold: false, italic: false, rotation: 0, scale: 1, level: GROUND,
    },
  },
  drawings: {
    drawing_pen: { id: 'drawing_pen', kind: 'drawing', timestamp: 1794603037696, type: 'pen', color: '#ffffff', width: 12.5, opacity: 1, points: [{ x: 2015.77, y: 2909.67 }, { x: 2041.3, y: 2907.19 }], level: GROUND },
  },
  walls: {
    wall_solid: { id: 'wall_solid', kind: 'wall', type: 'solid', p1: { x: 903.48, y: 612.3 }, p2: { x: 1203.48, y: 612.3 }, chainId: 'chain_a', closed: true, level: GROUND },
    wall_door: { id: 'wall_door', kind: 'wall', type: 'door', p1: { x: 1203.48, y: 612.3 }, p2: { x: 1273.48, y: 612.3 }, closed: false, locked: true, level: GROUND },
  },
  lights: {
    light_torch: {
      id: 'light_torch', kind: 'light', levels: [CELLAR], x: 2295.96, y: 3581.87,
      emission: { bright: 20, dim: 40, color: '#ff9a3c', intensity: 1, animation: 'torch', sourceRadius: 2, kind: 'torch', preset: 'torch' },
    },
  },
  audios: {
    audio_fire: { id: 'audio_fire', kind: 'audio', x: 300, y: 300, innerRadius: 70, outerRadius: 350, volume: 0.6, soundId: 'fire', loop: true, level: GROUND },
  },
  lightZones: {
    zone_cave: { id: 'zone_cave', kind: 'light-zone', levels: [CELLAR], polygon: square(1933.3, 3462.5, 100), ambient: 0, name: 'cave' },
  },
  levelLinks: {
    levellink_stairs: { id: 'levellink_stairs', kind: 'level-link', polygon: square(2550, 3000, 300), levels: [GROUND, CELLAR], flight: { foot: 2, rows: 3 } },
  },
  levelSurfaces: {
    levelsurface_well: { id: 'levelsurface_well', kind: 'level-surface', polygon: square(2850, 3000, 300), open: true, level: GROUND, name: 'Stair well' },
  },
  mapFeatures: {
    feature_platform: { id: 'feature_platform', kind: 'map-feature', polygon: square(900, 3300, 450), name: 'Platform' },
  },
  liquids: {
    liquid_pool: { id: 'liquid_pool', kind: 'liquid', liquid: 'water', polygon: square(741.35, 1807.47, 120), level: GROUND },
  },
  measures: {
    measure_cone: {
      id: 'measure_cone', kind: 'measure', shape: 'cone', points: [{ x: 1837.56, y: 2137.54 }, { x: 2984.07, y: 2491.81 }],
      origin: { tokenIds: ['tok_skeleton'], unseenAtStart: false }, effect: 'shadow', color: '#086ddd', level: GROUND,
    },
  },
};

const widgetSettings = {
  widgets: {
    'timer-torch': { id: 'timer-torch', label: 'Torch', icon: 'torch', color: '#e5a22e', scope: 'scene', visible: true, visibleToPlayers: true, order: 1, type: 'timer', value: 1800, duration: 1800, direction: 'down' },
    'counter-fear': { id: 'counter-fear', label: 'Fear', icon: 'terror', color: '#913db8', scope: 'scene', visible: true, visibleToPlayers: true, order: 2, type: 'counter', value: 3 },
  },
  globalVisible: true,
  position: 'top',
  scale: 1,
};

const initiative = {
  entries: [
    {
      tokenId: 'tok_skeleton', name: 'Skeleton', initiative: 15, initiativeModifier: 2, imagePath: 'atlas-vtt/assets/token_skeleton.png', isNPC: true,
      statblockPath: 'atlas-vtt/collections/Demo/statblocks/Skeleton.md', id: 'init_skeleton', order: 0, isActive: true, rolledModifier: 2, hp: { current: 9, max: 13 }, isDefeated: false,
    },
    { tokenId: 'tok_rogue', name: 'Rogue', initiative: 12, initiativeModifier: 3, imagePath: 'atlas-vtt/assets/token_rogue.png', isNPC: false, id: 'init_rogue', order: 1, isActive: false, isDefeated: false },
  ],
  round: 2,
  isActive: true,
};

const diceLog = [
  { id: 'roll_hooves', timestamp: 1794964247592, formula: '2d6+4', rolls: [{ die: 'd6', value: 4, max: 6 }, { die: 'd6', value: 1, max: 6 }], modifiers: 4, total: 9, crit: null, player: 'Player' },
  { id: 'roll_attack', timestamp: 1794964724353, formula: '1d20 + 2', rolls: [{ die: 'd20', value: 19, max: 20 }], modifiers: 2, total: 21, crit: null, player: 'Player' },
];

/** A scene of two levels, shown on the cellar, with something of everything a scene file holds. */
export function richSceneFile(): { version: number; state: Record<string, unknown> } {
  return {
    version: 5,
    state: {
      schema: 'atlas-vtt',
      version: 5,
      mapPath: RICH_SCENE_PATH,
      background: 'atlas-vtt/assets/ground.webp',
      levels: [
        { id: GROUND, elevation: { bottom: 0, top: 10 }, background: 'atlas-vtt/assets/ground.webp', name: 'Ground floor', alignment: { offset: { x: 170.5, y: 151.9 }, scale: 1, stretch: { x: 1, y: 1 } } },
        { id: CELLAR, elevation: { bottom: -10, top: 0 }, background: 'atlas-vtt/assets/cellar.webp', name: 'Cellar' },
      ],
      viewedLevel: CELLAR,
      grid: {
        enabled: true, visible: true, snapToGrid: true, type: 'hex-vertical', size: 72, offsetX: 3.5, offsetY: -2, opacity: 0.4, lineType: 'dotted', lineWidth: 2,
        unitType: 'feet', unitDistance: 5, measurementType: 'units', cellNumbers: 'column-row', cellNumberOpacity: 0.8, mapStretch: { x: 1, y: 1.047 },
      },
      objects,
      camera: { x: -120.5, y: 64.25, scale: 0.85 },
      widgetValues: { 'counter-fear': 3 },
      widgetSettings,
      dmNotePath: 'atlas-vtt/collections/Demo/notes/Hallow Keep.md',
      tokenSettings: { showNameplates: true, hiddenResources: ['stress'], showInstanceBadges: false, tokenRingSize: 1.2, showHPBars: true, showStressBars: false },
      initiative,
      initiativeTrackerOpen: true,
      diceLog,
      pinnedNotePreviews: { pin_note: { left: 120, top: 80, width: 420, height: 360, anchorId: 'pin_note', notePath: 'atlas-vtt/collections/Demo/notes/README.md' } },
      lootRoller: { open: true, position: { x: 40, y: 60 }, disabledViews: [], excludedRarities: ['legendary'], count: 3, pane: 'results' },
      lighting: { enabled: true, ambient: 0.2, exploredColor: '#c0d0ff', litThreshold: 0.3 },
      exploredMask: MASK_GROUND,
      exploredMasks: { [CELLAR]: MASK_CELLAR },
      playerFrames: [{ centerX: 4616.06, centerY: 4159.83, scale: 0.6, width: 1732.12, height: 1119.66 }],
      sound: { mood: 'mood-dungeon' },
      roomSizes: { brushSize: 40, bucketRadius: 280 },
    },
  };
}

/** A scene of one level as most scenes are: tokens, walls, fog and a fight, without levels or frames. */
export function plainSceneFile(): { version: number; state: Record<string, unknown> } {
  const { levelLinks: _links, levelSurfaces: _surfaces, ...flat } = objects;
  const unlevelled = Object.fromEntries(Object.entries(flat).map(([kind, records]) => [
    kind,
    Object.fromEntries(Object.entries(records).map(([id, record]) => {
      const { level: _level, levels: _levels, ...rest } = record as Record<string, unknown>;
      return [id, rest];
    })),
  ]));
  return {
    version: 4,
    state: {
      schema: 'atlas-vtt',
      version: 4,
      mapPath: PLAIN_SCENE_PATH,
      background: 'atlas-vtt/assets/stable.webp',
      grid: { enabled: true, visible: false, snapToGrid: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5, lineType: 'solid', lineWidth: 1, unitType: 'feet', unitDistance: 5, measurementType: 'units' },
      objects: unlevelled,
      camera: { x: 0, y: 0, scale: 1 },
      widgetValues: {},
      widgetSettings: { widgets: {}, globalVisible: true, position: 'top', scale: 1 },
      dmNotePath: null,
      tokenSettings: { showNameplates: false, hiddenResources: ['stress'], showInstanceBadges: true, tokenRingSize: 1, showHPBars: true, showStressBars: false },
      initiative,
      initiativeTrackerOpen: false,
      diceLog,
      pinnedNotePreviews: {},
      lootRoller: { open: false, disabledViews: [], excludedRarities: [], count: 1, pane: 'results' },
      lighting: { enabled: false, ambient: 0.1 },
      exploredMask: null,
    },
  };
}
