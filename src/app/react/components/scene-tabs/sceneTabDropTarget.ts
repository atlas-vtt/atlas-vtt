export interface SceneTabDropTarget {
  beforeTabId: string | null;
  indicatorLeft: number;
}

/** Placement in the strip's resting layout; the held tab keeps its space. */
export function sceneTabDropTarget(strip: HTMLElement, sourceId: string, clientX: number, clientY: number): SceneTabDropTarget | null {
  const bounds = strip.getBoundingClientRect();
  if (clientX < bounds.left || clientX >= bounds.right || clientY < bounds.top || clientY >= bounds.bottom) return null;
  const tabs = Array.from(strip.querySelectorAll<HTMLElement>('[data-scene-tab-id]'));
  if (!tabs.some((tab) => tab.dataset.sceneTabId === sourceId)) return null;
  const target = tabs.find((tab) => {
    const rect = tab.getBoundingClientRect();
    return tab.dataset.sceneTabId !== sourceId && clientX < rect.left + rect.width / 2;
  });
  const edge = target ? target.getBoundingClientRect().left : tabs[tabs.length - 1]!.getBoundingClientRect().right;
  return { beforeTabId: target?.dataset.sceneTabId ?? null, indicatorLeft: edge - bounds.left + strip.scrollLeft - strip.clientLeft };
}
