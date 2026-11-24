## New

- A welcome wizard greets you the first time you open Atlas, on the start page or a map: a carousel of what Atlas does, with links to its guides and to the Stream Deck plugin, where to find the guides and the Discord, the Atlas Sidebar plugin, and your look
- Atlas has looks of its own, no theme to install: Medieval and a new Sci-fi look, or keep your own theme. Pick one on picture cards under Appearance settings in the command palette or in the welcome wizard; each device keeps its own. The fog's edge and the dice numerals follow the look
- Appearance settings also pick the accent colour: the look's own, eight presets or any colour, in step with Obsidian's accent colour setting. Under Atlas' looks it colours your notes' headings, bold lead-ins, quotes and table headings too
- The Medieval look's ivy takes any colour you like, shading and all: pick Natural, a preset or your own under Appearance settings
- Both looks can let the map show through: with Transparency under Appearance settings, bars, widgets, dice, hover previews and Atlas' sidebars (the asset manager, Collection Settings and its other dialogs, the Loot Roller, the Sound page) turn to smoked glass. Sci-fi starts with it on, Medieval with it off, and each look keeps your choice
- Square corners, under Appearance settings: no rounded corners anywhere in Atlas, for a retro look, under any look
- Show toolbar on hover moved from the toolbar editor to Appearance settings, whose header also leads to Customize toolbar and to Dice settings
- **Atlas Online: phones as remotes.** Playing together around one screen, the GM can turn every player's phone or tablet into a remote: a big pad steps their token one cell at a time on the map everyone watches, on square and hex grids. Switch between Token control and Remote control under Play mode in the player window bar's Table settings menu, which now also holds online play's own switches, before a table starts too. A table starts with Remote control while the player window is open, and with Token control while it is not, unless you chose otherwise. With the measure tool in hand the pad measures instead: a ruler, circle, cone, square or line grows from the player's token a cell with every press
- The player window shows what online players measure, their rulers and areas with their distances, so everyone at the table sees them on the shared screen
- The player window bar also shows while an Atlas Online table runs. Hide the map and Pause now reach online players too: behind the curtain they are sent nothing of the scene, and while play is paused nobody can move their tokens. While a table runs, the bar also opens the player window, so a TV at the table can show the scene beside online play
- **Atlas Online: players can ask to open doors.** Switch on "Players may ask to open doors" in Table settings, and a player whose token stands at a closed door can ask you to open it, on their map or with their phone as a remote. You get a notice that brings you to the door, and open it or keep it shut right there on the map
- **Atlas Online: each player sees through their own characters' eyes.** On a lit scene, a player sees only what their own characters see: other characters, monsters, doors and readable pins show only where their own token perceives them. Each player also keeps their own explored map of where their characters have been, saved with the campaign from session to session, and forgetting explored areas clears it too. Players without a character of their own on the map, or whose character is down, see only what they remember. Switch on Shared vision in Table settings and every player sees and remembers what all player characters see
- Atlas Online: a token that walks into a wall or a closed door bumps against it, on the player's map and on the screen everyone watches, so players feel why it stops
- **Choose whose tokens players see each resource on.** In Table settings, every resource of the scene's collection (HP, Stress, ammunition…) gets its own choice: none, the party's tokens, foes' tokens or all, so players can see their own HP bars and not the monsters', or the other way round. Tokens with vision, player characters and tokens on the players' side count as the party. The Resources tab's eye button steps through the same four
- The player window bar's Table settings menu is laid out in columns, like its page in the command palette: what the player window and online players see alike, then the player window's own settings and online play's
- The player window bar's first button opens the player window and, once it is open, closes it
- Widgets can be reordered: drag one by its grip in the command palette's Widgets page (or move it with Alt and the arrow keys), and the widget bar follows in every scene of the collection
- **Music in the Armarium.** Share a track or an album from the Sound library: from a track's menu, a selection of tracks or a tag. Give it a cover, an artist and the order the tracks play in
- Install albums and tracks from the Armarium into your music folder. A review shows the tracks and where they go first; they are ready to play once they land, with nothing to convert, and an update keeps any track you changed, leaves tracks whose music did not change as they are, and your moods keep playing the new version
- An experimental Bucket in the rooms mode, under Experimental features: click or drag inside a room on a painted map and its floor is carved up to the walls the art draws. Contributed by ThatMattLatt

## Improved

