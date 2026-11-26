## Improved

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
- Statblocks Choices blocks now formats several choices in the expected YAML format. This allows existing "showWhen" conditional formatting to work with several choices.
- You can now determine the positioning of entries extras fields to appear before the entry's or after the entry's description, including after the name which is the current default behaviour. This behaviour can be set via the template editor.
- You can now toggle if entries extras fields' labels are shown or hidden.  This behaviour can be set via the template editor.
- Atlas Online: players see your changes at once instead of up to a second later, such as Shared vision, remote mode, letting players draw, a character's dice and what your lighting shows them

## Fixed

- Atlas Online: on a map that plays by a game system preset you made, players see initiative grouped by that preset's sides, as on your tracker and the player window
- Initiative: taking the combatant whose turn it is out of the initiative, or deleting its token, now passes the turn by defeated combatants, as Next turn does, and when nobody else can act, the turn rests at the next combatant's place
- Initiative: delaying the last combatant in a fight by cards now deals the next round's cards, as Next turn does
