import { getMessage } from '../shared/services/i18n.service';
import type { ClipData } from '../entities/clip.entity';
import type { ValveTimerHijacker } from '../features/valve-interop/timer-hijacker.injector';
import type { SubmitCommand, SubmitRequestFactory, ValvePageClient, NextPageReader, ValvePageCommitter, HistoryPersistencePort, PageNavigator, ClipActivationPort, PlayerTransitionPort } from './submit.port';

export interface SubmitWorkflowOptions {
  requestFactory: SubmitRequestFactory;
  pageClient: ValvePageClient;
  pageReader: NextPageReader;
  pageCommitter: ValvePageCommitter;
  history: HistoryPersistencePort;
  navigator: PageNavigator;
  activation: ClipActivationPort;
  playerTransition: PlayerTransitionPort;
  timerHijacker: ValveTimerHijacker;
  getContext: () => { clip: ClipData };
  onSubmitting: (submitting: boolean) => void;
  onError: (message: string) => void;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class SubmitWorkflow {
  private activeController: AbortController | null = null;
  private isDisposed = false;

  private readonly options: SubmitWorkflowOptions;

  constructor(options: SubmitWorkflowOptions) {
    this.options = options;
  }

  async submit(command: SubmitCommand): Promise<void> {
    if (this.isDisposed || this.activeController) return;

    const controller = new AbortController();
    let acceptedPageUrl: string | null = null;
    this.activeController = controller;

    try {
      this.options.onSubmitting(true);
      const context = this.options.getContext();
      const request = this.options.requestFactory.create(command, controller.signal);
      const response = await this.options.pageClient.submit(request);
      controller.signal.throwIfAborted();
      acceptedPageUrl = response.url;

      const historyPersistence = this.options.history.save({
        clip: context.clip,
        verdicts: command.verdicts,
        badClip: command.badClip,
      }).then(
        () => null,
        (error: unknown) => describeError(error),
      );

      const mimeType = response.contentType.split(';', 1)[0]?.trim().toLowerCase();
      if (mimeType !== 'text/html') {
        throw new Error(getMessage("errValveUnsupportedContentType", response.contentType || "missing"));
      }

      const responseText = await response.text();
      controller.signal.throwIfAborted();
      const nextPage = await this.options.pageReader.read(responseText, acceptedPageUrl);
      controller.signal.throwIfAborted();
      if (nextPage.clip.reviewType === 'cheating') {
        // New site scripts own watched progress and decision ticks. Load them normally
        // instead of carrying a legacy player's closures into the new task.
        const historyError = await historyPersistence;
        if (historyError) this.options.onError(getMessage('errVerdictAcceptedHistoryFailed', historyError));
        this.options.navigator.replace(acceptedPageUrl);
        return;
      }
      this.options.pageCommitter.validate(nextPage);
      const commit = this.options.pageCommitter.commit(nextPage);
      try {
        await this.options.playerTransition.transition(nextPage.clip);
        controller.signal.throwIfAborted();
        this.options.activation.activate(nextPage);
        this.options.timerHijacker.markClipTransition();
        commit.finalize();
      } catch (error) {
        commit.rollback();
        throw error;
      }
      void historyPersistence.then((historyError) => {
        if (historyError && !this.isDisposed) {
           this.options.onError(getMessage('errVerdictAcceptedHistoryFailed', historyError));
        }
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (acceptedPageUrl) this.options.navigator.replace(acceptedPageUrl);
      this.options.onError(describeError(error));
    } finally {
      if (this.activeController === controller) this.activeController = null;
      if (!controller.signal.aborted) this.options.onSubmitting(false);
    }
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.activeController?.abort();
    this.activeController = null;
  }
}
