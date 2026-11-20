import type { Tool } from "./toolFaces"

/**
 * The measure key works like a spring: pressed and let go, the measure tool stays; held while
 * the primary button presses (a quick drag across the map), the tool used before comes back once
 * both key and button are let go, and the measurement leaves with the measure tool. Nothing comes
 * back when another tool was picked meanwhile (`stillMeasuring` is false then).
 */
export function measureWhileHeld(
  keyDown: KeyboardEvent,
  previous: Tool,
  stillMeasuring: () => boolean,
  restore: (tool: Tool) => void,
): void {
  const win = keyDown.view ?? window
  let used = false
  let pressed = false
  let keyHeld = true

  const end = (): void => {
    win.removeEventListener("pointerdown", onPointerDown, true)
    win.removeEventListener("pointerup", onPointerUp)
    win.removeEventListener("pointercancel", onPointerUp)
    win.removeEventListener("keyup", onKeyUp, true)
    win.removeEventListener("blur", onBlur)
    if (used && stillMeasuring()) restore(previous)
  }
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    used = true
    pressed = true
  }
  // Heard in the bubble phase on the window, after PIXI's capture listener has finished the measurement.
  const onPointerUp = (): void => {
    pressed = false
    if (!keyHeld) end()
  }
  // By the physical key, so a modifier let go first still ends the hold.
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== keyDown.code) return
    keyHeld = false
    if (!pressed) end()
  }
  const onBlur = (): void => end()

  win.addEventListener("pointerdown", onPointerDown, true)
  win.addEventListener("pointerup", onPointerUp)
  win.addEventListener("pointercancel", onPointerUp)
  win.addEventListener("keyup", onKeyUp, true)
  win.addEventListener("blur", onBlur)
}
