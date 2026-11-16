import React from "react"
import { useStore } from "zustand"
import { Maximize, Minimize } from "lucide-react"
import { fullScreenAvailable, setPlayerWindowFullScreen } from "../../../services/playerWindowDisplay"
import { playerWindowStore } from "../../../stores/playerWindowStore"
import { runInBackground } from "../../../utils/backgroundTask"
import { ToolButton } from "../primitives/ToolButton"
import { t } from "../../../i18n"

/**
 * Puts the player window in full screen on the TV, or takes it out. Without a second display it
 * stands disabled and says why; where Obsidian offers no way to the window (`remote`) it is not shown.
 */
export function FullScreenButton(): React.ReactElement | null {
  const fullScreen = useStore(playerWindowStore, (s) => s.fullScreen)
  const secondDisplay = useStore(playerWindowStore, (s) => s.secondDisplay)
  if (!fullScreenAvailable()) return null
  // Leaving full screen is always offered; entering it on the GM's only display would cover Obsidian
  const disabled = !fullScreen && !secondDisplay
  return (
    <ToolButton
      icon={fullScreen ? Minimize : Maximize}
      label={fullScreen ? t("playerBar.leaveFullScreen") : t("playerBar.fullScreen")}
      {...(!fullScreen && { subtitle: t(secondDisplay ? "playerBar.fullScreenHint" : "playerBar.connectScreen") })}
      isActive={fullScreen}
      disabled={disabled}
      onClick={() => runInBackground(setPlayerWindowFullScreen(!fullScreen), "Changing the player window's full screen")}
      tooltipSide="bottom"
    />
  )
}
