import React, { useState } from 'react';
import { useScrollbarGutter } from '../../../packages/components/primitives/useScrollbarGutter';

interface SettingsContentProps {
  children: React.ReactNode;
}

/**
 * The scrolling area of the collection settings dialog that holds the open tab.
 * Its scrollbar lies inside the padding, so a tab that starts to scroll does not move.
 */
export function SettingsContent({ children }: SettingsContentProps): React.ReactElement {
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  useScrollbarGutter(content);
  return (
    <div ref={setContent} className="atlas-collection-settings-content">
      <div className="atlas-collection-settings-page">{children}</div>
    </div>
  );
}
