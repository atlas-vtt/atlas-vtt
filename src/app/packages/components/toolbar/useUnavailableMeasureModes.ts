import { useMemo } from "react"
import { t } from "../../../i18n"
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import type { MeasureMode } from "../../../measure/measureTypes"
import { useMapRulesRevision } from "../../../react/hooks/useMapRulesRevision"
import { useAtlasUI } from "../../../react/root/AtlasUIContext"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { mapOffersRanges } from "../../../services/mapRanges"

/**
 * Why a mode of the measure tool cannot be chosen now, or null where it can. Ranges needs rings
 * to show (the map's range bands, or movement steps where it measures distances) and the GM's
 * view, since its rings are the GM's own. Follows the map's rules as they are edited.
 */
export function useUnavailableMeasureModes(): (mode: MeasureMode) => string | null {
  const { app } = useAtlasUI()
  const mapPath = useAtlasStore((state) => state.mapPath)
  const grid = useAtlasStore((state) => state.grid)
  const isGMView = useAtlasStore((state) => state.isGMView)
  const revision = useMapRulesRevision(app)
  const hotkeyLabel = useHotkeyLabels()
  // `revision` stands for the rules and the asset index, which are read here.
  const offered = useMemo(() => mapOffersRanges(app, { mapPath, grid }), [app, mapPath, grid, revision])
  return (mode) => {
    if (mode !== 'ranges') return null
    if (!offered) return t('toolbar.rangesNoRules')
    return isGMView ? null : t('toolbar.rangesNeedGmView', { key: hotkeyLabel('gmView') })
  }
}
