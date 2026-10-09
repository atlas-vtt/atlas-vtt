## New

- Huge maps of up to 144 megapixels (about 16,000 × 9,000 pixels) stay sharp at every zoom
- Imported maps keep their full quality: PNG, JPEG and WebP files are no longer compressed
- Tokens glide to their place instead of jumping
- Lighting quality setting (High, Balanced, Saver) for laptops with weaker graphics

## Important changes

- The player window shows everything your map view shows, and may show more of the map around it. Hide rooms from players with fog or lighting, not by scrolling them off your screen
- When the map pane changes size, the map keeps its centre in place instead of its top-left corner
- Hidden tokens no longer give players sight or explore new areas. Areas already explored stay explored
- Tokens and door icons under fog are hidden from players, with their names and rulers
- Players see a roll's token picture and name only when they can see that token
- Measurements that start on a token players can't see are hidden from players
- Look-alike token numbers in the player view count only the tokens players can see
- Atlas skips statblocks, note properties and loot files larger than 32 KB
- The old, unused map view is gone. Tabs that still used it no longer reopen

## Improved

- Large maps open faster, and much faster the second time. Settings show the space this uses and clear it
- Players see the grid exactly as you set it. The separate Show grid switch is gone
- Choose the scene players see without opening the player window. Open it with Open Player Window in the command palette
- Show my rolls to players is now in the dice tray and in Dice settings
- Invalid or oversized dice formulas are rejected with a clear message
- Sight and light are much faster on maps with thousands of walls
- Fog strokes keep consistent shapes

## Fixed

- The map no longer flickers when a sidebar opens or closes
- Fit map (Shift+1) shows very large maps whole
- Maps larger than the graphics card can show no longer stay black
- The player window no longer zooms in, cuts off the map or turns blocky when you open a sidebar or use a small pane
- The frozen player camera no longer jumps or resizes when you switch tabs or open a sidebar
- Freezing the player camera right after switching scenes freezes it in the right place
- Obsidian no longer turns sluggish after a right-click menu while Fantasy Statblocks is enabled
- Dragging tokens and measuring no longer slow Obsidian down
- The DM screen shows statblocks right away after Obsidian starts
- A statblock note named like a known creature, such as Goblin, shows its own statblock
- Empty or broken statblock entries no longer break the toolbar or the asset manager. With a contribution by ISorokaI
- Dice in statblocks can be clicked in every Fantasy Statblocks layout, including custom ones
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
