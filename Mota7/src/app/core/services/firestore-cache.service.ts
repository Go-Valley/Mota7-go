import { Injectable } from '@angular/core';

interface CacheEntry<T> {
  data: T;
  ts: number;
}

/** ميتا مزامنة قائمة إعلانات الرئيسية (حد أعلى لـ updated_at + آخر مزامنة كاملة) */
export interface HomeAdsSyncMeta {
  highWaterMs: number;
  lastFullSyncMs: number;
}

@Injectable({ providedIn: 'root' })
export class FirestoreCacheService {

  private static readonly PREFIX = 'mota7_cache_';

  /** مفتاح نسبي (يُسبق بـ PREFIX داخل get/set/remove) */
  private static readonly ADS_SYNC_META_PREFIX = 'ads_sync_meta_';

  static readonly KEYS = {
    TAXONOMY_BUNDLE: 'taxonomy_bundle',
    ADS_PREFIX: 'ads_',
    CATEGORIES_HOME: 'categories_home',
    STORE_PREFIX: 'store_',
    BANNERS: 'banners',
  } as const;

  static readonly TTL = {
    TAXONOMY: 24 * 60 * 60 * 1000,
    ADS_LIST: 30 * 60 * 1000,
    CATEGORIES: 24 * 60 * 60 * 1000,
    STORE: 60 * 60 * 1000,
    BANNERS: 60 * 60 * 1000,
  } as const;

  /** مدة "الطزاجة" — إذا الكاش أحدث من هذا لا نجلب من الشبكة أصلاً */
  static readonly FRESH_TTL = {
    ADS_LIST: 5 * 60 * 1000,      // 5 دقائق
    CATEGORIES: 10 * 60 * 1000,  // 10 دقائق
    STORE: 5 * 60 * 1000,        // 5 دقائق
    TAXONOMY: 10 * 60 * 1000,    // 10 دقائق
  } as const;

  set<T>(key: string, data: T): void {
    try {
      const entry: CacheEntry<T> = { data, ts: Date.now() };
      localStorage.setItem(
        FirestoreCacheService.PREFIX + key,
        JSON.stringify(entry),
      );
    } catch { /* quota exceeded or SSR – silently ignore */ }
  }

  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(FirestoreCacheService.PREFIX + key);
      if (!raw) return null;
      const entry: CacheEntry<T> = JSON.parse(raw);
      return entry.data;
    } catch {
      return null;
    }
  }

  getTimestamp(key: string): number | null {
    try {
      const raw = localStorage.getItem(FirestoreCacheService.PREFIX + key);
      if (!raw) return null;
      const entry: CacheEntry<unknown> = JSON.parse(raw);
      return entry.ts;
    } catch {
      return null;
    }
  }

  isFresh(key: string, maxAgeMs: number): boolean {
    const ts = this.getTimestamp(key);
    if (ts === null) return false;
    return Date.now() - ts < maxAgeMs;
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(FirestoreCacheService.PREFIX + key);
    } catch { /* ignore */ }
  }

  /** مسح كل مفاتيح الكاش التي تبدأ بالبادئة (بدون PREFIX الداخلي؛ يُضاف تلقائياً) */
  invalidatePrefix(keyPrefixRelative: string): void {
    const fullPrefix = FirestoreCacheService.PREFIX + keyPrefixRelative;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(fullPrefix)) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  }

  /** مفتاح قائمة إعلانات نوع منطقي: delivery | education | other | product | store */
  static adsListCacheKey(adType: string): string {
    return `${FirestoreCacheService.KEYS.ADS_PREFIX}${adType}`;
  }

  getHomeAdsSyncMeta(adType: string): HomeAdsSyncMeta | null {
    return this.get<HomeAdsSyncMeta>(FirestoreCacheService.ADS_SYNC_META_PREFIX + adType);
  }

  setHomeAdsSyncMeta(adType: string, meta: HomeAdsSyncMeta): void {
    this.set(FirestoreCacheService.ADS_SYNC_META_PREFIX + adType, meta);
  }

  removeHomeAdsSyncMeta(adType: string): void {
    this.remove(FirestoreCacheService.ADS_SYNC_META_PREFIX + adType);
  }

  clearAll(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(FirestoreCacheService.PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
  }
}
