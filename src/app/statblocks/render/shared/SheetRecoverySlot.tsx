import React, { useContext } from 'react';
import { ValueEditingContext } from '../valueSlot';

/**
 * What stands under the header once for the whole sheet where a surface edits the statblock
 * (`ValueEditing.recovery`): a player character's recovery buttons. A card that is only read
 * shows none.
 */
export function SheetRecoverySlot(): React.ReactNode {
  const editing = useContext(ValueEditingContext);
  return editing?.recovery?.() ?? null;
}
