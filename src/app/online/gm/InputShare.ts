import type { AssetRef, DeltaOf, GmMessage, SharedLightingScene } from '../protocol/index.ts';
import type { LightingSource } from './atlasLighting.ts';
import type { SceneState, SceneStore } from './atlasView.ts';
import { sha256Hex } from './assetServe.ts';
import { Pacer, type PacerClock } from '../marks/index.ts';
import { sharedFog, sharedLightingScene, sharedSight } from './sceneInputs.ts';
import { SequencedList } from './sequencedList.ts';
import { levelObjects } from '../../levels/levelObjects';
import { levelExploredMask } from '../../levels/sceneLevels';

export interface InputSharePorts extends PacerClock {
  send(body: GmMessage, to?: string): void;
  randomId(): string;
  /** The ids of the tokens the players see now, or null while the tab cannot say (no renderer, loading). */
  shownTokens(): ReadonlySet<string> | null;
  /** The random id players know a token by, the one its entry in the token list has. */
  tokenAlias(tokenId: string): string;
  /** Where the GM's lighting reads its rules and measurement, or null while it cannot be read. */
  lightingSource(): LightingSource | null;
}

/** The shortest time between two sends of the scene's inputs, as for the token list. */
export const INPUT_INTERVAL_MS = 66;
/** The shortest time between two explored memories: the GM saves one every few seconds while tokens explore. */
export const EXPLORED_INTERVAL_MS = 5_000;

const PNG_DATA_URL = 'data:image/png;base64,';

