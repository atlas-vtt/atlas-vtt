# Tactical room scale validation

Validated against upstream `beta` commit `5e0c534f`, version `0.12.1-beta.0`, on Windows. The PR contains only the tactical feature and its compatibility changes, not the source checkout's other customizations.

## Feature checks

- TypeScript, repository ESLint, dependency boundaries, production build, changelog validation, beta version validation and release-asset preparation passed.
- Preflight reported zero errors and the repository's eight bundle/style warnings.
- Tactical tests cover all four themes, five-room stages, ordinary one-to-four-floor maps, connectivity, terrain clearance, image budgets, saved settings and wizard interactions.
- Forest-specific tests cover wet multi-floor scenes, rivers, links into the caves below, scene walls/features, and dry five-room routes without secret walls or cave-only hazards.
- Real Chromium worker tests render all four themes in five-room and ordinary two-floor modes, checking PNG dimensions, bounded image exports and scene generation at Atlas's production scene budget. Existing wizard-layout and multi-floor scene browser checks also passed.
- Complete Standard and omitted-scale models matched an untouched beta archive for 30 requests across Fortress, Mansion, Cavern, Forest and Any, one/two/four floors, and five-room/ordinary modes.
- Independent review identified a lost Round-tag sizing bias; a failing regression test was added and the bias restored. Cave passage-chain connectivity and cave size-tier metadata also have regression coverage.
- The full dungeon suite covered 903 checks in 116 files: 902 passed in the run started before the Round-tag fix, with that new regression its only failure. The final rerun passed all 77 tactical, wizard, settings and export tests, including the corrected sizing test. Existing Forest and wizard coverage also passed (124 tests).

## Full unit suite on this host

`npx vitest run --project unit --maxWorkers 4` completed with 13,428 passed, 33 failed and 13 skipped tests. All 33 failures were reproduced against the untouched beta source with the same dependencies and Windows checkout conditions:

| Files under `tests/unit/` | Failure area |
| --- | --- |
| `sharedTypes.test.ts` | TypeScript diagnostic expectation |
| `stylesheetRootHas.test.ts` | Stylesheet import paths |
| `worktreeTargets.test.ts` | Windows/worktree target paths (two cases) |
| `online/noKeys.test.ts` | Windows path separators (two cases) |
| `online/gm/controlParity.test.ts` | Existing source-pattern expectation |
| `statblocks/presets/templateAttributions.test.ts` | CRLF in SPDX header comparison; reproduced after giving the archive the checkout's CRLF endings |
| `mosaicCanvas/TesseraDecoderClient.test.ts` | Existing worker fallback exceeds its short settling limit |
| `online/gm/assetGather.test.ts`, `assetPublisher.test.ts`, `assetPublisherLevels.test.ts`, `assetPublisherTiles.test.ts`, `assetReoffer.test.ts`, `assetReview.test.ts`, `pyramidGivenUp.test.ts`, `pyramidRanking.test.ts` | Existing map-pyramid publication assertions/timeouts |

The full unit suite is not claimed green. No unrelated test expectation or timeout was changed to hide these results. Browser validation uses the real renderer and worker plus an in-memory vault; the build has not been installed into a live Obsidian vault.
