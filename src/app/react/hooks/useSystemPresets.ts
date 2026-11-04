import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { SystemPresetService } from '../../services/SystemPresetService';
import { SystemPresetFiles } from '../../services/systemPresets/SystemPresetFiles';
import type { SystemPreset } from '../../types/systemPresetTypes';

interface SystemPresets {
  /** Null while the preset files are not open (no plugin). */
  service: SystemPresetService | null;
  presets: SystemPreset[];
}

/** The vault's game system presets, kept current as they are saved, renamed or deleted. */
export function useSystemPresets(app: App | undefined): SystemPresets {
  const service = useMemo(() => {
    const files = SystemPresetFiles.forApp(app);
    return files ? new SystemPresetService(files) : null;
  }, [app]);
  const [presets, setPresets] = useState<SystemPreset[]>(() => service?.list() ?? []);

  useEffect(() => {
    if (!service) return;
    setPresets(service.list());
    return service.onChange(() => setPresets(service.list()));
  }, [service]);

  return { service, presets };
}
