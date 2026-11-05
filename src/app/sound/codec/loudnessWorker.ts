import { LoudnessMeter } from './loudness';
import type { MeterMessage, MeterReply } from './meterThread';

/** Entry of the worker `MeterThread` runs: a conversion's loudness and true peak, beside its encoding. */

let meter: LoudnessMeter | null = null;

function reply(message: MeterReply): void {
  self.postMessage(message);
}

self.addEventListener('message', (event: MessageEvent<MeterMessage>) => {
  const message = event.data;
  if (message.type === 'add') {
    meter ??= new LoudnessMeter(message.planes.length);
    meter.add(message.planes);
    reply({ type: 'ack' });
  } else if (message.type === 'peek') {
    reply({ type: 'peek', result: meter ? meter.result() : { lufs: -Infinity, truePeakDb: -Infinity } });
  } else {
    reply({ type: 'result', result: meter ? meter.result() : { lufs: -Infinity, truePeakDb: -Infinity } });
  }
});
