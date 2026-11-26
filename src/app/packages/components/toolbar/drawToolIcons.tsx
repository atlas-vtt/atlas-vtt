import React from "react"
import type { DrawFont, DrawSize } from "../../../annotations/annotationTypes"

/** What a button of a bar or a row of its menus draws as its icon. */
export type DrawIcon = React.ComponentType<{ className?: string }>

interface GlyphProps {
  className?: string | undefined
  /** The width of its lines, of the 24 px box. */
  line?: number
  children: React.ReactNode
}

/** A glyph drawn like a lucide icon (24 px box, round strokes), where lucide has none for a choice. */
function Glyph({ className, line = 2, children }: GlyphProps): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={line} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  )
}

/** A stroke of the pen at each size, as the Size button and its menu show it. */
const SIZE_LINES: Readonly<Record<DrawSize, number>> = { s: 1.25, m: 2.5, l: 4.5, xl: 7 }

function sizeIcon(size: DrawSize): DrawIcon {
  return function SizeIcon({ className }): React.ReactElement {
    return <Glyph className={className} line={SIZE_LINES[size]}><path d="M4.5 15c3-8 5-8 7.5-3s4.5 5 7.5-3" /></Glyph>
  }
}

export const SIZE_ICONS: Readonly<Record<DrawSize, DrawIcon>> = { s: sizeIcon('s'), m: sizeIcon('m'), l: sizeIcon('l'), xl: sizeIcon('xl') }

export function DashedIcon({ className }: { className?: string }): React.ReactElement {
  return <Glyph className={className}><path d="M4 12h3.5M10.25 12h3.5M16.5 12H20" /></Glyph>
}

export function DottedIcon({ className }: { className?: string }): React.ReactElement {
  return <Glyph className={className} line={2.5}><path d="M5 12h.01M9.67 12h.01M14.33 12h.01M19 12h.01" /></Glyph>
}

/** A line without arrowheads, lying as lucide's arrows for one end and both ends lie. */
export function PlainEndsIcon({ className }: { className?: string }): React.ReactElement {
  return <Glyph className={className}><path d="M6 18 18 6" /></Glyph>
}

/** A square whose inside is a quarter of its colour: the soft fill. */
export function SoftFillIcon({ className }: { className?: string }): React.ReactElement {
  return <Glyph className={className}><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" fillOpacity={0.3} /></Glyph>
}

export function SolidFillIcon({ className }: { className?: string }): React.ReactElement {
  return <Glyph className={className}><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" /></Glyph>
}

function fontIcon(font: DrawFont): DrawIcon {
  return function FontIcon({ className }): React.ReactElement {
    return <span className={`atlas-tool-bar__letter atlas-tool-bar__letter--${font}${className ? ` ${className}` : ''}`} aria-hidden="true">A</span>
  }
}

/** The letter A in each face the Text mode offers. */
export const FONT_ICONS: Readonly<Record<DrawFont, DrawIcon>> = { medieval: fontIcon('medieval'), scifi: fontIcon('scifi'), mono: fontIcon('mono') }
