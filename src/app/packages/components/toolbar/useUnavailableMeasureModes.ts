import { useMemo } from "react"
import { t } from "../../../i18n"
import type { MeasureMode } from "../../../measure/measureTypes"
import { useMapRulesRevision } from "../../../react/hooks/useMapRulesRevision"
import { useAtlasUI } from "../../../react/root/AtlasUIContext"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { mapOffersRanges } from "../../../services/mapRanges"

/**
 * Why a mode of the measure tool cannot be chosen now, or null where it can. Ranges needs rings
 * to show (the map's range bands, or movement steps where it measures distances). Follows the
 * map's rules as they are edited.
 */
export function useUnavailableMeasureModes(): (mode: MeasureMode) => string | null {
  const { app } = useAtlasUI()
  const mapPath = useAtlasStore((state) => state.mapPath)
  const grid = useAtlasStore((state) => state.grid)
  const revision = useMapRulesRevision(app)
  // `revision` stands for the rules and the asset index, which are read here.
  const offered = useMemo(() => mapOffersRanges(app, { mapPath, grid }), [app, mapPath, grid, revision])
  return (mode) => (mode === 'ranges' && !offered ? t('toolbar.rangesNoRules') : null)
}
