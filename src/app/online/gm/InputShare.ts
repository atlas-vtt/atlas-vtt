import type { SharedFog, SharedFogEdge, SharedLightingScene } from '../protocol/index.ts';
import type { LightingSource } from './atlasLighting.ts';
import type { SceneState, SceneStore } from './atlasView.ts';
import { Feed, type FeedPorts, type FeedScene } from './feed/Feed.ts';
import type { FeedOut } from './feed/feedOutbox.ts';
import { sharedLightingScene, sharedSight } from './sceneInputs.ts';
import { SharedFogLog } from './sharedFogLog.ts';
import { levelObjects } from '../../levels/levelObjects';
import type { SightPolicy } from '../../vision/tokenSightPolicy';
import { t } from '../../i18n';

export interface InputSharePorts extends FeedPorts {
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
  /** Whose tokens players light the scene from (one player's own, `ownPolicy`); unset, every token's that sees. */
  sightPolicy?(): SightPolicy;
}

/** The shortest time between two sends of the scene's inputs, as for the token list. */
export const INPUT_INTERVAL_MS = 66;

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
  readonly feed: Feed;
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

  constructor(private readonly store: SceneStore, private readonly ports: InputSharePorts) {
    // The fog and sight inputs go whole for a new scene, a joiner or a player who asks, else as deltas.
    this.feed = new Feed(ports, { interval: INPUT_INTERVAL_MS, sequenced: ['fog', 'sight'], build: (scene, out) => this.build(scene, out), reset: () => this.reset() });
  }

  private reset(): void {
    this.fogOf = undefined;
    this.sharedFog = [];
    this.fogEdge = undefined;
    this.fogLog.reset();
    this.fogTooMuch = false;
    this.fogAliases.clear();
    this.lighting = null;
  }

  private build(scene: FeedScene, out: FeedOut): void {
    const state = this.store.getState();
    if (!state.mapLoaded || state.isMapLoading) return;
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
      out.sequenced('fog', { fog: this.sharedFog, ...(edge !== undefined && { edge: { style: edge.style, width: edge.width } }) });
    }
    if (!scene.lit) return;
    const source = this.ports.lightingSource();
    const shown = this.ports.shownTokens();
    if (source === null || shown === null) return;
    const rules = source.rules();
    const lighting = this.lightingScene(state, source);
    // The walls may run to megabytes: they are compared as text only when worked out anew.
    if (lighting !== this.lighting?.sent) {
      out.send({ t: 'lighting', scene: scene.id, ...lighting });
      if (this.lighting !== null) this.lighting.sent = lighting;
    }
    const policy = this.ports.sightPolicy?.();
    out.sequenced('sight', sharedSight({
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
