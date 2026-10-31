# Scene tab upstream update implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved update. Track each step below.

**Goal:** Update PR #520 to current beta (0.11.1-beta.0) without changing its scene-ordering contract.

**Architecture:** Merge upstream beta into the published feature branch, keeping its history. Retain upstream top-bar layout, processing indicators, and main-window restriction; integrate drag tooltip suppression with the processing indicator.

**Tech Stack:** TypeScript, React, Zustand, SCSS, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-scene-tab-reordering-design.md`, amended by the user-approved update plan on 2026-10-31.

## Global constraints

- Only the scene-tab PR changes belong here; the custom and merchant branches remain untouched.
- Preserve active and presented scenes, per-view workspace order, keyboard behavior and touch scrolling.
- Keep the latest upstream main-window restriction and processing UI. Do not add dependencies or change release versions.
- User approved implementation, verification, pushing this PR branch and updating its description; merging the PR is outside this task.

## Review focus

- Processing starts or completes during a drag: cancel when tab dimensions change, preserve order and allow the next gesture.
- Processing tooltips: remain hidden during a drag and usable afterwards.
- Updated top-bar wrapper: overflow and edge scrolling still work in the actual layout.
- Main-window relocation: saved tab order and active scene survive reopening.
- Presentation and close-neighbor behavior: tab reordering never changes what players see.

## Task 1: Integrate current beta

- [x] Run the existing ordering, tooltip and presentation tests as a baseline (71 passed).
- [x] Merge `origin/beta`, preserving the new `atlas-top-bar-start` wrapper in `UIRoot.tsx` and wiring `onMoveTab` within it.
- [x] Preserve upstream release history, add the scene-ordering note to `changelog/Unreleased.md`, and regenerate generated changelogs.
- [x] Install the merged lockfile's dependencies in this worktree and rerun relevant tests (79 passed).

## Task 2: Cover current processing and workspace behavior

- [x] Add processing tooltip coverage: a focused unit regression failed before suppression forwarding and passes after it; Chromium verifies dragging and fresh hover after cancellation, allowing the closing animation to finish.
- [x] Add optional `suppressed?: boolean` to `SceneTabProcessing`, pass it to its `LabelTooltip`, and supply the drag state from `SceneTabBar`.
- [x] Update the browser harness to include upstream's top-bar wrapper. Verify processing completion during a drag safely cancels and subsequent gestures work (14 browser tests passed).
- [x] Verify restored order through the main-window relocation flow; retain existing order/presentation tests.
- [x] Revise the existing design's obsolete native-popout acceptance steps.

## Task 3: Verify and publish the update

- [x] Run TypeScript, lint, architecture boundaries, full unit suite, relevant Chromium tests, changelog consistency, build, preflight, release validation and whitespace checks. Static/build checks pass; preflight has zero errors and eight advisory warnings.
- [x] Investigate failures against untouched upstream. Full Windows unit run: 13,224 passed, 32 failed, 13 skipped. Failure-file retry with CI's 30-second timeout: 183 passed, nine failed; all 23 initial timeouts passed. All nine remaining failures reproduce on untouched `fdb1bab6`: sharedTypes, stylesheetRootHas, worktreeTargets (two), TesseraDecoderClient, online/noKeys (two), online/gm/controlParity, templateAttributions. No scene-tab regression failed.
- [x] Obtain a fresh whole-branch code review and resolve material findings (none; align stale documentation wording with the approved push).
- [ ] Commit the update, push normally to `bbell-sys/atlas-vtt:feature/reorder-scene-tabs`, and update PR #520's description with current behavior and actual validation results.
- [ ] Verify the remote head and mergeability, and report CI status honestly.
