import { Component, OnDestroy, OnInit, ViewChildren, QueryList, inject, Injector, runInInjectionContext } from '@angular/core';
import { IonicModule, AlertController, ToastController, IonItemSliding } from '@ionic/angular';
import { CommonModule, registerLocaleData, Location } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { FormsModule } from '@angular/forms';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  onSnapshot,
  deleteDoc,
} from '@angular/fire/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { CloudinaryCleanupService } from '../../services/cloudinary-cleanup.service';
import { collectCloudinaryPublicIdsFromAd } from '../../core/utils/cloudinary-public-id.util';
import { addIcons } from 'ionicons';
import { 
  searchOutline, callOutline, logoWhatsapp, 
  statsChartOutline, eyeOutline, megaphoneOutline,
  trashOutline, calendarOutline 
} from 'ionicons/icons';

import { DELIVERY_CATEGORY } from '../../core/constants/delivery-data';
import { EDUCATION_CATEGORY } from '../../core/constants/educational-data';
import { OTHER_SERVICES_DATA } from '../../core/constants/other-services-data';

registerLocaleData(localeAr);

@Component({
  selector: 'app-click-btn',
  templateUrl: './click_btn.html',
  styleUrls: ['./click_btn.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, Mota7HeaderComponent]
})
export class ClickBtnPage implements OnInit, OnDestroy {
  @ViewChildren(IonItemSliding) private itemSlidings!: QueryList<IonItemSliding>;

  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private location = inject(Location);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private cloudinaryCleanup = inject(CloudinaryCleanupService);

  /** صفوف العرض المشتقة من ads (بدون أعداد اليوم — تُحدَّث من daily_logs) */
  private adBaseById = new Map<string, any>();
  /** نقرات اتصال/واتساب للفترة المعروضة: daily_stats/{date}/ads_logs/{adId} */
  private dailyClicksByAdId = new Map<string, { calls: number; whatsapp: number }>();

  private adsUnsub: Unsubscribe | undefined;
  private dailyUnsub: Unsubscribe | undefined;

  allAdsStats: any[] = [];
  filteredAds: any[] = [];
  searchQuery: string = '';

  /** `single` = يوم واحد (تحديث مباشر)، `range` = مجموع من تاريخ إلى تاريخ */
  dateFilterMode: 'single' | 'range' = 'single';
  selectedDate: string = '';
  rangeFrom: string = '';
  rangeTo: string = '';
  /** وصف الفترة للواجهة (مثلاً: 2026-03-01 أو من … إلى …) */
  periodLabel: string = '';

  totalCalls: number = 0;
  totalWhatsapp: number = 0;

  /** أقصى عدد أيام للفترة لتقليل طلبات Firestore */
  private static readonly MAX_RANGE_DAYS = 366;

  constructor() {
    addIcons({
      searchOutline, callOutline, logoWhatsapp,
      statsChartOutline, eyeOutline, megaphoneOutline,
      trashOutline, calendarOutline
    });

    const today = this.localCalendarDateKey();
    this.selectedDate = today;
    this.rangeFrom = today;
    this.rangeTo = today;
    this.periodLabel = today;
  }

  ngOnInit() {
    this.loadAdsAnalytics();
  }

  ngOnDestroy() {
    this.adsUnsub?.();
    this.dailyUnsub?.();
  }

  /**
   * نفس منطق التطبيق (Mota7): YYYY-MM-DD حسب التقويم المحلي للجهاز.
   */
  private localCalendarDateKey(d: Date = new Date()): string {
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  }

  loadAdsAnalytics() {
    runInInjectionContext(this.injector, () => {
      this.adsUnsub?.();
      const adsRef = collection(this.firestore, 'ads');
      this.adsUnsub = onSnapshot(adsRef, (snapshot) => {
        this.adBaseById.clear();
        snapshot.docs.forEach((docSnap) => {
          const row = this.buildAdDisplayRow(docSnap.id, docSnap.data() as any);
          this.adBaseById.set(docSnap.id, row);
        });
        this.mergeDailyIntoAdsAndPublish();
      });

      this.applyDateFilterMode();
    });
  }

  private buildAdDisplayRow(adId: string, ad: any) {
    const details = ad['details'] || {};
    const adType = ad['ad_type'];

    let displayTitle = '';
    let displayOwnerInfo = '';

    switch (adType) {
      case 'delivery': {
        const deliveryCat = DELIVERY_CATEGORY.items.find((i) => i.id === ad.category_id);
        displayTitle = `توصيل: ${deliveryCat ? deliveryCat.nameAr : 'خدمة نقل'}`;
        displayOwnerInfo = `${details.driver_name || ad.owner_name || 'غير مسجل'}`;
        break;
      }
      case 'education': {
        const eduCat = EDUCATION_CATEGORY.items.find((i) => i.id === ad.category_id);
        displayTitle = `تعليم: ${details.subject || 'مادة'} (${eduCat ? eduCat.nameAr : 'مرحلة'})`;
        displayOwnerInfo = `${details.teacher_name || ad.owner_name || 'غير مسجل'}`;
        break;
      }
      case 'other': {
        const otherCat = OTHER_SERVICES_DATA.items.find((i) => i.id === ad.category_id);
        displayTitle = `خدمة: ${otherCat ? otherCat.nameAr : 'خدمات أخرى'}`;
        displayOwnerInfo = `${details.provider_name || ad.owner_name || 'غير مسجل'}`;
        break;
      }
      case 'product':
        displayTitle = `منتج: ${details.short_desc || ad.title || 'بدون عنوان'}`;
        displayOwnerInfo = `${ad.owner_name || 'غير مسجل'}`;
        break;
      case 'store':
        displayTitle = `متجر: ${ad.store_name || details.store_name || 'بدون اسم'}`;
        displayOwnerInfo = `${ad.owner_name || 'غير مسجل'}`;
        break;
      default:
        displayTitle = ad.title || 'إعلان عام';
        displayOwnerInfo = `${ad.owner_name || 'غير مسجل'}`;
    }

    let displayImg = 'assets/mota7.png';
    if (ad.logo) displayImg = ad.logo;
    else if (details.images && details.images.length > 0) displayImg = details.images[0];
    else if (ad.image) displayImg = ad.image;

    return {
      ...ad,
      id: adId,
      title: displayTitle,
      owner: displayOwnerInfo,
      calls: 0,
      whatsapp: 0,
      image: displayImg,
    };
  }

  /** يُستدعى عند أول تحميل بعد اشتراك الإعلانات. */
  applyDateFilterMode(): void {
    if (this.dateFilterMode === 'single') {
      void this.subscribeDailyLogsForSelectedDate();
    } else {
      void this.loadRangeAggregation();
    }
  }

  onSegmentChange(ev: Event): void {
    const v = (ev as CustomEvent<{ value: string }>).detail?.value;
    if (v !== 'single' && v !== 'range') return;
    this.dateFilterMode = v;
    if (this.dateFilterMode === 'single') {
      void this.subscribeDailyLogsForSelectedDate();
    } else {
      if (!(this.rangeFrom || '').trim() || !(this.rangeTo || '').trim()) {
        const t = this.localCalendarDateKey();
        if (!this.rangeFrom) this.rangeFrom = t;
        if (!this.rangeTo) this.rangeTo = t;
      }
      void this.loadRangeAggregation();
    }
  }

  private subscribeDailyLogsForSelectedDate() {
    this.dailyUnsub?.();
    this.dailyUnsub = undefined;

    const dateKey = (this.selectedDate || '').trim();
    if (!dateKey) {
      this.dailyClicksByAdId.clear();
      this.periodLabel = '';
      this.mergeDailyIntoAdsAndPublish();
      return;
    }

    this.periodLabel = dateKey;

    runInInjectionContext(this.injector, () => {
      const logsRef = collection(this.firestore, 'daily_stats', dateKey, 'ads_logs');
      this.dailyUnsub = onSnapshot(logsRef, (snap) => {
        this.dailyClicksByAdId.clear();
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          this.dailyClicksByAdId.set(d.id, {
            calls: Number(data['calls'] ?? 0) || 0,
            whatsapp: Number(data['whatsapp'] ?? 0) || 0,
          });
        });
        this.mergeDailyIntoAdsAndPublish();
      });
    });
  }

  /**
   * يجمع نقرات كل يوم في [rangeFrom .. rangeTo] (شامل) من daily_stats.
   */
  private async loadRangeAggregation(): Promise<void> {
    this.dailyUnsub?.();
    this.dailyUnsub = undefined;

    const from = (this.rangeFrom || '').trim();
    const to = (this.rangeTo || '').trim();

    if (!from || !to) {
      this.dailyClicksByAdId.clear();
      this.periodLabel = '';
      this.mergeDailyIntoAdsAndPublish();
      return;
    }

    if (from > to) {
      const t = await this.toastCtrl.create({
        message: 'تاريخ «من» يجب أن يكون قبل أو يساوي «إلى»',
        duration: 2500,
        position: 'bottom',
        color: 'warning',
      });
      await t.present();
      return;
    }

    const dates = this.enumerateDateKeysInclusive(from, to);
    if (dates.length > ClickBtnPage.MAX_RANGE_DAYS) {
      const t = await this.toastCtrl.create({
        message: `الحد الأقصى للفترة ${ClickBtnPage.MAX_RANGE_DAYS} يوماً`,
        duration: 3000,
        position: 'bottom',
        color: 'warning',
      });
      await t.present();
      return;
    }

    this.periodLabel =
      from === to ? from : `من ${from} إلى ${to}`;

    const aggregated = new Map<string, { calls: number; whatsapp: number }>();

    try {
      await runInInjectionContext(this.injector, async () => {
        await Promise.all(
          dates.map(async (dayKey) => {
            const logsRef = collection(this.firestore, 'daily_stats', dayKey, 'ads_logs');
            const snap = await getDocs(logsRef);
            snap.forEach((d) => {
              const data = d.data() as Record<string, unknown>;
              const c = Number(data['calls'] ?? 0) || 0;
              const w = Number(data['whatsapp'] ?? 0) || 0;
              const prev = aggregated.get(d.id) ?? { calls: 0, whatsapp: 0 };
              aggregated.set(d.id, {
                calls: prev.calls + c,
                whatsapp: prev.whatsapp + w,
              });
            });
          })
        );
      });

      this.dailyClicksByAdId = aggregated;
      this.mergeDailyIntoAdsAndPublish();
    } catch (e) {
      console.error('loadRangeAggregation', e);
      const t = await this.toastCtrl.create({
        message: 'تعذر تحميل بيانات الفترة',
        duration: 2500,
        position: 'bottom',
        color: 'danger',
      });
      await t.present();
    }
  }

  /** YYYY-MM-DD inclusive، حسب التقويم المحلي (بدون إضافة 24 ساعة خام). */
  private enumerateDateKeysInclusive(from: string, to: string): string[] {
    const out: string[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return out;
    let cur = from;
    let guard = 0;
    while (cur <= to && guard++ < ClickBtnPage.MAX_RANGE_DAYS + 1) {
      out.push(cur);
      if (cur === to) break;
      cur = this.addOneCalendarDayKey(cur);
    }
    return out;
  }

  private addOneCalendarDayKey(ymd: string): string {
    const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
    const next = new Date(y, m - 1, d);
    next.setDate(next.getDate() + 1);
    return this.localCalendarDateKey(next);
  }

  private mergeDailyIntoAdsAndPublish() {
    this.totalCalls = 0;
    this.totalWhatsapp = 0;

    this.allAdsStats = [];
    this.adBaseById.forEach((base, id) => {
      const day = this.dailyClicksByAdId.get(id) ?? { calls: 0, whatsapp: 0 };
      this.totalCalls += day.calls;
      this.totalWhatsapp += day.whatsapp;
      this.allAdsStats.push({
        ...base,
        calls: day.calls,
        whatsapp: day.whatsapp,
      });
    });

    this.allAdsStats.sort(
      (a, b) => b.calls + b.whatsapp - (a.calls + a.whatsapp)
    );
    this.filterAds();
  }

  onSingleDateChange() {
    if (this.dateFilterMode !== 'single') return;
    void this.subscribeDailyLogsForSelectedDate();
  }

  onRangeDateChange() {
    if (this.dateFilterMode !== 'range') return;
    void this.loadRangeAggregation();
  }

  closeOpenSlidings(ev: Event): void {
    const t = ev.target as HTMLElement | undefined;
    if (t?.closest?.('ion-item-option')) return;
    this.itemSlidings?.forEach((s) => void s.close());
  }

  async confirmDelete(ad: any, sliding?: IonItemSliding) {
    await sliding?.close();
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف',
      message: `هل أنت متأكد من حذف إعلان "${ad.title}"؟`,
      cssClass: 'mota7-alert',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        { 
          text: 'حذف', 
          role: 'destructive',
          handler: async () => {
            try {
              const ids = collectCloudinaryPublicIdsFromAd(ad as Record<string, unknown>);
              if (ids.length) {
                await this.cloudinaryCleanup.deletePublicIds(ids).catch(() => {});
              }
              await runInInjectionContext(this.injector, () =>
                deleteDoc(doc(this.firestore, 'ads', ad.id))
              );
              const toast = await this.toastCtrl.create({
                message: 'تم الحذف بنجاح',
                duration: 2000,
                color: 'success'
              });
              toast.present();
            } catch (e) {
              console.error('Delete error:', e);
            }
          }
        }
      ]
    });
    await alert.present();
  }

  filterAds() {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredAds = [...this.allAdsStats];
    } else {
      this.filteredAds = this.allAdsStats.filter(ad => 
        ad.title.toLowerCase().includes(query) || 
        ad.owner.toLowerCase().includes(query)
      );
    }
  }

  handleImgError(event: any) {
    event.target.src = 'assets/mota7.png';
  }

  goBack() {
    this.location.back();
  }
}