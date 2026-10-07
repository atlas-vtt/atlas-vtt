# Extension API

Other Obsidian plugins can extend Atlas VTT through one versioned entry point:

```ts
app.plugins.plugins['atlas-vtt'].api
```

The API is announced with the workspace event `atlas-vtt:api-ready` and withdrawn with `atlas-vtt:api-unload`. Everything an extension adds is tidied up when either plugin unloads.

## Version and capabilities

`api.version` is the semver of the API, independent of Atlas's own version. It is the `API_VERSION` constant in `src/api/version.ts`.

An extension requires its major version and checks `api.has(capability)` before using a feature. It never compares minor versions. `has()` is true only for capabilities that have landed in the running Atlas.

| API version | Capabilities | `AtlasExtension` | Events |
|---|---|---|---|
| 1.0.0 | `views`, `rules`, `settings`, `storage`, `presentation` | `id`, `on`, `views`, `rules`, `settings`, `storage`, `presentation` | `unload`, `map-loaded`, `map-closed`, `rules-changed`, `settings-changed` |

The report in `api-report/` (entry `api-report/src/api/public.d.ts`) is the source of truth for what the running version contains.

**The version moves once per Atlas release, not once per change.** Changes merged between two Atlas releases share one API version: the first release that carries the API ships 1.0.0, and the API version moves (by the semver rules below) only when an Atlas release changes the report against the release before it. That is why `npm run api:check` compares against the latest Atlas release tag, `x.y.z` without betas (see Semver rules).

## Behaviour by group

The reference further down says what each group is for; this section collects the behaviour an extension author is most likely to trip over.

### Views and rules

- **One kind of view.** `ViewInfo.kind` is `'map'`, Atlas's map views. A later API version may add other kinds of view; an extension that picks, hosts or presents map views filters on `kind === 'map'` from the start.
- **Distance per cell.** A scene can set its own distance per cell. `GridState.unitDistanceOverride` holds it (unset: the collection's), and `MeasurementSettings.ruleDistance` is the collection's distance per cell that distances written in squares convert with; `unitDistance` is the scene's where it sets one. `rules.forMap` gives the collection's settings.
- **Grid limits.** Atlas draws no grid at all for a size of 0 or less, or past 2,000 cells along a side, wherever it comes from, and a saved grid whose origin lies farther than 100,000 px away is moved next to the map by whole cells when the map loads, which draws the same grid.

### Presentation

- **`presentationId`.** A presented scene carries a `presentationId`: the same while the scene is held and resumed, new for every presentation and never repeated after Atlas reloads.

## Rules every group follows

- **Frozen data.** What Atlas hands an extension from its own state is frozen, to its depth: store records by reference once Atlas has frozen them, frozen copies otherwise. Changing it throws in strict mode and never reaches Atlas. A list or result object built fresh for one call (`views.list()`) is the extension's own and may be unfrozen.
- **Read once, then checked.** Input is read once (every field, every getter) and Atlas checks and keeps what it read, never the extension's object; a later change to that object changes nothing.
- **Guarded callbacks.** Every listener and callback runs guarded: a throw is logged and Atlas carries on. Each is dropped when its view closes, when the extension unloads, or when Atlas unloads.
- **Listeners.** A listener that is not a function (or `on` with an event Atlas does not have) registers nothing, gets a disposer that does nothing, and is logged once.
- **Disposers.** Every disposer may be called more than once; the second call does nothing.
- **Errors.** A malformed call throws (an async call rejects) with `[Atlas API] <namespace>.<method>: <what is wrong>`, in English whatever Atlas's language.
- **Optional members.** A member added to a namespace in a later API version is typed optional, so call it with `?.`. Whole namespaces are gated by `has()`.
- **Unknown views.** A call naming a view that is not open never throws: it answers `null`, `false` or a pending result, or gives a disposer that does nothing.
- **Spelling.** Names the API itself gives are spelled `colour`, as Atlas's own dice settings are (`settings.get('diceLook').colour`). A field that carries the colour of one of Atlas's records keeps that record's spelling, `color`, such as `settings.get('laserPointer').color`.

## Reference by group

The report (`api-report/`, entry `src/api/public.d.ts`) has every member with its JSDoc; this is what each group is for and how it behaves.

- **`views`.** `list()` and `active()` describe the open map views; `snapshot(viewId)` gives the scene in a view's store, and `subscribe` hears each store change that replaced one of its fields. `camera(viewId)` gives the visible world area and `watchCamera` hears it after every viewport frame. `map-loaded` fires once per map load, `map-closed` when a view closes.
- **`rules`.** `forMap(mapPath)` gives the collection's grid defaults, measurement (with the GM's cone angle), dice, initiative, conditions and resources, or Atlas's defaults outside a collection. `rules-changed` names the collection whose rules changed, or `null` once the asset index has loaded.
- **`settings`.** `get(key)` reads one of the four settings an extension may know (`laserPointer`, `diceLook`, `diceDisplay`, `playerView`); `settings-changed` names a key whose value changed. Read-only.
- **`storage`.** `folder()` creates and returns `atlas-vtt/.atlas-data/extensions/<extension id>/`, a dot folder Obsidian does not index; the id must be kebab-case.
- **`presentation`.** `current()` gives the presented scene (also while held), `present(viewId, tabId?)` presents a tab and `stop()` stops; `subscribe` hears `presented`, `held` and `cleared`, each with a `presentationId` that names one presentation. `addTarget` adds an audience besides the player window, which changes what the scene tab's eye does while it is active.
  - **Stock presenting until a target is registered.** Until an extension registers a target with `addTarget` (active or not), Atlas presents exactly as it does without the API: the player window, "Send current map to player view", and the eye, marked while the open window shows its tab. Then the presented scene is the player window's: `current()` is the tab the open window shows (null once the window closes), `present` goes through the player window as that command does (opening it when it is closed), and `stop()` lets the window keep its last frame and drops the marker, as closing the presented map does. Once a target is registered, Atlas keeps a presented scene of its own: the eye's marker stays until Stop presenting (whether or not the window is open), an open player window follows a scene presented from anywhere, and the Present to players and Stop presenting commands exist. Removing the last target goes back to stock presenting.

