import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import type { SettingMount } from '../api/apiTypes';
import { appearanceSettings } from '../api/extensionPoints';

/** Runs another plugin's code so that its failure stays its own. */
function runSafely<T>(run: () => T): T | undefined {
  try {
    return run();
  } catch (error) {
    console.error('[Atlas] A setting another plugin added failed', error);
    return undefined;
  }
}

function CompanionSetting({ mount }: { mount: SettingMount }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const unmount = runSafely(() => mount(el));
    return () => {
      if (typeof unmount === 'function') runSafely(unmount);
      el.empty();
    };
  }, [mount]);
  return <div ref={ref} className="atlas-appearance-companion" />;
}

/** The rows other plugins added to Appearance settings (`AtlasApi.appearance.addSetting`). */
export function CompanionSettings(): React.JSX.Element {
  const mounts = useSyncExternalStore(appearanceSettings.subscribe, appearanceSettings.list);
  return <>{mounts.map((mount, index) => <CompanionSetting key={index} mount={mount} />)}</>;
}
