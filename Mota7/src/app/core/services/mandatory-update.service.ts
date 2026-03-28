import { Injectable, inject, signal, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import {
  RemoteConfig,
  fetchAndActivate,
  getBoolean,
  getNumber,
  getString,
} from '@angular/fire/remote-config';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { environment } from '../../../environments/environment';
import { MANDATORY_UPDATE_RC_KEYS } from '../constants/remote-config-keys';

const DEFAULT_TITLE_AR = 'تحديث مطلوب';
const DEFAULT_MESSAGE_AR =
  'يجب تحديث التطبيق إلى أحدث إصدار من Google Play لمتابعة الاستخدام والاستفادة من التحسينات والأمان.';

@Injectable({ providedIn: 'root' })
export class MandatoryUpdateService {
  private readonly injector = inject(EnvironmentInjector);
  private readonly firestore = inject(Firestore);
  private readonly remoteConfig = inject(RemoteConfig, { optional: true });

  /** true أثناء أول فحص أو إعادة فحص من شاشة الحجز */
  readonly loading = signal(true);
  /** يمنع استخدام التطبيق حتى التحديث */
  readonly blocked = signal(false);
  readonly titleAr = signal(DEFAULT_TITLE_AR);
  readonly messageAr = signal(DEFAULT_MESSAGE_AR);
  readonly storeUrl = signal(
    environment.playStoreUrl ||
      `https://play.google.com/store/apps/details?id=${environment.androidApplicationId}`
  );

  async runInitialCheck(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      this.loading.set(false);
      this.blocked.set(false);
      return;
    }
    await this.evaluateAndApplyState();
    this.loading.set(false);
  }

  /** بعد العودة من Play — دون إظهار شاشة التحميل */
  async recheckAfterResume(): Promise<void> {
    if (!Capacitor.isNativePlatform() || !this.blocked()) {
      return;
    }
    await this.evaluateAndApplyState();
  }

  /** زر «تحديث من Play» */
  async openPlayStore(): Promise<void> {
    const pkg = environment.androidApplicationId;
    const httpsUrl =
      this.storeUrl() ||
      `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}`;
    if (Capacitor.getPlatform() === 'android' && pkg) {
      const market = `market://details?id=${encodeURIComponent(pkg)}`;
      try {
        const can = await AppLauncher.canOpenUrl({ url: market });
        if (can.value) {
          await AppLauncher.openUrl({ url: market });
          return;
        }
      } catch {
        /* fall through */
      }
    }
    try {
      await AppLauncher.openUrl({ url: httpsUrl });
    } catch {
      window.open(httpsUrl, '_system');
    }
  }

  private async evaluateAndApplyState(): Promise<void> {
    let currentBuild = 0;
    try {
      const appInfo = await App.getInfo();
      const parsed = Number.parseInt(String(appInfo.build ?? ''), 10);
      currentBuild = Number.isFinite(parsed) ? parsed : 0;
    } catch {
      currentBuild = 0;
    }

    let minVersion = 0;
    let mandatoryEnabled = true;
    let titleAr = DEFAULT_TITLE_AR;
    let messageAr = DEFAULT_MESSAGE_AR;
    let storeUrl =
      environment.playStoreUrl ||
      `https://play.google.com/store/apps/details?id=${encodeURIComponent(environment.androidApplicationId)}`;

    const rc = this.remoteConfig;
    let usedRemoteConfig = false;

    if (rc) {
      rc.defaultConfig = {
        [MANDATORY_UPDATE_RC_KEYS.MIN_VERSION_CODE]: '0',
        [MANDATORY_UPDATE_RC_KEYS.MANDATORY_ENABLED]: 'true',
        [MANDATORY_UPDATE_RC_KEYS.TITLE_AR]: '',
        [MANDATORY_UPDATE_RC_KEYS.MESSAGE_AR]: '',
        [MANDATORY_UPDATE_RC_KEYS.PLAY_STORE_URL]: '',
      };

      try {
        await runInInjectionContext(this.injector, () => fetchAndActivate(rc));
        usedRemoteConfig = true;
        minVersion = getNumber(rc, MANDATORY_UPDATE_RC_KEYS.MIN_VERSION_CODE);
        mandatoryEnabled = getBoolean(rc, MANDATORY_UPDATE_RC_KEYS.MANDATORY_ENABLED);
        const t = getString(rc, MANDATORY_UPDATE_RC_KEYS.TITLE_AR).trim();
        const m = getString(rc, MANDATORY_UPDATE_RC_KEYS.MESSAGE_AR).trim();
        const u = getString(rc, MANDATORY_UPDATE_RC_KEYS.PLAY_STORE_URL).trim();
        if (t.length > 0) {
          titleAr = t;
        }
        if (m.length > 0) {
          messageAr = m;
        }
        if (u.length > 0) {
          storeUrl = u;
        }
      } catch (e) {
        console.warn('MandatoryUpdate: Remote Config fetch failed, trying Firestore', e);
        usedRemoteConfig = false;
      }
    }

    if (!usedRemoteConfig) {
      try {
        const snap = await runInInjectionContext(this.injector, () =>
          getDoc(doc(this.firestore, 'settings/app_config'))
        );
        if (snap.exists()) {
          const d = snap.data();
          const mv = d['min_version'];
          minVersion =
            typeof mv === 'number' && Number.isFinite(mv)
              ? mv
              : Number.parseInt(String(mv ?? '0'), 10) || 0;
          const u = d['update_url'];
          if (typeof u === 'string' && u.trim().length > 0) {
            storeUrl = u.trim();
          }
          const tt = d['update_title_ar'];
          const mm = d['update_message_ar'];
          if (typeof tt === 'string' && tt.trim().length > 0) {
            titleAr = tt.trim();
          }
          if (typeof mm === 'string' && mm.trim().length > 0) {
            messageAr = mm.trim();
          }
        }
      } catch (e) {
        console.warn('MandatoryUpdate: Firestore fallback failed', e);
      }
    }

    const minFloor = Number.isFinite(minVersion) ? Math.floor(minVersion) : 0;
    const shouldBlock =
      mandatoryEnabled && minFloor > 0 && currentBuild > 0 && currentBuild < minFloor;

    this.titleAr.set(titleAr);
    this.messageAr.set(messageAr);
    this.storeUrl.set(storeUrl);
    this.blocked.set(shouldBlock);
  }
}
