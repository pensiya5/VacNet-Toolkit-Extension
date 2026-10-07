import { defineContentScript } from 'wxt/utils/define-content-script';
import { MainWorldRuntime } from '../src/app/main-world-runtime.injector';
import { installValveTimerHijacker } from '../src/features/valve-interop/timer-hijacker.injector';
import { createMainMessageBus } from '../src/shared/message-bus.adapter';
import 'plyr/dist/plyr.css';
import '../src/features/theme/components/theme.css';
import '../src/features/valve-interop/components/valve-overrides.css';
import '../src/features/valve-interop/components/native-player.css';
import '../src/features/valve-interop/components/native-review.css';
import { startExtensionBoot } from '../src/app/extension-boot.service';

export default defineContentScript({
  matches: ['https://www.counter-strike.net/vacnet/clips*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    if (window.__vacnetMainWorldRuntime) return;

    const stopBoot = startExtensionBoot();
    const bus = createMainMessageBus();
    const timerHijacker = installValveTimerHijacker();
    const runtime = new MainWorldRuntime(bus, timerHijacker);
    let isDisposed = false;

    const dispose = (): void => {
      if (isDisposed) return;
      isDisposed = true;
      runtime.dispose();
      timerHijacker.dispose();
      bus.dispose();
      stopBoot();
      window.removeEventListener('pagehide', onPageHide);
      delete window.__vacnetMainWorldRuntime;
    };
    const onPageHide = (): void => {
      dispose();
    };

    window.__vacnetMainWorldRuntime = { dispose };
    window.addEventListener('pagehide', onPageHide);
    try {
      runtime.start();
    } catch (error) {
      dispose();
      throw error;
    }
  },
});
