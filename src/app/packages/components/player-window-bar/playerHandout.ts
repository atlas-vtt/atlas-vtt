import { useSyncExternalStore } from "react"
import { ImageDisplayService } from "../../../services/ImageDisplayService"
import { PlayerLootDisplay } from "../../../services/PlayerLootDisplay"
import { playerWindowStore } from "../../../stores/playerWindowStore"

const lootInWindow = (): boolean => PlayerLootDisplay.get().showsInWindow()

function subscribeToHandouts(listener: () => void): () => void {
  const stopLoot = PlayerLootDisplay.get().subscribe(listener)
  const stopImage = playerWindowStore.subscribe(listener)
  return () => {
    stopLoot()
    stopImage()
  }
}

/** Whether the player window shows players a handout now: a displayed image or the loot window. */
export function handoutShown(): boolean {
  return playerWindowStore.getState().imageShown || lootInWindow()
}

/** `handoutShown`, followed in React. */
export function useHandoutShown(): boolean {
  return useSyncExternalStore(subscribeToHandouts, handoutShown, handoutShown)
}

/** Takes the handouts the player window shows away from players, without a notice: the bar's button going says so. */
export function takeBackHandout(): void {
  if (playerWindowStore.getState().imageShown) ImageDisplayService.getInstance()?.closeImageDisplay({ quiet: true })
  if (lootInWindow()) PlayerLootDisplay.get().close()
}
