import React, { useEffect, useRef } from 'react';
import { Setting } from 'obsidian';
import type { AtlasSettingSection } from '../../../settings/settingSections';

interface AddonSettingsPanelProps {
  sections: AtlasSettingSection[];
}

/** The installed add-ons' settings, the same rows as in Obsidian's settings tab. */
export function AddonSettingsPanel({ sections }: AddonSettingsPanelProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const cleanups: Array<() => void> = [];
    for (const { heading, rows } of sections) {
      new Setting(host).setName(heading).setHeading();
      for (const row of rows) {
        const setting = new Setting(host).setName(row.name);
        if (row.desc) setting.setDesc(row.desc);
        const cleanup = row.render(setting);
        if (cleanup) cleanups.push(cleanup);
      }
    }
    return () => {
      cleanups.splice(0).forEach((cleanup) => cleanup());
      host.replaceChildren();
    };
  }, [sections]);

  return <div ref={hostRef} className="atlas-command-palette-addon-settings" />;
}
