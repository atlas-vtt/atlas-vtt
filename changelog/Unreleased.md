## New

- Rooms: in the lighting tool's Rooms mode, carve rooms out of solid rock instead of drawing walls one by one. Their outline stops sight, light, sound and tokens like walls, and a door dragged across an opening reaches the walls. Contributed by ThatMattLatt
- Sounds in a linked folder become Opus files in that folder once you agree (originals go to the trash or stay), so they are never converted again and Atlas keeps no hidden copy of your sound library
- The Sound page shows how far the conversion has got, with a button to pause it

## Fixed

- Atlas notices such as "Saved" show at the bottom of the window again; since 0.13.0 they appeared nowhere
- A defeated token no longer gives its players sight under dynamic lighting, and sees again once revived
- Hovering a token linked to a Fantasy Statblocks note on the map now shows its statblock, the same one the asset manager and the DM screen show, instead of the plain note
- A token whose statblock note was deleted or moved outside Obsidian now shows a red badge in the asset manager, and clicking it lets you link another statblock instead of opening an empty Untitled note
- One-way walls that let light through no longer draw a dark line across passages when ray tracing is off
- "New statblock…" in the Link Statblock dialog opens its menu in front of the dialog, so its choices can be picked
- Recovery buttons can restore a tracked number such as HP or Stress again when the collection has a resource of the same name that reads another field
- Tokens on an open map take the new maximum when a resource is pointed at another statblock field in the collection's settings
- Counters such as spell slots can now be ticked off in a statblock's hover preview and in the DM screen, not only beside the note
- Snapshots that were saved but no longer showed in a scene's snapshot tray appear there again
- The player window shows the map live again when you reopen the scene it was showing, instead of staying frozen on its last picture
- Statblocks with large tables no longer freeze Obsidian when their note opens beside the statblock or when the window is resized
- Sound uses far less memory while preparing long files

## Atlas Online

- Abilities named with a link show their plain name in the players' Abilities tab, and an ability linking a heading of its own note shows the text under that heading
