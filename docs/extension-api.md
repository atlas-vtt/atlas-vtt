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
| 1.0.0 | `views`, `rules`, `settings`, `storage`, `presentation`, `dice`, `lasers`, `lighting`, `tokens`, `ui`, `scenes`, `bundles`, `scene-tabs`, `asset-tabs`, `collections` | `id`, `on`, `views`, `rules`, `settings`, `storage`, `presentation`, `dice`, `lasers`, `lighting`, `tokens`, `ui`, `scenes`, `bundles`, `collections` (optional) | `unload`, `map-loaded`, `map-closed`, `rules-changed`, `settings-changed`, `scenes-changed`, `tabs-changed`, `collections-changed` |

The report in `api-report/` (entry `api-report/src/api/public.d.ts`) is the source of truth for what the running version contains.

**The version moves once per Atlas release, not once per change.** Changes merged between two Atlas releases share one API version: the first release that carries the API ships 1.0.0, and the API version moves (by the semver rules below) only when an Atlas release changes the report against the release before it. That is why `npm run api:check` compares against the latest Atlas release tag, `x.y.z` without betas (see Semver rules).

## Behaviour by group

The reference further down says what each group is for; this section collects the behaviour an extension author is most likely to trip over.

### Views and rules

- **One kind of view.** `ViewInfo.kind` and `ViewContext.kind` are `'map'`, Atlas's map views. A later API version may add other kinds of view; an extension that picks, hosts or presents map views filters on `kind === 'map'` from the start.
- **Distance per cell.** A scene can set its own distance per cell. `GridState.unitDistanceOverride` holds it (unset: the collection's), and `MeasurementSettings.ruleDistance` is the collection's distance per cell that distances written in squares convert with; `unitDistance` is the scene's where it sets one. `rules.forMap` gives the collection's settings.
- **Grid input is bounded.** `scenes.addToCollection` and `scenes.replaceMap` check the grid: the numbers it sets must be finite, its `size` at least 4 px and at most 2,000 cells along a side of the map (for a saved map, when Atlas can read the background image's size), its offsets within 100,000 px, and its `type` and `lineType` known values; anything else throws before anything is written. Atlas draws no grid at all for a size of 0 or less, or past 2,000 cells along a side, wherever it comes from, and a saved grid whose origin lies farther than 100,000 px away is moved next to the map by whole cells when the map loads, which draws the same grid.

### Presentation

- **`presentationId`.** A presented scene carries a `presentationId`: the same while the scene is held and resumed, new for every presentation and never repeated after Atlas reloads.

### Dice

- **One channel.** `dice.onRolled` hears every roll Atlas logs once, whichever map view or window made it (`dice.roll` and `dice.publish` included). Atlas keeps each map view's rolls in that view: its dice tray, statblocks and the dice log's Roll again log a roll in the view that made it only, and the player window follows the view it presents. `roll` and `publish` hand their roll to every open GM map view, whose log, toasts and sounds show it, and to the player window through the view it presents.
- **Formulas Atlas does not roll.** `dice.roll` checks the formula before any die is rolled, as the dice tray does: at most 64 characters, 10 terms, 100 dice and 1,000 faces per die, constants of up to four digits, and nothing but dice, numbers, `+`, `-`, spaces and exploding notation (`!`, `!!`, `!3`, `!i`). Anything else throws `[Atlas API] dice.roll: …` and nothing is rolled or logged; a formula `diceFormula` builds from at most 100 dice and a modifier of at most four digits always passes. An empty formula, like a bare bonus such as `+3`, rolls the rules' default roll. `dice.publish` and `dice.throw` take rolls decided elsewhere and check only the roll itself (plain data, at most 1,000 dice): their `formula` is the text Atlas shows.
- **Publishing without a throw.** In `dice.publish(roll, { throw })`, `throw` defaults to true, and a roll without `rolledBy` is then thrown with Atlas's 3D dice in every open GM map view. With `throw: false` the roll is logged, toasted (with the result card's sound) and reaches the player window and `onRolled` the same way, but Atlas shows it as a result card instead of throwing it, for dice an extension has shown already. Options that are not `{ throw?: boolean }` throw.
- **Throwing a decided roll.** `dice.throw(viewId, roll)` throws a roll decided elsewhere with Atlas's own 3D dice in a GM map view: seeded by the roll's id as Atlas's own throws are, in the user's dice look and speed, and once per roll id in each view (handing an id again throws nothing and answers true). It answers false when nothing is thrown: the view is not open or its map not loaded, its dice display is not showing, the user shows dice as result cards, or the roll is malformed (a die whose value is not a whole number from 1 to its `max` included); show the roll your own way then. Where the view cannot draw 3D dice, or the roll does not list all its dice, Atlas shows its own result card. It only throws: nothing is logged, `onRolled` hears nothing and the player window shows nothing, which is what `publish` is for. Use `throw` for a roll you do not publish, or one published with `rolledBy`.
- **Tags.** `DiceRollResult.rolls[]` entries take optional `color` (`#rrggbb`) and `colorName` (e.g. `"Fire"`). Atlas only carries, saves and shows them: they never change a result. `dice.publish` and `dice.throw` keep a `color` that is `#rrggbb` and a `colorName` that is plain text (any script, emoji and punctuation, but no `<`, `>`, `[`, `]`, backticks, control or invisible formatting characters; trimmed, at most 32 characters) and drop any other, never the roll. Tags are saved with the map's dice log, and a log without them reads as before. The dice log, the toasts and the player window list tagged dice grouped under their tag, a dot of the colour and its name (or the colour's code without a name); a roll without tags shows as before.
- **Rolls name a token only where players see it.** In the player window a roll shows its token's name, portrait and ability only when it was made for that token from a statblock and the shown scene shows the token to players; the name also only while token nameplates show. A roll repeated from the log, or published or rolled through the API, names no token there. `dice.onRolled` still hands extensions the whole roll, `source` included: what you send to players, decide as the player window does (`lighting.playerVisibility`, hidden tokens, nameplates). `rolledBy` shows as before.

