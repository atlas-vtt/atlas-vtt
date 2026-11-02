import { useRef, useState, type DragEvent } from 'react';

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

export interface FileDrop {
  isDragging: boolean;
  /** Spread on the element files are dropped on. */
  handlers: {
    onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
    onDragLeave: () => void;
    onDragOver: (event: DragEvent<HTMLDivElement>) => void;
    onDrop: (event: DragEvent<HTMLDivElement>) => void;
  };
}

/**
 * Files dragged over an element and dropped on it. Entering and leaving its children is counted,
 * so the drop state holds while the pointer crosses them; `accept` false takes no drop.
 */
export function useFileDrop(onFiles: (files: File[]) => void, accept: boolean): FileDrop {
  const [isDragging, setIsDragging] = useState(false);
  const depth = useRef(0);
  return {
    isDragging,
    handlers: {
      onDragEnter: (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setIsDragging(true);
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setIsDragging(false);
      },
      onDragOver: (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      },
      onDrop: (event) => {
        event.preventDefault();
        depth.current = 0;
        setIsDragging(false);
        if (accept) onFiles(Array.from(event.dataTransfer.files));
      },
    },
  };
}
