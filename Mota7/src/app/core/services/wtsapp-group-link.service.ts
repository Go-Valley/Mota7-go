import {
  DestroyRef,
  EnvironmentInjector,
  Injectable,
  NgZone,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { Firestore, doc, onSnapshot } from '@angular/fire/firestore';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';

/** مسار Firestore: wtsapp_group / mota7 — الحقل link (رابط دعوة المجموعة) */
export const WTSAPP_GROUP_DOC_PATH = ['wtsapp_group', 'mota7'] as const;

/** احتياطي عند غياب المستند أو الحقل أو رابط غير صالح */
export const WTSAPP_GROUP_DEFAULT_LINK =
  'https://chat.whatsapp.com/J6pKHQuz5EUHrNWadzVS2p';

@Injectable({ providedIn: 'root' })
export class WtsappGroupLinkService {
  private readonly firestore = inject(Firestore);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(EnvironmentInjector);

  private inviteUrl = WTSAPP_GROUP_DEFAULT_LINK;

  constructor() {
    const unsub = runInInjectionContext(this.injector, () => {
      const docRef = doc(this.firestore, WTSAPP_GROUP_DOC_PATH[0], WTSAPP_GROUP_DOC_PATH[1]);
      return onSnapshot(
        docRef,
        (snap) => {
          const raw = snap.exists() ? snap.data()?.['link'] : undefined;
          const next = this.normalizeInviteUrl(raw) ?? WTSAPP_GROUP_DEFAULT_LINK;
          this.zone.run(() => {
            this.inviteUrl = next;
          });
        },
        (err) => {
          console.error('[wtsapp_group/mota7]', err);
        }
      );
    });
    this.destroyRef.onDestroy(() => unsub());
  }

  /** آخر رابط صالح من Firestore (أو الافتراضي) */
  getCurrentInviteUrl(): string {
    return this.inviteUrl;
  }

  /**
   * فتح دعوة مجموعة واتساب في التطبيق (وليس المتصفح) على الموبايل.
   * على الويب: نفس رابط HTTPS في تبويب جديد.
   */
  openServiceGroupInvite(): void {
    const url = this.inviteUrl?.trim();
    if (!url) {
      return;
    }
    if (!Capacitor.isNativePlatform()) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (Capacitor.getPlatform() === 'android') {
      void this.openGroupInviteOnAndroid(url);
      return;
    }
    this.openGroupInviteOnIos(url);
  }

  /** أندرويد: Intent يحدّد حزمة واتساب ليفتح التطبيق مباشرة */
  private async openGroupInviteOnAndroid(httpsUrl: string): Promise<void> {
    const packages = ['com.whatsapp', 'com.whatsapp.w4b'];
    for (const pkg of packages) {
      const intentUrl = this.buildAndroidWhatsappGroupIntent(httpsUrl, pkg);
      if (!intentUrl) {
        break;
      }
      try {
        const { value } = await AppLauncher.canOpenUrl({ url: intentUrl });
        if (value) {
          await AppLauncher.openUrl({ url: intentUrl });
          return;
        }
      } catch {
        /* جرّب الحزمة التالية */
      }
    }
    window.open(httpsUrl, '_system');
  }

  /** iOS: رابط chat.whatsapp.com كرابط عالمي — يفتح تطبيق واتساب عبر النظام */
  private openGroupInviteOnIos(httpsUrl: string): void {
    window.open(httpsUrl, '_system');
  }

  private buildAndroidWhatsappGroupIntent(
    httpsUrl: string,
    packageName: string
  ): string | null {
    try {
      const u = new URL(httpsUrl);
      if (!u.hostname.endsWith('whatsapp.com')) {
        return null;
      }
      const hostPath = `${u.host}${u.pathname}`;
      const fallback = encodeURIComponent(httpsUrl);
      return `intent://${hostPath}#Intent;scheme=https;package=${packageName};S.browser_fallback_url=${fallback};end`;
    } catch {
      return null;
    }
  }

  private normalizeInviteUrl(raw: unknown): string | null {
    if (typeof raw !== 'string') {
      return null;
    }
    const t = raw.trim();
    if (!t) {
      return null;
    }
    try {
      const u = new URL(t);
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        return u.toString();
      }
    } catch {
      /* ignore */
    }
    return null;
  }
}
