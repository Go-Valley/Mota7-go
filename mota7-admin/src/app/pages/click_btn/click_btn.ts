import { Component, OnDestroy, OnInit, ViewChildren, QueryList, inject, Injector, NgZone, runInInjectionContext, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  runTransaction,
} from '@angular/fire/firestore';
import type { QueryDocumentSnapshot, Unsubscribe } from 'firebase/firestore';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { addIcons } from 'ionicons';
import { 
  searchOutline, callOutline, logoWhatsapp, 
  statsChartOutline, eyeOutline, megaphoneOutline,
  trashOutline, calendarOutline 
} from 'ionicons/icons';

import { DELIVERY_CATEGORY } from '../../core/constants/delivery-data';
import { EDUCATION_CATEGORY } from '../../core/constants/educational-data';
import { AppTaxonomyService } from '@mota7-app/core/services/app-taxonomy.service';
import { resolveOtherCategoryNameAr } from '@mota7-app/core/utils/other-category-display.util';

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
  private ngZone = inject(NgZone);
  private location = inject(Location);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private taxonomy: AppTaxonomyService | null = null;
  private destroyRef = inject(DestroyRef);
  /**
   * نسخ ديناميكية من قوائم التصنيفات (Categories/{docId}) من Firestore.
   * تُستخدم لعرض الأسماء الصحيحة للفروع المضافة حديثاً، بدلاً من رسائل
   * افتراضية ("خدمات أخرى" / "خدمة نقل" / "مرحلة") عند تطابق الـ id.
   */
  private dynamicOtherItems: Array<{ id: string; nameAr: string }> = [];
  private dynamicDeliveryItems: Array<{ id: string; nameAr: string }> = [];
  private dynamicEducationItems: Array<{ id: string; nameAr: string }> = [];
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
    // نبدأ بجلب الإعلانات أولاً حتى لا يتأخر عرض الصفحة في حالة تأخر
    // Firestore في إطلاق أول استجابة للتصنيفات على Android WebView.
    // اشتراك taxonomy مُغلَّف داخل try/catch ليمنع فشل ngOnInit من تعطيل
    // الصفحة بأكملها (كان النقر على «إحداثيات النقر» يبدو بلا استجابة
    // لأن الصفحة كانت تُرمى قبل اكتمال التهيئة).
    this.loadAdsAnalytics();

    try {
      this.taxonomy = this.injector.get(AppTaxonomyService);
    } catch (err) {
      this.taxonomy = null;
      console.error('failed to resolve AppTaxonomyService in ClickBtnPage:', err);
    }

    if (!this.taxonomy) {
      return;
    }

    try {
      this.taxonomy.bundle$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (b) => {
            this.ngZone.run(() => this.applyTaxonomyBundle(b));
          },
          error: (err) => {
            // مستمع Firestore أخفق؛ نتابع بالقيم الافتراضية بدل تعطيل الصفحة
            console.error('taxonomy bundle$ error in ClickBtnPage:', err);
          },
        });
    } catch (err) {
      console.error('failed to subscribe to taxonomy bundle$:', err);
    }
  }

  private applyTaxonomyBundle(b: any): void {
    const toList = (arr: any[] | undefined) =>
      (arr ?? [])
        .filter((i: any) => i?.id && i?.nameAr)
        .map((i: any) => ({ id: String(i.id), nameAr: String(i.nameAr) }));
    this.dynamicOtherItems = toList(b?.otherItems);
    this.dynamicDeliveryItems = toList(b?.deliveryItems);
    this.dynamicEducationItems = toList(b?.educationItems);

    // إعادة بناء العناوين للإعلانات المُحمَّلة بالفعل بناءً على القائمة الجديدة
    if (this.adBaseById.size > 0) {
      const refreshed = new Map<string, any>();
      this.adBaseById.forEach((row, id) => {
        refreshed.set(id, this.buildAdDisplayRow(id, row));
      });
      this.adBaseById = refreshed;
      this.mergeDailyIntoAdsAndPublish();
    }
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

  /**
   * يدمج مستند ads_logs في الخريطة تحت `doc.id` وتحت `ad_id` إن وُجد ومختلفًا.
   * التطبيق يكتب بـ docId = معرّف الإعلان (انظر commitAdContactClickFirestore في Mota7)؛
   * السجلات القديمة قد تستخدم id مستند خاطئًا مع حقل ad_id صحيح.
   */
  private addAdsLogDocToClickMap(
    docSnap: QueryDocumentSnapshot,
    target: Map<string, { calls: number; whatsapp: number }>
  ): void {
    const data = docSnap.data() as Record<string, unknown>;
    const calls = Number(data['calls'] ?? 0) || 0;
    const whatsapp = Number(data['whatsapp'] ?? 0) || 0;
    const merge = (key: string) => {
      const prev = target.get(key) ?? { calls: 0, whatsapp: 0 };
      target.set(key, {
        calls: prev.calls + calls,
        whatsapp: prev.whatsapp + whatsapp,
      });
    };
    merge(docSnap.id);
    const aid = data['ad_id'];
    if (aid != null && String(aid).trim() !== '' && String(aid) !== docSnap.id) {
      merge(String(aid));
    }
  }

  loadAdsAnalytics() {
    runInInjectionContext(this.injector, () => {
      this.adsUnsub?.();
      const adsRef = collection(this.firestore, 'ads');
      /**
       * NgZone.run() ضروري على Android WebView: Capacitor أحياناً يشغّل callback
       * الخاص بـ onSnapshot خارج Zone.js فلا يسري Change Detection وتبقى القائمة فارغة
       * رغم وصول البيانات (يعمل على الويب لكن لا يظهر على الـ APK).
       */
      this.adsUnsub = onSnapshot(adsRef, (snapshot) => {
        this.ngZone.run(() => {
          this.adBaseById.clear();
          snapshot.docs.forEach((docSnap) => {
            const row = this.buildAdDisplayRow(docSnap.id, docSnap.data() as any);
            this.adBaseById.set(docSnap.id, row);
          });
          this.mergeDailyIntoAdsAndPublish();
        });
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
        // نُفضّل القائمة الديناميكية (Firestore: Categories/transportation) ثم نرتدّ للثوابت
        const dynD = this.dynamicDeliveryItems.find((i) => i.id === ad.category_id);
        const staticD = DELIVERY_CATEGORY.items.find((i) => i.id === ad.category_id);
        const dName = dynD?.nameAr || staticD?.nameAr || ad.category_id || 'خدمة نقل';
        displayTitle = `توصيل: ${dName}`;
        displayOwnerInfo = `${details.driver_name || ad.owner_name || 'غير مسجل'}`;
        break;
      }
      case 'education': {
        // نُفضّل القائمة الديناميكية (Firestore: Categories/education) ثم نرتدّ للثوابت
        const dynE = this.dynamicEducationItems.find((i) => i.id === ad.category_id);
        const staticE = EDUCATION_CATEGORY.items.find((i) => i.id === ad.category_id);
        const eName = dynE?.nameAr || staticE?.nameAr || ad.category_id || 'مرحلة';
        displayTitle = `تعليم: ${details.subject || 'مادة'} (${eName})`;
        displayOwnerInfo = `${details.teacher_name || ad.owner_name || 'غير مسجل'}`;
        break;
      }
      case 'other': {
        // نستخدم نفس الـ resolver المركزي الذي تستخدمه كروت العرض في تطبيق العميل
        // لضمان نفس تسلسل الأولوية: ديناميكي → ثابت → details.service_name → other_match_key
        const otherName = resolveOtherCategoryNameAr(
          { category_id: ad.category_id, details, other_match_key: ad['other_match_key'] },
          this.dynamicOtherItems
        );
        displayTitle = `خدمة: ${otherName}`;
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
        this.ngZone.run(() => {
          this.dailyClicksByAdId.clear();
          snap.forEach((d) => this.addAdsLogDocToClickMap(d, this.dailyClicksByAdId));
          this.mergeDailyIntoAdsAndPublish();
        });
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
            snap.forEach((d) => this.addAdsLogDocToClickMap(d, aggregated));
          })
        );
      });

      this.ngZone.run(() => {
        this.dailyClicksByAdId = aggregated;
        this.mergeDailyIntoAdsAndPublish();
      });
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

  /**
   * نقرات اليوم/الفترة من ads_logs؛ المفتاح عادةً = معرّف مستند ads.
   * إن وُجد تطابق عبر `base.ad_id` نقرأ المفتاحين؛ إن تطابقت الأرقام (نفس السجل مُكرَّر في الخريطة) لا نجمع مرتين.
   */
  private dailyClicksForAdRow(base: any): { calls: number; whatsapp: number } {
    const docId = String(base.id ?? '');
    const a = this.dailyClicksByAdId.get(docId);
    const altRaw = base.ad_id;
    const alt =
      altRaw != null && String(altRaw).trim() !== '' && String(altRaw) !== docId
        ? String(altRaw)
        : '';
    const b = alt ? this.dailyClicksByAdId.get(alt) : undefined;
    const ca = a?.calls ?? 0;
    const wa = a?.whatsapp ?? 0;
    const cb = b?.calls ?? 0;
    const wb = b?.whatsapp ?? 0;

    if (!b) {
      return { calls: ca, whatsapp: wa };
    }
    if (!a) {
      return { calls: cb, whatsapp: wb };
    }
    if (ca === cb && wa === wb) {
      return { calls: ca, whatsapp: wa };
    }
    return { calls: ca + cb, whatsapp: wa + wb };
  }

  private mergeDailyIntoAdsAndPublish() {
    this.totalCalls = 0;
    this.totalWhatsapp = 0;

    this.allAdsStats = [];
    this.adBaseById.forEach((base) => {
      const day = this.dailyClicksForAdRow(base);
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

  /**
   * إغلاق أي صف منزلق مفتوح عند النقر *خارج* القائمة فقط.
   * استدعاء close() على كل نقرة داخل الصف كان يلغي النقر على Android WebView
   * (يبدو وكأن الشاشة لا تستجيب).
   */
  closeOpenSlidings(ev: Event): void {
    const t = ev.target as HTMLElement | undefined;
    if (t?.closest?.('ion-item-option')) return;
    if (t?.closest?.('.analytics-list')) return;
    this.itemSlidings?.forEach((s) => void s.close());
  }

  /** أيام الفلتر الحالي: يوم واحد أو كل الأيام في نطاق «من — إلى». */
  private dateKeysForActiveFilter(): string[] {
    if (this.dateFilterMode === 'single') {
      const d = (this.selectedDate || '').trim();
      return d ? [d] : [];
    }
    const from = (this.rangeFrom || '').trim();
    const to = (this.rangeTo || '').trim();
    if (!from || !to || from > to) {
      return [];
    }
    return this.enumerateDateKeysInclusive(from, to);
  }

  /**
   * مسح إحصائيات النقرات للفترة المعروضة فقط: حذف سجلات daily_stats وخفض المجاميع على مستند الإعلان.
   * لا يحذف إعلان ads ولا يؤثر على ظهور الكارت في التطبيق.
   */
  async confirmClearClickStats(ad: any, sliding?: IonItemSliding) {
    await sliding?.close();
    const dateKeys = this.dateKeysForActiveFilter();
    if (!dateKeys.length) {
      const t = await this.toastCtrl.create({
        message: 'اختر يوماً أو فترة صالحة أولاً',
        duration: 2200,
        color: 'warning',
        position: 'bottom',
      });
      await t.present();
      return;
    }

    const callsRm = Number(ad.calls) || 0;
    const waRm = Number(ad.whatsapp) || 0;

    const alert = await this.alertCtrl.create({
      header: 'مسح إحصائيات النقرات',
      message: `سيتم تصفير نقرات الاتصال/واتساب المعروضة للفترة «${this.periodLabel}» لهذا الإعلان فقط، دون حذف الإعلان من التطبيق. متابعة؟`,
      cssClass: 'mota7-alert',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'مسح الإحصائيات',
          role: 'destructive',
          handler: async () => {
            try {
              const adDocId = String(ad.id);
              const altId =
                ad.ad_id != null && String(ad.ad_id).trim() !== '' && String(ad.ad_id) !== adDocId
                  ? String(ad.ad_id)
                  : '';
              const logIds = [adDocId, altId].filter(Boolean);

              await runInInjectionContext(this.injector, async () => {
                for (const day of dateKeys) {
                  for (const logId of logIds) {
                    try {
                      await deleteDoc(doc(this.firestore, 'daily_stats', day, 'ads_logs', logId));
                    } catch {
                      /* مستند غير موجود */
                    }
                  }
                }
              });

              if (callsRm > 0 || waRm > 0) {
                await runInInjectionContext(this.injector, async () => {
                  const adRef = doc(this.firestore, 'ads', adDocId);
                  await runTransaction(this.firestore, async (transaction) => {
                    const snap = await transaction.get(adRef);
                    if (!snap.exists()) {
                      return;
                    }
                    const d = snap.data() as Record<string, unknown>;
                    const curCc = Number(d['call_clicks'] ?? 0) || 0;
                    const curWc = Number(d['whatsapp_clicks'] ?? 0) || 0;
                    const stats = (d['stats'] as Record<string, unknown>) || {};
                    const curSc = Number(stats['calls'] ?? 0) || 0;
                    const curSw = Number(stats['whatsapp'] ?? 0) || 0;
                    transaction.update(adRef, {
                      call_clicks: Math.max(0, curCc - callsRm),
                      whatsapp_clicks: Math.max(0, curWc - waRm),
                      'stats.calls': Math.max(0, curSc - callsRm),
                      'stats.whatsapp': Math.max(0, curSw - waRm),
                    });
                  });
                });
              }

              if (this.dateFilterMode === 'range') {
                await this.loadRangeAggregation();
              }

              const toast = await this.toastCtrl.create({
                message: 'تم مسح إحصائيات النقرات للفترة المعروضة',
                duration: 2000,
                color: 'success',
                position: 'bottom',
              });
              await toast.present();
            } catch (e) {
              console.error('clearClickStats error:', e);
              const errToast = await this.toastCtrl.create({
                message: 'تعذر إكمال المسح',
                duration: 2500,
                color: 'danger',
                position: 'bottom',
              });
              await errToast.present();
            }
          },
        },
      ],
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