## Semver rules

- **Minor:** a new function, capability, event, optional option, or a new field on a returned object or record type.
- **Major:** removing or renaming anything, changing behaviour a contract test pins, or tightening an input type.
- **Capabilities** let the API grow without a major version. Atlas may ship a capability as experimental: present, documented and excluded from semver guarantees until promoted.
- **Record types are part of the contract on purpose.** When Atlas adds a field to a record type (a minor version), an extension that keeps a `Record<keyof TokenEntity, ...>` table fails to compile until its author decides what to do with the field. New data stays private by default.

`npm run api:report` writes the report: `tsc -p tsconfig.api.json --declaration --emitDeclarationOnly` emits declarations, and `scripts/declaration-tree.mjs` copies into `api-report/` only those `src/api/public.d.ts` reaches (the API's types and the Atlas record types they name; no translations). The tree is committed. `npm run api:check` regenerates it, then:
- **Up to date** (`scripts/api-report-check.js`). A report that differs from the committed tree fails a change that touches the API: `src/api/`, the report itself, or a source file the report includes (its `.d.ts` is in the tree). Any other change only prints the difference, so a pull request that touches none of these never fails here; the next API change brings the report up to date. CI names what the change is compared with in `API_CHANGES_BASE` (the pull request's base branch, or the commit before a push); without it, as locally, a stale report always fails.
- **Version moved** (`scripts/api-version-check.js`). The report as committed (or staged) must not differ from the base's unless `API_VERSION` differs too. The base is the latest Atlas release tag (`x.y.z`, betas left out) reachable from `HEAD`, so every change merged before the next release shares one API version; set `API_BASE_REF` to compare against another ref, for example `API_BASE_REF=origin/beta npm run api:check`. A base without a report (the release before the API) passes. Tags must be fetched (CI checks out with `fetch-depth: 0`).

## Deprecation

A deprecated function keeps working for at least two Atlas minor releases. It:

- logs one console warning per session;
- is marked `@deprecated` in the types;
- is listed in the changelog.

A major version is announced one release ahead.

## Connecting from an extension

```ts
import type { Plugin } from 'obsidian';
import type { AtlasApi, AtlasExtension } from '@atlas-vtt/api-types';

const REQUIRED_MAJOR = 1;

export class AtlasLink {
  private extension: AtlasExtension | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly plugin: Plugin) {}

  start(): void {
    // Atlas may already be ready, or may announce itself later (and again after a reload).
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('atlas-vtt:api-ready' as never, ((api: AtlasApi) => this.bind(api)) as never),
    );
    const atlas = (this.plugin.app as unknown as { plugins: { plugins: Record<string, { api?: AtlasApi }> } })
      .plugins.plugins['atlas-vtt'];
    if (atlas?.api) this.bind(atlas.api);
  }

  private bind(api: AtlasApi): void {
    if (Number.parseInt(api.version, 10) !== REQUIRED_MAJOR) return;
    this.unsubscribe?.();
    this.extension = api.connect(this.plugin);
    // Atlas is unloading: drop what we hold and wait for the next api-ready.
    this.unsubscribe = this.extension.on('unload', () => { this.extension = null; });
    if (api.has('views')) {
      // Use the capability's namespace here, for example this.extension.views.
    }
  }
}
```

`connect` validates its argument and scopes everything to `plugin.manifest.id`. Connecting again with the same id replaces the earlier registration rather than adding to it.

## No npm: vendor the report

The API types are not published to npm.

- `api-report/` is the declaration tree of `src/api/` (entry `src/api/public.d.ts`, with the Atlas record types it names under `src/app/`). It is committed, and nothing in it imports anything outside the tree but `obsidian`. An extension vendors the folder as `@atlas-vtt/api-types`, with `src/api/public.d.ts` as its `types` entry.
- Some record fields use types the entry does not export by name, such as `WallType`, `Widget`, `WidgetIcon` and `InitiativeSide`. Name them through the record that holds them, for example `WidgetSettings['widgets'][string]['icon']`, or import them from their file in the tree. Comments on Atlas's own record types may name Atlas functions (`lightKindOf`, `tokenSenses`, `FogCanvasCompositor`); they describe Atlas, and an extension cannot call them.

Record the Atlas commit and the API version of every vendored copy, and verify the copy's hashes in your own CI.
