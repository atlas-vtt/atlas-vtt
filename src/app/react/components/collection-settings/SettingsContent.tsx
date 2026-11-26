import React from 'react';

interface SettingsContentProps {
  children: React.ReactNode;
}

/** The scrolling area of the collection settings dialog that holds the open tab. */
export function SettingsContent({ children }: SettingsContentProps): React.ReactElement {
  return (
    <div className="atlas-collection-settings-content">
      <div className="atlas-collection-settings-page">{children}</div>
    </div>
  );
}
