import { Injectable, NgZone, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { Firestore, collection } from '@angular/fire/firestore';
import { onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { normalizeAdTypeValue } from '../utils/duplicate-ad.util';
import { FirestoreCacheService } from './firestore-cache.service';
import { computeHighWaterMsFromAds, createdAtMsForSort } from '../utils/ad-sync-ms.util';

/**
 * استماع لحظي لمجموعة `ads` حسب النوع المنطقي (مع دعم القيم القديمة other_services / stores…).
 * كل تغيير على السحابة (إضافة / تعديل / حذف) يعكس فوراً على الكاش المحلي والواجهة.
 */
@Injectable({ providedIn: 'root' })
export class HomeAdsRealtimeService {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private fCache = inject(FirestoreCacheService);
  private ngZone = inject(NgZone);

  private unsub: Unsubscribe | undefined;
  private activeLogicalType: string | null = null;

  /** إيقاف الاستماع (مثلاً عند الخروج من القسم أو مغادرة الرئيسية). */
  stop(): void {
    if (this.unsub) {
      this.unsub();
      this.unsub = undefined;
    }
    this.activeLogicalType = null;
  }

  /** نوع Firestore كما في home.page */
  private variantsForLogical(logical: string): string[] {
    switch (logical) {
      case 'other':
        return ['other', 'other_services'];
      case 'store':
        return ['store', 'stores', 'shop'];
      default:
        return [logical];
    }
  }

  /**
   * @param logicalType delivery | education | other | product | store
   * @param onUpdate قائمة خام مدمجة بعد كل snapshot (تعكس الحذف بتقلص القائمة)
   */
  start(
    logicalType: string,
    onUpdate: (ads: any[]) => void,
    onError?: (err: unknown) => void
  ): void {
    if (this.activeLogicalType === logicalType && this.unsub) {
      return;
    }
    this.stop();
    this.activeLogicalType = logicalType;

    const variants = this.variantsForLogical(logicalType);
    runInInjectionContext(this.injector, () => {
      const adsRef = collection(this.firestore, 'ads');
      const q = query(adsRef, where('ad_type', 'in', variants));

      this.unsub = onSnapshot(
        q,
        (snapshot) => {
          const byId = new Map<string, any>();
          for (const d of snapshot.docs) {
            const row = Object.assign({ id: d.id }, d.data() || {}) as Record<string, unknown>;
            row['ad_type'] = normalizeAdTypeValue(row['ad_type']);
            byId.set(d.id, row);
          }
          const sorted = Array.from(byId.values()).sort(
            (a, b) => createdAtMsForSort(b) - createdAtMsForSort(a)
          );

          const cacheKey = FirestoreCacheService.adsListCacheKey(logicalType);
          this.fCache.set(cacheKey, sorted);

          const hw = computeHighWaterMsFromAds(sorted);
          const prev = this.fCache.getHomeAdsSyncMeta(logicalType);
          this.fCache.setHomeAdsSyncMeta(logicalType, {
            highWaterMs: hw,
            lastFullSyncMs: prev?.lastFullSyncMs ?? Date.now(),
          });

          this.ngZone.run(() => onUpdate(sorted));
        },
        (err) => {
          console.error('[HomeAdsRealtime]', logicalType, err);
          if (onError) {
            this.ngZone.run(() => onError(err));
          }
        }
      );
    });
  }
}
