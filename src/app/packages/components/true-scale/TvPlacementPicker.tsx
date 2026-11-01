import React, { useRef } from "react"
import { useAtlasSettings } from "../../../keyboard/useMapHotkeys"
import type { SettingsService } from "../../../services/SettingsService"
import { MAX_WIDGET_SCALE, MIN_WIDGET_SCALE, PLAYER_WIDGET_POSITIONS, type TvRotation } from "../../../services/tableTvSettings"
import { MAX_SHOWN_IMAGE_SIZE, MIN_SHOWN_IMAGE_SIZE, readShownImageLayout, SHOWN_IMAGE_PLACES, type ShownImagePlace } from "../../../services/shownImageLayout"
import { LabelTooltip } from "../primitives/tooltip"
import { t } from "../../../i18n"
import { nearestPlace, placePoint, placeToward, steppedWithin, tvAspect, type PlacePoint } from "./tvPlacement"

/** A thing players see on the TV that the GM places: where it sits and how large it is. */
interface ChipSpec {
  id: "widgets" | "image"
  label: string
  /** Where it may sit; the widgets' places are some of the image's. */
  places: readonly ShownImagePlace[]
  place: ShownImagePlace
  scale: number
  min: number
  max: number
  step: number
  /** Its width and height at `scale`, as shares of the TV's. */
  share: (scale: number) => PlacePoint
  setPlace: (place: ShownImagePlace) => void
  setScale: (scale: number) => void
}

/** The widget bar at scale 1, as shares of the TV's longer side: about what it takes on a TV. */
const WIDGETS_AT_ONE = { width: 0.2, height: 0.09 }

interface Gesture {
  kind: "move" | "resize"
  chip: ChipSpec["id"]
  box: DOMRect
  startX: number
  startY: number
  startScale: number
}

const within = (value: number): number => Math.min(1, Math.max(0, value))

