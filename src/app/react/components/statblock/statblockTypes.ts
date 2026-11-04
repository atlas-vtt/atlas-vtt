/**
 * Structural types mirroring Fantasy Statblocks' layout format.
 *
 * Declared here rather than imported because Fantasy Statblocks is an optional
 * runtime dependency — Atlas reads the layout objects it exposes at runtime and
 * renders them with its own components.
 */

export type StatblockItemType =
  | 'traits'
  | 'heading'
  | 'subheading'
  | 'property'
  | 'table'
  | 'saves'
  | 'spells'
  | 'inline'
  | 'group'
  | 'image'
  | 'text'
  | 'ifelse'
  | 'collapse'
  | 'javascript'
  | 'layout'
  | 'action';

export interface CommonItem {
  type: StatblockItemType;
  id: string;
  conditioned?: boolean;
  properties?: string[];
  fallback?: string;
  hasRule?: boolean;
  markdown?: boolean;
  doNotAddClass?: boolean;
  cls?: string;
  heading?: string;
  headingProp?: boolean;
  callback?: string;
  display?: string;
  nested?: StatblockItem[];
  /** heading */
  size?: number;
  /** subheading */
  separator?: string;
  /** table */
  headers?: string[];
  calculate?: boolean;
  modifier?: string;
  /** text */
  text?: string;
  /** traits */
  subheadingText?: string;
  /** ifelse */
  conditions?: Array<{ condition: string; nested: StatblockItem[] }>;
  /** collapse */
  open?: boolean;
  /** javascript */
  code?: string;
  /** layout */
  layout?: string;
  /** action */
  action?: string;
  icon?: string;
}

export type StatblockItem = CommonItem;

export interface StatblockLayout {
  name: string;
  id: string;
  columns?: number;
  forceColumns?: boolean;
  columnWidth?: number;
  blocks: StatblockItem[];
}

/** A resolved Fantasy Statblocks creature. Fields vary by game system. */
export interface StatblockMonster {
  name?: string;
  [key: string]: unknown;
}

/** A trait as a note writes it: its name and description are texts in a well-formed statblock only. */
export interface Trait {
  name?: unknown;
  desc?: unknown;
  [key: string]: unknown;
}
