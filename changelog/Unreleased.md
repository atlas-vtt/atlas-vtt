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
- Add level opens your Maps library to choose the new floor's map, with thumbnails, folders, tags and search; changing a floor's map or roof uses it too

**Dice**

- Dice written in a note roll with Atlas: click 2d6+3, d20, +4 or `dice: 1d20+5` in reading view to roll it into the open map's dice log, Shift-click for advantage and Alt-click for disadvantage. With a contribution by young-george
- Saved rolls: the bookmark at the foot of the dice tray (or P) opens a panel beside it. Save a roll under a name, then roll it with one click
- Change the tray's dice row: the pencil (or E) makes its dice wiggle. Drag them into order, take one out with its ×, add a die of any size (a d3, a d30) with +, and pin saved rolls into it from their panel, up to ten places. Swap the d100 for Daggerheart's two d12, for example. Number keys 1 to 0 follow the row
- Dress a saved roll as in the Dice Lab: its dice open beside it when you save it, or with the pencil. Click a die for its faces, name and colour, set the bonus, and the critical, exploding and advantage rules. In the dice row it shows its first die in its colour and rolls at once
- Keep a Dice Lab set as a saved roll with the flask beside +
- Saved rolls and the row belong to the collection, so each game keeps its own
- A label can follow brackets: in `2d6[slashing]+(1d10+12)[necrotic]` the d10 and the 12 are both necrotic

**Sound**

- Loop points for music: set loop in and out from the waveform's right-click menu, or with Loop points… in a library row's menu. Contributed by ThatMattLatt
- The loop shows as a band you can drag while the track plays, and Hear the loop seam plays across it. Contributed by ThatMattLatt
- Start at loop in, and a crossfade button for each track in the music card. Contributed by ThatMattLatt
- Point at the waveform to see the time there: a line follows the pointer with its minutes and seconds beside it, and follows a loop edge while you drag it

**Tokens**

- Small (75 % of Medium) and Tiny (50 %) sizes in the token creator, the asset library and the map's Size menu, and by shrinking with the resize handles. Contributed by Jackson98Tomphson
- Tiny tokens snap to any quarter of a square cell; on hex grids both sizes take the hex's centre. Contributed by Jackson98Tomphson
- Hold Shift and drag a token to turn it towards the pointer, as when you place it from the library. With several tokens selected, they all turn together. A Shift-click still adds a token to the selection or takes it out
- Any kept measurement can follow a token: switch on Follows token in its menu. It keeps its shape and moves and turns with the token, so a cone stays in front of it

**Armarium**

- Share a statblock template, a game system or a dice set on its own in the Armarium, and add one to your vault in one click
- A template brings the note it starts statblocks with and the dice set it rolls; a game system brings its dice set too
- An update replaces your copy where you left it as it came, and comes in beside it where you changed it
- Share in the Armarium… sits in the menu of each of your templates (collection settings and template editor), game systems (System tab) and dice sets (Dice Lab). Atlas counts up the version and asks what changed
- Export… beside it saves the same file, to hand to someone who imports it in the asset manager
- In the Armarium, the menu beside Share offers a template, game system or dice set of your vault

**Initiative, quests and lighting**

- Initiative by sides can roll once at combat start: each side rolls, and that order holds for the whole fight; the order of the sides in the settings breaks ties. Contributed by iviaxpow3r
- Quests can be set to Hidden: players are not sent them until you change their status. Contributed by young-george
- Forget explored areas is now a command in the command palette, on a lit scene. Contributed by CatapultTV

**Languages**

- Atlas now speaks German, French, Spanish, Portuguese and Italian, following Obsidian's language, and Russian and Chinese cover every text. Italian contributed by Jackson98Tomphson
- Gaming words read the way players at the table say them: Statblock, Encounter and Loot in German, token in Spanish, statblock and master in Italian, loot and assets in Portuguese

## Improved

- Measurements come and go smoothly: a kept ruler, circle, cone, square or line grows in from where it starts and fades out when deleted or undone, and one you don't keep dissolves instead of vanishing. The pin that keeps it pops in beside its label, lifts under the pointer, and the measurement it keeps glows once
- Undo and redo carry a moved or resized measurement back along its way, with its handles. Auras and measurements grouped with a token glide with the token instead of jumping ahead of it
- Players' measurements come and go the same way on your map, and one they move glides there

## Fixed

- A token's ring now turns with its art
- On Windows, converting music or ambience in a linked folder now moves the originals to the trash when you chose that, instead of keeping them
- While the Armarium is open in the asset manager, the sidebar shows the Armarium's tags and filters the store by them, instead of the tags of the collection you were in
- The table log has room around its messages again; rolls and the message field no longer sit against its edge
- The table log and the dice log show a roll's result once the dice have landed, not while they are still rolling
