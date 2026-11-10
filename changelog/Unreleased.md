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

## Fixed

- A roll you make as Public roll in the online table log now always reaches your players, even while "Show my rolls to players" is off
- Creating a statblock from a token no longer says it failed when only linking the token went wrong: the new note opens and a notice tells you to link the token from its menu
- Online play: when you point a pin players already found at another note or heading, they now read the new one instead of the old note
- A statblock value that tracks a number now shows its own pattern, such as a rank looked up from the current Glory, instead of "current / max"
- In statblocks, the name of an action or trait and its text now stand a full space apart in every font, and text that starts with a space no longer gets a double gap
- Hovering a link to an Atlas statblock note, or holding Cmd/Ctrl over it, now shows the statblock in the preview instead of only its properties
- Online play: a player whose page fell out of step with the table is caught up by itself, instead of having every roll and move refused until they reload
