## Improved

- Added checks to keep data types and rendering helpers independent of plugin services.

- Widget shortcuts are consistently marked as GM controls.

- Dice rolls now reject invalid formulas with a clear message and enforce limits of 64 characters, 10 terms, 100 dice and 1,000 faces per die. Exploding dice keep their existing limit.

## Fixed

- Erasing part of a drawing now keeps all saved properties on the remaining pieces.

- Closing the command palette cancels its pending focus attempts, so it cannot take focus back afterwards.

- Dice rolls, sounds and history stay in the map view that made them. The player window follows the presented view, and clearing a log leaves other views alone.

## Important changes

- Removed an unused legacy map view. Old tabs using it no longer reopen. The current player window is unchanged.
