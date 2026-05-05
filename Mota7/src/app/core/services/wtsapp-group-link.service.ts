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
  'https://chat.whatsapp.com/KXmQ3xlt6h26w7qgtSqldR';

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
   * فتح رابط مجموعة واتساب (HTTPS) — يعمل على الويب والأصلي دون إعادة بناء التطبيق
   * عند تغيير الحقل link في Firestore.
   */
  openServiceGroupInvite(): void {
    const url = this.inviteUrl;
    if (!url) {
      return;
    }
    if (Capacitor.isNativePlatform()) {
      void AppLauncher.openUrl({ url }).catch(() => {
        window.open(url, '_system');
      });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
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
