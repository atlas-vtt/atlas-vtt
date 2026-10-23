# Scene tab reordering

Status: scoped with the user on 2026-10-23; the user confirmed persistence and requested an implementation plan. The precise implementation defaults below are proposed engineering choices for review.

## Intent and boundaries

Let a DM arrange the open Atlas scene tabs by dragging them left or right. Keep the chosen order when Obsidian restores the workspace. This concerns the scene strip inside an Atlas view; it does not rearrange Obsidian's own workspace tabs.

Use `feature/reorder-scene-tabs`, created directly from upstream `beta` at `ebbebdbd7e45fe359cf6d8ed8195f3e571d2195b`. The merchant work remains on `feature/merchant-shops` at `1a548a23`. Include no merchant or token-sound commits in this PR.

## Approaches

- **Selected direction from the scoping discussion: pointer dragging following the toolbar editor's existing gesture pattern.** Reuse its low-level `ToolbarPointerSession`, which manages thresholds, pointer capture and cancellation without reading toolbar data. Use a scene-specific hook for tab geometry and edge scrolling. This avoids a second implementation of pointer cleanup and adds no dependency. Extend its existing body grabbing-state selector with scene-scoped cursor rules, since the tab normally declares its own pointer cursor. Leave the toolbar implementation and public API intact.
- Native HTML drag-and-drop is shorter initially but gives less control over accidental clicks, map input, and scrolling while dragging.
- The existing dnd-kit core could provide sensors, but another provider and drag model are unnecessary for this one-dimensional strip.

This is a bounded UI change with two implementation tasks: persistent ordering and keyboard access, followed by pointer interaction. No settings, vault-data migration, scene format, or network protocol changes are required.

## User-visible behavior

- A primary mouse press on a tab's name/background becomes a drag after 4 CSS px of movement. Pen input may use the existing 8 px threshold. Leave touch scrolling as it works today; dedicated touch dragging is outside this desktop mouse-and-keyboard change.
- Keep the strip's appearance at rest. While dragging, dim the source, show a grabbing cursor and a thin accent insertion line, and hide its path tooltip. Keep the source's space so tab widths and targets stay stable. A floating preview or animated rearrangement is unnecessary.
- A drop inserts the tab before the indicated tab, or at the end. Commit order only on a valid drop. Escape, an outside drop, lost/canceled pointer, window blur, changed strip/tab sizes, view unmount, or a changed tab-ID sequence cancel without saving a provisional order. Normal scroll-offset changes update placement and do not cancel.
- A regular click continues to switch scenes. Reordering an inactive tab keeps the previously active scene and the scene shown to players. Eye, close, middle-click, add, and All open maps controls retain their existing behavior and never initiate dragging.
- Suppress only a drag's incidental click, including an outside release over the map. Tie suppression to the original pointer gesture; clear it on the next fresh pointerdown in the owner document and on cleanup, so a cancellation that produces no click cannot block a later deliberate click. Keyboard activation must remain usable too.
- When tabs overflow, holding the pointer within 24 CSS px of either visible strip edge scrolls the strip in that direction. Use an animation-frame loop and elapsed time, up to 480 CSS px/second, bounded by the scroll range. Recompute the target after scrolling even with a stationary pointer. Stop scrolling outside the strip or when the gesture ends. Fixed end controls are not drop targets.
- Focused tabs can move one position with Alt+Left/Right Arrow. Consume the shortcut within the tab, preserve focus, and reveal the moved tab with nearest-edge scrolling. At either end the corresponding shortcut is a no-op. Enter/Space and the action buttons keep their current behavior.
- Provide translated keyboard instructions and a polite live announcement after a move. Escape can cancel a drag while a tooltip is open, without leaking the key to map commands.

## Ordering and persistence contract

- Add an ID-based store action `moveTab(tabId: string, beforeTabId: string | null): boolean`; null means append. Read the latest store state when committing. Reuse each existing `SceneTab` object and change only array order; preserve active ID, loaded/dirty state, names, paths, camera/history caches, and presentation IDs.
- Missing IDs, the same source/target, an already satisfied position, and moving the last tab to the end return false without notifying store subscribers.
- Add a synchronous `AtlasView.moveSceneTab(tabId: string, beforeTabId: string | null): boolean` wrapper. Request Obsidian's layout save exactly once when the action changes order. Reordering does not load a scene, flush scene saves, write a map, increment scene request counters, or alter undo/redo history.
- Persist using the existing `AtlasView.getState()`/`setState()` tabs array. Order belongs to that Atlas view and restored workspace, independently of other views and other workspaces. This is not a permanent collection-wide ranking of every scene.
- New scenes append; opening a scene already in the strip activates its existing tab in place. Closing and reopening a scene appends a new tab. Closing the active tab selects its neighbor using the new visible order. The All open maps list and its digit shortcuts follow that order; search relevance behavior remains intact.
- Metadata changes alone do not restore an old drag snapshot. If adding, closing, or otherwise reordering a tab changes the ID sequence during dragging, cancel the gesture; the latest changes remain intact. A rename may cancel when it changes tab geometry. ID validation at commit handles races after cancellation checks.
- Immediately before drop, compare the current full ID sequence and dimensions with the gesture snapshot. End the gesture and its cancellation/scroll observers before calling the move action so the drop's own state update cannot be reported as a canceled drag.

## Implementation shape

- `tabMetaStore.ts`: the move action; `atlas-view.ts`: the save-layout wrapper; `UIRoot.tsx`: wire it to a new required `SceneTabBar.onMoveTab` callback.
- `SceneTabBar.tsx` and `scene-tab-bar.scss`: keyboard reordering, accessible feedback, tab-ID attributes, drag appearance and an absolutely positioned insertion line that does not affect flex sizing.
- `react/hooks/useSceneTabReorder.ts`: own the pointer session, current target, cancellation, incidental-click guard, and bounded edge-scroll loop. Use the tab strip's owner document/window for popouts, never the global document/window.
- `react/components/scene-tabs/sceneTabDropTarget.ts`: compute the ID-based insertion target and content-coordinate line position from the current resting tab rectangles, excluding the source. Treat coordinates outside the visible strip or a missing source as invalid.
- English UI copy goes through the existing translation catalog; other locales fall back normally. Keep new implementation files under roughly 300 lines and reuse existing geometry/motion conventions where appropriate.

## Acceptance and PR preparation

Test moves in both directions and across the whole strip; no-op and stale IDs; identity/metadata preservation; workspace JSON save/restore; independent views; keyboard focus and announcements; normal clicks and action buttons; canceled and interrupted drags; stationary-pointer edge scrolling; and an overflowed strip in a popout document. Confirm local and online presented scenes remain unchanged.

Inspect actual browser drags at narrow and wide widths and with reduced motion. Verify no map-input side effects or scene loads. Establish a fresh dependency/test baseline on current beta: the older merchant branch's test results do not establish this branch's status.

Add a user-facing entry to `changelog/Unreleased.md`, run the repository's type, lint, boundary, unit, browser, changelog, and build checks, and obtain one fresh final code review. Build a separately named test-vault ZIP, `dist/atlas-vtt-scene-tabs-test.zip`, containing the standard `atlas-vtt/main.js`, `atlas-vtt/styles.css`, and `atlas-vtt/manifest.json`. Preserve the earlier merchant test ZIP. Prepare a local PR description using `.github/pull_request_template.md`, with Obsidian reproduction steps and actual verification results. Target `atlas-vtt/atlas-vtt:beta` later; pushing and opening the PR remain separate user actions.
