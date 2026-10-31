import { useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';
import type { TabMetaStore } from '../../../stores/tabMetaStore';
import { ToolbarPointerSession, type ClientPoint } from '../../../packages/components/toolbar/editor/toolbarPointerSession';
import { t } from '../../../i18n';
import { sceneTabDropTarget } from './sceneTabDropTarget';
import { sceneTabDragClick } from './sceneTabDragClick';

interface SceneTabReorderOptions {
  strip: HTMLElement | null;
  store: TabMetaStore;
  onMoveTab: (tabId: string, beforeTabId: string | null) => boolean;
  announce: (text: string) => void;
}

interface SceneTabReorderControls {
  press: (event: React.PointerEvent<HTMLElement>, tabId: string) => void;
  onClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
  draggedId: string | null;
  indicatorLeft: number | null;
}

interface Drag {
  sourceId: string;
  point: ClientPoint;
  valid: () => boolean;
  dispose: () => void;
}

/** Keep the resting tab layout until drop; all listeners belong to the strip's document. */
export function useSceneTabReorder(options: SceneTabReorderOptions): SceneTabReorderControls {
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });
  const session = useRef<ToolbarPointerSession | null>(null);
  const drag = useRef<Drag | null>(null);
  const click = useRef<ReturnType<typeof sceneTabDragClick> | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [indicatorLeft, setIndicatorLeft] = useState<number | null>(null);

  const finish = (): Drag | null => {
    const current = drag.current;
    drag.current = null;
    session.current = null;
    current?.dispose();
    setDraggedId(null);
    setIndicatorLeft(null);
    return current;
  };
  const cancel = (): void => {
    if (finish()) latest.current.announce(t('tabs.reorderCancelled'));
  };

  useLayoutEffect(() => () => {
    session.current?.cancel();
    click.current?.dispose();
  }, [options.strip]);

  const pickUp = (strip: HTMLElement, sourceId: string, pointerId: number, point: ClientPoint): void => {
    const { store } = latest.current;
    const ids = store.getState().tabs.map((tab) => tab.id);
    if (!ids.includes(sourceId)) { session.current?.cancel(); return; }
    const elements = [strip, ...strip.querySelectorAll<HTMLElement>('[data-scene-tab-id]')];
    const sizes = elements.map((element) => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height };
    });
    const valid = (): boolean => {
      const currentIds = store.getState().tabs.map((tab) => tab.id);
      return strip.isConnected && currentIds.length === ids.length && currentIds.every((id, index) => id === ids[index])
        && elements.every((element, index) => {
          const rect = element.getBoundingClientRect();
          return element.isConnected && rect.width === sizes[index]!.width && rect.height === sizes[index]!.height;
        });
    };
    const win = strip.win as Window & { ResizeObserver: typeof ResizeObserver };
    let frame = 0;
    let previousTime = 0;
    const updateTarget = (): void => {
      const current = drag.current;
      if (!current) return;
      setIndicatorLeft(sceneTabDropTarget(strip, sourceId, current.point.x, current.point.y)?.indicatorLeft ?? null);
    };
    const check = (): void => { if (!valid()) session.current?.cancel(); };
    const unsubscribe = store.subscribe(check);
    const observer = new win.ResizeObserver(check);
    elements.forEach((element) => observer.observe(element));
    strip.addEventListener('scroll', updateTarget);
    win.addEventListener('resize', check);
    const tick = (time: number): void => {
      const current = drag.current;
      if (!current) return;
      const elapsed = previousTime ? Math.min(time - previousTime, 50) / 1000 : 0;
      previousTime = time;
      const bounds = strip.getBoundingClientRect();
      const { x, y } = current.point;
      if (x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom) {
        const band = Math.min(24, bounds.width / 2);
        const speed = x < bounds.left + band ? -480 * (1 - (x - bounds.left) / band)
          : x > bounds.right - band ? 480 * (1 - (bounds.right - x) / band) : 0;
        strip.scrollLeft = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, strip.scrollLeft + speed * elapsed));
      }
      updateTarget();
      frame = win.requestAnimationFrame(tick);
    };
    drag.current = {
      sourceId, point, valid,
      dispose: (): void => {
        unsubscribe();
        observer.disconnect();
        strip.removeEventListener('scroll', updateTarget);
        win.removeEventListener('resize', check);
        win.cancelAnimationFrame(frame);
      },
    };
    click.current?.dispose();
    click.current = sceneTabDragClick(strip.ownerDocument, pointerId);
    latest.current.announce('');
    setDraggedId(sourceId);
    updateTarget();
    frame = win.requestAnimationFrame(tick);
  };

  return {
    draggedId, indicatorLeft,
    onClickCapture: (event): void => { click.current?.suppress(event.nativeEvent); },
    press: (event, tabId): void => {
      const { strip } = latest.current;
      if (!strip || event.button !== 0 || !event.isPrimary || event.pointerType === 'touch' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if ((event.target as Element).closest('button')) return;
      session.current?.cancel();
      event.stopPropagation();
      session.current = new ToolbarPointerSession(strip, event.nativeEvent, {
        pickUp: (point): void => { pickUp(strip, tabId, event.pointerId, point); },
        move: (point): void => {
          if (!drag.current) return;
          drag.current.point = point;
          setIndicatorLeft(sceneTabDropTarget(strip, tabId, point.x, point.y)?.indicatorLeft ?? null);
        },
        drop: (point): void => {
          const current = drag.current;
          const target = current?.valid() ? sceneTabDropTarget(strip, current.sourceId, point.x, point.y) : null;
          // Remove observers before the store mutation so our own reorder cannot cancel itself.
          finish();
          if (current && target) latest.current.onMoveTab(current.sourceId, target.beforeTabId);
          else if (current) latest.current.announce(t('tabs.reorderCancelled'));
        },
        cancel,
        release: (): void => { session.current = null; },
      });
    },
  };
}
