import { Component, OnDestroy, OnInit, inject, Injector, NgZone, runInInjectionContext } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ActionSheetController, AlertController, ModalController, ToastController } from '@ionic/angular';
import { Firestore, collection, onSnapshot, query, doc, updateDoc, deleteDoc, serverTimestamp, where, getDocs, getDoc, Timestamp } from '@angular/fire/firestore';
import { deleteField } from 'firebase/firestore';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  createOutline,
  closeCircleOutline,
  playCircleOutline,
  pauseCircleOutline,
  removeCircleOutline,
  ribbonOutline,
  starOutline,
  personCircleOutline,
  trashOutline,
  documentTextOutline,
  chevronDownCircleOutline,
  searchOutline,
  closeOutline,
  cartOutline
} from 'ionicons/icons';

// استيراد الـ 5 كروت المختصرة
import { DeliveryCard } from './delivery';
import { EducationCard } from './education';
import { OtherCard } from './other';
import { ProductCard } from './product';
import { StoreCard } from './store';

// استيراد مودال التعديل
import { EditAdModal } from './edit-ad';
import { AdReasonModalComponent } from './ad-reason-modal.component';
import { CloudinaryCleanupService } from '../../services/cloudinary-cleanup.service';
import { collectCloudinaryPublicIdsFromAd } from '../../core/utils/cloudinary-public-id.util';
import { normalizeAdTypeValue } from '@mota7-app/core/utils/duplicate-ad.util';
import {
  canonicalTierForFirestore,
  effectiveTierForAdFields,
  parseFirestoreMillis,
  tierSortWeight,
  yyyyMmDdStringToUtcTimestamp,
} from '../../core/utils/verification-tiers.util';
import {
  DateRangePickerModalComponent,
  type DateRangePickerResult,
} from '../../shared/date-range-picker-modal/date-range-picker-modal.component';

@Component({
  selector: 'app-adv',
  templateUrl: './adv.html',
  styleUrls: ['./adv.scss'],
  standalone: true,
  imports: [
    CommonModule, IonicModule, Mota7HeaderComponent, FormsModule,
    DeliveryCard, EducationCard, OtherCard, ProductCard, StoreCard
  ]
})
export class AdvPage implements OnInit, OnDestroy {
  private static readonly EXPIRED_AD_REASON =
    '↶\nاعلان تاريخه منتهي\nلتجديد تاريخ انتهاء الاعلان\nيرجى التواصل مع الادارة - واتساب 01220883999\n❃ شكراً لاستخدامك تطبيق "مُتاح" ❃';

