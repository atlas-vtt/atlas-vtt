import React, { useEffect, useId, useRef, useState } from "react"
import { Minus, Plus } from "lucide-react"
import type { SettingsService } from "../../../services/SettingsService"
import type { TvSetupScreen } from "../../../services/tableTvFrame"
import { firstGuessPxPerMm } from "../../../services/tableTv"
import { setupOf } from "../../../services/tableTvDevice"
import type { TvRotation } from "../../../services/tableTvSettings"
import { Button } from "../primitives/button"
import { t } from "../../../i18n"
import { RotationControl } from "./RotationControl"

/** What the set-up needs of the player window: the screen it shows on the TV. */
export interface SetupScreenHost {
  showSetup: (state: TvSetupScreen | null) => void
}

/** The dial: a fine step, a button's step, and how far it reaches either way of the first guess. */
const FINE = 1.005
const COARSE = 1.02
const REACH = 4
const STEPS = Math.round(Math.log(REACH * REACH) / Math.log(FINE))

/** The screen's size from its key (`WxH`), for the dial's first guess. */
function screenSize(key: string): { width: number; height: number } {
  const size = /^(\d+)x(\d+)$/.exec(key)
  return { width: size ? Number(size[1]) : 0, height: size ? Number(size[2]) : 0 }
}

interface TrueScaleSetupProps {
  settings: SettingsService
  host: SetupScreenHost
  screenKey: string
  /** Ends the flow: committed or cancelled, the screen is put back either way. */
  onDone: () => void
}

/**
 * Sets a TV up in two steps, while the TV shows what to do: which way is up, then a bank card
 * fitted with one dial. A screen never set up starts with the first; the fit is stored only by
 * Looks right, and leaving any other way puts the turn back as it was.
 */
export function TrueScaleSetup({ settings, host, screenKey, onDone }: TrueScaleSetupProps): React.ReactElement {
  const device = settings.getTableTvDevice()
  const setup = setupOf(device, screenKey)
  const rotation: TvRotation = device.screens[screenKey]?.rotation ?? 0
  const [step, setStep] = useState<"orientation" | "fit">(setup ? "fit" : "orientation")
  const { width, height } = screenSize(screenKey)
  const guess = firstGuessPxPerMm(width, height)
  const [pxPerMm, setPxPerMm] = useState(() => setup?.pxPerMm ?? guess)
  const leaving = useRef({ committed: false, rotation, host, screenKey, settings })

  // Whatever ends the flow without Looks right (Cancel, Escape, the panel or the window closing) puts the TV back
  useEffect(() => () => {
    const { committed, host: tv, settings: store, screenKey: key, rotation: before } = leaving.current
    tv.showSetup(null)
    if (!committed) store.setTvScreenSetup(key, { rotation: before })
  }, [])

  useEffect(() => {
    host.showSetup(step === "fit" ? { kind: "fit", pxPerMm } : { kind: "orientation" })
  }, [host, step, pxPerMm])

  const commit = (): void => {
    leaving.current.committed = true
    settings.setTvScreenSetup(screenKey, { pxPerMm })
    settings.setTableTvDevice({ trueScale: true })
    onDone()
  }

  return (
    <div className="atlas-true-scale__setup">
      {step === "orientation" ? (
        <div className="atlas-dropdown-section">
          <span className="atlas-dropdown-label">{t("tableTv.setup.upTitle")}</span>
          <RotationControl value={rotation} onChange={(turn) => settings.setTvScreenSetup(screenKey, { rotation: turn })} />
        </div>
      ) : (
        <div className="atlas-dropdown-section">
          <span className="atlas-dropdown-label">{t("tableTv.setup.fit")}</span>
          <Dial value={pxPerMm} guess={guess} onChange={setPxPerMm} />
        </div>
      )}
      <div className="atlas-dropdown-section">
        <div className="atlas-true-scale__actions">
          {step === "fit" && <Button variant="ghost" size="sm" onClick={() => setStep("orientation")}>{t("tableTv.setup.back")}</Button>}
          <Button variant="ghost" size="sm" onClick={onDone}>{t("tableTv.setup.cancel")}</Button>
          {step === "orientation"
            ? <Button variant="default" size="sm" onClick={() => setStep("fit")}>{t("tableTv.setup.next")}</Button>
            : <Button variant="default" size="sm" onClick={commit}>{t("tableTv.setup.looksRight")}</Button>}
        </div>
      </div>
    </div>
  )
}

/**
 * The card fit's dial: − / track / +, the wheel over it and the track's arrow keys. Its value
 * (pixels per mm) moves by a factor, so every step changes the card outline alike; it is never
 * shown as a number, since the card on the glass is what it is read against.
 */
function Dial({ value, guess, onChange }: { value: number; guess: number; onChange: (pxPerMm: number) => void }): React.ReactElement {
  const rowRef = useRef<HTMLDivElement>(null)
  const nameId = useId()
  const lowest = guess / REACH
  const clamp = (px: number): number => Math.min(guess * REACH, Math.max(lowest, px))
  const index = Math.round(Math.log(value / lowest) / Math.log(FINE))
  const latest = useRef({ value, onChange, clamp })
  latest.current = { value, onChange, clamp }

  // Not passive, so the wheel turns the dial instead of scrolling the panel
  useEffect(() => {
    const row = rowRef.current
    if (!row) return undefined
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0) return
      event.preventDefault()
      const now = latest.current
      now.onChange(now.clamp(now.value * (event.deltaY < 0 ? FINE : 1 / FINE)))
    }
    row.addEventListener("wheel", onWheel, { passive: false })
    return () => row.removeEventListener("wheel", onWheel)
  }, [])

  return (
    <div ref={rowRef} className="atlas-true-scale__dial-row">
      <span id={nameId} hidden>{t("tableTv.setup.fit")}</span>
      <Button variant="ghost" size="icon" aria-label={t("tableTv.setup.smaller")} onClick={() => onChange(clamp(value / COARSE))}>
        <Minus />
      </Button>
      <input
        type="range"
        className="atlas-true-scale__dial"
        aria-labelledby={nameId}
        min={0}
        max={STEPS}
        step={1}
        value={Math.min(STEPS, Math.max(0, index))}
        onChange={(event) => onChange(clamp(lowest * FINE ** Number(event.target.value)))}
      />
      <Button variant="ghost" size="icon" aria-label={t("tableTv.setup.larger")} onClick={() => onChange(clamp(value * COARSE))}>
        <Plus />
      </Button>
    </div>
  )
}
