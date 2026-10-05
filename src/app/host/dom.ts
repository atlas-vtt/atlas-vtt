/** DOM operations supplied by the application that owns the map. */
export interface DomHost {
  createCanvas(doc?: Document, size?: { width: number; height: number }): HTMLCanvasElement;
  createDiv(parent: HTMLElement, cls: string): HTMLDivElement;
  ownerWindow(node: Node): Window;
  activeDocument(): Document;
}

let current: DomHost | undefined;

/** Install before loading modules that create DOM resources. Returns a function that restores the previous binding. */
export function installDomHost(host: DomHost): () => void {
  const previous = current;
  current = host;
  return () => { current = previous; };
}

export function getDomHost(): DomHost {
  if (!current) throw new Error('DOM host has not been installed');
  return current;
}