  constructor() {
    addIcons({
      checkmarkCircleOutline,
      createOutline,
      closeCircleOutline,
      playCircleOutline,
      pauseCircleOutline,
      removeCircleOutline,
      ribbonOutline,
      starOutline,
      personCircleOutline,
      trashOutline,
      documentTextOutline,
      'chevron-down-circle-outline': chevronDownCircleOutline,
      'search-outline': searchOutline,
      'close-outline': closeOutline,
      'cart-outline': cartOutline,
    });
  }

  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private ngZone = inject(NgZone);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);
  private location = inject(Location);
  private modalCtrl = inject(ModalController);
  private cloudinaryCleanup = inject(CloudinaryCleanupService);
  private toastCtrl = inject(ToastController);

  adsList: any[] = [];
  isLoading: boolean = true;
  selectedTab: string = 'pending';
  selectedType: string = 'all';
  searchQuery: string = '';
  sortBy: string = 'createdAtDesc';

  readonly longPressMs = 500;
  selectionMode = false;
  selectedAdIds = new Set<string>();
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTriggered = false;
  /** إلغاء الاشتراك السابق يمنع تعدّد مستمعي onSnapshot ووميض القائمة عند كل تحديث */
  private adsSnapshotUnsub: (() => void) | null = null;
  /** منع تحديث نفس الإعلان إلى منتهي أكثر من مرة بالتوازي */
  private expiringAdIds = new Set<string>();

  ngOnInit() {
    this.fetchAds();
  }

  ngOnDestroy(): void {
    this.adsSnapshotUnsub?.();
    this.adsSnapshotUnsub = null;
  }

  trackByAdId(_index: number, ad: any): string {
    return ad?.id ?? String(_index);
  }

  onSearchInput() {
    this.pruneAdSelectionToVisible();
  }

  clearSearch() {
    this.searchQuery = '';
    this.pruneAdSelectionToVisible();
  }

  doRefresh(event: any) {
    this.fetchAds();
    setTimeout(() => {
      event.target.complete();
    }, 1000);
  }

  /** نفس `normalizeAdTypeValue` في Mota7 (duplicate-ad.util) لضمان تطابق الفلاتر والكروت. */
  private normalizeAdType(raw: unknown): string {
    return normalizeAdTypeValue(raw);
  }

  fetchAds() {
    this.isLoading = true;
    this.adsSnapshotUnsub?.();
    this.adsSnapshotUnsub = null;
    runInInjectionContext(this.injector, () => {
      /**
       * لا نستخدم orderBy('created_at') على الخادم: في Firestore تُستبعد أي مستندات
       * لا يوجد فيها الحقل — فيظهر للأدمن «صفر إعلانات» رغم وجود بيانات.
       * الترتيب يتم محلياً بعد الجلب (نفس منطق موثوقية العرض على الويب والـ APK).
       *
       * NgZone.run() حول تحديث الحالة ضروري على Android WebView:
       * Capacitor قد يُطلق callback الخاص بـ onSnapshot خارج Zone.js فلا يسري
       * Change Detection وتبقى القائمة فارغة رغم وصول البيانات (يعمل على الويب
       * لكن لا يظهر على الـ APK). داخل NgZone نضمن تحديث العرض فوراً.
       */
      const adsRef = collection(this.firestore, 'ads');
      this.adsSnapshotUnsub = onSnapshot(
        adsRef,
        (snapshot) => {
          const rows = snapshot.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            const ad_type = this.normalizeAdType(data['ad_type']);
            return { id: d.id, ...data, ad_type };
          });
          this.ngZone.run(() => {
            this.adsList = this.sortAdsNewestFirst(rows);
            this.isLoading = false;
            this.pruneAdSelectionToVisible();
          });
          void this.autoExpireAdsByDate(rows);
        },
        (error) => {
          console.error('Error fetching ads:', error);
          this.ngZone.run(() => {
            this.isLoading = false;
          });
          void this.toastFetchAdsFailed(error);
        }
      );
    });
  }

  /** ترتيب حسب created_at تنازلياً؛ المستندات بدون تاريخ في الأسفل */
  private sortAdsNewestFirst(ads: any[]): any[] {
    return [...ads].sort((a, b) => this.createdAtMs(b) - this.createdAtMs(a));
  }

  private createdAtMs(ad: any): number {
    const v = ad?.created_at;
    if (v == null) return 0;
    if (typeof v?.toMillis === 'function') return v.toMillis();
    if (typeof v?.seconds === 'number') return v.seconds * 1000;
    if (typeof v?.nanoseconds === 'number' && typeof v?.seconds === 'number') {
      return v.seconds * 1000 + Math.floor(v.nanoseconds / 1e6);
    }
    return 0;
  }

  private adExpiryMs(ad: any): number | null {
    return parseFirestoreMillis(ad?.expiry_date);
  }

  private adAcceptedAtMs(ad: any): number {
    const acceptedMs = parseFirestoreMillis(ad?.active_from);
    if (acceptedMs != null) {
      return acceptedMs;
    }
    return this.createdAtMs(ad);
  }

  private isExpiryReached(ad: any, nowMs = Date.now()): boolean {
    const expiryMs = this.adExpiryMs(ad);
    return expiryMs != null && nowMs >= expiryMs;
  }

  private async autoExpireAdsByDate(ads: any[]): Promise<void> {
    const nowMs = Date.now();
    for (const ad of ads) {
      const adId = String(ad?.id ?? ad?.ad_id ?? '').trim();
      if (!adId || ad?.status === 'expired') {
        continue;
      }
      if (ad?.status !== 'active' && ad?.status !== 'pending') {
        continue;
      }
      if (!this.isExpiryReached(ad, nowMs) || this.expiringAdIds.has(adId)) {
        continue;
      }
      this.expiringAdIds.add(adId);
      try {
        await this.markAdAsExpiredWithReason(adId);
      } catch (e) {
        console.error('autoExpireAdsByDate', e);
      } finally {
        this.expiringAdIds.delete(adId);
      }
    }
  }

  private async markAdAsExpiredWithReason(adId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'ads', adId), {
        status: 'expired',
        admin_reason: AdvPage.EXPIRED_AD_REASON,
        reject_reason: AdvPage.EXPIRED_AD_REASON,
        updated_at: serverTimestamp(),
      })
    );
  }

  private async toastFetchAdsFailed(err: unknown): Promise<void> {
    const msg =
      err && typeof err === 'object' && 'code' in err
        ? `تعذّر جلب الإعلانات (${String((err as { code?: string }).code)}). تحقق من الاتصال وإعدادات Firebase.`
        : 'تعذّر جلب الإعلانات. تحقق من الاتصال.';
    const t = await this.toastCtrl.create({
      message: msg,
      duration: 4500,
      position: 'bottom',
      color: 'danger',
      mode: 'ios',
    });
    await t.present();
  }

  onTabChange(event: Event) {
    const ce = event as CustomEvent<{ value?: string }>;
    let v = ce.detail?.value;
    if (v == null && event.target && 'value' in event.target) {
      v = (event.target as HTMLIonSegmentElement).value as string | undefined;
    }
    if (typeof v === 'string' && v.length) {
      this.selectedTab = v;
    }
    this.pruneAdSelectionToVisible();
  }

  onTypeChange(event: Event) {
    const ce = event as CustomEvent<{ value?: string }>;
    let v = ce.detail?.value;
    if (v == null && event.target && 'value' in event.target) {
      v = (event.target as HTMLIonSegmentElement).value as string | undefined;
    }
    if (typeof v === 'string' && v.length) {
      this.selectedType = v;
    }
    this.pruneAdSelectionToVisible();
  }

  onSortChange(event: Event) {
    const ce = event as CustomEvent<{ value?: string }>;
    let v = ce.detail?.value;
    if (v == null && event.target && 'value' in event.target) {
      v = (event.target as HTMLIonSelectElement).value as string | undefined;
    }
    if (typeof v === 'string' && v.length) {
      this.sortBy = v;
    }
    this.pruneAdSelectionToVisible();
  }

  get selectedAdCount(): number {
    return this.selectedAdIds.size;
  }

  private get visibleAds(): any[] {
    return this.getFilteredAds(this.selectedTab);
  }

  get isAllVisibleAdsSelected(): boolean {
    const ads = this.visibleAds;
    if (!ads.length) return false;
    const ids = ads.map((a) => a.id).filter(Boolean) as string[];
    if (ids.length !== this.selectedAdIds.size) return false;
    return ids.every((id) => this.selectedAdIds.has(id));
  }

  isAdSelected(adId: string): boolean {
    return this.selectedAdIds.has(adId);
  }

  private pruneAdSelectionToVisible(): void {
    if (!this.selectionMode) return;
    const visible = new Set(this.visibleAds.map((a) => a.id).filter(Boolean));
    const next = new Set<string>();
    for (const id of this.selectedAdIds) {
      if (visible.has(id)) next.add(id);
    }
    this.selectedAdIds = next;
    if (this.selectedAdIds.size === 0) {
      this.selectionMode = false;
    }
  }

  private enterSelectionForAd(adId: string): void {
    this.selectionMode = true;
    this.selectedAdIds = new Set(this.selectedAdIds);
    this.selectedAdIds.add(adId);
  }

  toggleSelectedAd(adId: string): void {
    if (!this.selectionMode) return;
    const next = new Set(this.selectedAdIds);
    if (next.has(adId)) next.delete(adId);
    else next.add(adId);
    this.selectedAdIds = next;
    if (this.selectedAdIds.size === 0) this.selectionMode = false;
  }

  toggleSelectAllVisible(checked: boolean): void {
    if (!checked) {
      this.selectedAdIds = new Set();
      this.selectionMode = false;
      return;
    }
    this.selectionMode = true;
    this.selectedAdIds = new Set(this.visibleAds.map((a) => a.id).filter(Boolean));
  }

  onAdPointerDown(adId: string, ev: PointerEvent): void {
    if (ev.pointerType === 'mouse' && ev.buttons !== 1) return;
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.longPressTriggered = false;
    this.longPressTimer = setTimeout(() => {
      this.longPressTriggered = true;
      this.enterSelectionForAd(adId);
    }, this.longPressMs);
  }

  onAdPointerUp(): void {
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
  }

  onAdPointerCancel(): void {
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
  }

  onAdCardClick(adId: string, ev: Event): void {
    if (!this.selectionMode) return;
    const t = ev.target as HTMLElement | undefined;
    if (t?.closest?.('ion-checkbox')) return;
    if (this.longPressTriggered) {
      this.longPressTriggered = false;
      return;
    }
    ev.stopPropagation();
    this.toggleSelectedAd(adId);
  }

  async confirmDeleteSelectedAds(): Promise<void> {
    const count = this.selectedAdCount;
    if (count <= 0) return;

    const ids = Array.from(this.selectedAdIds);
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف',
      message: `هل أنت متأكد من حذف عدد (${count}) إعلان؟`,
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'تأكيد',
          role: 'destructive',
          handler: async () => {
            try {
              for (const id of ids) {
                const ad = this.adsList.find((a) => a.id === id);
                if (ad) {
                  const cloudIds = collectCloudinaryPublicIdsFromAd(ad as Record<string, unknown>);
                  if (cloudIds.length) {
                    await this.cloudinaryCleanup.deletePublicIds(cloudIds).catch(() => {});
                  }
                }
                await runInInjectionContext(this.injector, () => 
                  deleteDoc(doc(this.firestore, 'ads', id))
                );
              }
              this.selectedAdIds = new Set();
              this.selectionMode = false;
              const toast = await this.toastCtrl.create({
                message: 'تم حذف الإعلانات',
                duration: 2000,
                color: 'success',
                mode: 'ios',
              });
              await toast.present();
            } catch (e) {
              console.error(e);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private normalizeText(input: any): string {
    if (input === null || input === undefined) return '';
    return input.toString()
      .toLowerCase()
      .trim()
      .normalize('NFKD')
      .replace(/[\u064B-\u065F]/g, '') // إزالة التشكيل
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ') // إزالة الرموز الخاصة
      .replace(/\s+/g, ' '); // توحيد المسافات
  }

  private tokenizeText(text: string): string[] {
    const normalized = this.normalizeText(text);
    if (!normalized) return [];
    // تقسيم النص لكلمات، مع تجاهل الكلمات القصيرة جداً (أقل من حرفين)
    return normalized.split(' ').filter(word => word.length >= 2);
  }

  private buildSearchHaystack(ad: any): string {
    const parts = [
      ad.owner_name,
      ad.owner_phone,
      ad.phone,
      ad.userId,
      ad.ad_type,
      ad.category_id,
      ad.city,
      ad.status,
      ad.details?.title,
      ad.details?.store_name,
      ad.details?.product_name,
      ad.details?.service_name,
      ad.details?.driver_name,
      ad.details?.teacher_name,
      ad.details?.short_desc,
      ad.details?.full_details,
      ad.details?.whatsapp_phone,
      ad.details?.location_name,
      ad.details?.subject,
      ad.details?.stage
    ];
    return parts.filter(Boolean).join(' ');
  }

  private matchesSearch(ad: any, query: string): boolean {
    const tokens = this.tokenizeText(query);
    if (tokens.length === 0) return true;

    const haystack = this.normalizeText(this.buildSearchHaystack(ad));
    
    // يجب أن توجد كل كلمة من كلمات البحث داخل نص الإعلان (AND logic)
    return tokens.every(token => haystack.includes(token));
  }

  private tierWeightForActiveSort(ad: any): number {
    const t = effectiveTierForAdFields(
      ad?.verification_level,
      ad?.is_verified,
      ad?.verification_valid_from,
      ad?.verification_valid_until
    );
    return tierSortWeight(t);
  }

  private ownerPhoneSortValue(ad: any): string {
    const raw = String(ad?.owner_phone ?? ad?.phone ?? '').trim();
    return raw.replace(/\D/g, '');
  }

  private categorySortValue(ad: any): string {
    return String(ad?.category_id ?? ad?.ad_type ?? '').trim().toLowerCase();
  }

  private ownerNameSortValue(ad: any): string {
    const raw =
      ad?.owner_name ??
      ad?.details?.owner_name ??
      ad?.details?.store_name ??
      ad?.details?.driver_name ??
      ad?.details?.teacher_name ??
      '';
    return String(raw).trim().toLowerCase();
  }

  private compareBySelectedSort(a: any, b: any): number {
    switch (this.sortBy) {
      case 'createdAtDesc':
        return this.createdAtMs(b) - this.createdAtMs(a);
      case 'acceptedAtDesc': {
        const aMs = this.adAcceptedAtMs(a);
        const bMs = this.adAcceptedAtMs(b);
        if (bMs !== aMs) {
          return bMs - aMs;
        }
        return this.createdAtMs(b) - this.createdAtMs(a);
      }
      case 'expiryDateDesc': {
        const aMs = this.adExpiryMs(a) ?? 0;
        const bMs = this.adExpiryMs(b) ?? 0;
        if (bMs !== aMs) {
          return bMs - aMs;
        }
        return this.createdAtMs(b) - this.createdAtMs(a);
      }
      case 'ownerPhoneDesc': {
        const phoneA = this.ownerPhoneSortValue(a);
        const phoneB = this.ownerPhoneSortValue(b);
        return phoneB.localeCompare(phoneA, 'en', { numeric: true });
      }
      case 'categoryDesc': {
        const catA = this.categorySortValue(a);
        const catB = this.categorySortValue(b);
        return catB.localeCompare(catA, 'ar');
      }
      case 'ownerNameDesc': {
        const nameA = this.ownerNameSortValue(a);
        const nameB = this.ownerNameSortValue(b);
        return nameB.localeCompare(nameA, 'ar');
      }
      case 'verificationTier': {
        const wa = this.tierWeightForActiveSort(a);
        const wb = this.tierWeightForActiveSort(b);
        if (wa !== wb) {
          return wb - wa; // vip ثم Diamonds ثم golden ... ثم free ثم empty
        }
        return this.createdAtMs(a) - this.createdAtMs(b);
      }
      case 'createdAtAsc':
      default:
        return this.createdAtMs(a) - this.createdAtMs(b);
    }
  }

  getFilteredAds(status: string): any[] {
    let filtered = this.adsList.filter(ad => ad.status === status);
    
    if (this.selectedType !== 'all') {
      filtered = filtered.filter((ad) => {
        const t = String(ad?.ad_type ?? '');
        if (t === this.selectedType) return true;
        if (this.selectedType === 'other') {
          return t.toLowerCase() === 'other_services';
        }
        if (this.selectedType === 'store') {
          const low = t.toLowerCase();
          return low === 'stores' || low === 'shop';
        }
        return false;
      });
    }

    if (this.searchQuery && this.searchQuery.trim().length >= 2) {
      filtered = filtered.filter(ad => this.matchesSearch(ad, this.searchQuery));
    }

    return [...filtered].sort((a, b) => this.compareBySelectedSort(a, b));
  }

  async openAdActions(event: any) {
    if (this.selectionMode) {
      return;
    }
    const ad = event.ad ? event.ad : event;

    if (event.action === 'edit') {
      this.editAd(ad);
      return;
    }

    const sheetButtons: {
      text: string;
      icon?: string;
      role?: string;
      cssClass?: string;
      handler?: () => void;
    }[] = [
        { 
          text: 'قبول الإعلان', 
          icon: 'checkmark-circle-outline',
          handler: () => { void this.promptAcceptAdDateRange(ad); }
        },
        { 
          text: 'تعديل الإعلان', 
          icon: 'create-outline',
          handler: () => { this.editAd(ad); }
        },
        {
          text: 'تعليق الإعلان',
          icon: 'pause-circle-outline',
          handler: () => { void this.setAdPending(ad); }
        },
    ];

    if (this.normalizeAdType(ad.ad_type) === 'product') {
      const cartEnabled = ad.cart_enabled !== false;
      sheetButtons.push({
        text: cartEnabled ? 'تعطيل زر العربة على كارت المنتج' : 'تفعيل زر العربة على كارت المنتج',
        icon: 'cart-outline',
        handler: () => { void this.setProductCartEnabled(ad.id || ad.ad_id, !cartEnabled); },
      });
    }

    sheetButtons.push(
        { 
          text: 'رفض الإعلان (سبب)', 
          icon: 'close-circle-outline',
          handler: () => { this.promptReason(ad.id, 'rejected'); }
        },
        { 
          text: 'إيقاف الإعلان (سبب)', 
          icon: 'pause-circle-outline',
          handler: () => { 
            void this.expireAdFromActionSheet(ad);
          }
        },
        {
          text: 'بدون اشتراك',
          icon: 'remove-circle-outline',
          handler: () => {
            void this.promptAdVerificationDates(ad, 'empty');
          },
        },
        {
          text: 'مجاني',
          icon: 'remove-circle-outline',
          handler: () => {
            void this.promptAdVerificationDates(ad, 'free');
          },
        },
        { 
          text: 'برونزي', 
          icon: 'ribbon-outline',
          handler: () => { void this.promptAdVerificationDates(ad, 'bronze'); }
        },
        { 
          text: 'فضي', 
          icon: 'ribbon-outline',
          cssClass: 'blue-verify-btn',
          handler: () => { void this.promptAdVerificationDates(ad, 'silver'); }
        },
        { 
          text: 'ذهبي', 
          icon: 'star-outline',
          cssClass: 'gold-verify-btn',
          handler: () => { void this.promptAdVerificationDates(ad, 'golden'); }
        },
        { 
          text: 'ماسي Diamonds', 
          icon: 'star-outline',
          handler: () => { void this.promptAdVerificationDates(ad, 'Diamonds'); }
        },
        { 
          text: 'VIP', 
          icon: 'star-outline',
          handler: () => { void this.promptAdVerificationDates(ad, 'vip'); }
        },
        { 
          text: 'تعديل الترتيب اليدوي', 
          icon: 'ribbon-outline',
          handler: () => { this.promptManualOrder(ad); }
        },
        { 
          text: 'بيانات منشأ الإعلان', 
          icon: 'person-circle-outline',
          handler: () => { this.openUserDetails(ad); }
        },
        { 
          text: 'حذف الإعلان نهائياً', 
          role: 'destructive', 
          icon: 'trash-outline',
          handler: () => { void this.confirmDelete(ad); }
        },
        { text: 'إلغاء', role: 'cancel' }
    );

    const actionSheet = await this.actionSheetCtrl.create({
      header: 'إدارة إعلان: ' + (ad.details?.title || ad.details?.driver_name || ad.details?.teacher_name || 'بدون عنوان'),
      mode: 'ios',
      cssClass: 'mota7-action-sheet',
      buttons: sheetButtons,
    });
    await actionSheet.present();
  }

  /**
   * يتحكم في ظهور زر «إضافة للعربة» على كارت المنتج في التطبيق.
   * `cart_enabled !== false` = الزر يعمل؛ `false` = زر بهتان/معطّل على الكارت.
   */
  async setProductCartEnabled(adId: string | undefined, enabled: boolean): Promise<void> {
    if (!adId) {
      return;
    }
    try {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'ads', adId), {
          cart_enabled: enabled,
          updated_at: serverTimestamp(),
        })
      );
      const toast = await this.toastCtrl.create({
        message: enabled ? 'تم تفعيل زر العربة على كارت المنتج' : 'تم تعطيل زر العربة (بهتان) على كارت المنتج',
        duration: 2200,
        color: 'success',
        position: 'bottom',
        mode: 'ios',
      });
      await toast.present();
    } catch (e) {
      console.error(e);
      const errToast = await this.toastCtrl.create({
        message: 'تعذّر حفظ إعداد العربة. حاول مرة أخرى.',
        duration: 2800,
        color: 'danger',
        position: 'bottom',
        mode: 'ios',
      });
      await errToast.present();
    }
  }

  async updateAdStatus(adId: string, status: string) {
    const payload: any = {
      status: status,
      updated_at: serverTimestamp(),
    };
    if (status === 'active') {
      payload.admin_reason = '';
    }
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'ads', adId), payload)
    );
  }

  private async setAdPending(ad: any): Promise<void> {
    const adId = String(ad?.id ?? ad?.ad_id ?? '').trim();
    if (!adId) {
      return;
    }
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'ads', adId), {
        status: 'pending',
        updated_at: serverTimestamp(),
      })
    );
  }

  private async expireAdFromActionSheet(ad: any): Promise<void> {
    const adId = String(ad?.id ?? ad?.ad_id ?? '').trim();
    if (!adId) {
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'سبب إيقاف الإعلان',
      subHeader: 'يمكنك استخدام الرسالة الحالية أو تعديلها',
      mode: 'ios',
      inputs: [
        {
          name: 'reason',
          type: 'textarea',
          value: AdvPage.EXPIRED_AD_REASON,
          placeholder: 'اكتب سبب الإيقاف',
          attributes: {
            rows: 7,
          },
        },
      ],
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'تأكيد الإيقاف',
          role: 'destructive',
          handler: (data) => {
            const inputReason = String(data?.reason ?? '').trim();
            const reason =
              inputReason.length > 0
                ? inputReason
                : AdvPage.EXPIRED_AD_REASON;
            void runInInjectionContext(this.injector, () =>
              updateDoc(doc(this.firestore, 'ads', adId), {
                status: 'expired',
                admin_reason: reason,
                reject_reason: reason,
                updated_at: serverTimestamp(),
              })
            );
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  /** تاريخ إعلان من Firestore → YYYY-MM-DD (UTC) لمنتقي التقويم */
  private initialAdDateYyyyMmDd(v: unknown): string | null {
    if (v == null || v === '') {
      return null;
    }
    let ms: number | null = null;
    if (
      typeof v === 'object' &&
      v &&
      typeof (v as { toMillis?: () => number }).toMillis === 'function'
    ) {
      ms = (v as { toMillis: () => number }).toMillis();
    } else if (
      typeof v === 'object' &&
      v &&
      typeof (v as { seconds?: number }).seconds === 'number'
    ) {
      const sec = (v as { seconds: number }).seconds;
      const nano =
        typeof (v as { nanoseconds?: number }).nanoseconds === 'number'
          ? (v as { nanoseconds: number }).nanoseconds
          : 0;
      ms = sec * 1000 + Math.floor(nano / 1e6);
    }
    if (ms == null || !Number.isFinite(ms)) {
      return null;
    }
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  }

  /** قبول الإعلان مع اختيار تاريخ القبول وتاريخ الانتهاء من التقويم باللمس. */
  private async promptAcceptAdDateRange(ad: any): Promise<void> {
    const adId = String(ad?.id ?? ad?.ad_id ?? '').trim();
    if (!adId) {
      return;
    }
    const initFrom =
      this.initialAdDateYyyyMmDd(ad?.active_from) ??
      this.initialAdDateYyyyMmDd(ad?.created_at);
    const initUntil = this.initialAdDateYyyyMmDd(ad?.expiry_date);

    const modal = await this.modalCtrl.create({
      component: DateRangePickerModalComponent,
      componentProps: {
        title: 'مدة قبول الإعلان',
        subtitle:
          'من = تاريخ قبول الإعلان، إلى = تاريخ انتهاء الإعلان (اختيار باللمس من التقويم)',
        confirmLabel: 'قبول ونشر',
        allowWithoutDates: false,
        initialFrom: initFrom,
        initialUntil: initUntil,
      },
      mode: 'ios',
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<
      DateRangePickerResult | null
    >();
    if (role !== 'confirm' || !data) {
      return;
    }

    const fromTs = yyyyMmDdStringToUtcTimestamp(data.fromIsoDate, false);
    const untilTs = yyyyMmDdStringToUtcTimestamp(data.untilIsoDate, true);
    if (!fromTs || !untilTs) {
      const t = await this.toastCtrl.create({
        message: 'تواريخ غير صالحة — أعد الاختيار من التقويم',
        duration: 2500,
        color: 'warning',
        position: 'bottom',
        mode: 'ios',
      });
      await t.present();
      return;
    }
    if (fromTs.toMillis() > untilTs.toMillis()) {
      const t = await this.toastCtrl.create({
        message: 'تاريخ البداية بعد تاريخ النهاية',
        duration: 2200,
        color: 'danger',
        position: 'bottom',
        mode: 'ios',
      });
      await t.present();
      return;
    }

    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'ads', adId), {
        status: 'active',
        active_from: fromTs,
        expiry_date: untilTs,
        admin_reason: '',
        reject_reason: '',
        updated_at: serverTimestamp(),
      })
    );
  }

  /**
   * توثيق الإعلان بشارة + نافذة صلاحية من/إلى (تقويم باللمس).
   * بدون اشتراك (empty) | مجاني (free + free.jpg) | برونزي وما فوق — كلها بمدة من/إلى.
   */
  async promptAdVerificationDates(ad: any, level: string): Promise<void> {
    const adId = ad?.id || ad?.ad_id;
    if (!adId) {
      return;
    }
    const tier = canonicalTierForFirestore(level);

    const initFrom = this.initialAdDateYyyyMmDd(ad?.verification_valid_from);
    const initUntil = this.initialAdDateYyyyMmDd(ad?.verification_valid_until);

    const modal = await this.modalCtrl.create({
      component: DateRangePickerModalComponent,
      componentProps: {
        title: 'مدة توثيق الإعلان',
        subtitle:
          'تاريخ التوثيق من وإلى — اختر من التقويم باللمس (لا كتابة)',
        confirmLabel: 'حفظ التوثيق',
        allowWithoutDates: false,
        initialFrom: initFrom,
        initialUntil: initUntil,
      },
      mode: 'ios',
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<
      DateRangePickerResult | null
    >();
    if (role !== 'confirm' || !data) {
      return;
    }
    const fromTs = yyyyMmDdStringToUtcTimestamp(data.fromIsoDate, false);
    const untilTs = yyyyMmDdStringToUtcTimestamp(data.untilIsoDate, true);
    if (!fromTs || !untilTs) {
      const t = await this.toastCtrl.create({
        message: 'تواريخ غير صالحة — أعد الاختيار من التقويم',
        duration: 2500,
        color: 'warning',
        position: 'bottom',
        mode: 'ios',
      });
      await t.present();
      return;
    }
    if (fromTs.toMillis() > untilTs.toMillis()) {
      const t = await this.toastCtrl.create({
        message: 'تاريخ البداية بعد تاريخ النهاية',
        duration: 2200,
        color: 'danger',
        position: 'bottom',
        mode: 'ios',
      });
      await t.present();
      return;
    }
    await this.persistAdVerification(adId, tier, fromTs, untilTs, false);
  }

  private async persistAdVerification(
    adId: string,
    tier: string,
    validFrom: Timestamp | null,
    validUntil: Timestamp | null,
    clearDates: boolean
  ): Promise<void> {
    try {
      const payload: Record<string, unknown> = {
        is_verified: tier,
        verification_level: tier,
        updated_at: serverTimestamp(),
      };
      if (clearDates) {
        payload['verification_valid_from'] = deleteField();
        payload['verification_valid_until'] = deleteField();
      } else {
        payload['verification_valid_from'] =
          validFrom != null ? validFrom : deleteField();
        payload['verification_valid_until'] =
          validUntil != null ? validUntil : deleteField();
      }
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'ads', adId), payload)
      );
      const tierLabel =
        tier === 'free'
          ? 'توثيق مجاني'
          : tier === 'empty'
            ? 'بدون اشتراك'
            : tier;
      const ok = await this.toastCtrl.create({
        message: `تم تحديث التوثيق (${tierLabel})`,
        duration: 1800,
        color: 'success',
        position: 'bottom',
        mode: 'ios',
      });
      await ok.present();
    } catch (e) {
      console.error('persistAdVerification', e);
      const err = await this.toastCtrl.create({
        message: 'تعذّر حفظ التوثيق',
        duration: 2500,
        color: 'danger',
        position: 'bottom',
        mode: 'ios',
      });
      await err.present();
    }
  }

  async promptReason(adId: string, status: string) {
    const ad = this.adsList.find((a) => a.id === adId);
    const initialReason = ad?.admin_reason || ad?.reject_reason || '';

    const modal = await this.modalCtrl.create({
      component: AdReasonModalComponent,
      componentProps: {
        headerTitle: status === 'rejected' ? 'سبب الرفض' : 'سبب الإيقاف',
        initialReason: initialReason,
      },
      mode: 'ios',
      cssClass: 'mota7-reason-modal',
      backdropDismiss: true,
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<{ reason: string }>();
    if (role !== 'confirm' || !data || typeof data.reason !== 'string') {
      return;
    }
    const reason = data.reason;
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'ads', adId), {
        status: status,
        admin_reason: reason,
        reject_reason: reason,
        updated_at: serverTimestamp(),
      })
    );
    const ok = await this.toastCtrl.create({
      message: 'تم حفظ السبب والحالة',
      duration: 2000,
      color: 'success',
      position: 'bottom',
    });
    await ok.present();
  }

  async confirmDelete(ad: { id: string; ad_id?: string; [key: string]: unknown }) {
    const adId = ad.id || ad.ad_id;
    if (!adId) {
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف',
      message: 'هل أنت متأكد من حذف هذا الإعلان نهائياً؟ لا يمكن التراجع.',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف',
          role: 'destructive',
          handler: async () => {
            const ids = collectCloudinaryPublicIdsFromAd(ad as Record<string, unknown>);
            if (ids.length) {
              await this.cloudinaryCleanup.deletePublicIds(ids).catch(() => {});
            }
            await runInInjectionContext(this.injector, () =>
              deleteDoc(doc(this.firestore, 'ads', adId))
            );
          },
        },
      ]
    });
    await alert.present();
  }

  async promptManualOrder(ad: any) {
    try {
      const snap = await runInInjectionContext(this.injector, () =>
        getDocs(
          query(
            collection(this.firestore, 'ads'),
            where('ad_type', '==', ad.ad_type),
            where('category_id', '==', ad.category_id)
          )
        )
      );
      const reserved = new Set<number>();
      snap.docs.forEach((d) => {
        const data: any = d.data();
        const so = data?.sort_order;
        const isSameAd = d.id === (ad.id || ad.ad_id);
        if (!isSameAd && Number.isFinite(so) && so >= 1 && so <= 5) {
          reserved.add(so);
        }
      });

      const inputs: any[] = [];
      const currentValue = Number(ad?.sort_order);
      const current = Number.isFinite(currentValue) ? currentValue : null;
      inputs.push({
        name: 'order',
        type: 'radio',
        label: 'بدون ترتيب يدوي (افتراضي 999)',
        value: 'none',
        checked: !current || current === 999 || current < 1 || current > 5,
      });
      for (let i = 1; i <= 5; i++) {
        const taken = reserved.has(i);
        inputs.push({
          name: 'order',
          type: 'radio',
          label: taken
            ? `المستوى ${i} (محجوز)`
            : `المستوى ${i}${i === 1 ? ' — يظهر أول القائمة' : ''}`,
          value: i,
          disabled: taken,
          checked: current === i,
        });
      }

      const alert = await this.alertCtrl.create({
        header: 'الترتيب اليدوي (1–5)',
        subHeader: 'المستوى 1 يظهر أول القائمة — ثم مدة الترتيب من التقويم',
        mode: 'ios',
        inputs,
        buttons: [
          { text: 'إلغاء', role: 'cancel' },
          {
            text: 'متابعة',
            handler: (selected) => {
              void this.applyManualSortAfterPick(ad, selected);
              return true;
            },
          },
        ],
      });
      await alert.present();
    } catch (e) {
      console.error('Error updating manual order:', e);
    }
  }

  private async applyManualSortAfterPick(
    ad: any,
    selected: unknown
  ): Promise<void> {
    if (selected == null || selected === '') {
      return;
    }
    const sortOrder = selected === 'none' ? 999 : Number(selected);
    const adRef = doc(this.firestore, 'ads', ad.id || ad.ad_id);
    if (sortOrder === 999) {
      await runInInjectionContext(this.injector, () =>
        updateDoc(adRef, {
          sort_order: 999,
          manual_sort_from: deleteField(),
          manual_sort_until: deleteField(),
          updated_at: serverTimestamp(),
        })
      );
      return;
    }
    const range =
      (await this.promptManualSortDateRange(ad)) ?? null;
    if (!range) {
      return;
    }
    const fromTs = yyyyMmDdStringToUtcTimestamp(range.fromIsoDate, false);
    const untilTs = yyyyMmDdStringToUtcTimestamp(range.untilIsoDate, true);
    if (!fromTs || !untilTs) {
      const t = await this.toastCtrl.create({
        message: 'تواريخ غير صالحة للترتيب اليدوي — أعد الاختيار',
        duration: 2500,
        color: 'warning',
        position: 'bottom',
        mode: 'ios',
      });
      await t.present();
      return;
    }
    if (fromTs.toMillis() > untilTs.toMillis()) {
      const t = await this.toastCtrl.create({
        message: 'تاريخ البداية بعد تاريخ النهاية',
        duration: 2200,
        color: 'danger',
        position: 'bottom',
        mode: 'ios',
      });
      await t.present();
      return;
    }
    await runInInjectionContext(this.injector, () =>
      updateDoc(adRef, {
        sort_order: sortOrder,
        manual_sort_from: fromTs,
        manual_sort_until: untilTs,
        updated_at: serverTimestamp(),
      })
    );
  }

  private async promptManualSortDateRange(
    ad: any
  ): Promise<DateRangePickerResult | null> {
    const initFrom = this.initialAdDateYyyyMmDd(ad?.manual_sort_from);
    const initUntil = this.initialAdDateYyyyMmDd(ad?.manual_sort_until);
    const modal = await this.modalCtrl.create({
      component: DateRangePickerModalComponent,
      componentProps: {
        title: 'مدة الترتيب اليدوي',
        subtitle:
          'تاريخ الترتيب من وإلى — اختر من التقويم باللمس (المستويات 1–5)',
        confirmLabel: 'تطبيق الترتيب',
        allowWithoutDates: false,
        initialFrom: initFrom,
        initialUntil: initUntil,
      },
      mode: 'ios',
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<
      DateRangePickerResult | null
    >();
    if (role !== 'confirm' || !data) {
      return null;
    }
    return data;
  }

  async editAd(ad: any) {
    const modal = await this.modalCtrl.create({
      component: EditAdModal,
      componentProps: { ad: ad },
      mode: 'ios',
      cssClass: 'mota7-full-modal'
    });
    
    await modal.present();
  }

  // دالة موحدة لفتح بيانات منشأ الإعلان
async openUserDetails(ad: any) {
    // التعديل هنا: نبحث عن رقم الهاتف أولاً في كل الأماكن الممكنة
    const phone = ad.owner_phone || ad.details?.whatsapp_phone || ad.phone || ad.userId;
    
    if (!phone) {
      console.error('لم يتم العثور على رقم هاتف أو ID للمستخدم');
      return;
    }

    const userData = await this.fetchUserData(phone);
    
    // محاولة استخراج الاسم من بيانات المستخدم أو من تفاصيل الإعلان نفسه
    const name = userData ? userData['fullName'] : (ad.details?.driver_name || ad.owner_name || ad.details?.owner_name || 'غير مسجل');
    const userPhone = userData ? userData['phone'] : (ad.owner_phone || ad.details?.whatsapp_phone || phone);
    const city = userData ? userData['city'] : (ad.city || 'غير محددة');

    const alert = await this.alertCtrl.create({
      header: 'بيانات منشأ الإعلان',
      subHeader: 'تفاصيل المستخدم المعلن',
      mode: 'ios',
      cssClass: 'mota7-user-alert',
      message: `👤 الاسم: ${name}\n\n📞 الهاتف: ${userPhone}\n\n📍 المدينة: ${city}`,
      buttons: ['إغلاق']
    });

    await alert.present();
  }
  // دالة جلب البيانات من الفايربيس (موحدة لجميع الإعلانات)
  async fetchUserData(phone: string) {
    try {
      const cleanPhone = phone.toString().trim();
      
      // 1. محاولة الجلب المباشر عبر المعرف (ID)
      const docSnap = await runInInjectionContext(this.injector, () => 
        getDoc(doc(this.firestore, 'users', cleanPhone))
      );
      
      if (docSnap.exists()) return docSnap.data();

      // 2. إذا لم يوجد، نحاول البحث عبر حقل الهاتف
      return await runInInjectionContext(this.injector, () => {
        const q = query(
          collection(this.firestore, 'users'),
          where('phone', '==', cleanPhone)
        );
        return getDocs(q).then(snap => !snap.empty ? snap.docs[0].data() : null);
      });
    } catch (e) {
      console.error('Error fetching user data:', e);
      return null;
    }
  }

  goBack() {
    this.location.back();
  }
}
