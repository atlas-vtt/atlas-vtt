import { setOutputDevice } from '../sound/engine/outputDevice';
import { t } from '../i18n';
import { loadOutput, saveOutput, type DeviceStorage, type StoredOutput } from './deviceFacts';

/** Which output this device plays on. A device that is gone falls back to the default and is said once. */
export class OutputChoice {
  private told = false;

  constructor(
    private readonly storage: DeviceStorage,
    private readonly notify: (message: string) => void,
  ) {}

  /** Moves sound to the stored output, at switching on. */
  apply(): StoredOutput | null {
    const output = loadOutput(this.storage);
    void this.move(output);
    return output;
  }

  choose(output: StoredOutput | null): void {
    saveOutput(this.storage, output);
    this.told = false;
    void this.move(output);
  }

  release(): void {
    void setOutputDevice('');
  }

  private move(output: StoredOutput | null): Promise<void> {
    return setOutputDevice(output?.id ?? '', () => {
      if (this.told) return;
      this.told = true;
      this.notify(t('audio.outputMissing', { name: output?.label || t('audio.outputUnnamed') }));
    });
  }
}