### Lighting

- **Fog hides tokens from players.** The player window leaves out every token under committed fog, lit scene or not, and while the fog cannot be drawn it covers the whole map. `lighting.playerVisibility` answers the same: a token under fog is `'unseen'`, and fog Atlas cannot draw makes it `pending`. `lighting.watch` fires when the fog changes. On an unlit scene (or with dynamic lighting off) the answer is `unlit`, and its `tokens` lists every token under the scene's committed fog as `'unseen'`; a token absent from it is not under fog. Fog Atlas cannot draw, or fog the view cannot read, makes it `pending` there too. Apply hidden tokens yourself while the answer is `unlit`.
- **GM-hidden tokens give players no sight.** A token the GM hid neither sees nor explores for the players, so `playerVisibility` shows nothing that only a hidden token's vision would show, and the hidden token itself is `'unseen'`. Which tokens give the players sight and which the player window always shows is decided by one policy, which `playerVisibility` reads too.
- **What the API does not hand out.** Door badges under fog do not show to players; the API hands out no walls or doors. The player window and session view leave out a measurement that starts on a token players do not see (hidden, out of sight, only sensed, under fog); the API hands out no measurements.

### Tokens

- **Undo.** A `tokens.move` is exactly one undo step, taking back the moves and the layer raise; something Atlas changed by itself since (on another token, say) stays. Extension scene and collection data never enter a view's history.
- **Instance badges.** The player window and session view count and number look-alikes (one `imagePath`) only among the tokens they show, so a hidden or fogged look-alike neither counts nor takes a number, and the players' numbers can differ from the GM's. `views.snapshot` gives the GM's `instanceNumber`, which is GM data: if you show players badges, number them among the tokens you send, never by that field.

### UI slots

