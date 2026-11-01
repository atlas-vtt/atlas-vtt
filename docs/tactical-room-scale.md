# Tactical room scale

Choose **Dungeon generator → Layout → Room scale → Tactical** for larger encounters. The choice is remembered independently of the size tags, which control room count, and the Five-room dungeon option.

Standard remains the default. Existing scenes need no migration, and Standard keeps the beta generator's seeded output.

- **Fortress:** encounter floors are 11 or 13 cells across and 10–14 deep; arenas target 17–19 by 16–20; rewards are 7 by 6–8. Main passages are three cells wide. Interior doors widen to two cells where both sides have space; secret doors and stairs retain their widths.
- **Mansion:** five-room layouts have three 10–14-cell encounters, a 16–20-cell climax, and a 6–8-cell reward. Ordinary mansions enlarge their architectural room bands, retaining their service spaces and corridor widths; their boss rooms use those bands.
- **Cavern:** chambers start at the beta's house-sized tier, retaining larger halls and gargantuan caves. Existing formation, exit, crawl and passage-chain rules still apply. Organic floor areas are not rectangular and narrow ways can remain narrow.
- **Forest:** larger glades retain roads, rivers, trees and caves below. The five-room reward stays on an open route.

Movement lanes connect entrances and room centers, reserving a three-cell band wherever floor geometry permits. Structural columns and furnishings keep off those lanes, with cover elsewhere. An upper Fortress floor constrained by the footprint below may retain a smaller boss encounter after attempts to fit a full arena.

Scene creation and image exports retain Atlas's image budgets. A larger map can therefore have fewer pixels per cell. Low-resolution image exports and the scene creation image budget are separate.

## Interaction check in Obsidian

1. Open the dungeon generator, select **Layout → Room scale → Tactical**, and generate each of Fortress, Mansion, Cavern and Forest.
2. Try Five-room dungeon and an ordinary multi-floor layout; for Forest, also try Wet.
3. Create a scene, check grid alignment, walls and level links, and export an image.
4. Reopen the generator to check the remembered scale; switch to Standard to generate with the original sizes.

Automated coverage and local verification limitations are recorded in [tactical-room-scale-validation.md](tactical-room-scale-validation.md).
