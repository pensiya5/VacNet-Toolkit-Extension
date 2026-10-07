import { getMessage } from '../../shared/services/i18n.service';
import type { MessageCatalog, MessageKey } from '../../shared/services/i18n.service';

const translatedKeys: ReadonlyArray<readonly [MessageKey, MessageKey]> = [
  ['nativeStartMatch', 'sourceNativeStartMatch'],
  ['nativeFullMatch', 'sourceNativeFullMatch'],
  ['nativeChooseEarly', 'sourceNativeChooseEarly'],
  ['nativeDecisionMoment', 'sourceNativeDecisionMoment'],
  ['nativeChooseEnd', 'sourceNativeChooseEnd'],
  ['nativeTraining', 'sourceNativeTraining'],
  ['cs2VideoReview', 'sourceCs2VideoReview'],
  ['inviteReviewers', 'sourceInviteReviewers'],
  ['inviteReviewers', 'sourceInviteReviewersRu'],
  ['noInvites', 'sourceNoInvites'],
  ['clipsLabeled', 'sourceClipsLabeled'],
  ['logout', 'sourceLogout'],
  ['watchClipInstructions', 'sourceWatchClipInstructions'],
  ['xrayActive', 'sourceXrayActive'],
  ['verdictTrainingNotice', 'sourceVerdictTrainingNotice'],
  ['uncertainNotice', 'sourceUncertainNotice'],
  ['clipSelectionNotice', 'sourceClipSelectionNotice'],
  ['questionAimAssist', 'sourceQuestionAimAssist'],
  ['questionWallHack', 'sourceQuestionWallHack'],
  ['questionAutoBhop', 'sourceQuestionAutoBhop'],
  ['questionBot', 'sourceQuestionBot'],
  ['labelAimAssist', 'sourceLabelAimAssist'],
  ['labelWallHack', 'sourceLabelWallHack'],
  ['labelAutoBhop', 'sourceLabelAutoBhop'],
  ['labelBot', 'sourceLabelBot'],
  ['btnUncertain', 'sourceBtnUncertain'],
  ['btnProceed', 'sourceBtnProceed'],
  ['btnBack', 'sourceBtnBack'],
  ['btnConfirm', 'sourceBtnConfirm'],
  ['statusSubmitting', 'sourceStatusSubmitting'],
  ['statusPleaseWait', 'sourceStatusPleaseWait'],
  ['btnSendFeedback', 'sourceBtnSendFeedback'],
  ['btnReportBadClip', 'sourceBtnReportBadClip'],
  ['clipDetails', 'sourceClipDetails'],
  ['taskId', 'sourceTaskId'],
  ['app', 'sourceApp'],
  ['none', 'sourceNone'],
  ['devMetricsTitle', 'sourceDevMetricsTitle'],
];

const createTranslations = (catalog: MessageCatalog): ReadonlyMap<string, string> => {
  const translations = new Map<string, string>();
  for (const [targetKey, sourceKey] of translatedKeys) {
    const source = catalog[sourceKey];
    const target = catalog[targetKey];
    if (source === target) continue;
    const existing = translations.get(source);
    if (existing && existing !== target) {
      throw new Error(getMessage("errConflictingTranslation", source));
    }
    translations.set(source, target);
  }
  return translations;
};

const ignoredSelector = 'script, style, textarea, input, vacnet-extension-ui';
const translatedAttributes = ['title', 'aria-label'] as const;

class TextMutator {
  constructor(private readonly translations: ReadonlyMap<string, string>) {}

  get isActive(): boolean { return this.translations.size > 0; }

  translate(container: Node): void {
    if (container === document.documentElement) this.translateTitle();
    if (container.nodeType === Node.TEXT_NODE) {
      this.translateText(container);
      return;
    }
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      this.translateText(node);
      node = walker.nextNode();
    }
    if (container instanceof Element) this.translateElementTree(container);
  }

  private translateTitle(): void {
    const translated = this.translations.get(document.title);
    if (translated) document.title = translated;
  }

  private translateText(node: Node): void {
    const parent = node.parentElement;
    if (!parent || parent.closest(ignoredSelector)) return;
    const value = node.nodeValue ?? '';
    const translated = this.translations.get(value.trim());
    if (!translated) return;
    const nextValue = `${value.match(/^\s*/u)?.[0] ?? ''}${translated}${value.match(/\s*$/u)?.[0] ?? ''}`;
    if (nextValue !== value) node.nodeValue = nextValue;
  }

  private translateElementTree(container: Element): void {
    this.translateAttributes(container);
    for (const element of container.querySelectorAll<HTMLElement>('[title], [aria-label]')) {
      this.translateAttributes(element);
    }
  }

  private translateAttributes(element: Element): void {
    for (const attribute of translatedAttributes) {
      const source = element.getAttribute(attribute);
      const translated = source ? this.translations.get(source) : undefined;
      if (translated && translated !== source) element.setAttribute(attribute, translated);
    }
  }
}

class DomObserver {
  private readonly roots = new Set<Node>();
  private observer: MutationObserver | null = null;
  private frameId: number | null = null;

  constructor(private readonly onChange: (root: Node) => void) {}

  start(): void {
    if (this.observer) return;
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => this.addRoot(node));
        } else {
          this.addRoot(mutation.target);
        }
      }
      this.schedule();
    });
    this.observer.observe(document, {
      attributeFilter: ['aria-label', 'title'],
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.roots.clear();
    if (this.frameId !== null) window.cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private addRoot(root: Node): void {
    if (!root.isConnected) return;
    for (const existing of this.roots) {
      if (existing === root || existing.contains(root)) return;
      if (root.contains(existing)) this.roots.delete(existing);
    }
    this.roots.add(root);
  }

  private schedule(): void {
    if (this.frameId !== null) return;
    this.frameId = window.requestAnimationFrame(() => {
      this.frameId = null;
      const roots = Array.from(this.roots);
      this.roots.clear();
      for (const root of roots) {
        if (root.isConnected) this.onChange(root);
      }
    });
  }
}

export class DomLocalizer {
  private readonly mutator: TextMutator;
  private readonly observer: DomObserver;
  private isStarted = false;

  constructor(catalog: MessageCatalog) {
    this.mutator = new TextMutator(createTranslations(catalog));
    this.observer = new DomObserver((root) => this.mutator.translate(root));
  }

  start(): void {
    if (this.isStarted || !this.mutator.isActive) return;
    this.isStarted = true;
    this.observer.start();
    this.mutator.translate(document.documentElement);
  }

  stop(): void {
    if (!this.isStarted) return;
    this.isStarted = false;
    this.observer.stop();
  }
}
