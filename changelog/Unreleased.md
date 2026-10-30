## New
- The dungeon generator makes forests: clearings in the woods joined by trails, drawn as one mass of treetops along every clearing, with lone trees that give cover, brooks, streams and broad rivers that wander or meander through meadows along their banks, widen where streams join them, part round gravel islands, now and then flow into a lake, and are bridged only where a road crosses them, their water on animated maps flowing round every bend; a cart road or footpath runs through the map's entrances from one edge to another, through the clearings and round the lakes, and now and then a footpath branches off it. Every map style draws its own forest: a dark wood by lantern light, a burnt one in Ember, snowbound firs in Rime, autumn in Ochre, Umber and Oxblood, a bog in Cistern, a misty pine wood in Flint, each with its own trees, ground, roads and water, and caves on the levels below
- Generated dungeons, caves and manors have a new default style, Crayon: pencil lines and hatching on vellum, coloured in with wax crayon like the village map of the Lockwood Manor collection. Its water, lava and acid move as hand-drawn crayon strokes that fade in and out on their own
- Fog: Cloud reveal in the fog tool's menu shows players the fog as clouds in a colour you pick, which part over what you reveal and drift in over what you cover. While you paint or erase fog, players keep seeing the fog from before, and your changes reach them at once when you switch to another tool, at an online table too. Contributed by ISorokaI
- TrueScale, a new section of Atlas' settings for a TV lying on the table: turn the player view by 90, 180 or 270° to match the TV, lock the players' zoom so one grid cell measures the size of a miniature's base on the glass (worked out from the TV's size and resolution, with a ruler of 10 squares to measure and correct it; a scene can switch it off in its grid settings), and choose where the widgets and a displayed image sit on the player view and how large they are
- Frame player view, a toolbar button beside the GM view switch while the player window is open: an outline shows what the players' screen covers, with what they see now dotted; move it over the map and click to freeze the players there. On a map they are not seeing yet, it presents that map already framed

## Improved
- Russian translation of the GM's side of online play: the online panel on the map, the online account, the table's commands and notices. Contributed by ISorokaI
- Russian translation of native statblocks: the statblock beside a note, creating statblocks, the template gallery, Fantasy Statblocks imports and the collection's Statblocks tab. Contributed by ISorokaI
- Russian translation of the statblock template editor. Contributed by ISorokaI
- Russian translation of random tables, campaigns, quests, recovery actions, initiative rules and dynamic lighting. Contributed by ISorokaI
- Russian translation of the dungeon generator, scene levels, stairs and openings, animated maps and multi-floor Universal VTT imports. Contributed by ISorokaI
- Russian translation of the dice lab, the initiative tracker's new options, the encounter builder, statblock counters and other newer texts. Contributed by ISorokaI
- Graphics settings, a page in the command palette (also behind Graphics settings… in the lighting tool's menu): the three quality presets as tabs, with what each draws on hover, and below them every choice a preset makes, so one thing can be set away from a preset: the lighting picture, its detail, bounced light, flames, shadow softness, how often water and lava move, and the lit map's resolution on a high-resolution screen. The settings page's Lighting row is gone
- Atlas asks the computer for its faster graphics chip where there are two, as Foundry and Owlbear Rodeo do
- Saver lighting quality draws each light from the area it lights instead of tracing it on the graphics card, so a lit map runs smoothly on weak and software graphics; shadows keep a soft edge
- A device without a lighting quality chosen in the settings starts on one picked for its graphics: Balanced on graphics built into the processor, Saver where WebGL draws on the CPU
- On Balanced and Saver lighting quality, a high-resolution screen draws the lit map at standard resolution, which takes the graphics less work; the edges of what players see never reach further
- Dice volume: set how loud dice are in Atlas' settings (Dice) or the command palette's dice settings, or slide it all the way down to turn their sounds off. It applies to thrown dice and to result cards. Contributed by ISorokaI

## Fixed
- Online play: players see the resource wheels beside a token that are shown to them, as Atlas's player window shows them; before, the browser drew only the bars
- Several lights together no longer wash the map out to white: the brightest light at a spot shows as it always did, and every further torch adds less and less
- Moving a token that carries a light no longer stutters as badly on large maps with many walls
- Dragging a token that sees no longer builds new graphics objects for its sight every frame, so each step of a drag costs less on large generated dungeons
- A pinned statblock scrolled down can be moved up again: it no longer stops at an invisible edge where its scrolled-away name would be. Contributed by ISorokaI
- Menus in Edit Token, such as Add sense, open at their button instead of at the top left of the window. Contributed by ISorokaI
