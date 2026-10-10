# Atlas VTT changelog

<!-- Generated from changelog/*.md. Run npm run changelog:generate. -->

## 0.7.1 — Local player window and more precise grid alignment

2026-10-10

### New

- New command in Atlas Command Palette: Show Current Map in Local Player Window as a differentiation between online player view and local player view

### Improved

- Significantly improved reliability and precision of grid alignment both in auto and manual mode
- Grid alignment now detects stretched hexes and pointy hex grids much better
### Fixed

- A collection's cover and the thumbnails of small images are saved as WebP, as their file names say, and an export no longer carries one that is a PNG or JPEG under a WebP name
- Fixed a bug where too small cover images of exported collections weren't converted to .webp correctly as expected by the Armarium parser
- Fixed a bug where modifier rolls in FS statblock tables weren't clickable

## 0.7.0 — Huge sharp maps, gliding tokens and a lighting quality setting

2026-10-09

### New

- Huge maps of up to 144 megapixels (about 16,000 × 9,000 pixels) stay sharp at every zoom
- Imported maps keep their full quality: PNG, JPEG and WebP files are no longer compressed
- Tokens glide to their place instead of jumping
- Lighting quality setting (High, Balanced, Saver) for laptops with weaker graphics

### Important changes

- Local player view window no longer adapts in size and resolution to host windows and instead adapts to it's own monitor
- When the map pane changes size, the map keeps its centre in place instead of its top-left corner
- Hidden tokens no longer give players sight or explore new areas. Areas already explored stay explored
- Tokens and door icons under fog are hidden from players, with their names and rulers
- Players see a roll's token picture and name only when they can see that token
- Measurements that start on a token players can't see are hidden from players
- Look-alike token numbers in the player view count only the tokens players can see
- Atlas skips statblocks, note properties and loot files larger than 32 KB

### Improved

- Large maps open faster, and much faster the second time. Settings show the space this uses and clear it
- Grid on maps now correctly adjusts again to host changes on the player view
- New toggle for public dice rolls in the dice tray
- Invalid or oversized dice formulas are rejected with a clear message
- Sight and light are much faster on maps with thousands of walls
- Fog strokes keep consistent shapes

### Fixed

- The map no longer flickers when a sidebar opens or closes
- Fit map (Shift+1) shows very large maps entirely
- Maps larger than the graphics card can show no longer stay black
- The player window no longer zooms in, cuts off the map or turns blocky when you open a sidebar or use a small pane
- The frozen player camera no longer jumps or resizes when you switch tabs or open a sidebar
- Freezing the player camera right after switching scenes freezes it in the right place
- Obsidian no longer turns sluggish after a right-click menu while Fantasy Statblocks is enabled
- Dragging tokens and measuring no longer slow Obsidian down
- Fixed performance for DM screen after fresh Obsidian start
- Empty or broken statblock entries no longer break the toolbar or the asset manager. With a contribution by ISorokaI
- Dice in statblocks can be clicked in every Fantasy Statblocks layout, including custom ones with scripts
- Dice rolls, sounds and history stay in the map view that made them
- Undo and redo change only what that edit changed
- The ruler and token dragging measure the same distance everywhere on the map
- Distance per square takes decimals with a comma or a point, and values below 1
- Ruler labels are readable in the light theme
- Timers keep correct time while Obsidian is in the background
- Fog updates correctly when you return to a map or cancel a drawing
- Erasing part of a drawing keeps the drawing's settings
- Map shortcuts keep working after two note previews open at once
- Scenes no longer fail with "Failed to fetch" on older Obsidian installers
- A scene that fails to open no longer leaves the previous scene's tokens on screen
- The command palette no longer takes focus back after you close it
- Without graphics acceleration, areas that two tokens see are no longer black for players

## 0.6.0 — Customizable toolbar, links to scenes in notes, Russian and library sync

2026-10-05

### New

- Customize the toolbar from the command palette. With a contribution by oscar-eriksson
- You can now link and embed scenes, snapshots and encounters in your notes
- Atlas uses Obsidian's language. Russian is the first translation and more will follow Contributed by ISorokaI

### Important changes

- Your library now syncs with Obsidian Sync, Remotely Save and Self-hosted LiveSync. Update Atlas on every device before you edit your library there
- With Obsidian Sync, turn on "Sync all other types"
- Atlas settings now sync with your plugin settings

### Improved

- Set a different distance per cell for each scene in Grid Settings. Contributed by ISorokaI
- Number the cells on square grids. New format: A1, B1, …
- Maps use much less graphics memory
- On narrow windows, the command palette button always stays in the toolbar
- Walls join at their end points
- Right-click a wall to place a door
- Right-click a door, point or wall to remove it

### Fixed

- Grid lines no longer disappear at some zoom levels. Contributed by ISorokaI
- Links in Fantasy Statblocks statblocks work. Contributed by ISorokaI
- The asset manager is faster with many tokens. Contributed by ISorokaI
- Zooming a map without a grid no longer distorts it
- The laser pointer no longer disappears
- Rolls show as cards when 3D dice can't be drawn. Contributed by ISorokaI
- Fixed the swapped export and import icons in the asset manager. Contributed by anacletoTM
- Large and Gargantuan tokens snap to whole cells
- The selection outline follows a resized token
- A d100 shows the right tens die in 3D
- Fixed graphics memory leaks after a reload and after loading a scene
- With dynamic lighting, the grid, pins and ruler stay visible in the dark
- Brush rings stay under the pointer when you scroll with a trackpad. With a contribution by Lobby444
- The DM screen fits narrow maps
- Restoring a snapshot works with dynamic lighting on

## 0.5.0 — Dynamic lighting as an experimental feature, 3D dice, token resources and map imports

2026-10-02

### New

- Dynamic lighting. It is off by default. Switch it on in the Atlas command palette under Experimental features
- Experimental features page in the command palette
- Import maps from Dungeondraft, DungeonFog and Dungeon Alchemist (.dd2vtt, .uvtt, .df2vtt)
- 3D dice
- Dice rules for each collection: default roll, critical rule, exploding dice
- Token resources: up to six for each collection. New Resources tab in the collection settings
- Cairn game system preset
- Draw Steel game system preset. Contributed by jSQrD-dev
- Initiative by sides
- Initiative rules for each collection
- Clear button in the initiative tracker

### Improved

- Initiative: you add the combatants yourself. Right-click a token and choose Add to Initiative
- Players see every combatant whose token is not hidden
- The GM dashboard is now the DM screen. Press Tab to open it
- The token you drop last lies on top
- Edit Token has two columns
- Hold Ctrl/Cmd over a token in the asset manager to see its statblock
- The asset manager shows placeholders while it loads, and scrolls smoothly
- Large token imports are much faster. With a contribution by DeastinY
- A collection export includes linked notes, images, PDFs and loot tables
- New dice looks and a new dice tray
- HP and secondary bars are now in the Resources tab
- A map larger than 8192 pixels is scaled down. Its card shows the new size
- SVG maps stay sharp
- Cone measurements follow the game system. Contributed by ISorokaI
- The player view button of a scene tab is now on the left. Contributed by ISorokaI
- Map shortcuts work on every keyboard layout. Contributed by ISorokaI
- Maps open with software rendering when WebGL does not start
- A statblock with a `token` property is found when you create tokens
- Fixed: scenes that became black or empty when you switched, renamed or opened them
- Fixed: wrong dice totals and critical results
- Fixed: right-click menus and right-drag pan over fog of war
- Fixed: the DM screen shows its statblocks side by side again
- Fixed: Edit Token did not open
- Fixed: Spawn on Map did nothing in some asset managers
- Fixed: a collection with missing files could not be deleted
- Fixed: a moved text went back to its old position
- Fixed: the player window stayed dark in a light theme
- Fixed: many small layout problems

## 0.4.2 — Faster imports with progress bars, a toolbar that fits small windows, and scene and map fixes

2026-09-29

### Improved

- The map toolbar fits any window size. Tools that don't fit move into a "More tools" menu
- Menus, the dice tray and the command palette stay inside small map views
- Importing tokens and maps is now roughly 2.5x faster and images that are already small enough won't get re-compressed any longer
- Importing tokens/maps now shows a progress bar
- The Fantasy Statblocks import opens much faster in large vaults
- Create token from statblock image now saves a small, optimized thumbnail instead of a full size copy

### Fixed

- Maps and scenes can be moved into folders in the asset manager again
- Scenes keep their background when the map image is renamed or moved
- Fixed bug where the dashboard would open map images as a black canvas. It now lists only scenes again
- Scenes that can't be opened now show an error instead of a black canvas
- Token images can be moved and zoomed again after turning on the ring. Edit token now saves the new framing
- Maps now show up when Obsidian can't use the graphics card, for example on some Linux systems
- The laser pointer works again after closing a map view
- Fixed an issue where recently created scenes wouldn't show their thumbnail in the asset manager

## 0.4.1 — Fixes the asset manager's menus on older Obsidian installs and note pins linked to a heading

2026-09-28

### Fixed

- The asset manager's Create menu works again on older Obsidian installs. Only the top of Create Token reacted to clicks, and clicking Add Map or Create Collection closed the menu. The other menus and search suggestions below the asset manager's header had the same problem.
- Note pins linked to a heading open the note at that heading again, also for headings further down the note and headings with links, formatting or a # in them.
- Picking a heading for a note pin lists the headings of the note you picked, even when another note has the same name. Notes that share a name show their folder, and a heading you already typed is kept.

## 0.4.0 — Creature filters, hexcrawl maps, loot roller, progress clocks and moving between collections

2026-09-28

### New

**Creature Filters**
- Filter characters by challenge rating, level, type, alignment and more. Type `cr:1-3` or `type:beast` in the search, or use the filter panel.
- Sort characters by Rating.

**Hexcrawl Maps**
- Number every hex on a hex grid.
- Link a note to a hex: Shift-click it with the Note Pin tool.

**Progress Clocks**
- A new Clock widget, like in Blades in the Dark. Show it to your players too.

**Move and Copy Between Collections**
- Right-click any asset and choose Move or Copy to Collection. Artwork, statblocks and links come along.

**Loot Roller**
- Roll random loot from your item notes in Obsidian Bases. Press L to open it.
- Show an item to your players with the eye button.

**Player View and Starter Tokens**
- Share your dice rolls with players. Turn on "Show dice rolls" in the player view settings.
- Ten new class tokens in the default collection.

### Improved

- New laser pointer that is easy to see on any map.
- Place a grid by eye with the new Freehand tab.
- The asset manager opens where you left it.
- Start, pause and reset timers from the keyboard.
- Open map tabs scroll when there are too many.

### Fixed

- Many fixes for note previews, the player view, widgets and settings.
- Atlas now notices when you rename, move or delete its files outside Atlas.
- Saved encounters go to the right collection.

### Important changes

- A collection's folder now always has the collection's name. Atlas renames old folders once, for example `default` to `5e`.
- The Quick tab in Grid alignment is gone. Use Intersections or Freehand instead.

## 0.3.1 — Completes 0.3.0 with game systems, new pin icons and conditions

2026-09-24

### Important changes

- This release completes 0.3.0. Several finished features were missing from the 0.3.0 build and are included now. Pins that show no icon in 0.3.0 get their icons back.

### New

**New Feature: Game System Presets**

- Set a collection's measurement, conditions and token bars in one click in Collection Settings → Game System.
- Built-in presets: Daggerheart, D&D 5e, Old-School Essentials, Shadowdark, Pathfinder 2e, Call of Cthulhu 7th Edition and Cyberpunk RED.
- Save your own rules as a preset and use them in other collections.
- Choose the game system when you create a collection.

**New Feature: Place Pins**

- 65 new place icons for pins, from a world map down to a single room. Hover the location marker in the pin picker to open them.

**General**

- Share a counter or timer with every scene of a collection ("Share across collection" in Widget Settings).
- Tokens at 0 hit points turn grey and show a skull.
- Tag assets right from their card in the asset manager.
- Measure in yards.
- Conditions can carry a number, like Frightened 2 or Exhaustion 3.
- Apply a condition to several selected tokens at once.
- Join the Atlas community on Discord. The changelog and settings now link to it.

### Improved

- New Atlas app icon.
- New fantasy icons for map pins. Existing pins switch to the new icons on their own.
- Change a pin's icon in one click with Edit Pin.
- Conditions show as badges on the token, with a hover card that names them.
- Resource bars stay at a normal size and grow when you select a token.
- Resource bars animate when their value changes.
- Rotate and resize handles stay in place on rotated tokens.
- Smooth mouse-wheel zoom and a gentle stop after panning.
- Widgets float on their own cards above the map.
- Redesigned Link Statblock dialog with a statblock preview.
- Search and tag filters in the asset manager find assets in every folder.
- The asset manager sidebar floats over the library on narrow windows.
- Smoother animations for the asset manager, its dialogs, the pin menu and the command palette.
- Every panel closes with the same × button and shares the same rounded corners.
- Atlas shows its own tooltips instead of plain grey browser tooltips.
- Shift+Enter in the map switcher opens the map in both views.
- The End Combat button shows a white flag.

### Fixed

- The asset manager fits narrow and tall windows.
- Conditions show on the token at once.
- Every resource bar can be edited and has working +/- buttons.
- Tokens without a statblock no longer get a hit point bar of 100.
- Range band fields in Grid & Measure can be cleared and retyped.
- Sorting in the asset manager works.
- Map tags and character tags are kept apart.
- Tags created from an asset's right-click menu are saved.
- Manage Tags & Collections no longer reacts to Ctrl/Cmd shortcuts.

## 0.3.0 — Map switcher, scene snapshots and copy and paste

2026-09-24

### New

**New Feature: Map Switcher**

- Hit 'g' to open a keyboard friendly map/tab switcher (hotkey adjustable in settings)

**New Feature: Snapshots**

- Save multiple save states of a map under a name. Restore it later, for example to run the same fight with another group. Open the command palette (spacebar) and choose Scene snapshots. Snapshots move with their scene and export with their collection.

**General**

- Copy, cut, paste and duplicate on maps. This works for tokens, drawings, texts and pins. Use Ctrl/Cmd+C, X, V and D. Paste puts the objects at the cursor, also on another open map.
- Spawn many copies of a token at once. In the asset manager, hover a token, type a number and press Go. You can also right-click it and choose Spawn Multiple. On the map, hold Alt/Option while you drag to make copies.
- Updated Collection Export to include more granular Settings and a thumbnail
- See the drag distance when you drag tokens
- Choose how diagonals count on square grids in the collection settings

### Improved

- Improved Performance for Atlas Maps. They use much less CPU and GPU
- The player view copies a new frame only when the map changes.
- Switching maps is much faster now.
- Improved animations throughout Atlas
- Improved performance of Maps tab in Asset Manager
- Token controls grow with the token. Large creatures get large bars, nameplates and handles.
- Delete and Backspace also remove selected texts and pins.
- Import and export dialogs stay open and show the result until you close them.
- Dates in the note picker use your app language.

### Fixed

- Fixed memory leak when map switching
- Old player windows no longer stay open in the background after you reload Obsidian.
- Atlas releases token art and the player view's old map when you leave them.
- The player view shows the initiative tracker and widgets of its own map. Another open map no longer changes them.
- Pinned note previews are saved with their map. They come back in the same place, with the same scroll position and mode.
- Import of a collection you already have no longer stops without a message.
- Import asks for a new name when the name is already in use.
- A new collection no longer replaces a collection with the same name.
- Collection updates also update token art.
- Imports check each file. Atlas refuses damaged files and files that go outside its folder.
- A failed import undoes its changes. Atlas backs up each file before it replaces or removes it.
- Export tells you about missing files. It no longer skips them without a message.
- Imports during an asset manager refresh no longer add duplicate tokens or remove tokens.
- The Show Nameplate setting of a token stays as you set it when you link or unlink a statblock.
- Ctrl/Cmd no longer opens a preview from a map you left.
- Number badges show on new tokens at once. Before, you had to move a token first.
- Dice cards and the roll log show a token's portrait as it looks on the map.
- Encounters keep the ring setting of their tokens.
- Renamed collections keep their scenes, maps and tokens. This includes the default collection.
- When you rename, move or delete a collection folder in the file explorer, the asset manager and dashboard update.
- Collections with the same name get a number, for example "Default (2)".
- Collections with a name of more than one word show their assets.
- Manage Tags & Collections: "Delete selected" deletes the items.
- Manage Tags & Collections: tag names you change are saved.
- Manage Tags & Collections: right-click → Delete removes the row you clicked.
- Atlas no longer removes tokens at startup before Obsidian lists all files.
- If Atlas cannot read its asset index at startup, it tries again. If it fails again, it keeps a copy and builds a new index from your collection files.

## 0.2.3 — Maintenance release

2026-09-22

### Fixed

- Obsidian's community directory can complete its source review. The lint suppressions file moved to a name ESLint does not load on its own, so the review's own ESLint run no longer exits with a configuration error. The plugin itself is unchanged from 0.2.0.

## 0.2.2 — Maintenance release

2026-09-22

### Fixed

- Obsidian's community directory can complete its source review. Every script file in the repository now belongs to a TypeScript project, so the review's parser no longer fails on the test suite and build scripts. The plugin itself is unchanged from 0.2.0.

## 0.2.1 — Maintenance release

2026-09-22

### Fixed

- Obsidian's community directory can review the plugin source again. The lint configuration no longer aborts on `package.json`. The plugin itself is unchanged from 0.2.0.

## 0.2.0 — Token resources, bulk statblock import and asset manager upgrades

2026-09-22

### New

- Set maximum HP and secondary resource values in Edit Token, with per-token overrides of linked statblock defaults.

- Choose a token's size from its right-click menu on the map: Medium (1×1), Large (2×2), Huge (3×3) or Gargantuan (4×4).
- Give token assets a default size in the token creator, when editing a token, or from the asset manager's right-click menu. Tokens spawn at that size, and it travels with collection exports. Fantasy Statblocks imports pick it up from the creature's size.
- The ruler follows the grid's Snap to grid setting: switch snapping off to measure from any point.
- Click a selected token's HP or secondary-resource bar to edit it: the bar highlights on hover, and a popover opens below it with current and maximum fields. Type a number or a `+5`/`-3` adjustment, use the arrow keys to step (Shift for tens), Tab between fields, Enter or click away to apply, Escape to cancel.
- Choose whether to share the DM’s initiative tracker in the local player view. The read-only player panel appears only while the DM tracker is open and player sharing is enabled, independently of other widgets. Turn order and rounds update live; hidden tokens stay private.

- Select several assets or folders in the asset manager like in a file manager: Ctrl/Cmd-click adds or removes single items, Shift-click selects everything between the last clicked item and the one you click.
- Tab and Shift+Tab cycle through the asset manager tabs, like in the command palette.
- Ctrl/Cmd+F in the asset manager jumps to the search box.
- Ctrl/Cmd+A in the asset manager selects all items of one kind: every folder when a folder is selected, otherwise every asset in the current view.
- Import tokens from Fantasy Statblocks in bulk. Preview creatures with local artwork, choose a collection, and create linked tokens while skipping existing imports and preserving original notes and images.
- Hold Shift and click tokens to add them to or remove them from the selection, then drag any of them to move the whole group.
- New scenes align their grid to the map image on their own the first time they open. Maps without a grid simply open without one; the grid alignment tool remains available for corrections.
- Read what's new after an Atlas update and browse previous releases in an offline changelog. Open it anytime with the View changelog command or from Atlas settings.
- Turn automatic update announcements on or off in Atlas settings or in the changelog.
- Report a bug or suggest a feature from inside Obsidian with the Report an issue command or from Atlas settings under Help and feedback. Atlas fills in your Atlas and Obsidian versions and submits your report directly, preserving the chosen issue type and affected area. No GitHub account or second form is needed.

### Improved

- Browse release notes in a fixed-size changelog with a scrolling history, release sections and a feature-update-only announcement option. Beta builds include their pending notes.
- The issue-report form uses Atlas dropdowns and grouped categories, with only its text fields scrolling.

- Exporting a collection now packs everything it needs: scenes with their map files, backgrounds and previews, token art and thumbnails, encounters, and the Fantasy Statblocks notes tokens link to together with their artwork, plus the collection's tags and settings. Importing restores all of it into the new vault with working scene previews and statblock links, and a progress dialog shows what is being packed or written.
- Hover highlights in the asset manager, dropdown menus and context menus now appear and disappear instantly, and every item also shows a pressed highlight while you click it.
- Deleting a token asset now tells you which encounters and maps still use it, removes it from them on confirm, and deletes encounters that would be left empty.
- Fantasy Statblocks artwork now opens in the same token import cards as uploaded images, with crop controls, tags for selected tokens, and individual or global ring choices.

- Dice roll toasts now look like a game HUD: a large glowing result, a ringed portrait, an accent-tinted ability label and knotwork corners. Natural 20s glow gold and natural 1s glow crimson, and the number lands with the reveal chime.
- The asset manager stays quick with large libraries: it keeps its index in memory, shows small thumbnails instead of full-size token art (existing tokens get theirs in the background), and only renders the cards on screen.
- Fantasy Statblocks imports now open inside the existing token creator. Filter by system/layout and choose the Atlas ring for all tokens or individually. Tokens imported without a ring retain their full artwork on the map.

- Grid auto-detect now lines up across the whole map instead of drifting towards the edges, finds faint grids on busy art, and no longer reports a grid on maps that have none or picks the wrong grid type. The result tells you how much of the map the grid was found on.
- Grids draw in black or white, whichever stands out against the map image, instead of cyan. Maps still on the old cyan default switch over automatically; pick Auto in the grid colour swatches to return to this after choosing a colour.

### Fixed

- Spawning several selected tokens from the asset manager keeps each token's ring setting and default size, matching single spawns.
- The current and maximum numbers on token gauges sit close together around the slash. Changing a maximum in the bar popover preserves it as a token override.
- Deleting an open scene no longer makes Atlas and Obsidian both close its view. Closing the active scene loads the next scene and restores its viewport and undo history.
- Closing a map waits for its pending saves to finish, and overlapping saves keep their original order.

- Token HP and secondary-resource fills keep their rounded leading edge at low values. Clicking a selected token's bar keeps the value editor open, and changing only the secondary-resource maximum refreshes its bar and label.
- Token artwork and glass overlays update throughout resize and rotation gestures, including after release.
- Edit Token no longer draws an extra frame around its fields, and its actions use the shared button states.

- Scene tabs and widgets share the top row, with widgets aligned right and the initiative tracker kept clear. The view-actions menu sits at the bottom right.

- Resize and rotation handles on selected tokens respond to clicks and drags again instead of deselecting the token.
- Deleting or renaming a collection in Manage Tags & Collections now sticks: the collection and its assets are removed from the vault, and the dropdown no longer shows it after reopening the asset manager. Deleting asks for confirmation first, and the default collection cannot be deleted.
- Right-clicking assets, folders and tags in the asset manager opened from the dashboard shows the context menu again, including when no map is open or another map tab was closed.
- Fantasy Statblocks import actions stay in a padded footer while the list scrolls, and the system/layout filter uses the Atlas dropdown.

- The local player window no longer shows hidden tokens, the selection outline, marquee, token controls or resize and rotation handles from the DM view.
- Imported collections open their scenes again and keep each token's ring setting and statblock link.
- Token ring toggles keep their full button height in the importer sidebar and use the consistent label “Toggle token ring”.

- Clicking controls in Manage Tags or closing the dialog no longer closes the asset manager behind it.
- Token import ring controls now share the editable preview state, and fast-loading images no longer get stuck optimizing.

- Shift+2 centers the selected token at a readable on-screen size across map resolutions and window sizes, with room around it in small panes.

- Local player windows refresh at the display frame rate without the display-only label or FPS counter, and reconnect to the presented scene after Obsidian reloads.

- Creating a token from a statblock image no longer mistakes the source artwork for an existing token.
- Opening a settings dropdown closes the previous one, including when switching with the keyboard or between map views.
- Grid settings dropdowns keep opening after other map tabs close, and size to their button unless longer options need more room.
- The unit type picker in collection default settings uses the Atlas dropdown menu instead of the native system menu.
- Ctrl/Cmd+hover statblock previews open when you press the key while already over a token, and tall statblocks scroll inside the card with a soft edge shadow instead of running off the screen.

### Important changes

- Removed the music and ambience player.
- Removed the vault-wide and current-folder image optimization commands. Images are still optimized during import.
- Removed the New map from image command. Create scenes through the scene browser.

## 0.1.6 — Scene settings and reliable map switching

2026-09-20

### Improved

- Switch command-palette tabs with Tab and Shift+Tab. Keyboard navigation inside settings panels continues to work as usual.
- Creating a scene no longer asks you to select an unused campaign.

### Fixed

- Grid and token settings now update the active scene correctly.
- Pending map changes are saved before switching scenes.

### Important changes

- Removed the legacy generic-token command. Use the token tools in the asset manager instead.

## 0.1.5 — Creating scenes in collections

2026-09-20

### Fixed

- Creating a scene in a named collection now uses the correct collection folder, including on Windows and when the collection name contains spaces.
- New scenes use the selected collection's grid defaults consistently.
- If scene creation fails, Atlas displays a notice explaining that it could not create the scene.

## 0.1.4 — Compatibility and dependency maintenance

2026-09-20

### Improved

- Updated dependencies and adjusted the plugin bundle for Obsidian's community-plugin requirements.
- ZIP import and export remain available with the updated bundle.

## 0.1.3 — Map switching and asset-manager dialogs

2026-09-20

### Fixed

- Leaving a map clears its old interaction handlers so they cannot respond after switching scenes.
- Confirming or cancelling a deletion keeps the asset manager open.

## 0.1.2 — Atlas VTT for Obsidian

2026-09-20

### New

- Run tabletop sessions with battle maps, square and hex grids, tokens, fog of war, note pins, drawing, measuring, dice, initiative and music.
- Present your game in a separate player window.

### Important changes

- Atlas requires Obsidian 1.8.7 or newer on desktop.
