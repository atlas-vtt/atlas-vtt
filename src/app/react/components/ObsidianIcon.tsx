import React, { useEffect, useRef } from 'react';
import { setIcon } from 'obsidian';

/** An Obsidian (Lucide) icon by name. */
export function ObsidianIcon({ name, className }: { name: string; className?: string }): React.ReactElement {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const span = ref.current;
    if (!span) return;
    while (span.firstChild) span.removeChild(span.firstChild);
    setIcon(span, name);
  }, [name]);

  return <span ref={ref} {...(className ? { className } : {})} />;
}

type IconComponent = React.ComponentType<{ className?: string }>;

const components = new Map<string, IconComponent>();

/** One stable component per icon name, for props that take a component (`ToolButton.icon`): an inline one would remount the icon on every render. */
export function obsidianIconComponent(name: string): IconComponent {
  let component = components.get(name);
  if (!component) {
    const Icon: IconComponent = ({ className }) => <ObsidianIcon name={name} {...(className ? { className } : {})} />;
    Icon.displayName = `ObsidianIcon(${name})`;
    components.set(name, Icon);
    component = Icon;
  }
  return component;
}