/** The PNG bytes of a saved explored memory (a data URL), or null for none or anything else. */
function maskBytes(mask: string | null): Uint8Array<ArrayBuffer> | null {
  if (mask === null || !mask.startsWith(PNG_DATA_URL)) return null;
  try {
    const text = atob(mask.slice(PNG_DATA_URL.length));
    return Uint8Array.from(text, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

interface Sent {
  readonly scene: string;
  readonly text: string;
  readonly body: GmMessage;
}

/** What `lighting` was last worked out from: it is worked out again only when one of these changes. */
interface LightingKey {
  readonly walls: unknown;
  readonly zones: unknown;
  readonly grid: unknown;
  readonly rules: unknown;
  readonly unitDistance: number;
  readonly scene: SharedLightingScene;
  /** The scene last published, or null before it was. */
  sent: SharedLightingScene | null;
}

/**
 * The inputs players rebuild the scene's fog and lighting from, sent to all whenever they change
 * (fog and sight as deltas from the last where those are smaller), at most every `INPUT_INTERVAL_MS`: the committed fog of every shared scene and, for a lit
 * one, its walls, zones and senses (`lighting`), its lighting, lights and tokens (`sight`) and the
 * explored memory the GM last saved (`explored`, served by hash).
 */
export class InputShare {
  private readonly store: SceneStore;
  private readonly ports: InputSharePorts;
  private scene: { readonly id: string; readonly lit: boolean } | null = null;
  private readonly last = new Map<GmMessage['t'], Sent>();
  private fogOf: unknown = undefined;
  private lighting: LightingKey | null = null;
  private readonly lightAliases = new Map<string, string>();
  /** The random ids of the shared scene's fog operations, by their keys in the store. */
  private readonly fogAliases = new Map<string, string>();
  private mask: { readonly source: string | null; readonly ref: AssetRef | null; readonly bytes: Uint8Array<ArrayBuffer> | null } | null = null;
  private readonly pacer: Pacer;
  private readonly exploredPacer: Pacer;
  /** The fog and sight inputs sent: whole for a new scene, a joiner or a player who asks, else as deltas. */
  private readonly fog: SequencedList<'fog'>;
  private readonly sight: SequencedList<'sight'>;

  constructor(store: SceneStore, ports: InputSharePorts) {
    this.store = store;
    this.ports = ports;
    this.pacer = new Pacer(ports, INPUT_INTERVAL_MS, () => this.flush());
    this.exploredPacer = new Pacer(ports, EXPLORED_INTERVAL_MS, () => void this.flushExplored());
    this.fog = new SequencedList('fog', ports);
    this.sight = new SequencedList('sight', ports);
  }

  /** The shared scene the inputs belong to; null sends none. */
  setScene(scene: { readonly id: string; readonly lit: boolean } | null): void {
    if (scene?.id === this.scene?.id) return;
    this.scene = scene;
    this.last.clear();
    this.fog.reset();
    this.sight.reset();
    this.fogOf = undefined;
    this.fogAliases.clear();
    this.lighting = null;
    this.mask = null;
    this.pacer.cancel();
    this.exploredPacer.cancel();
    this.update();
  }

  /** Works the inputs out again; they go out now, or once the interval has passed. */
  update(): void {
    if (this.scene === null) return;
    this.pacer.request();
    if (this.scene.lit && levelExploredMask(this.store.getState()) !== this.mask?.source) this.exploredPacer.request();
  }

  /** The last inputs again, whole, to one player or to all. */
  resend(to?: string): void {
    for (const sent of this.last.values()) if (sent.scene === this.scene?.id) this.ports.send(sent.body, to);
    this.fog.resend(this.scene?.id ?? null, to);
    this.sight.resend(this.scene?.id ?? null, to);
  }

  /** A player's fog or sight inputs stopped following on: they get the last ones whole (at most once a second). */
  resync(player: string, scene: string, of: Exclude<DeltaOf, 'tokens'>): void {
    if (scene === this.scene?.id) (of === 'fog' ? this.fog : this.sight).resync(player, scene);
  }

  /** The bytes of the explored memory players were last sent, by its hash. */
  exploredBytes(hash: string): Uint8Array<ArrayBuffer> | undefined {
    return this.mask?.ref?.hash === hash ? this.mask.bytes ?? undefined : undefined;
  }

  stop(): void {
    this.setScene(null);
  }

  private flush(): void {
    const scene = this.scene;
    const state = this.store.getState();
    if (scene === null || !state.mapLoaded || state.isMapLoading) return;
    if (levelObjects(state).fog !== this.fogOf) {
      this.fogOf = levelObjects(state).fog;
      this.fog.publish(scene.id, { fog: sharedFog(levelObjects(state).fog, (key) => this.fogAlias(key)) });
    }
    if (!scene.lit) return;
    const source = this.ports.lightingSource();
    const shown = this.ports.shownTokens();
    if (source === null || shown === null) return;
    const rules = source.rules();
    const lighting = this.lightingScene(state, source);
    // The walls may run to megabytes: they are compared as text only when worked out anew.
    if (lighting !== this.lighting?.sent) {
      this.publish({ t: 'lighting', scene: scene.id, ...lighting });
      if (this.lighting !== null) this.lighting.sent = lighting;
    }
    this.sight.publish(scene.id, sharedSight({ state, rules, shown, tokenAlias: (id) => this.ports.tokenAlias(id), lightAlias: (id) => this.lightAlias(id) }));
  }

  /** The walls, zones and senses, worked out again only when what they are made of changed. */
  private lightingScene(state: SceneState, source: LightingSource): SharedLightingScene {
    const rules = source.rules();
    const measurement = source.measurement();
    const key = this.lighting;
    if (key !== null && key.walls === levelObjects(state).walls && key.zones === levelObjects(state).lightZones && key.grid === state.grid && key.rules === rules && key.unitDistance === measurement.unitDistance) return key.scene;
    const scene = sharedLightingScene(state, rules, measurement);
    this.lighting = { walls: levelObjects(state).walls, zones: levelObjects(state).lightZones, grid: state.grid, rules, unitDistance: measurement.unitDistance, scene, sent: null };
    return scene;
  }

  private async flushExplored(): Promise<void> {
    const scene = this.scene;
    const source = levelExploredMask(this.store.getState());
    if (scene === null || !scene.lit || source === this.mask?.source) return;
    const bytes = maskBytes(source);
    const ref: AssetRef | null = bytes === null ? null : { hash: await sha256Hex(bytes), size: bytes.length, mime: 'image/png' };
    if (this.scene !== scene) return;
    this.mask = { source, ref, bytes };
    this.publish({ t: 'explored', scene: scene.id, mask: ref });
  }

  /** Sends a message unless it says what the last of its kind said. */
  private publish(body: GmMessage): void {
    const scene = this.scene;
    if (scene === null) return;
    const text = JSON.stringify(body);
    const last = this.last.get(body.t);
    if (last?.scene === scene.id && last.text === text) return;
    this.last.set(body.t, { scene: scene.id, text, body });
    this.ports.send(body);
  }

  private fogAlias(key: string): string {
    let alias = this.fogAliases.get(key);
    if (alias === undefined) {
      alias = this.ports.randomId();
      this.fogAliases.set(key, alias);
    }
    return alias;
  }

  private lightAlias(lightId: string): string {
    let alias = this.lightAliases.get(lightId);
    if (alias === undefined) {
      alias = this.ports.randomId();
      this.lightAliases.set(lightId, alias);
    }
    return alias;
  }
}
