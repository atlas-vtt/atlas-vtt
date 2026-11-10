import { useEffect, useRef, useState } from 'react';

export interface DieDrag {
  /** The die being dragged, once the pointer has reached another die. */
  lifted: string | null;
  /** The die it would land on. */
  target: string | null;
  press: (id: string) => void;
  enter: (id: string) => void;
}

/**
 * Dragging a die to another place on the tray, as the Resources tab drags a
 * resource to another socket: press a die, move onto another and let go, and
 * it takes that die's place. Released anywhere else, nothing moves.
 */
export function useDieDrag(doc: Document | null, onDrop: (id: string, onto: string) => void): DieDrag {
  const pressed = useRef<string | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const drop = useRef(onDrop);
  drop.current = onDrop;
  const over = useRef<string | null>(null);

  useEffect(() => {
    const win = doc?.defaultView;
    if (!win) return;
    const release = (): void => {
      const from = pressed.current;
      const onto = over.current;
      pressed.current = null;
      over.current = null;
      if (from !== null && onto !== null && onto !== from) drop.current(from, onto);
      setLifted(null);
      setTarget(null);
    };
    win.addEventListener('pointerup', release);
    win.addEventListener('pointercancel', release);
    return () => {
      win.removeEventListener('pointerup', release);
      win.removeEventListener('pointercancel', release);
    };
  }, [doc]);

  return {
    lifted,
    target,
    press: (id) => { pressed.current = id; },
    enter: (id) => {
      const from = pressed.current;
      if (from === null) return;
      over.current = id === from ? null : id;
      setLifted(from);
      setTarget(over.current);
    },
  };
}