/** Places and sizes the widgets and a shown image on a picture of the TV as the players see it. */
export function TvPlacementPicker({ settings, rotation, screenKey }: { settings: SettingsService; rotation: TvRotation; screenKey: string | null }): React.ReactElement {
  useAtlasSettings(settings)
  const boxRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const aspect = tvAspect(screenKey, rotation)
  const tv = settings.getTableTvSettings()
  const image = readShownImageLayout(settings.getSetting("shownImage"))
  // Of the longer side: a portrait TV draws the widgets as a landscape one would
  const long = { width: Math.max(1, 1 / aspect), height: Math.max(1, aspect) }

  const chips: ChipSpec[] = [
    {
      id: "image",
      label: t("tableTv.image"),
      places: SHOWN_IMAGE_PLACES,
      place: image.place,
      scale: image.size,
      min: MIN_SHOWN_IMAGE_SIZE,
      max: MAX_SHOWN_IMAGE_SIZE,
      step: 0.05,
      share: (size) => ({ x: size, y: size }),
      setPlace: (place) => settings.setSetting("shownImage", { ...image, place }),
      setScale: (size) => settings.setSetting("shownImage", { ...image, size }),
    },
    {
      id: "widgets",
      label: t("tableTv.widgets"),
      places: PLAYER_WIDGET_POSITIONS,
      place: tv.widgetPosition,
      scale: tv.widgetScale,
      min: MIN_WIDGET_SCALE,
      max: MAX_WIDGET_SCALE,
      step: 0.1,
      share: (scale) => ({ x: Math.min(1, WIDGETS_AT_ONE.width * scale * long.width), y: Math.min(1, WIDGETS_AT_ONE.height * scale * long.height) }),
      setPlace: (place) => {
        const widgetPosition = PLAYER_WIDGET_POSITIONS.find((known) => known === place)
        if (widgetPosition) settings.setTableTvSettings({ widgetPosition })
      },
      setScale: (widgetScale) => settings.setTableTvSettings({ widgetScale }),
    },
  ]

  // A gesture reads each chip as it is now: every step it takes is saved and drawn anew
  const latest = useRef(chips)
  latest.current = chips

  const rescale = (chip: ChipSpec, scale: number): void => {
    const next = steppedWithin(scale, chip.min, chip.max, chip.step)
    if (next !== chip.scale) chip.setScale(next)
  }

  const begin = (event: React.PointerEvent, chip: ChipSpec, kind: Gesture["kind"]): void => {
    const box = boxRef.current
    if (event.button !== 0 || !box) return
    event.preventDefault()
    event.stopPropagation()
    ;(event.currentTarget as HTMLElement).focus()
    gesture.current = { kind, chip: chip.id, box: box.getBoundingClientRect(), startX: event.clientX, startY: event.clientY, startScale: chip.scale }
    const doc = box.ownerDocument
    const onMove = (move: PointerEvent): void => follow(move)
    const onUp = (): void => {
      gesture.current = null
      doc.removeEventListener("pointermove", onMove)
      doc.removeEventListener("pointerup", onUp)
      doc.removeEventListener("pointercancel", onUp)
    }
    doc.addEventListener("pointermove", onMove)
    doc.addEventListener("pointerup", onUp)
    doc.addEventListener("pointercancel", onUp)
  }

  const follow = (move: PointerEvent): void => {
    const now = gesture.current
    const chip = latest.current.find((known) => known.id === now?.chip)
    if (!now || !chip) return
    const { box } = now
    if (now.kind === "move") {
      const point = { x: within((move.clientX - box.left) / box.width), y: within((move.clientY - box.top) / box.height) }
      const place = nearestPlace(chip.places, point, box.width, box.height)
      if (place !== chip.place) chip.setPlace(place)
      return
    }
    // The handle sits on the corner that faces the TV's middle; a centred chip grows both ways at once
    const at = placePoint(chip.place)
    const growth = (start: number, delta: number, side: number): number => {
      const facing = side > 0.5 ? -1 : 1
      return start > 0 ? (start + delta * facing * (side === 0.5 ? 2 : 1)) / start : 1
    }
    const share = chip.share(now.startScale)
    const ratio = (growth(share.x * box.width, move.clientX - now.startX, at.x) + growth(share.y * box.height, move.clientY - now.startY, at.y)) / 2
    rescale(chip, now.startScale * ratio)
  }

  const onKeyDown = (event: React.KeyboardEvent, chip: ChipSpec): void => {
    const size = event.key === "+" || event.key === "=" ? 1 : event.key === "-" ? -1 : 0
    if (size !== 0) {
      event.preventDefault()
      rescale(chip, chip.scale + size * chip.step)
      return
    }
    const place = placeToward(chip.places, chip.place, event.key)
    if (place === null) return
    event.preventDefault()
    if (place !== chip.place) chip.setPlace(place)
  }

  return (
    <div className="atlas-true-scale__on-tv">
      <LabelTooltip label={t("tableTv.onTvHint")} side="right" describe multiline>
        <span className="atlas-dropdown-label">{t("tableTv.onTv")}</span>
      </LabelTooltip>
      <div className="atlas-true-scale__tv" style={{ aspectRatio: String(aspect) }}>
        <div ref={boxRef} className="atlas-true-scale__tv-area" data-testid="true-scale-tv">
          {[...new Set([...SHOWN_IMAGE_PLACES, ...PLAYER_WIDGET_POSITIONS])].map((place) => {
            const at = placePoint(place)
            return <span key={place} className="atlas-true-scale__slot" style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }} />
          })}
          {chips.map((chip) => {
            const at = placePoint(chip.place)
            const share = chip.share(chip.scale)
            const corner = `${at.y > 0.5 ? "top" : "bottom"}-${at.x > 0.5 ? "left" : "right"}`
            return (
              <button
                key={chip.id}
                type="button"
                className={`atlas-true-scale__chip atlas-true-scale__chip--${chip.id}`}
                aria-label={t("tableTv.chip", { name: chip.label, place: t(`tableTv.place.${chip.place}`) })}
                style={{
                  width: `${share.x * 100}%`,
                  height: `${share.y * 100}%`,
                  left: `${at.x * (1 - share.x) * 100}%`,
                  top: `${at.y * (1 - share.y) * 100}%`,
                }}
                onPointerDown={(event) => begin(event, chip, "move")}
                onKeyDown={(event) => onKeyDown(event, chip)}
              >
                <span className="atlas-true-scale__chip-label">{chip.label}</span>
                <span
                  className={`atlas-true-scale__handle atlas-true-scale__handle--${corner}`}
                  data-testid={`true-scale-${chip.id}-handle`}
                  aria-hidden="true"
                  onPointerDown={(event) => begin(event, chip, "resize")}
                />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
