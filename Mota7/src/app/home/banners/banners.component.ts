import { Component, OnInit, inject, CUSTOM_ELEMENTS_SCHEMA, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ActionSheetController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logoWhatsapp, closeOutline, colorPaletteOutline, imageOutline } from 'ionicons/icons';
import { Firestore, collection, collectionData, query, where } from '@angular/fire/firestore';
import { map, catchError, shareReplay, startWith } from 'rxjs/operators';
import { Observable, of, combineLatest, interval } from 'rxjs';
import { register } from 'swiper/element/bundle';

register();

@Component({
  selector: 'app-banners',
  templateUrl: './banners.component.html',
  styleUrls: ['./banners.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class BannersComponent implements OnInit {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private actionSheetCtrl = inject(ActionSheetController);

  activeBanners$!: Observable<any[] | null>;

  /** يمنع فتح أكثر من Action Sheet فوق بعض (تكرار «إلغاء») */
  private adRequestSheetOpen = false;

  // بيانات التواصل
  private readonly WHATSAPP_NUMBER = '201220883999';

  constructor() {
    addIcons({
      'logo-whatsapp': logoWhatsapp,
      'close-outline': closeOutline,
      'color-palette-outline': colorPaletteOutline,
      'image-outline': imageOutline
    });
  }

  ngOnInit() {
    runInInjectionContext(this.injector, () => {
      const bannersRef = collection(this.firestore, 'banners');
      const q = query(bannersRef, where('status', '==', 'active'));
      const activeList$ = collectionData(q, { idField: 'id' }).pipe(
        map((banners) => banners.filter((banner) => this.isCurrentlyActive(banner))),
        catchError((err) => {
          console.error('Failed to load banners from Firestore:', err);
          return of([] as any[]);
        }),
        shareReplay(1)
      );
      /** كل دقيقة: إعادة فرز غير المرقّمين عند تغيّر فتحة الساعة دون انتظار Firestore */
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

  // --- التعديل الإضافي لضمان أداء السلايدر مع الصور الكثيرة ---
  trackByFn(index: number, item: any) {
    return item.id || index;
  }

  /**
   * أولاً: بانرات بـ displayOrder بين 1–100 حسب الرقم (الأصغر أولاً).
   * ثانياً: غير المرقّمين بترتيب شبه عشوائي يتغيّر كل ساعة (ليست أحدث إضافة أولاً).
   */
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
      if (ra !== rb) {
        return ra - rb;
      }
      return this.bannerCreatedMillis(b) - this.bannerCreatedMillis(a);
    });

    unranked.sort(
      (a, b) =>
        this.hourlyShuffleScore(hourSlot, String(a?.id ?? '')) -
        this.hourlyShuffleScore(hourSlot, String(b?.id ?? ''))
    );

    return [...ranked, ...unranked];
  }

  /** FNV-1a على (فتحة الساعة + id) — نفس الترتيب لكل الأجهزة في نفس الساعة */
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
  
    const now = new Date(); // الوقت الحالي الفعلي بالثواني
  
    const start = new Date(banner.startDate);
    start.setHours(0, 0, 0, 0); // بداية يوم البدء
  
    const end = new Date(banner.endDate);
    end.setHours(23, 59, 59, 999); // نهاية يوم الانتهاء (حتى آخر لحظة في اليوم)
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return true;
  
    // التحقق: هل الوقت الآن يقع بين بداية يوم البدء ونهاية يوم الانتهاء
    return now >= start && now <= end;
  }
    
  async openAdRequest() {
    if (this.adRequestSheetOpen) {
      return;
    }
    this.adRequestSheetOpen = true;
    const actionSheet = await this.actionSheetCtrl.create({
      header: '"مساحتك الإعلانية على "مُتاح',
      subHeader: 'اختر الخدمة المطلوبة لبدء إعلانك',
      mode: 'ios',
      cssClass: 'mota7-premium-sheet',
      backdropDismiss: true,
      buttons: [
        {
          text: 'إرسال تصميم الإعلان',
          icon: 'image-outline',
          handler: () => { 
            const msg = encodeURIComponent('السلام عليكم.. محتاج أرفع إعلاني بالمساحة الإعلانية على تطبيق "مُتاح"');
            window.open(`whatsapp://send?phone=${this.WHATSAPP_NUMBER}&text=${msg}`, '_system');
          }
        },
        {
          text: 'طلب خدمة تصميم إعلاني',
          icon: 'color-palette-outline',
          handler: () => { 
            const msg = encodeURIComponent('السلام عليكم.. محتاج أصمم بانر إعلاني وأرفعه بالمساحة الإعلانية على تطبيق "مُتاح"');
            window.open(`whatsapp://send?phone=${this.WHATSAPP_NUMBER}&text=${msg}`, '_system');
          }
        },
        { 
          text: 'إلغاء', 
          role: 'cancel',
          icon: 'close-outline'
        }
      ]
    });
    void actionSheet.onDidDismiss().then(() => {
      this.adRequestSheetOpen = false;
    });
    await actionSheet.present();
  }

  handleBannerClick(banner: any) {
    if (banner.link) {
      window.open(banner.link, '_blank');
    } else {
      this.openAdRequest();
    }
  }
}