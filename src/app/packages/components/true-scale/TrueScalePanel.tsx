import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useStore } from "zustand"
import { CreditCard, Eye } from "lucide-react"
import type { AtlasView } from "../../../atlas-view"
import type { SettingsService } from "../../../services/SettingsService"
import { presentTab } from "../../../services/PlayerWindowPresenter"
import { CELL_MM_CHOICES, setupOf } from "../../../services/tableTvDevice"
import type { TvRotation } from "../../../services/tableTvSettings"
import { playerWindowStore } from "../../../stores/playerWindowStore"
import { useAtlasSettings } from "../../../keyboard/useMapHotkeys"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { SegmentedControl } from "../primitives/SegmentedControl"
import { LabelTooltip } from "../primitives/tooltip"
import { t } from "../../../i18n"
import { RotationControl } from "./RotationControl"
import { TrueScaleSetup, type SetupScreenHost } from "./TrueScaleSetup"

/** What the panel needs of the player window: its screen, and the set-up screen it shows. */
export interface TrueScaleHost extends SetupScreenHost {
  setupScreenKey: () => string | null
}

/** How long the TV shows its arrow after the turn was changed outside the set-up. */
const ORIENTATION_FLASH_MS = 2000

const CELL_LABELS = { 25.4: "tableTv.cell.inch", 25: "tableTv.cell.25", 30: "tableTv.cell.30" } as const

interface TrueScalePanelProps {
  settings: SettingsService
  host: TrueScaleHost
  view: AtlasView | null
}

/** The scene tab the view shows, followed; null without a view. */
function useActiveTabId(view: AtlasView | null): string | null {
  const store = view?.tabMetaStore
  const subscribe = useCallback((listener: () => void) => store?.subscribe(listener) ?? (() => undefined), [store])
  return useSyncExternalStore(subscribe, () => store?.getState().activeTabId ?? null)
}

/** Shows the TV's arrow for a moment; the TV is cleared again when the panel closes before that. */
function useOrientationFlash(host: SetupScreenHost): { flash: () => void; stop: () => void } {
  const timer = useRef<number | null>(null)
  const stop = useCallback((): void => {
    if (timer.current === null) return
    window.clearTimeout(timer.current)
    timer.current = null
    host.showSetup(null)
  }, [host])
  const flash = useCallback((): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    host.showSetup({ kind: "orientation" })
    timer.current = window.setTimeout(() => {
      timer.current = null
      host.showSetup(null)
    }, ORIENTATION_FLASH_MS)
  }, [host])
  useEffect(() => stop, [stop])
  return { flash, stop }
}

/** TrueScale's panel, below its button: whether this TV is set up, true scale, the card fit, the turn and what sits where on the TV. */
export function TrueScalePanel({ settings, host, view }: TrueScalePanelProps): React.ReactElement {
  useAtlasSettings(settings)
  const shownTabId = useStore(playerWindowStore, (s) => s.shownTabId)
  const windowOpen = useStore(playerWindowStore, (s) => s.isOpen)
  const activeTabId = useActiveTabId(view)
  const [settingUp, setSettingUp] = useState(false)
  const { flash, stop } = useOrientationFlash(host)

  const key = host.setupScreenKey()
  const device = settings.getTableTvDevice()
  const setup = key ? setupOf(device, key) : null
  const rotation: TvRotation = key ? device.screens[key]?.rotation ?? 0 : 0
  const startSetup = (): void => {
    stop()
    setSettingUp(true)
  }

  if (settingUp && key) {
    return <TrueScaleSetup settings={settings} host={host} screenKey={key} onDone={() => setSettingUp(false)} />
  }

  const elsewhere = windowOpen && activeTabId !== null && shownTabId !== activeTabId
  const status = elsewhere ? "otherMap" : setup ? "setUp" : "notSetUp"

  return (
    <>
      <div className="atlas-dropdown-section">
        <div className="atlas-true-scale__status" data-status={status}>
          <span className="atlas-true-scale__dot" aria-hidden="true" />
          <span>{status === "setUp" ? t("tableTv.status.setUp", { screen: key?.replace("x", "×") ?? "" }) : t(`tableTv.status.${status}`)}</span>
        </div>
        {elsewhere && view && activeTabId && (
          <DropdownMenuItem icon={Eye} label={t("tableTv.showMap")} onClick={() => void presentTab(view.app, view, activeTabId)} />
        )}
      </div>

      <div className="atlas-dropdown-section">
        <DropdownToggleRow
          label={t("tableTv.trueScale")}
          value={device.trueScale && setup !== null}
          disabled={key === null}
          onChange={() => {
            if (device.trueScale && setup) settings.setTableTvDevice({ trueScale: false })
            else if (setup) settings.setTableTvDevice({ trueScale: true })
            else startSetup()
          }}
        />
        <DropdownMenuItem icon={CreditCard} label={t(setup ? "tableTv.fitAgain" : "tableTv.fit")} disabled={key === null} onClick={startSetup} />
      </div>

      <div className="atlas-dropdown-section">
        <span className="atlas-dropdown-label">{t("tableTv.cell")}</span>
        <SegmentedControl
          ariaLabel={t("tableTv.cell")}
          value={String(device.cellMm)}
          options={CELL_MM_CHOICES.map((mm) => ({ value: String(mm), label: t(CELL_LABELS[mm]) }))}
          onChange={(picked) => {
            const cellMm = CELL_MM_CHOICES.find((mm) => String(mm) === picked)
            if (cellMm !== undefined) settings.setTableTvDevice({ cellMm })
          }}
        />
      </div>

      <div className="atlas-dropdown-section">
        <LabelTooltip label={t("tableTv.upHint")} side="right" describe multiline>
          <span className="atlas-dropdown-label">{t("tableTv.up")}</span>
        </LabelTooltip>
        <RotationControl
          value={rotation}
          onChange={(turn) => {
            if (!key) return
            settings.setTvScreenSetup(key, { rotation: turn })
            flash()
          }}
        />
      </div>

    </>
  )
}