- **Toolbar items.** The GM can reorder and hide the toolbar's controls, and the bar moves controls into "More tools" from its right end. Extension items sit together right after the dice button (before the Command palette when there is none), and `ToolbarItem.priority` orders them among themselves: a higher priority sits further left, so lower priorities move into "More tools" first. The GM's toolbar editor arranges Atlas's controls only; extension items are not in it and leave the bar while it is open.
- **Per-view visibility.** `ToolbarItem.isVisible(ctx)` decides per view whether the item shows. Only `true` shows it; a hidden item takes no room in the bar and is not in "More tools", and `ui.invalidate()` asks again. A predicate that throws hides the item and is logged once.
- **Menus that stay open.** A plain item with `MenuItem.keepOpen: true` leaves its menu open when chosen, for toggles picked several in a row. An open submenu runs its provider again after `ui.invalidate()`, so its checkmarks follow the change. An item in the menu itself also leaves it open, but in a map's More options and a token's menu its checkmark stays as it was when the menu opened; put toggles picked several in a row in a submenu. A submenu finds itself again by its label, so give the submenus among one menu's items distinct labels. The scene tab eye's menu reads its items again after `ui.invalidate()` (see Scene tabs).
- **Asset manager tabs** (`asset-tabs`). `ui.addAssetTab({ id, title, icon, mount })` adds a tab in the asset manager after Scenes, Maps, Encounters and Tokens, with the extension's icon and title and no count. Choosing it shows what `mount(container, { collectionId })` renders in place of the asset grid (the breadcrumb and filters go with it), for the collection the asset manager shows; picking another collection runs the disposer and mounts again with the new `collectionId`, and leaving the tab, closing the asset manager or removing the tab runs the disposer. The context is frozen. Keys pressed inside the container stay there, all but Escape, which still closes the asset manager, so Atlas's own shortcuts (Tab between tabs, select all) never act behind the extension's controls. Render inside the container: a press outside the asset manager closes it. The asset manager reopens on Atlas's tab it was on, never on an extension's. A mount or disposer that throws is logged; `id`, `title` and `icon` must be non-empty strings and `mount` a function, and an `id` this extension already added throws.
- **Collection settings tabs** (`collections`). `ui.addCollectionSettingsTab({ id, title, icon?, mount })` adds a tab in a collection's settings dialog after Atlas's own, with the extension's icon (a Lucide name, `puzzle` when left out) and title. Choosing it shows what `mount(container, { collectionId })` renders in place of Atlas's tab; choosing another tab, closing the dialog or removing the tab runs the disposer. The dialog's Save button saves Atlas's own settings only: what the tab changes is the extension's to save, at once, typically with `collections.setData`. Keys pressed inside the container stay there, all but Escape, which closes the dialog. The context is frozen, and a mount or disposer that throws is logged.
- **Language.** Atlas follows Obsidian's language where it has a translation, and English otherwise. Texts Atlas shows around what extensions add (the panel's close button, the eye's menu, notices) go through its translations; they are written in English so far, so other languages show them in English until they are translated. The labels, titles and messages an extension gives are shown as given. Errors thrown to an extension stay in English.

### Scenes, collections and bundles

