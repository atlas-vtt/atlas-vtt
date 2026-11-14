## New

**New Feature: Draw tool**
- Draw and Text are one tool now, with its own secondary toolbar: Select, Pen, Line, Rectangle, Ellipse, Text, Stamp, Cells and Eraser
- More colours, four sizes that fit the map's grid, dashes, arrowheads, curves, fills and see-through ink
- Drag a line or a shape, or place a line click by click. Space adds a corner, Shift keeps it straight, square or round
- Shapes and stamps snap to the grid. Hold Alt to place them freely
- The pointer shows what a click will place: the stamp itself, a dot as wide as the line, the cell to fill
- The eraser cuts exactly where it passes, through filled shapes too. Hold Alt to remove whole drawings
- B selects the tool and steps through its modes, T opens Text, E switches to the eraser and back

**Text on the map**
- Type directly on the map: click for a label, drag for a text box whose words wrap
- Three fonts (Medieval, Sci-fi, Mono) and three looks: an outline that reads on any map, a dark plate, or plain

**Hide, layer and edit drawings**
- Players see it: switch it off and a drawing or text is yours alone
- With dynamic lighting, drawings, stamps and texts are lit like the map: players see them only where they see or remember the map
- Under tokens: lays a drawing on the floor, under the grid and the tokens
- Select mode selects only drawings and texts. A frame with handles moves, resizes and turns them, and a line's points can be dragged, added and removed
- Lock, group, bring to front and send to back

**Stamps and cells**
- Stamps use every pin symbol, in any colour. A medium stamp is one grid cell
- Cells colours squares and hexes: drag to fill them, Unfill to clear them

**New Feature: Fog tools**
- The fog tool has its own secondary toolbar: Fog and Eraser, and the shapes Brush, Rectangle, Polygon, Lasso, Cells and Room
- Cover all hides the whole map in one step, Delete all fog clears it. Undo takes either back
- Rectangles and polygons snap to the grid and to walls. Hold Ctrl or Cmd to place them freely
- Cells adds or erases fog on whole grid cells, squares and hexes alike
- Hold Alt to do the other thing: erase with Fog, add fog with Eraser. , and . size the brush; hold one to keep sizing
- Fog fades when it changes, on your map and in the player window
- More sets how dark fog looks to you in GM View. Hold H to see it as your players do

**Reveal, hide and delete fog**
- Fog that touches is one: a room painted in two strokes is one fog
- Right-click fog and choose Reveal to take it away. Right-click the place again and choose Hide to bring it back
- Delete, in the same menu, removes the fog for good

**Rooms from walls**
- Room: on a map with walls, click inside a room to fill it with fog or erase it. It ends at its walls and doors
- Hide all rooms, in More, covers every room the walls enclose in one step

**Party tokens clear fog**
- Switch it on in More: fog clears around the party's tokens as they are moved, as far as the distance you set. Walls stop it
- Undo takes the move and the fog it cleared back together

## Improved

- Carving rooms and filling them in is quick on large maps: an edit on a cave with thousands of walls took several seconds and now takes a fraction of one. Reported by ThatMattLatt
- On Windows and Linux, the window's minimise, maximise and close buttons stay out of sight over a map and the other Atlas pages, so the widgets in the top-right corner can be seen. Move the pointer to the corner to show them
- The player view shows a dragged token's move as you see it: the line in the colour of the movement step, and moved / speed beside it, for every token the players can see
- A shape shows the fog it will leave while you draw it. What it will erase shows to you alone until you let go
- The fog brush's ring shows on light maps and on dark ones
- Tools with options in the toolbar look like every other tool: hovering, pressing or choosing one highlights the whole tool as one rounded button, and the arrow beside it for its options has a highlight of its own
- The player window bar has a pause and play button: paused, players stay on what they see while you pan and zoom. With TrueScale on, the pin on its frame does this instead
- The player window bar is slimmer: as tall as the scene tabs above it
- Every toolbar, widget and the online play button have the same rounded corners, and the bars at the bottom stand as close to the edges of the map as those at the top. The scene tabs are no longer a pill, and every button in a bar is rounded alike on all sides, the GM view switch too. Buttons sit closer to their bar's edge and to each other, so their corners are rounder and the bars a little smaller
- Widget icons stand on the widget itself, without a tinted tile behind them that did not follow the widget when it grew or shrank

## Fixed

- Tokens and pins under fog can be clicked and dragged: fog no longer takes their clicks
- The TrueScale frame and its bar on the map show only while TrueScale is on
- TrueScale and Full screen on the TV have icons of their own in the player window bar
- The player window no longer says "Camera paused" after you come back to the scene it shows
- The eye on a scene tab shows the scene to players again, in the player view and online, and the tab's close button closes it: both had become hard to click. Reported by Tanaros, Meisterdieb, George and Theo Chronis
- Online, the eye on a floor shows that floor to players at once; before, they saw it only after a refresh. Reported by Theo Chronis
- Ctrl/Cmd and hover shows a token's statblock with the measure tool and the other tools too, not only with Move and Select. Reported by George

## Atlas Online

- Players may draw: a switch in the player view settings gives your online players a Draw tool of their own. They change and erase only what they drew
- A map with more fog than players can be sent is shown covered to them, never open, and you are told
- A dragged token's move reads for online players as it does for you: the line in the colour of the movement step, and moved / speed beside it, for their own tokens and every token they see
