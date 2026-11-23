# Panning

- **A right-drag pans in every tool.** The viewport's `drag` plugin runs on the right mouse button (`PixiAppManager`) and is never paused for a tool, only for the length of a gesture (token, pin, text and drawing drags). Never set `viewport.pause` for a tool: it stops the zoom too.
- Tools start their gestures on the primary button only (`e.button === 0` on `pointerdown` and `pointertap`; PIXI sends `pointertap` for the right button too, so a pan ends in one). Never check the button on `pointerup`: a browser sends it only when the last button is released, with that button, so a stroke whose release is ignored stays open.
- A right-click menu that opens away from a small target (fog, linked hexes, the wall tool's selection menu) opens when the button is released in place, through `watchClick` (`pixi/utils/clickRelease.ts`), and its press stays unhandled. The menus of tokens, pins, drawings and text open on the press.