- **Extension data is index-only.** Extension data on scenes (`scenes.setData`) lives only in Atlas's asset index, never in the scene's record file, so it travels in no bundle and no copy. When Atlas cannot read the index and rebuilds it from the collection files, that data is lost, because the files do not hold it.
- **Library sync.** Atlas keeps its library in record files that sync tools carry between devices; the asset index in `atlas-vtt/.atlas-data/` is each device's cache of them. Atlas never writes extension data, or the note of which extension added a scene and the images it wrote, to the library files, and never takes them from one: a record file that arrives from another device, or that someone edits or copies by hand, neither removes nor adds any. A scene whose record file moves and that comes back from its new path in a later read keeps its extension data for as long as Atlas runs, and keeps the note of which extension added it, and the images Atlas wrote, only while its map path stays the same: a file that points the scene at another map (another device moved the scene to another collection, or the file was edited) drops them, so `replaceMap` then refuses it on this device. A scene whose file disappears and comes back only after Atlas restarted has lost all of it on this device. Saving extension data is no edit of the scene: its `modifiedAt` and record file stay as they were. So `scenes.getData` answers on the device that wrote the data, and `scenes.replaceMap` accepts only scenes added on that device; elsewhere the same scene is the GM's. A sync tool set to carry dot folders as well (Remotely Save and Self-hosted LiveSync can be) copies the whole index, extension data included, with it: the device that saved last then wins, as with any file such a tool carries.
- **Saved map fields.** `SavedMapInput` holds `pins` (with their note links), `walls`, `lights`, `lightZones`, `camera`, `tokenSettings` and `initiativeTrackerOpen` as optional fields that `scenes.readMap` returns and `scenes.addToCollection` writes. A `readMap` result can be handed to `addToCollection` as it is.
  - **Reading.** They are normalised as Atlas loads the map, so a file that lacks them reads as empty records, the camera at the origin, Atlas's token settings and a closed tracker. A camera that is not finite numbers with a scale above 0 reads as the default, and only the four known token settings of the right type are kept. Pin, wall and light entries are handed out as saved, also ones Atlas cannot read and skips.
  - **Writing.** A field left out is written as Atlas writes a new map. A malformed field throws before anything is written: a pin must be `{ id, kind: 'pin', x, y, notePath }` with a plain vault path, the camera finite with a scale above 0, token settings of the right types, and walls, lights and light zones records by id. A pin's `notePath` is a vault path and is never rewritten as an image path; Atlas does not check that the note exists, so write the notes first and drop pins whose note you could not write. The tracker opens only for `initiativeTrackerOpen: true`.
  - **What stays behind.** The GM's note on the map, the dice log, explored memory, pinned note previews and the loot roller are never read or written.
- **Replacing a map.** `scenes.replaceMap(sceneId, { map, images })` puts a newer version of a map in place of a scene's old one and keeps the scene's id, name, collection and map path. It takes the same input and checks as `addToCollection`, with images relative to the map file's folder; an image name already taken there gets a number.
  - **Only your own scenes.** Atlas notes in its index (never in record files, exports or copies) which extension added a scene through `addToCollection`. Only that extension may replace the scene's map. Every other scene, including the GM's own maps and a copy of an added scene, is refused: the promise rejects and nothing is written. The note holds only for the map Atlas wrote: a record file (from another device, a sync conflict or a hand edit) that points the scene at another map drops it, and a scene whose map file is not inside its collection's folder is refused. The images Atlas wrote follow a rename in the vault.
  - **Not while open.** A scene that is open in a map view, also as a scene tab that is not shown, is refused, so an open view never saves over the new map. Ask the GM to close it first. The check runs again just before the map file is written; a tab opened in the moment between that check and the write is not caught.
  - **Order.** The new images are written first, then the map file. Only then are images removed, and only images Atlas itself wrote for this scene (through `addToCollection` or an earlier `replaceMap`; the index keeps the list) that the new map, another asset, another scene's map and resolved note links no longer use. No other file is ever removed, even one the old map named. If a write fails, the images it wrote are removed and the old map is put back.
  - **The GM's play stays.** The GM's note link, the dice log, pinned note previews and the loot roller are carried over from the old file. Explored memory resets, since it belongs to the old map's layout.
- **Links in notes.** Notes can link and embed scenes, their snapshots (`[[Tavern.atlasmap#Snapshot name]]`) and encounters. Those links are note text that names the map file, so `scenes` and `bundles` do not track them: `replaceMap` keeps the map path and the scene id (its snapshots stay with it), so links to the scene keep working; a scene `addToCollection` adds has a new path no link names yet. Embeds draw a card, not a map view, so they never appear in `views.list()`.
- **Collection data** (`collections`). `collections.list()` gives every collection as `{ id, name }` (a collection is named like its folder), and `getData(collectionId)` and `setData(collectionId, value)` keep this extension's own data on a collection, by the same rules as `scenes.getData` and `setData`: plain JSON, copied in and handed out frozen, `null` clears it, and each extension sees only its own. It lives in Atlas's asset index alone, beside the collection records: never in the collection's `collection.json`, an export, an install or a copied folder, and saving it is no edit of the collection (its file and `modifiedAt` stay as they were). Renaming a collection, in Atlas or outside Obsidian, keeps it; deleting one takes it along, so a new collection of the same name starts without it. Like extension data on scenes it stays on the device that wrote it, and goes when Atlas has to rebuild its index from the library files. `setData` rejects for a collection that does not exist, and every call rejects when the asset index could not load. The `collections-changed` event fires when collections are added, removed or renamed, or when any extension's data on one changes; read again then.
- **Note properties kept out of exports.** `bundles.stripNoteProperties(keys)` remembers its keys per extension id: they stay stripped when the extension is not loaded, and only the returned disposer, or `bundles.forgetNoteProperties()`, forgets them, not the extension unloading. Handing the disposer to Obsidian's `this.register()` forgets the keys on every unload, so keep that for an extension that really stops stripping. The keys of an extension that crashed or was uninstalled stay until something calls that disposer or `forgetNoteProperties` (Atlas keeps them in its settings under `extensionNoteKeys`).

