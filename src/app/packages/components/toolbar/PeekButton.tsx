import React, { useCallback, useEffect, useRef, useState } from "react"
import { ScanEye } from "lucide-react"
import { t } from "../../../i18n"
import { cn } from "../../../../utils/cn"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { LIGHTING_PEEK_EVENT } from "../../../lighting/lightingPeek"
import { Button } from "../primitives/button"
import { useEmitViewEvent } from "./useEmitViewEvent"


/**
 * What the `lightingPeek` key is to a keyboard, for a finger: held down, the map shows the players'
 * lighting; let go, the GM's again. The press is captured, so a finger that slides off the button
 * still ends the peek when it lifts, and a press the system takes away ends it too. In the session
 * view the map shows the players' picture already and the button takes no press.
 */
export function PeekButton(): React.ReactElement {
  const emit = useEmitViewEvent()
  const isGMView = useAtlasStore((state) => state.isGMView)
  const [held, setHeld] = useState(false)
  const holding = useRef(false)
  const peek = useCallback((on: boolean): void => {
    if (holding.current === on) return
    holding.current = on
    setHeld(on)
    emit(LIGHTING_PEEK_EVENT, on)
  }, [emit])
  const release = useCallback((): void => peek(false), [peek])
  // The button goes (a mouse was attached, the view closed) while it is held: the peek ends with it.
  useEffect(() => release, [release])
  // The view left the GM's picture by its switch or key while the button was held.
  useEffect(() => {
    if (!isGMView) release()
  }, [isGMView, release])
  return (
    <Button
      variant="toolbar"
      size="icon"
      aria-label={t('toolbar.peek')}
      aria-pressed={held}
      aria-disabled={!isGMView || undefined}
      className={cn("btn--toolbar atlas-peek-button", held && "is-active", !isGMView && "atlas-tool-button--disabled")}
      onPointerDown={(event) => {
        if (!isGMView || event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        peek(true)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ScanEye />
    </Button>
  )
}
