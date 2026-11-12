## New

- **Units with a name of their own**: pick Custom as a collection's unit and type its name, such as mi, and every distance shows it. A single scene can name its own unit in the grid settings, so a galaxy map measures in ly while the rest of the collection stays in feet
- **Diagonals that count 2**: a new choice for how a collection counts diagonals, for games without diagonal moves

**Measuring**
- The measure tool has its own bars above the toolbar: Ruler, Circle, Cone, Square and Line, and beside them Keep, Players see it, a colour and Clear
- Keep (K) switches whether what you measure stays on the map, and Clear removes everything kept on the level you are looking at
- Players see it switches whether players see what you measure, and the colour dot picks the colour of your next measurement
- Press M again while measuring to step to the next mode
- Measure around corners: press Space while you drag the ruler, or click point by point and finish with a double click or Enter. Backspace takes the last corner back, Escape cancels
- A ruler with corners shows the length of each leg and the total at its end
- A measurement you keep is saved with the scene, and undo takes it back
- A measurement you let go shows a pin beside its distance for two seconds: click the pin to keep it
- A kept measurement has a small handle at its start, shown only to you. Drag the handle to move the measurement with any tool; its line and area take no clicks, so tokens under them stay in reach
- Click the handle to change the measurement's colour, hide it from players or delete it
- Delete or Backspace with the pointer over a handle removes that measurement
- Hold Shift as you let go to do the opposite of Keep for that one measurement
- Hold Alt to measure without snapping to the grid
- Measurements have a dark edge, so they show on bright maps
- Distance while moving tokens: choose in the measure tool's menu whether a dragged token shows how far it has moved always, only in combat or never
- Square and Line: two new shapes. A square starts at the middle of one side and grows the way you drag; a line is one cell wide, and a kept line's width is set at its handle
- Areas snap the way rulebooks measure them: they start on a cell's centre, corner or edge, and their size goes in whole cells whichever way you drag, so a circle of four squares reads 20ft in every direction
- An area tints the cells it covers and outlines its true shape. It lies on the map under the tokens, lit like the floor, so players see it only where they see the map
- An area stops at walls and closed doors. A kept area's handle has Stops at walls to let it pass them
- While you draw an area or point at its handle, the tokens in it get a ring and the label says how many there are. Players see the rings only while you draw, and only on tokens they can see
- A kept area has a second handle at its far end: drag it to resize and turn the area
- Select tokens, at a kept area's handle, selects every token in it
- Auras: a token's menu has Aura, which gives the token an area that goes where it goes, one square's distance at a time (+ and - work too), for the whole selection. It is counted from the token's own space by the collection's rule for diagonals, so with diagonals that count 1 it is the square the rules mean. It tints its cells, stops at walls, and players see it while they see the token
- Follows token, at the handle of a kept circle that lies on a token, makes the circle that token's aura, or lets it go where it is. An aura's far handle sets how far it reaches
- Covered cells: a collection's Grid and measure settings say when an area covers a square or hex: at least half of it is inside, its centre is inside, or any part of it is
- A cone can end rounded or flat, chosen in the same settings
- Movement steps: the same settings name the steps of a move, such as Move ×1 and Dash ×2, each so many times a token's speed and with a colour of its own, and whether movement adds up over a turn. D&D 5e and Pathfinder 2e come with theirs
- While you drag a token, its line takes the colour of the step the move is in and turns red past the last one, and the label reads moved / speed, such as 25 / 30ft. Where movement adds up over a turn, a token's moves in its turn count together while a fight runs, and undo gives the distance back
- Speed: a token moves by the speed its statblock states, or by one of its own that you type in Edit token. Where a statblock states several, such as walking and flying, pick one under Movement in the token's menu
- Height: a token's menu has Height, which lifts it off the floor or puts it below, one square's distance at a time (+ and - work too), for the whole selection. A small tag over the token says how far, such as ↑ 30ft, and players see it on tokens they see
- A ruler that starts or ends on a token counts the height between its two ends, by the collection's rule for diagonals
- Range check: with one token selected and the measure tool in hand, point at another token to see a dashed line and the distance between the two, from edge to edge and with their heights. Nothing is clicked or kept, and only you see it
- Ranges: a new mode of the measure tool. Click a token or a place for labelled rings around it: the range bands of a game that measures in bands, or how far the token gets with each movement step. The rings follow the grid and its rule for diagonals, stay with their token when it moves, and go when you click the token again or press Escape. Only you see them
- Effects: a kept area can burn, freeze or crackle. Its handle offers Fire, Frost, Lightning, Mist, Radiance and Shadow, drawn in the area's own colour and moving while maps are animated. Tokens stand on top, and players see an effect only where they see the floor
- Gives light: a kept area can light the scene like any light. A circle and an aura shine from their middle, a cone shines the way it points, and a square or a line glows along its whole shape, so a wall of fire lights the corridor it stands in. Its two ranges start from its size and can be changed at its handle
- Fire, Lightning and Radiance bring their light when you choose them, and Shadow makes a circle or an aura a magical darkness as wide as itself
- The colour dot in the measure tool's bar is now the look: pick a colour and an effect there, and the next area you keep takes both, with its light. A wall of fire is Line, drag, Shift

