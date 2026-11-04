import { createContext, useContext } from 'react'
import { createStore, type StoreApi } from 'zustand'
import type { ToolbarEditApi } from './toolbarEditContext'
import { createToolbarEditStore, type ToolbarEditStore } from './toolbarEditStore'

/**
 * What the bottom toolbar row shares between the main toolbar, whose editor
 * lives in MainToolbar, and the undo/redo bar in the row's start slot, which
 * the editor hides, shows and drags too.
 */
export interface ToolbarRowBridge {
  /** The row's drag state, which MainToolbar uses as its own. */
  editStore: ToolbarEditStore
  /** The editor's actions while edit mode is on, published by MainToolbar after each of its renders; else null. */
  edit: StoreApi<{ api: ToolbarEditApi | null }>
}

export function createToolbarRowBridge(): ToolbarRowBridge {
  return { editStore: createToolbarEditStore(), edit: createStore(() => ({ api: null })) }
}

export const ToolbarRowBridgeContext = createContext<ToolbarRowBridge | null>(null)

/** The bottom row's bridge; null for a toolbar rendered on its own (tests). */
export function useToolbarRowBridge(): ToolbarRowBridge | null {
  return useContext(ToolbarRowBridgeContext)
}
