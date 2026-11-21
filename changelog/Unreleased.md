## New

- **Music packs**: get Vindsvept's fantasy music on the Sound page, 365 tracks in ten packs sorted by mood, each ready to play the moment it lands and tagged Instrumental or With vocals
- Settings → Sound copies the credit line for the starter music, ready for the description of a stream or video
- **Downloads**: a button at the foot of the Sound page's sidebar fills as packs come in; open it to see each pack's progress, speed and time left, cancel one, try a failed one again or show a finished one in the library. A pack stopped part way offers the rest
- **Stream Deck**: control music and ambience from a Stream Deck: press moods, stop, pause, skip and turn levels on keys and dials, with each mood's crest on its key. Switch it on in Settings → Stream Deck and pair the Atlas plugin for Stream Deck

## Improved

- The starter ambience plays the moment it is downloaded, without being converted first, and is a third smaller
- The Sound page stays smooth with thousands of tracks: the list scrolls without stutter, pressing a tag, typing a search or adding a file redraws only what changed, and tags, moods, track lengths and scene pictures show placeholders in their own shape while they load
- The starter ambience and starter music offers on the Sound page can be hidden with their ×; both stay in the ⋯ menu of Ambience and Music
- Sort the Sound page's library by name or by length: press a column's heading, press again to reverse. The choice applies to tags and search results too, and Play all plays in that order
- What’s new in Atlas links to the Atlas website and Patreon beside GitHub, and takes the look of the other dialogs
- Dragging cards in the initiative tracker works like arranging a phone's home screen: the cards wiggle, the one you hold lifts and the others make room, in the compact view too
- A card moved in the initiative tracker glides straight to its new place in the player view
- The dice tray offers advantage and disadvantage only where the collection's dice set has a rule for them: collections without a game system, Old-School Essentials, Daggerheart and Cairn roll a plain die. Pick the d20 set in the collection's Dice settings to get advantage back
- Where combatants act by sides, drag a side by its heading before the fight to choose which side goes first: its cards pile up while you carry it, so a long side is as easy to move as one card, and spread out again where you drop it
- The Ranges rings and the range check of the measure tool now show in the player view, and to online players, as other measurements do: not while Players see it is off, and not on a token the players cannot see. Ranges can now be used in the session view too

## Fixed

- With a light's panel open, a click on the map outside it closes the panel instead of placing another light or starting a wall
- FLAC files no longer fail to import on the Sound page with a decoding error; about a third of FLAC music hit it
- A Number value written with advantage or disadvantage (`+7 adv`) no longer shows "Not a number"; a value that rolls as a bonus keeps the word (`7 adv` rolls `+7 adv`)
- A reference to such a value (`@perception` on `+2 adv`) reads its number, and a sum written with the word shows its total (`10 + @dex adv` reads `12 adv`)
- A saved roll written with `adv` or `dis` rolls with it from the dice row instead of being refused
- "Combat has started" and "Combat has ended" show in the middle of the player view when the initiative list is vertical, instead of beside the list
- Outside a fight, the initiative list shows a fade at its bottom while there is more to scroll to, as it does at its top
- Forget explored areas forgets every floor of a scene, not only the floor you are looking at, and online players on other floors forget theirs too
- Sharing a template, game system or dice set in the Armarium no longer stops at "The Armarium cannot be reached" when the account server stumbles for a moment: Atlas asks once more before giving up
- Fitting the grid of a floor you moved with Position floor no longer turns the map black: while the grid panel (or a floor being dragged into place) shows the floor's map somewhere else, the map shows whole, without the floor below cutting through it
- On a hex grid, Position floor stops a floor at the map's top or left edge where it is, instead of throwing it a row the other way

## Atlas Online

- Players' rolls written with `adv` or `dis` (`+4 adv` on the character sheet) roll with the dice set's advantage or disadvantage instead of being refused, also when rolled privately
- The players' dice tray takes a roll typed with `adv` or `dis` (`1d20+5 adv`), and Shift-click or the roll menu offers advantage on a sheet roll written that way
- Players can change a Number value written with `adv` or `dis` on their character sheet (`+4 adv` to `+5 adv`)
- The players' character sheet shows a statblock's Markdown as Obsidian does: bold values in bold, links like `[Spellcasting](#Spellcasting)` as their words, and HTML tags used for styling no longer show as written
- On some Windows laptops a lit scene could crash a player's browser even at the lowest graphics setting: Saver no longer prepares the lighting of the higher settings, and a page whose graphics crashed comes back one setting lower instead of crashing again
- When the campaign's world map cannot reach players because its map or scene was deleted or shows no image, the GM is told so, instead of players only reading that no world map was chosen
- A player using the laser pointer on a phone or tablet no longer leaves its dot standing on the map after lifting the finger, for themselves or for anyone else at the table
- Pinching on a Mac trackpad in Safari zooms the players' world map as smoothly as their battle map
- A number on the players' character sheet written with a reference (an initiative of `@dex.mod`) shows its value, as the GM's statblock does, instead of the reference as written
