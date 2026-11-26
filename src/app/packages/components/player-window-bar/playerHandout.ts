import { useSyncExternalStore } from "react"
import { ImageDisplayService } from "../../../services/ImageDisplayService"
import { PlayerLootDisplay } from "../../../services/PlayerLootDisplay"
import { playerWindowStore } from "../../../stores/playerWindowStore"

const lootInWindow = (): boolean => PlayerLootDisplay.get().showsInWindow()
/** Asked of the image display itself: an online table that stands in front of it counts the image its players see. */
const imageShown = (): boolean => ImageDisplayService.getInstance()?.isImageDisplayed() ?? false

function subscribeToHandouts(listener: () => void): () => void {
  const stopLoot = PlayerLootDisplay.get().subscribe(listener)
  const stopImage = playerWindowStore.subscribe(listener)
  return () => {
    stopLoot()
    stopImage()
  }
}

/** Whether players are shown a handout now: a displayed image, in the player window or at an online table, or the loot window. */
export function handoutShown(): boolean {
  return imageShown() || lootInWindow()
}

/** `handoutShown`, followed in React. */
export function useHandoutShown(): boolean {
  return useSyncExternalStore(subscribeToHandouts, handoutShown, handoutShown)
}

/** Takes the handouts away from players, without a notice of the player window's own: the bar's button going says so. */
export function takeBackHandout(): void {
  if (imageShown()) ImageDisplayService.getInstance()?.closeImageDisplay({ quiet: true })
  if (lootInWindow()) PlayerLootDisplay.get().close()
}