## Rules every group follows

- **Frozen data.** What Atlas hands an extension from its own state is frozen, to its depth: store records by reference once Atlas has frozen them, frozen copies otherwise. Changing it throws in strict mode and never reaches Atlas. A list or result object built fresh for one call (`views.list()`, `scenes.list()`, the outer result of `tokens.move`) is the extension's own and may be unfrozen.
- **Read once, then checked.** Input is read once (every field, every getter) and Atlas checks and keeps what it read, never the extension's object; a later change to that object changes nothing.
- **Guarded callbacks.** Every listener and callback runs guarded: a throw is logged and Atlas carries on. Each is dropped when its view closes, when the extension unloads, or when Atlas unloads.
- **Listeners.** A listener that is not a function (or `on` with an event Atlas does not have) registers nothing, gets a disposer that does nothing, and is logged once. `ui.*` registrations, which describe an item rather than listen, throw instead.
- **Disposers.** Every disposer may be called more than once; the second call does nothing.
- **Errors.** A malformed call throws (an async call rejects) with `[Atlas API] <namespace>.<method>: <what is wrong>`, in English whatever Atlas's language.
- **Optional members.** These members are typed optional, so call them as `extension.dice.throw?.(...)`: `dice.throw`, `scenes.replaceMap`, `views.showTab`, `ui.addSceneTabMenuSection`, `PresentationTarget.tabBadge`, `SceneSnapshot.tabId`, `ui.addAssetTab`, `ui.addCollectionSettingsTab` and `collections`. A member added to a namespace in a later API version is typed optional too. Whole namespaces are gated by `has()`.
- **Unknown views.** A call naming a view that is not open never throws: it answers `null`, `false` or a pending result, or gives a disposer that does nothing.
- **Spelling.** Names the API itself gives are spelled `colour`, as Atlas's own dice settings are (`settings.get('diceLook').colour`). A field that carries the colour of one of Atlas's records keeps that record's spelling, `color`: a die's tag (`color`, `colorName`), a laser's `color` and `settings.get('laserPointer').color`.

## Reference by group

The report (`api-report/`, entry `src/api/public.d.ts`) has every member with its JSDoc; this is what each group is for and how it behaves.

