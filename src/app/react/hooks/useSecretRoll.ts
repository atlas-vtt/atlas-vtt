import { useEffect, useState } from 'react';
import type { DiceTool } from '../../tools/DiceTool';

/** Whether the dice tray's rolls are secret, kept current as the switch changes. */
export function useSecretRoll(diceTool: DiceTool): boolean {
  const [secretRoll, setSecretRoll] = useState(diceTool.state.secretRoll);

  useEffect(() => {
    setSecretRoll(diceTool.state.secretRoll);
    return diceTool.onSecretRollChange(setSecretRoll);
  }, [diceTool]);

  return secretRoll;
}
