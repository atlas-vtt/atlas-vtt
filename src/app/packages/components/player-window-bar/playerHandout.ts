import { useSyncExternalStore } from "react"
import { useStore } from "zustand"
import { ImageDisplayService } from "../../../services/ImageDisplayService"
import { PlayerLootDisplay } from "../../../services/PlayerLootDisplay"
import { playerWindowStore } from "../../../stores/playerWindowStore"

const subscribeToLoot = (listener: () => void): (() => void) => PlayerLootDisplay.get().subscribe(listener)
const lootInWindow = (): boolean => PlayerLootDisplay.get().showsInWindow()

/** Whether the player window shows players a handout now: a displayed image or the loot window. */
export function useHandoutShown(): boolean {
  const imageShown = useStore(playerWindowStore, (s) => s.imageShown)
  const lootShown = useSyncExternalStore(subscribeToLoot, lootInWindow, lootInWindow)
  return imageShown || lootShown
}

/** Takes the handouts the player window shows away from players, without a notice: the bar's button going says so. */
export function takeBackHandout(): void {
  if (playerWindowStore.getState().imageShown) ImageDisplayService.getInstance()?.closeImageDisplay({ quiet: true })
  if (lootInWindow()) PlayerLootDisplay.get().close()
}
