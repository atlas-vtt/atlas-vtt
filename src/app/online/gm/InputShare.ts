import type { DeltaOf, GmMessage, SharedFog, SharedFogEdge, SharedLightingScene } from '../protocol/index.ts';
import type { LightingSource } from './atlasLighting.ts';
import type { SceneState, SceneStore } from './atlasView.ts';
import { Pacer, type PacerClock } from '../marks/index.ts';
import { sharedLightingScene, sharedSight } from './sceneInputs.ts';
import { SharedFogLog } from './sharedFogLog.ts';
import { SequencedList } from './sequencedList.ts';
import { levelObjects } from '../../levels/levelObjects';
import type { SightPolicy } from '../../vision/tokenSightPolicy';
import { t } from '../../i18n';

export interface InputSharePorts extends PacerClock {
  send(body: GmMessage, to?: string): void;
  randomId(): string;
  /** The ids of the tokens the players see now, or null while the tab cannot say (no renderer, loading). */
  shownTokens(): ReadonlySet<string> | null;
  /** The random id players know a token by, the one its entry in the token list has. */
  tokenAlias(tokenId: string): string;
  /** Where the GM's lighting reads its rules and measurement, or null while it cannot be read. */
  lightingSource(): LightingSource | null;
  /** Tells the GM something in words. */
  notice?(text: string): void;
  /** How the GM's fog edge looks; unset or undefined, players draw it hard. */
  fogEdge?(): SharedFogEdge | undefined;
  /** Whose tokens players light the scene from (one player's own, `narrowPolicy`); unset, every token's that sees. */
  sightPolicy?(): SightPolicy;
}

/** The shortest time between two sends of the scene's inputs, as for the token list. */
export const INPUT_INTERVAL_MS = 66;

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
 * one, its walls, zones and senses (`lighting`) and its lighting, lights and tokens (`sight`).
 */
export class InputShare {
  private readonly store: SceneStore;
  private readonly ports: InputSharePorts;
  private scene: { readonly id: string; readonly lit: boolean } | null = null;
  private readonly last = new Map<GmMessage['t'], Sent>();
  private fogOf: unknown = undefined;
  /** The fog and its edge as players were sent them last, so that a change of the edge alone sends the same fog again. */
  private sharedFog: SharedFog = [];
  private fogEdge: SharedFogEdge | undefined = undefined;
  private readonly fogLog = new SharedFogLog();
  /** The scene's fog is more than players can be sent, and the GM was told. */
  private fogTooMuch = false;
  private lighting: LightingKey | null = null;
  private readonly lightAliases = new Map<string, string>();
  /** The random ids of the shared scene's fog operations, by their keys in the store. */
  private readonly fogAliases = new Map<string, string>();
  private readonly pacer: Pacer;
  /** The fog and sight inputs sent: whole for a new scene, a joiner or a player who asks, else as deltas. */
  private readonly fog: SequencedList<'fog'>;
  private readonly sight: SequencedList<'sight'>;

  constructor(store: SceneStore, ports: InputSharePorts) {
    this.store = store;
    this.ports = ports;
    this.pacer = new Pacer(ports, INPUT_INTERVAL_MS, () => this.flush());
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
    this.sharedFog = [];
    this.fogEdge = undefined;
    this.fogLog.reset();
    this.fogTooMuch = false;
    this.fogAliases.clear();
    this.lighting = null;
    this.pacer.cancel();
    this.update();
  }

  /** Works the inputs out again; they go out now, or once the interval has passed. */
  update(): void {
    if (this.scene !== null) this.pacer.request();
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

  stop(): void {
    this.setScene(null);
  }

  private flush(): void {
    const scene = this.scene;
    const state = this.store.getState();
    if (scene === null || !state.mapLoaded || state.isMapLoading) return;
    const fog = levelObjects(state).fog;
    const edge = this.ports.fogEdge?.();
    const edgeChanged = edge?.style !== this.fogEdge?.style || edge?.width !== this.fogEdge?.width;
    if (fog !== this.fogOf || edgeChanged) {
      if (fog !== this.fogOf) {
        this.fogOf = fog;
        this.sharedFog = this.fogLog.shared(fog, (key) => this.fogAlias(key));
        this.tellFogTooMuch(this.fogLog.tooMuch);
      }
      this.fogEdge = edge;
      this.fog.publish(scene.id, { fog: this.sharedFog, ...(edge !== undefined && { edge: { style: edge.style, width: edge.width } }) });
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
    const policy = this.ports.sightPolicy?.();
    this.sight.publish(scene.id, sharedSight({
      state, rules, shown, tokenAlias: (id) => this.ports.tokenAlias(id), lightAlias: (id) => this.lightAlias(id), measurement: source.measurement(), ...(policy !== undefined && { policy }),
    }));
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

  /** Players see the map covered while its fog is more than they can be sent: the GM is told when that begins, once until it has ended. */
  private tellFogTooMuch(tooMuch: boolean): void {
    if (tooMuch && !this.fogTooMuch) this.ports.notice?.(t('online.fogTooMuch'));
    this.fogTooMuch = tooMuch;
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
