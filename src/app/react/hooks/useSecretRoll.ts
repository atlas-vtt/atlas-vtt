import { useEffect, useState } from 'react';
import type { DiceTool } from '../../tools/DiceTool';

/** Whether the dice tray's rolls are secret, kept current as the switch changes. A view without a dice tool has none. */
export function useSecretRoll(diceTool: DiceTool | null): boolean {
  const [secretRoll, setSecretRoll] = useState(diceTool?.state.secretRoll ?? false);

  useEffect(() => {
    setSecretRoll(diceTool?.state.secretRoll ?? false);
    return diceTool?.onSecretRollChange(setSecretRoll);
  }, [diceTool]);

  return secretRoll;
}
