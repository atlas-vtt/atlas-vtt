## Improved

- What’s new in Atlas links to the Atlas website and Patreon beside GitHub, and takes the look of the other dialogs
- Dragging cards in the initiative tracker works like arranging a phone's home screen: the cards wiggle, the one you hold lifts and the others make room, in the compact view too
- A card moved in the initiative tracker glides straight to its new place in the player view

## Fixed

- A Number value written with advantage or disadvantage (`+7 adv`) no longer shows "Not a number"; a value that rolls as a bonus keeps the word (`7 adv` rolls `+7 adv`)
- "Combat has started" and "Combat has ended" show in the middle of the player view when the initiative list is vertical, instead of beside the list
- Outside a fight, the initiative list shows a fade at its bottom while there is more to scroll to, as it does at its top
- Forget explored areas forgets every floor of a scene, not only the floor you are looking at, and online players on other floors forget theirs too

## Atlas Online

- Players' rolls written with `adv` or `dis` (`+4 adv` on the character sheet) roll with the dice set's advantage or disadvantage instead of being refused, also when rolled privately
- The players' dice tray takes a roll typed with `adv` or `dis` (`1d20+5 adv`), and Shift-click or the roll menu offers advantage on a sheet roll written that way
- The players' character sheet shows a statblock's Markdown as Obsidian does: bold values in bold, links like `[Spellcasting](#Spellcasting)` as their words, and HTML tags used for styling no longer show as written
- On some Windows laptops a lit scene could crash a player's browser even at the lowest graphics setting: Saver no longer prepares the lighting of the higher settings, and a page whose graphics crashed comes back one setting lower instead of crashing again
- When the campaign's world map cannot reach players because its map or scene was deleted or shows no image, the GM is told so, instead of players only reading that no world map was chosen
