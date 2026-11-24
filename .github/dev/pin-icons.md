# Pin icons

- Pin icons are game-icons.net glyphs (`src/app/types/pinIconPaths.ts`), catalogued with names and heraldic tones in `src/app/types/pinIcons.ts`: the palette row (`PIN_PALETTE`) and the place groups of the location slot's flyout (`PIN_PLACE_GROUPS`). Every path must be offered exactly once (a test enforces it). Place groups run from world scale down to a room; the flyout lays them out eight per row and moves the arrow keys along those rows, so a group may end in a short row.
- Pins store the icon id. Never rename one; older pins store Lucide ids, which `resolvePinIcon` maps through `LEGACY_PIN_ICONS`, so add a mapping instead.
- The canvas rasterises each glyph once in white (`pixi/utils/pinIconTexture.ts`) and tints it with the tone of the active theme.
