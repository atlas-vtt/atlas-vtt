## Improved

- Players see the grid as you set it on the map: hidden when you hide it, and with its style, colour, opacity and numbers. The player view settings no longer have a separate Show grid switch.

- The eye on a scene tab and Send current map to player view now work without the player window open: they choose the scene players see, and the player window shows it whenever it is opened. Open player window is a command of its own.

- A Lighting quality setting (High, Balanced, Saver) lets dynamic lighting use less graphics memory and battery on laptops with integrated graphics. Only the look changes: what tokens see stays the same.

- Show my rolls to players is now a switch in the dice tray and in Dice settings, the same setting as Show dice rolls in the player view settings.

- Sight and light are worked out much faster on maps with thousands of walls, such as large imported maps.

- Fog paint and erase strokes now use consistent shapes.

- Simplified how token artwork and collection rules update.

- Simplified token statblock updates and added checks for linked notes.

- Simplified laser pointer updates and added checks for cleanup.

- Added checks to keep data types and rendering helpers independent of plugin services.

- Widget shortcuts are consistently marked as GM controls.

- Dice rolls now reject invalid formulas with a clear message and enforce limits of 64 characters, 10 terms, 100 dice and 1,000 faces per die. Exploding dice keep their existing limit.

- Simplified the hashing behind bundles, library files, thumbnails and dice throws, with checks that keep their results unchanged.

- Simplified how the GM view and the player view decide which tokens see and which are always shown.

- Added licence notices for the two dice fonts.

## Fixed

- Freezing the player camera right after sending another scene to the player view no longer freezes players on the spot they were shown in the scene before.

- The player window no longer zooms in, cuts off the map or turns blocky when you open a sidebar, split the pane or keep the map in a small pane. It is now drawn at its own size and sharpness instead of being an enlarged copy of your map pane: it shows everything your view shows, centred on the same spot. Very large player screens are drawn with up to 2560 × 1440 pixels and scaled up smoothly.

- Obsidian no longer turns sluggish for the rest of a session once a right-click menu was opened while Atlas and Fantasy Statblocks are both enabled. Token drags, the ruler, typing in notes and moving files all lagged, most of all with an older Obsidian installer.

- Dragging tokens, measuring and drawing a selection box no longer make Obsidian restyle its window on every mouse move.

- The DM screen no longer stays empty or hidden while Fantasy Statblocks is still reading the vault after Obsidian starts. Each statblock shows as soon as its own note is read.

- A statblock note named like a creature Fantasy Statblocks already knows, such as Goblin, now shows its own statblock in the DM screen and in previews, as its tokens already used it. Before, the creature of that name was shown.

- A statblock whose spell list holds an empty item no longer takes the toolbar and the asset manager down when it is shown.

- A statblock with an empty or malformed entry no longer breaks the toolbar or the asset manager.

- Fog now updates correctly when returning to a map or canceling a drawing.

- Erasing part of a drawing now keeps all saved properties on the remaining pieces.

- Closing the command palette cancels its pending focus attempts, so it cannot take focus back afterwards.

- Dice rolls, sounds and history stay in the map view that made them. The player window follows the presented view, and clearing a log leaves other views alone.

- Undo and redo now change only what that edit changed. Changes Atlas made by itself since, such as following a renamed file, stay.

- With the player camera frozen, the player view no longer jumps when you switch to another Obsidian tab, and no longer changes size when you open or close a sidebar.

- Map shortcuts no longer stop working until the vault is reopened after two note previews load at the same time, such as on a map with two pinned notes. Obsidian lost track of the active tab then.

- Scenes with a map image no longer fail to open with "Failed to fetch" on older Obsidian installers, or where Obsidian runs on a different Electron than it shipped with.

- When a scene's file or map image cannot be read, the tokens of the scene that was open before no longer stay on the canvas.

- The measure tool and the token drag ruler now measure the same path alike everywhere on the map. On a grid aligned to its map, Pathfinder's second diagonal counted 10 ft in some places and 5 ft in others, and a distance such as 4.5 m was rounded up in some places and down in others. On a hex grid, dragging a Large or Gargantuan token measured a hex too few or too many in some places.

- Distance per Square in a collection's settings takes a decimal typed with a comma or a point, so 1,5 and 1.5 both give one and a half, and it takes distances below 1. Typing the decimal sign your system does not use gave 15.

- Where Atlas shows line of sight without light and shadow, because it cannot use the graphics card, areas that two tokens see at once are no longer black for the players. Neither is what a sense that sees in magical darkness sees around the darkness. A thin, broken black line can remain along a slanted wall that the party sees from both sides.

- Timers keep correct time while Obsidian is in the background. Before, a hidden window counted a running timer down by about one second a minute.

- The ruler's distance and the distance shown while dragging a token are readable in Obsidian's light theme. They were white on a light grey pill.

## Important changes

- The player window now shows everything your own map view shows, at its own sharpness, and may show the map around it where its shape differs from your pane. Hide a room from players with fog or lighting, not by scrolling it off your screen.

- When the map pane changes size (a sidebar opens or closes, the window is resized), the map now keeps its centre in place instead of its top-left corner. The player window is centred on the same spot, so it no longer slides when a sidebar opens.

- Atlas no longer reads a statblock code block, the properties of a note it previews from a bundle, or a loot base file that is larger than 32 KB.

- Fog-covered tokens and door badges are now hidden in the player view, including token labels and drag rulers.

- Hidden tokens no longer add sight or explore new areas in the player window. Areas already explored stay remembered.

- Removed an unused legacy map view. Old tabs using it no longer reopen. The current player window is unchanged.

- In the player window, a dice roll shows its token's portrait and ability only when players can see that token in the shown scene, and its name only when token nameplates are shown to players.

- A measurement that starts on a token players can't see is no longer shown in the player view or session view. A measurement also leaves the player view while the token it started on is out of sight.

- Instance badges in the player view and session view count and number only the tokens players can see, so their numbers can differ from those in the GM view. A token whose look-alikes are hidden or under fog shows no badge.
