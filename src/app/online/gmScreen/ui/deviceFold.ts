import { useState } from 'react';

/** The devices section's fold as the GM leaves it, and what folds or opens it. */
export interface DeviceFoldState {
  readonly open: boolean;
  readonly toggle: () => void;
}

/**
 * The fold of the devices section: closed each time the panel opens, and open only while the GM keeps it open,
 * whatever the devices do. Kept by the panel rather than the section: as it opens or closes it moves what stands
 * below it, which then takes no press for a moment (`useArmed`).
 */
export function useDeviceFold(): DeviceFoldState {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen((was) => !was) };
}
