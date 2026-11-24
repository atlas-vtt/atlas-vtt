# Links to Atlas files in notes

Scenes (`![[Tavern.atlasmap]]`), their snapshots (`#Snapshot name`) and encounters (their JSON, linked with the encounter's name as alias) embed in notes and hover previews as cards (`src/app/links/`).

- **Embeds** go through Obsidian's undocumented `app.embedRegistry` (typed in `obsidianInternals.d.ts`), which serves `![[…]]` in reading view, live preview and link hover previews alike. Atlas claims `atlasmap` and `json`, but the `json` creator returns null for anything that is no encounter (`isEncounterPath`), which gives Obsidian's plain file embed back. An extension another plugin already registered is left alone.
- **Snapshot links**: a link's `#` part reaches `AtlasView.setEphemeralState`; `restoreLinkedSnapshot` waits until the scene is shown loaded and offers the restore with the snapshots panel's confirmation (`snapshots/snapshotRestore.ts`, shared with `useSceneSnapshots`). Names match through `linkSafeName` (the characters a link cannot hold read as spaces), as written first, else ignoring case.
- **`#` suggestions**: `SnapshotLinkSuggest` is moved to the front of `workspace.editorSuggest.suggests`, since the first suggester that triggers wins and Obsidian's own answers every `[[file#` with headings. It triggers only for links that resolve to an `.atlasmap`.
- Encounter files are named by id, so Obsidian's `[[` suggestions cannot find them: links come from Copy link (asset manager, snapshots panel) and the Insert link to scene or encounter command (`atlasLink`, which follows the vault's link format).