- **Atlas is faster.** Scenes with many walls, tokens and lights open and switch sooner, and a scene you had open a moment ago comes back sooner still
- Maps with many tokens are drawn in far fewer steps, so panning, zooming and dragging tokens stay smooth on weaker computers too
- Atlas takes less time to start when Obsidian opens or reloads
- The dungeon generator draws the floors of a dungeon or cave at the same time, so a scene with several floors is made much sooner
- A new map's grid is looked for as soon as its image is in, without waiting for the whole map to be prepared
- A large new map is prepared about three times as fast: Atlas cuts it into tiles on several cores at once, so a dungeon or an image you add is ready to zoom into sooner
- The pin tool's menu is back to icons and the search: Show name is no longer a switch there. Right-click a pin to show or hide its name
- The Stream Deck's Music key now moves the Sound page's Music fader, and its Ambience key moves all ambience layers of the mix together, so the page shows every press at once
- Keys set to "Music in mix" now work as the Music key
- Statblocks shown without a template of their own no longer start with a line about Atlas' field layout
- Atlas Online: the table log's button stands beside the player window bar instead of below it, so the GM's top left corner holds two rows, not three
- The initiative tracker's ring around whoever holds the turn is thinner and calmer, in turn order and when sides act together
- Initiative cards show conditions again wherever no token on the map shows them: for a combatant kept beside the map or added without a token, and on every card while TrueScale shows the map on a TV at the table, where miniatures stand over the tokens. A card fans up to three badges down its left side and counts the rest; the compact list shows them beside the name. The players' list follows the GM's
- The card naming a token's conditions, shown while you hover the token, now shows in the player window too
- Hovering a combatant in the initiative tracker names all its conditions in one tooltip beside the tracker. The player window's list scrolls to that combatant and shows the same, so you can show the table what a creature suffers; moving off brings the list back to the turn
- A combatant kept beside the map shows a grey outline on its initiative card instead of an icon, which leaves the compact list more room
- Sharing in the Armarium: until the first part of an upload is in, the upload step says what it is sending and shows a moving bar instead of "0 Bytes sent"
- Atlas tells you when it is only partly updated on a device, as happens when a sync tool skips large files and brings the new version number and look but not the new Atlas itself, and says which file to copy over
- The rooms bar has a menu of its own with the brush's size and Stabilization, which keeps a shaky stroke steady. Shift keeps a brush stroke straight, and the brush starts a little narrower than a grid cell. With a contribution by ThatMattLatt

## Fixed

- A large generated dungeon or cave is no longer saved with blank floors: its floors are drawn in pieces the graphics card can hold, and where a floor still cannot be drawn, the generator says so and you can try again instead of getting a scene with empty maps
- The toolbar's Lighting button is named in your language, as its menu already was
- Initiative cards show a token cut out on a transparent ground whole, instead of zooming into a small part of it such as an eye
- Dice in the accent colour take a new accent colour at once, whether it is picked in Appearance settings or in Obsidian's settings
- The asset manager's scroll shadow no longer shows past the window's rounded corners
- Fog of War no longer takes a player's token away from them: a party token under the fog stays theirs to see and move, also in Atlas Online, and everyone at the table sees a ring above the fog where it stands
- Atlas Online: when players cannot change their character sheet because its template is missing or marked as made with a newer Atlas, the GM is now told which sheet and why
- The Master slider in Atlas' Sound settings now follows the Sound page's Master fader and the Stream Deck at once
- A Master volume change from a Stream Deck is no longer undone when another setting is changed right after it
- Stream Deck volume keys now stop at +6 dB, the top of the Sound page's faders
- Sound: the count beside Music or Ambience in the library's rail no longer counts originals kept beside their converted copies, so it matches the list
- Sound: a tag name the library's rail cuts short shows in full on hover, and "Get starter ambience" no longer loses its first letters in a narrow rail
- Sound: turning up reverb no longer makes a sound louder. A full knob is as wet as before, in every room, for music and ambience, on the players' page too
- Sound: the mix desk shows a track's length as the library does, to the nearest second
- Sound: cancelling the question about a new music or ambience folder, after Change folder, keeps the folder you had, with your choice for its originals, instead of leaving none linked
- Sound: linking an empty music or ambience folder no longer asks to convert "all 0 sounds": the question says the folder holds no sounds yet and that Atlas converts the sounds you add to it
- When the dungeon generator cannot draw its map or the pictures on its cards, the preview says so and offers Try again, instead of leaving the cards empty
- The asset manager's collection picker opens with its search ready: type a name or use the arrow keys at once, without clicking into the field first
- DM screen: in the list of notes to link to a map, the arrow keys move the highlight and Enter links the note after a click in the list too
- While you align the grid, a click on the map only places the alignment's mark, whatever tool is in hand: it no longer opens the pin picker, paints fog, draws or moves a token as well, and a drag pans the map