- **`views`.** `list()` and `active()` describe the open map views; `snapshot(viewId)` gives the scene in a view's store, and `subscribe` hears each store change that replaced one of its fields. `camera(viewId)` gives the visible world area and `watchCamera` hears it after every viewport frame. `map-loaded` fires once per map load, `map-closed` when a view closes. With `scene-tabs`, `tabs-changed` fires when a GM map view's tabs or active tab change, a snapshot's `tabId` names the tab whose scene it holds (null while loading), and `showTab(viewId, tabId)` opens a tab without presenting it; see Scene tabs below.
- **`rules`.** `forMap(mapPath)` gives the collection's grid defaults, measurement (with the GM's cone angle), dice, initiative, conditions and resources, or Atlas's defaults outside a collection. `rules-changed` names the collection whose rules changed, or `null` once the asset index has loaded.
- **`settings`.** `get(key)` reads one of the four settings an extension may know (`laserPointer`, `diceLook`, `diceDisplay`, `playerView`); `settings-changed` names a key whose value changed. Read-only.
- **`storage`.** `folder()` creates and returns `atlas-vtt/.atlas-data/extensions/<extension id>/`, a dot folder Obsidian does not index; the id must be kebab-case.
- **`presentation`.** `current()` gives the presented scene (also while held), `present(viewId, tabId?)` presents a tab and `stop()` stops; `subscribe` hears `presented`, `held` and `cleared`, each with a `presentationId` that names one presentation. `addTarget` adds an audience besides the player window, which changes what the scene tab's eye does while it is active. With `scene-tabs` a target's `tabBadge` marks scene tabs next to their eye.
  - **Stock presenting until a target is registered.** Until an extension registers a target with `addTarget` (active or not), Atlas presents exactly as it does without the API: the player window, "Send current map to player view", and the eye, marked while the open window shows its tab. Then the presented scene is the player window's: `current()` is the tab the open window shows (null once the window closes), `present` goes through the player window as that command does (opening it when it is closed), and `stop()` lets the window keep its last frame and drops the marker, as closing the presented map does. Once a target is registered, Atlas keeps a presented scene of its own: the eye's marker stays until Stop presenting (whether or not the window is open), an open player window follows a scene presented from anywhere, and the Present to players and Stop presenting commands exist. Removing the last target goes back to stock presenting.
- **`dice`.** `roll` rolls by a map's collection rules (optionally for someone, `rolledBy`); `onRolled` hears every roll Atlas logs; `publish` adds a roll made elsewhere to the log, toasts and sounds, thrown in 3D unless `{ throw: false }`; `throw` throws a decided roll with Atlas's 3D dice in one view and logs nothing. A roll result is plain data with at most 1,000 dice, an `id` of at most 128 characters, a `formula` of at most 256, a `rolledBy` of at most 64 (also for `roll`) and a die name of at most 16; each die may carry a tag (`color`, `colorName`) that Atlas shows and saves with it.
- **`lasers`.** `onLocal(viewId)` hears each point of the GM's laser and its lift (also when the pointer leaves the map or Obsidian loses focus mid-stroke; a pointer that comes back with the button still held starts a new stroke, so treat every point after a lift as a stroke's first); `show(viewId, laser)` draws someone else's laser, fading like Atlas's own. A laser not heard from for a second is let go.
- **`lighting`.** `playerVisibility(viewId)` says what the player window shows of a lit scene, token by token and cell by cell, and of an unlit one which tokens fog hides; it fails closed (`pending`) whenever Atlas cannot tell yet, lit or unlit. `watch` hears when that answer may have changed.
- **`tokens`.** `move(viewId, moves)` moves tokens like a GM drop, as one undo step, and answers why when it moves none; `snapPoint` says where a dropped token lands.
- **`ui`.** Toolbar buttons, command palette sections, dashboard tiles, entries in a map's More options and a token's menu, and floating panels, with `scene-tabs` a section in a scene tab eye's menu (`addSceneTabMenuSection`), with `asset-tabs` a tab of the asset manager (`addAssetTab`), and with `collections` a tab of a collection's settings (`addCollectionSettingsTab`); `invalidate()` has Atlas read the callbacks again. Each `add*` throws for a malformed item. Menu items are read once each time a menu opens (a throwing getter leaves that item out, logged), and a label over 64 characters is cut with "…"; a toolbar text badge over 8 characters is cut the same way. A toolbar item's `isActive`, `badge` or `isVisible` that throws is logged once per item, not on every render.
- **`scenes`.** `list()` and `findByMap` read the scene records; `getData` and `setData` keep this extension's own data on a scene (index only, never exported); `readMap` reads a saved map without opening it; `addToCollection` adds a scene with its images in one step, and `replaceMap` replaces the map of a scene this extension added. They reject when the asset index could not load.
- **`collections`** (`collections`). `list()` reads the collections; `getData` and `setData` keep this extension's own data on a collection (index only, never exported or copied); `collections-changed` fires when collections or that data change.
- **`bundles`.** `stripNoteProperties(keys)` keeps note properties out of collection exports and installs, remembered per extension; `forgetNoteProperties()` forgets them.

