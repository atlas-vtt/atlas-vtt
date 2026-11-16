import React from "react"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react"
import { TV_ROTATIONS, type TvRotation } from "../../../services/tableTvSettings"
import { SegmentedControl } from "../primitives/SegmentedControl"
import { t } from "../../../i18n"

const ARROWS: Readonly<Record<TvRotation, React.ComponentType>> = { 0: ArrowUp, 90: ArrowRight, 180: ArrowDown, 270: ArrowLeft }

/** Which way is up on the TV: one arrow per quarter turn, the way the picture's top then points. */
export function RotationControl({ value, onChange }: { value: TvRotation; onChange: (rotation: TvRotation) => void }): React.ReactElement {
  return (
    <SegmentedControl
      ariaLabel={t("tableTv.up")}
      value={String(value)}
      options={TV_ROTATIONS.map((rotation) => {
        const Arrow = ARROWS[rotation]
        return { value: String(rotation), label: "", icon: <Arrow />, ariaLabel: t(`tableTv.up.${rotation}`) }
      })}
      onChange={(picked) => {
        const rotation = TV_ROTATIONS.find((known) => String(known) === picked)
        if (rotation !== undefined) onChange(rotation)
      }}
    />
  )
}
