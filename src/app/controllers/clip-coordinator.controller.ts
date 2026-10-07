import { createClipIdentity, type ClipData, type ClipDeduplication } from '../../entities/clip.entity';
import { readValveClip, type ParsedValvePage } from '../../features/valve-interop/clip.parser';
import { storeInitialValveClip } from '../../features/valve-interop/page-synchronizer.service';
import type { MainMessageBus } from '../../shared/message-bus.adapter';
import type { VerdictSelection } from '../../entities/verdict.entity';
import { getMessage } from '../../shared/services/i18n.service';
import { waitForValvePageReady } from '../../features/valve-interop/valve-page-ready.service';

interface ClipCoordinatorOptions {
  bus: MainMessageBus;
  onStateChanged: () => void;
  onError: (message: string) => void;
  onActivated: (page: ParsedValvePage) => void;
}

export class ClipCoordinator {
  constructor(private readonly options: ClipCoordinatorOptions) {}

  async initialize(signal: AbortSignal, readMetadata = true): Promise<ClipData> {
    await waitForValvePageReady(document, signal);
    const clip = await readValveClip(document, location.href, (url) => readMetadata
      ? this.options.bus.readWebmMetadata({ url }) : Promise.resolve(null));
    storeInitialValveClip(clip);
    return clip;
  }

  activate(page: ParsedValvePage): void { this.options.onActivated(page); }

  async identify(clip: ClipData, isCurrent: () => boolean, setState: (state: { status: ClipDeduplication; previous: VerdictSelection | null; identity: string }) => void): Promise<void> {
    const { identity } = createClipIdentity(clip);
    try {
      const lookup = await this.options.bus.findHistory({ clip });
      if (!isCurrent()) return;
      const previous: VerdictSelection | null = lookup.entry ? {
        aimassist: lookup.entry.aimassist,
        wallhack: lookup.entry.wallhack,
        autobhop: lookup.entry.autobhop,
        bot: lookup.entry.bot,
        ...(lookup.entry.cheating ? { cheating: lookup.entry.cheating } : {}),
      } : null;
      setState({ status: lookup.status, previous, identity });
      this.options.onStateChanged();
    } catch (error) {
      if (!isCurrent()) return;
       this.options.onError(getMessage('errHistoryLookupFailed', error instanceof Error ? error.message : String(error)));
    }
  }
}