## Improved

- The lighting tool now opens on Draw rooms, with Draw walls for single walls right after it
- Rooms are now real walls: a room carved with Draw rooms can be dragged by its points, deleted and given doors like any wall you drew
- A shape carved over or against existing rooms joins them and only adds walls where there was rock, whether those rooms were carved or drawn with walls; Fill in walls a room off again
- Draw rooms darkens everything outside your rooms, so you can see where they are
- A room can be left open, as an entrance without a door: it stays a room, and what you carve through the opening joins it
- In the lighting tool's Lights mode, the lights you can place are in the bar beside the modes instead of the menu
- The lighting tool's bars stay in Session View, greyed out, and say that lighting is edited in GM View, instead of vanishing
- Rooms saved with 0.14.0 turn into walls when you open the scene. The Rooms panel is gone: joining two rooms is deleting the wall between them
- Fields, drop-downs and search bars in the asset manager and its dialogs have a quieter edge instead of a bright outline
- With dynamic lighting, the GM can read the map where a scene has no light, while players still see only what the light shows
- Scene tabs show more of each scene's name, and all of it while the bar has room
- Online play: note pins your players may read on the campaign's world map, and on the maps it leads into, now show there in their book, and the first player to open one finds its note for the whole table, as with pins on the shared map
- Online play: when the campaign you start a table with has a game system of its own, the start menu says that every map plays by it instead of its collection's

## Fixed

- A roll you make as Public roll in the online table log now always reaches your players, even while "Show my rolls to players" is off
- Creating a statblock from a token no longer says it failed when only linking the token went wrong: the new note opens and a notice tells you to link the token from its menu
- Online play: when you point a pin players already found at another note or heading, they now read the new one instead of the old note
- A statblock value that tracks a number now shows its own pattern, such as a rank looked up from the current Glory, instead of "current / max"
- In statblocks, the name of an action or trait and its text now stand a full space apart in every font, and text that starts with a space no longer gets a double gap
- Hovering a link to an Atlas statblock note, or holding Cmd/Ctrl over it, now shows the statblock in the preview instead of only its properties
- Online play: a player whose page fell out of step with the table is caught up by itself, instead of having every roll and move refused until they reload
- Two tokens linked to the same statblock no longer freeze Obsidian when two players play them at an online table
- Renaming a folder in the asset manager now keeps the new name, and the assets inside stay in the folder
- Creating a subfolder, moving a folder's contents and dragging a folder onto another folder in the asset manager now last, and Back and Forward still find a folder after it was renamed or moved
- Deleting a folder in the asset manager now moves what it holds to the parent folder and removes the folder for good
- A statblock description with several paragraphs or a list no longer makes its section, or everything after it, vanish from the card and the hover preview on older Obsidian installers
- Notices now go away properly when the system has animations switched off
- Text placed on the map stays sharp when you zoom in and on the player screen
- Online play: a player keeps their character sheet while their token is hidden or out of sight
- Online play: a token given to a player shows its statblock and abilities even when the map does not show the token yet
- Online play: abilities named with a long link, or a link to a heading with brackets, show their plain name and text
- Initiative by sides puts player characters on the players' side, also in scenes without dynamic lighting and at an online table
- Creating a statblock from a token now also offers your own statblock templates, not only the collection's roles
- Statblocks moved from Fantasy Statblocks show their Tier and the text of their features: renaming Level to the name your statblocks use now reads their value, and features written with `text` show their description
- The scene's Token Settings now follow the game system a map plays by at once, and say when a played campaign's rules replace the collection's
- A Base with a note Atlas cannot read no longer hangs on "Reading…": the note's bad value is left out and the rest of the table loads
- Collection and campaign settings no longer close on a click outside or Escape while they hold unsaved changes
- The Scene levels page lets you change or replace the map image of a scene with a single floor
- The statblock preview of the initiative tracker is no longer cut off for cards near the bottom of the window
- Saving changes in the asset manager no longer slows down as the library grows
- Moving Fantasy Statblocks statblocks into their notes no longer leaves a note behind because a property is written another way (3 and "3"), and for notes that really hold other values you can now choose to use the statblock's values
- Online play: a player can no longer leave their token pressed halfway through a wall: a dropped token lands on a cell it can reach, snapped to the grid like the GM's own drops
- Online play: the GM's map always shows the button that opens the table log while a table runs, not only when a new message came in
- A large map can always be zoomed out until all of it shows, also after the pane gets smaller or another level's larger map is shown
- Ctrl+click on a Mac trackpad opens the right-click menu of tokens, pins, doors, drawings, text, fog and walls
- A note pinned to the map stays pinned, where you left it, after you click its pin to open the full note
- A tooltip no longer blocks the buttons it covers, so the icon in the row above shows its own tooltip right away
- Moving the Atlas folder inside the vault and back no longer leaves scenes without their map images
