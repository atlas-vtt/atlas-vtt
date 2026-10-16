## New
- Statblocks whose image is a web address can be imported as tokens, from the import dialog and with **Create token from statblock image**. The token keeps the address and loads the picture when it is shown; nothing is downloaded ahead of time or copied into the vault.

## Improved
- Online play: busy tables send far fewer messages. Cursors, lasers and measurements go out ten times a second and still move smoothly, and a changed quest or world map reaches players without their whole book being sent again.
- Random tables: rename a table or remove it from the list from its menu (⋯ or right-click) in the Random tables window, and undo a removal from the message that follows. A new name shows only in Atlas and leaves the note as it is; you can also set it in the collection settings. A table whose note was deleted can now be removed too.
- A token whose art is a web address shows its picture wherever a token's art appears: the asset manager, the token picker, encounter previews, the initiative tracker, the player view, dice rolls and the statblock pane.

## Fixed
- Online play: players keep control of their characters when you change scenes. Giving a token to a player gives them the character it was placed from, so every token of that character is theirs on every scene.
- Statblocks from TTRPG Convert CLI import as tokens with their image. Atlas now reads image paths with encoded spaces, such as `/2.%20Mechanics/token.png`.
