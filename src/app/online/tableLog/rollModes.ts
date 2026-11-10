import type { RollMode } from '../protocol/index.ts';
import { Crown, EyeOff, UserRound, Users, type LucideIcon } from 'lucide-react';

export interface RollModeInfo {
  /** As the roll-mode menu offers it. */
  readonly choice: string;
  /** As a private roll's badge says it; null for a public roll, which has none. */
  readonly badge: string | null;
  readonly icon: LucideIcon;
}

/** The roll modes as the panel names and draws them. */
export const ROLL_MODE_INFO: Readonly<Record<RollMode, RollModeInfo>> = {
  public: { choice: 'Public roll', badge: null, icon: Users },
  gm: { choice: 'GM only', badge: 'GM only', icon: Crown },
  blind: { choice: 'Blind (only the GM sees the result)', badge: 'Blind', icon: EyeOff },
  self: { choice: 'Only me', badge: 'Only you', icon: UserRound },
};
