## New

- Rooms: in the lighting tool's Rooms mode, carve rooms out of solid rock instead of drawing walls one by one. Their outline stops sight, light, sound and tokens like walls, and a door dragged across an opening reaches the walls. Contributed by ThatMattLatt
- Pins can show their name under them on the map: the note's name or one you give them. Switch it on in the pin menu, or once for every new pin when placing them
- Pins you show to players appear in the player window with their names, where the players can see the map
- Names that would crowd each other hide until you zoom in
- Pins shrink with the map when you zoom far out instead of covering it, and become dots when the whole map fits on screen

## Improved

- The lighting tool's modes sit in a small bar above the toolbar with the chosen mode's tools in a bar beside it; its menu keeps only the light to place, brush sizes and the scene's lighting, and Rooms are listed in their own panel at the top left of the map
- The token and map creators keep the images you picked, with their crops, sizes and tags, when you close them; Cancel clears them
- Images dropped anywhere on the asset manager open the token creator (on the Characters and Player characters tabs) or the map creator with them
- Moving tokens, scenes or maps to a folder or another collection says where they went, with a button that opens it
- Scrolling quickly through a large asset manager stutters less
- A full Tokens, Maps, Scenes or Encounters tab ends with a card that creates another, reachable with the arrow keys after the last card
- The token and map creators keep where the images come from under one heading, and say what the tags apply to under Tags
- Card names and hints are easier to read in the dark theme, and every field in the asset manager and its dialogs has an edge you can see
- Scrollbars in Atlas lie over the content and take no room, so lists, menus and dialogs keep the same space on both sides; a thin bar shows while you scroll or point at the list and can be dragged
- The scene's lighting settings are a page in the command palette like the grid and token settings, found by searching for it or from the lighting tool's menu, in place of a separate window; the page also switches dynamic lighting
- In the lighting tool's Rooms mode, walls and doors can be selected, dragged by their points and right-clicked as in the Walls mode, without switching back
- Right-clicking a wall offers Add point, which puts a new point where you clicked, ready to drag
- Sounds in a linked folder become Opus files in that folder once you agree (originals go to the trash or stay), so they are never converted again and Atlas keeps no hidden copy of your sound library
- The Sound page shows how far the conversion has got, with a button to pause it

## Fixed

- In the light theme the veil behind the asset manager and other dialogs is dark again, and so are the shadows of token portraits and the spawn badge; they had turned white
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
- The asset manager's short messages (a move or delete that failed, a transfer done) show again; they had been drawn out of sight
- A dice roll made from a statblock over the asset manager, a statblock preview or a dialog now shows in front of it at the map's top right, instead of behind it under the blur
- When a collection cannot be loaded, the asset manager says so and offers to try again, instead of showing the previous collection's tokens and tags under its name
- Creating a folder with a name that is already taken keeps the dialog open with your name and says why beside it
- In Move to folder, a new folder's name can be moved into straight away: Move (or Enter in the name field) creates the folder and moves there in one step
- Long folder names in the asset manager's path show in full while there is room, and a name that has to be shortened shows whole on hover
- Selecting tags that no token shares now shows "no match" with a way to clear the filters, instead of the empty-library offer
- A tag's count in the asset manager's sidebar is now exactly what selecting it shows: a tag or a search finds its matches in every folder of the tab, wherever you stand
- Empty Scenes, Maps and Encounters tabs offer a button that makes the first one
- Switching collections in the asset manager no longer leaves invisible cards behind that could keep a name tooltip on screen, and the folders, header and cards of the new collection appear together
- Spawn on map and opening a scene start at once, while the asset manager fades out, instead of after it has gone
- With reduced motion on, the asset manager's cards, panes, floating sidebar, chevrons and popovers fade instead of moving
- Collection settings group their tabs under Rules and Content, with every tab name on one line
- The collection picker shows long collection names in full, so two collections that start alike can be told apart
- Create collection stays disabled until the name can be used, and says why beside the name as you type
- A map or token made from an image Atlas stored before is named after it, without the number Atlas added to the file name
- Error messages, selected tags, the filter sliders and card checkboxes are easier to see in the light theme
- Hiding and showing the asset manager's sidebar quickly, or widening the window right after hiding it, no longer leaves an empty space where the sidebar was
- A context menu closed and opened again right away turns back instead of disappearing and appearing anew
- Sound uses far less memory while preparing long files

## Atlas Online

- Abilities named with a link show their plain name in the players' Abilities tab, and an ability linking a heading of its own note shows the text under that heading
