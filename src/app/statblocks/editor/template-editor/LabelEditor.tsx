import React, { useLayoutEffect, useRef, useState } from 'react';
import { observeResize } from '../../../utils/observeResize';
import { labelElement, type LabelKind, type LabelPart } from './labelTargets';
import { t } from '../../../i18n';

/** Marks the label the input stands over, which hides while it is edited. */
export const LABEL_EDITING_ATTRIBUTE = 'data-te-label-editing';

export interface LabelEditorProps {
  stage: HTMLElement;
  frame: HTMLElement;
  kind: LabelKind;
  /** Which of a Metric's labels. */
  part?: LabelPart | undefined;
  text: string;
  /** Enter (`refocus`: focus goes back to the block), or leaving the field (focus stays where it went). */
  onCommit: (text: string, refocus: boolean) => void;
  onCancel: () => void;
  /** Tab and Shift+Tab: committed, then on to the next or previous label. */
  onStep: (text: string, step: 1 | -1) => void;
}

/** Custom properties the stylesheet reads: where chrome stands, measured after render. */
export type ChromeStyle = Record<`--${string}`, string>;

interface Placement {
  style: ChromeStyle;
}

/** The first run of text in the element, where the label's words stand. */
function textRect(element: HTMLElement): DOMRect {
  const doc = element.doc;
  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const range = doc.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0) return rect;
  }
  return element.getBoundingClientRect();
}

/** Where the input stands and how it writes: exactly over the label's text, in its font. */
function placementOf(stage: HTMLElement, label: HTMLElement): Placement {
  const stageBox = stage.getBoundingClientRect();
  const box = textRect(label);
  const font = label.win.getComputedStyle(label);
  return {
    style: {
      '--atlas-te-label-x': `${box.left - stageBox.left}px`,
      '--atlas-te-label-y': `${box.top - stageBox.top}px`,
      '--atlas-te-label-width': `${box.width}px`,
      '--atlas-te-label-height': `${box.height}px`,
      '--atlas-te-label-font': font.fontFamily,
      '--atlas-te-label-size': font.fontSize,
      '--atlas-te-label-weight': font.fontWeight,
      '--atlas-te-label-style': font.fontStyle,
      '--atlas-te-label-tracking': font.letterSpacing,
      '--atlas-te-label-transform': font.textTransform,
    },
  };
}

/**
 * The inline label input (§7.6): over the label's own text, in its font,
 * growing with what is typed (`field-sizing: content`) and underlined in the
 * accent. Enter or leaving commits, Escape reverts, Tab commits and moves on.
 * The label under it hides while it is open; nothing in the card moves.
 */
export function LabelEditor({ stage, frame, kind, part, text, onCommit, onCancel, onStep }: LabelEditorProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(text);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    const label = labelElement(frame, kind, part);
    const hides = label !== frame;
    if (hides) label.setAttribute(LABEL_EDITING_ATTRIBUTE, '');
    const place = (): void => setPlacement(placementOf(stage, label));
    place();
    const stop = observeResize([stage], place);
    return () => {
      stop();
      if (hides) label.removeAttribute(LABEL_EDITING_ATTRIBUTE);
    };
  }, [stage, frame, kind, part]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || !placement || input === input.doc.activeElement) return;
    input.focus({ preventScroll: true });
    input.select();
  }, [placement]);

  const finish = (action: () => void): void => {
    if (done.current) return;
    done.current = true;
    action();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') finish(() => onCommit(value, true));
    else if (event.key === 'Escape') finish(onCancel);
    else if (event.key === 'Tab') finish(() => onStep(value, event.shiftKey ? -1 : 1));
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className="atlas-te-label-input atlas-te-chrome-control"
      style={placement?.style}
      hidden={!placement}
      value={value}
      spellCheck={false}
      autoComplete="off"
      aria-label={t('templateEditor.label')}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(() => onCommit(value, false))}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
}
