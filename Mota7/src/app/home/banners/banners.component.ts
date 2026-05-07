import {
  Component,
  OnInit,
  inject,
  CUSTOM_ELEMENTS_SCHEMA,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  logoWhatsapp,
  closeOutline,
  megaphoneOutline,
  colorPaletteOutline,
  rocketOutline,
} from 'ionicons/icons';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  query,
  where,
} from '@angular/fire/firestore';
import { map, catchError, shareReplay, startWith } from 'rxjs/operators';
import { Observable, of, combineLatest, interval } from 'rxjs';
import { register } from 'swiper/element/bundle';
import { openWhatsappNative } from '../../core/utils/whatsapp-open.util';
import { normalizeSubscriptionsConfig } from '../../core/models/subscriptions-config.model';

register();

@Component({
  selector: 'app-banners',
  templateUrl: './banners.component.html',
  styleUrls: ['./banners.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class BannersComponent implements OnInit {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private modalCtrl = inject(ModalController);

  activeBanners$!: Observable<any[] | null>;

  bannerDisplayPrice = 50;
  bannerDesignPrice = 50;
  showBannerModal = false;

  private readonly WHATSAPP_NUMBER = '01220883999';

  constructor() {
    addIcons({
      'logo-whatsapp': logoWhatsapp,
      'close-outline': closeOutline,
      'megaphone-outline': megaphoneOutline,
      'color-palette-outline': colorPaletteOutline,
      'rocket-outline': rocketOutline,
    });
  }

  ngOnInit() {
    void this.loadBannerPrices();
    runInInjectionContext(this.injector, () => {
      const bannersRef = collection(this.firestore, 'banners');
      const q = query(bannersRef, where('status', '==', 'active'));
      const activeList$ = collectionData(q, { idField: 'id' }).pipe(
        map((banners) =>
          banners.filter((banner) => this.isCurrentlyActive(banner))
        ),
        catchError((err) => {
          console.error('Failed to load banners from Firestore:', err);
          return of([] as any[]);
        }),
        shareReplay(1)
      );
      const hourlyResort$ = interval(60_000).pipe(startWith(0));

      this.activeBanners$ = combineLatest([activeList$, hourlyResort$]).pipe(
        map(([banners]) => {
          const sorted = this.sortBannersForDisplay([...banners]);
          return sorted.length ? sorted : null;
        }),
        catchError((err) => {
          console.error('Failed to load banners from Firestore:', err);
          return of(null);
        })
      );
    });
  }

  trackByFn(index: number, item: any) {
    return item.id || index;
  }

  private sortBannersForDisplay(banners: any[]): any[] {
    const hourSlot = Math.floor(Date.now() / (60 * 60 * 1000));
    const displayRank = (x: any): number | null =>
      typeof x.displayOrder === 'number' &&
      Number.isFinite(x.displayOrder) &&
      x.displayOrder >= 1 &&
      x.displayOrder <= 100
        ? Math.floor(x.displayOrder)
        : null;

    const ranked: any[] = [];
    const unranked: any[] = [];
    for (const b of banners) {
      if (displayRank(b) != null) {
        ranked.push(b);
      } else {
        unranked.push(b);
      }
    }

    ranked.sort((a, b) => {
      const ra = displayRank(a)!;
      const rb = displayRank(b)!;
      if (ra !== rb) return ra - rb;
      return this.bannerCreatedMillis(b) - this.bannerCreatedMillis(a);
    });

    unranked.sort(
      (a, b) =>
        this.hourlyShuffleScore(hourSlot, String(a?.id ?? '')) -
        this.hourlyShuffleScore(hourSlot, String(b?.id ?? ''))
    );

    return [...ranked, ...unranked];
  }

  private hourlyShuffleScore(hourSlot: number, bannerId: string): number {
    const s = `${hourSlot}:${bannerId}`;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  private bannerCreatedMillis(b: any): number {
    const ts = b?.createdAt;
    if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
    if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
    return 0;
  }

  isCurrentlyActive(banner: any): boolean {
    if (!banner.startDate || !banner.endDate) return true;
    const now = new Date();
    const start = new Date(banner.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(banner.endDate);
    end.setHours(23, 59, 59, 999);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return true;
    return now >= start && now <= end;
  }

  private async loadBannerPrices(): Promise<void> {
    try {
      const snap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'subscriptions', 'config'))
      );
      if (!snap.exists()) return;
      const cfg = normalizeSubscriptionsConfig(
        snap.data() as Record<string, unknown>
      );
      this.bannerDisplayPrice = cfg.banner_display_price ?? 50;
      this.bannerDesignPrice = cfg.banner_design_price ?? 50;
    } catch (e) {
      console.error('banner prices load error', e);
    }
  }

  openAdRequest() {
    this.showBannerModal = true;
  }

  closeBannerModal() {
    this.showBannerModal = false;
  }

  requestBannerDisplay() {
    openWhatsappNative(
      this.WHATSAPP_NUMBER,
      'السلام عليكم.. محتاج أرفع إعلاني بالمساحة الإعلانية على تطبيق "مُتاح"'
    );
    setTimeout(() => this.closeBannerModal(), 400);
  }

  requestBannerDesign() {
    openWhatsappNative(
      this.WHATSAPP_NUMBER,
      'السلام عليكم.. محتاج أصمم بانر إعلاني وأرفعه بالمساحة الإعلانية على تطبيق "مُتاح"'
    );
    setTimeout(() => this.closeBannerModal(), 400);
  }

  handleBannerClick(banner: any) {
    if (banner.link) {
      window.open(banner.link, '_blank');
    } else {
      this.openAdRequest();
    }
  }
}