## Scene tabs (`scene-tabs`)

An Atlas map view holds one live scene: its active tab, which Atlas has loaded and renders. Its other tabs are their files and nothing more, until the GM switches to one and Atlas loads it into the same store. `scene-tabs` lets an extension follow the tabs, tell which tab a scene belongs to, open a tab without presenting it, and add to the scene tab eye's menu and marker. Check `api.has('scene-tabs')`; every member it adds to a namespace that already shipped is optional.

- **Tabs.** `tabs-changed` fires for a GM map view whose tabs were opened, closed, moved or renamed, or whose active tab changed: once per view per microtask, with its `ViewInfo` as it is then. Marking a tab dirty or loaded fires nothing, and `map-loaded` and `map-closed` fire as before.
- **Which tab a scene is.** A switch makes the next tab active first and loads its map after, so `ViewInfo.activeTabId` can name a tab whose scene the store does not hold yet. `SceneSnapshot.tabId` names the tab only once the store holds that tab's map, loaded, and is null while a map loads, and between the switch and the load. Attribute a scene by `loaded && tabId`, never by `activeTabId`; a snapshot without a `tabId` is no tab's. `views.subscribe` hears `tabId` change too, also when the active tab changes before any load (closing the active tab).
- **Opening a tab.** `views.showTab(viewId, tabId)` switches the view to the tab as the GM's click does, and answers true once that tab's map is loaded. It answers false, never throwing, for a closed or unknown view, an unknown tab, a switch that failed, and when another switch overtook it: a later `showTab` from any extension, or the GM choosing another tab. It also answers false when the view closes before the tab has loaded, and when the switch and load take longer than 60 seconds (a backstop: Atlas gives up on a stalled load after 30). It never presents. The presented scene holds while the view shows another tab, as on any switch, and resumes when the GM returns to it.
- **The eye's menu.** Right-clicking a scene tab's eye, or the context-menu key or Shift+F10 with it focused, opens Atlas's menu at the eye whenever it has something to show: Atlas's own "Open player window" while a presentation target is active, then, for each section an extension added with `ui.addSceneTabMenuSection({ heading, items })` whose `items` are not empty, a separator, the heading as a label row (plain text, at most 40 characters) and the items. `items(context)` is told the tab: `viewId`, `tabId`, `mapPath`, `name`, `active` (the view's active tab) and `presented` (Atlas's presented tab, held or not), frozen. While the menu is open Atlas reads every section again after `ui.invalidate()`, and when the view's tabs, the presentation targets or the presented scene change, so the checkmarks of top-level items follow; the rows keep their places, so focus and the arrow keys survive a rebuild. An item with `keepOpen` keeps the menu open, also while its action makes the tab active. A menu that has nothing left to show closes, as when its tab closes. An `items` that throws leaves its section out and is logged once.
- **The eye's marker.** A presentation target's `tabBadge({ viewId, tabId })` puts a short mark after a tab's eye, such as "2 players". Only active targets are asked, the first non-null mark wins, and it is read on render and after `ui.invalidate()`. The mark is plain text, trimmed and cut at 24 characters with "…". A tab with a mark draws its eye in the shown style even when it is not presented, and the mark joins the eye's accessible name; the eye's click, its pressed state and its icon are unchanged. A throw, or an answer that is neither a string nor null, shows no mark and is logged once.

Not part of `scene-tabs`: live state or player visibility of a tab that is not active. A background tab has no store and no sight to read; an extension keeps what it last read of it.

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
- Some record fields use types the entry does not export by name, such as `DieType`, `RolledDie`, `WallType`, `Widget`, `WidgetIcon` and `InitiativeSide`. Name them through the record that holds them, for example `DiceRollResult['rolls'][number]` or `WidgetSettings['widgets'][string]['icon']`, or import them from their file in the tree. Comments on Atlas's own record types may name Atlas functions (`lightKindOf`, `tokenSenses`, `FogCanvasCompositor`); they describe Atlas, and an extension cannot call them.

Record the Atlas commit and the API version of every vendored copy, and verify the copy's hashes in your own CI.
