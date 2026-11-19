## New

**Atlas on tablets**

- Atlas now runs in Obsidian on iPads (iPadOS 16.4 or newer) and Android tablets
- Two fingers move and zoom the map in every tool; one finger uses the tool, and on empty map it moves the view while you select or move tokens
- Touch and hold a token, pin, drawing, door or wall to open its menu. Touch and hold empty map to draw a selection box
- A bar above your selection has Edit, Duplicate, Conditions and Delete. Select more adds tokens to the selection tap by tap
- Double-tap to zoom in, tap with two fingers to undo and with three to redo. Zoom buttons sit at the right edge
- Snap, Constrain and Link to hex are switches in the tool menus, so nothing needs a held key. Preview is a row in the menus of tokens, pins and cards
- With an Apple Pencil the pencil draws and fingers move the map
- Table mode shows the players' picture full screen on the tablet, for a tablet lying on the table. Hold the GM chip to return
- Buttons, menus and handles are larger under a finger, and dialogs stay above the on-screen keyboard
- Tablet diagnostics in the command palette collects what Atlas finds on your device, to share in a report

**Position floor**

- Line up the floors of a scene whose maps differ in size: drag a floor over the floor below, shown see-through, until stairs and walls meet
- The floor moves by whole cells, so its grid stays lined up; hold Alt to place it freely, or use the arrow keys
- Tokens, walls and lights on that floor move with it; every move is one undo step
- Open it from a floor's row in Scene levels, the command palette, or the offer after adding a floor

**Dice**

- Dice written in a note roll with Atlas: click 2d6+3, d20, +4 or `dice: 1d20+5` in reading view to roll it into the open map's dice log, Shift-click for advantage and Alt-click for disadvantage. With a contribution by young-george
- Saved rolls: the bookmark at the foot of the dice tray (or P) opens a panel beside it. Save a roll under a name, then roll it with one click
- Change the tray's dice row: the pencil (or E) makes its dice wiggle. Drag them into order, take one out with its ×, add a die of any size (a d3, a d30) with +, and pin saved rolls into it from their panel, up to ten places. Swap the d100 for Daggerheart's two d12, for example. Number keys 1 to 0 follow the row
- Saved rolls and the row belong to the collection, so each game keeps its own
- A label can follow brackets: in `2d6[slashing]+(1d10+12)[necrotic]` the d10 and the 12 are both necrotic

**Sound**

- Loop points for music: set loop in and out from the waveform's right-click menu, or with Loop points… in a library row's menu. Contributed by ThatMattLatt
- The loop shows as a band you can drag while the track plays, and Hear the loop seam plays across it. Contributed by ThatMattLatt
- Start at loop in, and a crossfade button for each track in the music card. Contributed by ThatMattLatt

**Tokens**

- Small (75 % of Medium) and Tiny (50 %) sizes in the token creator, the asset library and the map's Size menu, and by shrinking with the resize handles. Contributed by Jackson98Tomphson
- Tiny tokens snap to any quarter of a square cell; on hex grids both sizes take the hex's centre. Contributed by Jackson98Tomphson

**Initiative, quests and lighting**

- Initiative by sides can roll once at combat start: each side rolls, and that order holds for the whole fight; the order of the sides in the settings breaks ties. Contributed by iviaxpow3r
- Quests can be set to Hidden: players are not sent them until you change their status. Contributed by young-george
- Forget explored areas is now a command in the command palette, on a lit scene. Contributed by CatapultTV

**Languages**

- Atlas now speaks German, French, Spanish, Portuguese and Italian, following Obsidian's language, and Russian and Chinese cover every text. Italian contributed by Jackson98Tomphson

## Improved

- Measurements come and go smoothly: a kept ruler, circle, cone, square or line grows in from where it starts and fades out when deleted or undone, and one you don't keep dissolves instead of vanishing. The pin that keeps it pops in beside its label, lifts under the pointer, and the measurement it keeps glows once
- Undo and redo carry a moved or resized measurement back along its way, with its handles. Auras and measurements grouped with a token glide with the token instead of jumping ahead of it
- Players' measurements come and go the same way on your map, and one they move glides there

## Fixed

- On Windows, converting music or ambience in a linked folder now moves the originals to the trash when you chose that, instead of keeping them
- While the Armarium is open in the asset manager, the sidebar shows the Armarium's tags and filters the store by them, instead of the tags of the collection you were in
- The table log has room around its messages again; rolls and the message field no longer sit against its edge
- The table log and the dice log show a roll's result once the dice have landed, not while they are still rolling
