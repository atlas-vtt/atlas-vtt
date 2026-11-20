/** What the measure key does, decided by what happens while it is down. */
export interface HeldMeasureKey {
  /** Whether a press landed on the map's canvas. */
  onMap(target: EventTarget | null): boolean
  /** The key went up with no press on the map: a tap. */
  tap(): void
  /** The primary button pressed on the map while the key was down, before the map hears the press. */
  press(): void
  /** Key and button are both up after such a press, or the window lost focus. */
  release(): void
}

/**
 * Follows the measure key from its press: a tap acts when the key goes up; a press on the map
 * while it is held is a quick ruler, which ends once key and button are both let go. The press is
 * heard in the capture phase on the window, before PIXI dispatches it, so the map's tools already
 * see the measure tool; the release in the bubble phase, after PIXI has finished the measurement.
 */
export function measureWhileHeld(keyDown: KeyboardEvent, key: HeldMeasureKey): void {
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
  }
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !key.onMap(event.target)) return
    pressed = true
    if (used) return
    used = true
    key.press()
  }
  const onPointerUp = (): void => {
    pressed = false
    if (keyHeld || !used) return
    end()
    key.release()
  }
  // By the physical key, so a modifier let go first still ends the hold.
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== keyDown.code) return
    keyHeld = false
    if (pressed) return
    end()
    if (used) key.release()
    else key.tap()
  }
  const onBlur = (): void => {
    end()
    if (used) key.release()
  }

  win.addEventListener("pointerdown", onPointerDown, true)
  win.addEventListener("pointerup", onPointerUp)
  win.addEventListener("pointercancel", onPointerUp)
  win.addEventListener("keyup", onKeyUp, true)
  win.addEventListener("blur", onBlur)
}
