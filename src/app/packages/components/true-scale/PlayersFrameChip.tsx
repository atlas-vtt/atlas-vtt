import React from "react"
import { Move } from "lucide-react"
import { LabelTooltip } from "../primitives/tooltip"
import { t } from "../../../i18n"

/**
 * The chip on the dashed frame, where players are while the GM has staged a frame elsewhere
 * (`GlassChip`): its grip moves the players with the pointer at once, and the staged frame stays
 * where it is. Shown only while a frame is staged; with none, the glass's own chip has the grip.
 */
export function PlayersFrameChip({
  ref,
  staged,
  onPointerDown,
}: {
  ref: React.Ref<HTMLDivElement>
  staged: boolean
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
}): React.ReactElement {
  return (
    <div
      ref={ref}
      className="atlas-vtt-toolbar atlas-glass-chip"
      role="group"
      aria-label={t("glass.playersNow")}
      hidden={!staged}
      onPointerDown={onPointerDown}
    >
      <LabelTooltip label={t("glass.liveHint")} side="bottom" describe>
        <span className="atlas-glass-chip__grip atlas-glass-chip__grip--alone" data-glass-grip="players">
          <Move className="atlas-glass-chip__icon" aria-hidden="true" />
        </span>
      </LabelTooltip>
    </div>
  )
}
