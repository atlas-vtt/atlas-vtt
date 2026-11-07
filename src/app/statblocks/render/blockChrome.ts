import { createContext, useContext, type DOMAttributes, type ReactNode } from 'react';
import type { FieldKey, MetricBlock, TemplateBlock } from '../model/templateTypes';
import type { BlockDisplay } from './blockDisplay';

type FrameHandlers = Pick<
  DOMAttributes<HTMLDivElement>,
  'onClick' | 'onDoubleClick' | 'onPointerDown' | 'onPointerEnter' | 'onPointerLeave' | 'onFocus' | 'onBlur' | 'onKeyDown' | 'onContextMenu'
>;

/** What the template editor adds to one block's frame. */
export interface BlockDecoration {
  className?: string | undefined;
  /** `data-*` and `aria-*` attributes: selection and hover state, a description. */
  attributes?: Readonly<Record<`data-${string}` | `aria-${string}`, string | undefined>> | undefined;
  handlers?: FrameHandlers | undefined;
  tabIndex?: number | undefined;
  role?: string | undefined;
  /** Drawn last inside the frame and positioned absolutely over it: outlines, handles, a toolbar's anchor. */
  overlay?: ReactNode;
}

/**
 * How the template editor dresses blocks: selection outlines, hover, handles.
 * Chrome never changes layout (S6): what it adds is an attribute, a handler,
 * a class that changes no box, or the overlay, so every block measures the
 * same with and without it. The runtime card has none and pays only for
 * reading an empty context.
 */
export interface BlockChrome {
  decorate(block: TemplateBlock, display: BlockDisplay): BlockDecoration | null;
  /** Laid absolutely over one number of a Metric, which is its own target (the recovery editor's spots). */
  decorateNumber?(block: MetricBlock, key: FieldKey): ReactNode;
}

export const BlockChromeContext = createContext<BlockChrome | null>(null);

export function useBlockChrome(): BlockChrome | null {
  return useContext(BlockChromeContext);
}
