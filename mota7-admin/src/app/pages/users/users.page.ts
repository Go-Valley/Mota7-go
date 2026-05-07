import { Component, OnInit, inject, Injector, ChangeDetectorRef, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  ActionSheetController,
  NavController,
  ToastController,
  ModalController,
  AlertController,
} from '@ionic/angular';
import {
  Firestore,
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from '@angular/fire/firestore';
import { deleteField, Timestamp } from 'firebase/firestore';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  canonicalTierForFirestore,
  defaultMaxAdsForTier,
  effectiveTierFromUserFields,
  normalizeVerificationTier,
  verificationBadgeAssetPath,
  yyyyMmDdStringToUtcTimestamp,
  type CanonicalVerificationTier,
} from '../../core/utils/verification-tiers.util';
import {
  DateRangePickerModalComponent,
  type DateRangePickerResult,
} from '../../shared/date-range-picker-modal/date-range-picker-modal.component';
import { 
  personOutline, ellipsisVerticalOutline, trashOutline, createOutline, 
  banOutline, ribbonOutline, starOutline, closeOutline, checkmarkCircleOutline,
  closeCircleOutline, searchOutline, // إضافة أيقونة البحث
  funnelOutline,
  chevronDownCircleOutline,
  chevronDownOutline,
  calendarOutline,
  refreshOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-users',
  templateUrl: './users.page.html',
  styleUrls: ['./users.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, Mota7HeaderComponent, FormsModule]
})
export class UsersPage implements OnInit {
  private static readonly DEACTIVATE_ACCOUNT_REJECTION_REASON =
    'اعلان مرفوض بسبب ايقاف تنشيط الحساب - لمزيد من الاستفسار, يرجى التواصل مع الادارة';

  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private actionSheetCtrl = inject(ActionSheetController);
  private modalCtrl = inject(ModalController);
  private navCtrl = inject(NavController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private cdr = inject(ChangeDetectorRef);

  usersList: any[] = [];
  filteredUsers: any[] = []; // قائمة المستخدمين بعد الفلترة
  searchQuery: string = '';   // نص البحث
  sortBy: string = 'createdAt'; // خيار الفرز الافتراضي

  // --- متغيرات التحديد المتعدد ---
  selectionMode = false;
  selectedUserIds = new Set<string>();
  private longPressTimer: any;
  private readonly longPressDuration = 600;

  /** معاينة شارة التوثيق على كارت المستخدم أثناء نافذة الحدّ والتاريخ */
  verificationDraftUserId: string | null = null;
  verificationDraftTier: Exclude<CanonicalVerificationTier, 'none'> | null =
    null;

  constructor() {
    addIcons({ 
      personOutline, ellipsisVerticalOutline, trashOutline, createOutline, 
      banOutline, ribbonOutline, starOutline, closeOutline, checkmarkCircleOutline,
      closeCircleOutline, searchOutline,
      funnelOutline, // إضافة أيقونة الفلتر/الفرز
      'chevron-down-circle-outline': chevronDownCircleOutline,
      'chevron-down-outline': chevronDownOutline,
      'calendar-outline': calendarOutline,
      'refresh-outline': refreshOutline,
    });
  }

  // --- منطق التحديد والضغط المطول ---
  onPointerDown(user: any) {
    if (this.selectionMode) return;
    this.longPressTimer = setTimeout(() => {
      this.enterSelectionMode(user);
    }, this.longPressDuration);
  }

  onPointerUp() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
  }

  private enterSelectionMode(user: any) {
    this.selectionMode = true;
    this.toggleUserSelection(user);
  }

  toggleUserSelection(user: any) {
    if (this.selectedUserIds.has(user.id)) {
      this.selectedUserIds.delete(user.id);
      if (this.selectedUserIds.size === 0) {
        this.exitSelectionMode();
      }
    } else {
      this.selectedUserIds.add(user.id);
    }
  }

  exitSelectionMode() {
    this.selectionMode = false;
    this.selectedUserIds.clear();
  }

  async confirmBulkDelete() {
    const count = this.selectedUserIds.size;
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف الجماعي',
      message: `هل أنت متأكد من حذف ${count} مستخدم نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`,
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف الكل',
          role: 'destructive',
          handler: () => this.executeBulkDelete()
        }
      ]
    });
    await alert.present();
  }

  private async executeBulkDelete() {
    const idsToDelete = Array.from(this.selectedUserIds);
    try {
      await runInInjectionContext(this.injector, async () => {
        const batch = writeBatch(this.firestore);
        idsToDelete.forEach(id => {
          batch.delete(doc(this.firestore, 'users', id));
        });
        return batch.commit();
      });
      this.showToast(`تم حذف ${idsToDelete.length} مستخدم بنجاح`);
      this.exitSelectionMode();
    } catch (e) {
      this.showToast('حدث خطأ أثناء الحذف الجماعي');
    }
  }

  onUserClick(user: any) {
    if (this.selectionMode) {
      this.toggleUserSelection(user);
    }
  }

  ngOnInit() {
    this.fetchUsers();
  }

  doRefresh(event: any) {
    this.fetchUsers();
    setTimeout(() => {
      event.target.complete();
    }, 1000);
  }

  fetchUsers() {
    runInInjectionContext(this.injector, () => {
      const usersRef = collection(this.firestore, 'users');
      onSnapshot(usersRef, (snapshot) => {
        this.usersList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        this.filterAndSortUsers();
      });
    });
  }

  // دالة الفلترة والفرز
  filterAndSortUsers() {
    let list = [...this.usersList];

    // 1. الفلترة حسب البحث
    const queryStr = this.searchQuery.trim().toLowerCase();
    if (queryStr) {
      list = list.filter(user => 
        (user.phone && user.phone.toString().includes(queryStr)) || 
        (user.fullName && user.fullName.toLowerCase().includes(queryStr))
      );
    }

    // 2. الفرز حسب الخيار المختار
    list.sort((a, b) => {
      switch (this.sortBy) {
        case 'phone': {
          const strA = String(a.phone || '').replace(/\D/g, '');
          const strB = String(b.phone || '').replace(/\D/g, '');
          return strA.localeCompare(strB); // ترتيب تصاعدي للأرقام
        }
        case 'createdAt': {
          const getTime = (val: any, fallbackVal: any) => {
            const v = val || fallbackVal;
            if (!v) return 0;
            if (typeof v.toDate === 'function') return v.toDate().getTime(); // Firestore Timestamp
            const d = new Date(v);
            return isNaN(d.getTime()) ? 0 : d.getTime(); // ISO String or Date
          };
          const timeA = getTime(a.createdAt, a.created_at);
          const timeB = getTime(b.createdAt, b.created_at);
          return timeB - timeA; // الأحدث أولاً (تنازلي)
        }
        case 'isActive': {
          if (a.isActive === b.isActive) return 0;
          return a.isActive ? -1 : 1; // النشط أولاً
        }
        case 'fullName': {
          const nameA = (a.fullName || '').trim().toLowerCase();
          const nameB = (b.fullName || '').trim().toLowerCase();
          return nameA.localeCompare(nameB, 'ar');
        }
        case 'city': {
          const cityA = (a.city || '').trim().toLowerCase();
          const cityB = (b.city || '').trim().toLowerCase();
          return cityA.localeCompare(cityB, 'ar');
        }
        default:
          return 0;
      }
    });

    this.filteredUsers = list;
  }

  // دالة تغيير نوع الفرز
  onSortChange(event: any) {
    this.sortBy = event.detail.value;
    this.filterAndSortUsers();
  }

  // دالة الفلترة للبحث برقم الهاتف أو الاسم
  filterUsers() {
    this.filterAndSortUsers();
  }

  async openArabicList(user: any) {
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'إدارة: ' + (user.fullName || user.phone),
      cssClass: 'mota7-action-sheet',
      buttons: [
        { text: 'تعديل البيانات', icon: 'create-outline', handler: () => this.openEditModal(user) },
        { 
          text: user.isActive ? 'تعطيل الحساب' : 'تنشيط الحساب', 
          icon: user.isActive ? 'ban-outline' : 'checkmark-circle-outline',
          handler: () => this.toggleStatus(user) 
        },
        {
          text: 'توثيق مجاني',
          icon: 'person-outline',
          handler: () => void this.promptAssignVerification(user, 'free'),
        },
        {
          text: 'توثيق برونزي',
          icon: 'ribbon-outline',
          handler: () => void this.promptAssignVerification(user, 'bronze'),
        },
        {
          text: 'توثيق فضي',
          icon: 'ribbon-outline',
          handler: () => void this.promptAssignVerification(user, 'silver'),
        },
        {
          text: 'توثيق ذهبي',
          icon: 'star-outline',
          handler: () => void this.promptAssignVerification(user, 'golden'),
        },
        {
          text: 'توثيق ماسي (Diamonds)',
          icon: 'star-outline',
          handler: () => void this.promptAssignVerification(user, 'Diamonds'),
        },
        {
          text: 'VIP',
          icon: 'star-outline',
          handler: () => void this.promptAssignVerification(user, 'vip'),
        },
        {
          text: 'إعادة للمجاني (إلغاء التوثيق)',
          icon: 'close-circle-outline',
          handler: () => void this.promptClearVerification(user),
        },
        {
          text: 'حذف نهائياً',
          role: 'destructive',
          icon: 'trash-outline',
          handler: () => {
            void this.confirmDeleteUser(user);
          },
        },
        { text: 'إلغاء', role: 'cancel', icon: 'close-outline' }
      ]
    });
    await actionSheet.present();
  }

  /** طبقة التوثيق الظاهرة على الكارت (البيانات المحفوظة أو المعاينة أثناء الإعداد). */
  effectiveVerificationTierForCard(user: any): Exclude<
    CanonicalVerificationTier,
    'none'
  > {
    if (
      this.verificationDraftUserId === user?.id &&
      this.verificationDraftTier != null
    ) {
      return this.verificationDraftTier;
    }
    return effectiveTierFromUserFields(user as Record<string, unknown>);
  }

  /** مسار صورة الشارة تحت `assets/subscrip/` */
  verificationBadgeSrc(user: any): string | null {
    const tier = this.effectiveVerificationTierForCard(user);
    return verificationBadgeAssetPath(tier);
  }

  tierCaptionForCard(user: any): string {
    return this.tierArabicLabel(this.effectiveVerificationTierForCard(user));
  }

  private tierArabicLabel(tier: Exclude<CanonicalVerificationTier, 'none'>): string {
    switch (tier) {
      case 'free':
        return 'توثيق مجاني';
      case 'bronze':
        return 'توثيق برونزي';
      case 'silver':
        return 'توثيق فضي';
      case 'golden':
        return 'توثيق ذهبي';
      case 'Diamonds':
        return 'توثيق ماسي';
      case 'vip':
        return 'توثيق VIP';
      default:
        return String(tier);
    }
  }

  /** تحويل حقول التاريخ المخزَّنة على المستخدم إلى YYYY-MM-DD (UTC) لمعاينة منتقي التاريخ. */
  private initialUserVerificationYyyyMmDd(v: unknown): string | null {
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

  async promptAssignVerification(
    user: any,
    tier: Exclude<CanonicalVerificationTier, 'none'>
  ): Promise<void> {
    this.verificationDraftUserId = user?.id ?? null;
    this.verificationDraftTier = tier;
    this.cdr.detectChanges();

    const defaultMax = defaultMaxAdsForTier(tier);
    const maxAds = await new Promise<number | null>((resolve) => {
      void this.alertCtrl
        .create({
          header: this.tierArabicLabel(tier),
          subHeader: 'الحد الأقصى للإعلانات النشطة',
          mode: 'ios',
          inputs: [
            {
              name: 'maxAds',
              type: 'number',
              placeholder: 'الحد الأقصى للإعلانات النشطة',
              value: String(defaultMax),
            },
          ],
          buttons: [
            {
              text: 'إلغاء',
              role: 'cancel',
              handler: () => resolve(null),
            },
            {
              text: 'متابعة — المدة',
              handler: (data) => {
                const n = parseInt(String(data?.maxAds ?? '').trim(), 10);
                if (!Number.isFinite(n) || n < 0) {
                  void this.showToast(
                    'أدخل عدداً صحيحاً للحد الأقصى للإعلانات'
                  );
                  return false;
                }
                resolve(n);
                return true;
              },
            },
          ],
        })
        .then((a) => a.present());
    });

    if (maxAds == null) {
      this.verificationDraftUserId = null;
      this.verificationDraftTier = null;
      this.cdr.detectChanges();
      return;
    }

    const initFrom = this.initialUserVerificationYyyyMmDd(
      user?.verification_valid_from
    );
    const initUntil = this.initialUserVerificationYyyyMmDd(
      user?.verification_valid_until
    );

    const modal = await this.modalCtrl.create({
      component: DateRangePickerModalComponent,
      componentProps: {
        title: 'مدة توثيق الحساب',
        subtitle:
          'تاريخ التوثيق من وإلى — اختر من التقويم باللمس (يمكن «بدون تواريخ» لصلاحية مفتوحة)',
        confirmLabel: 'حفظ وتطبيق',
        allowWithoutDates: true,
        initialFrom: initFrom,
        initialUntil: initUntil,
      },
      mode: 'ios',
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<
      DateRangePickerResult | null
    >();

    this.verificationDraftUserId = null;
    this.verificationDraftTier = null;
    this.cdr.detectChanges();

    if (role === 'cancel' || role === 'backdrop') {
      return;
    }

    let fromTs: Timestamp | null = null;
    let untilTs: Timestamp | null = null;
    if (role === 'confirm' && data) {
      fromTs = yyyyMmDdStringToUtcTimestamp(data.fromIsoDate, false);
      untilTs = yyyyMmDdStringToUtcTimestamp(data.untilIsoDate, true);
      if (!fromTs || !untilTs) {
        void this.showToast('تواريخ غير صالحة — أعد الاختيار');
        return;
      }
      if (fromTs.toMillis() > untilTs.toMillis()) {
        void this.showToast('تاريخ البداية بعد تاريخ النهاية');
        return;
      }
    }

    await this.persistUserVerification(user, tier, maxAds, fromTs, untilTs);
  }

  async promptClearVerification(user: any): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'إلغاء التوثيق',
      message:
        'إعادة الحساب إلى التوثيق المجاني (free)، حد إعلان واحد، وحذف تواريخ صلاحية التوثيق من الحساب. تُحدَّث جميع إعلانات المستخدم المرتبطة باستثناء الإعلانات الموثَّقة VIP (تبقى كما هي).',
      mode: 'ios',
      buttons: [
        { text: 'رجوع', role: 'cancel' },
        {
          text: 'تأكيد الإلغاء',
          role: 'destructive',
          handler: () => {
            void this.persistUserVerificationClear(user);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async persistUserVerification(
    user: any,
    tier: Exclude<CanonicalVerificationTier, 'none'>,
    maxAds: number,
    validFrom: Timestamp | null,
    validUntil: Timestamp | null
  ): Promise<void> {
    const tierStored = canonicalTierForFirestore(tier);
    const userPayload: Record<string, unknown> = {
      verifiedStatus: tierStored,
      verification_level: tierStored,
      max_active_ads: maxAds,
      verification_valid_from:
        validFrom != null ? validFrom : deleteField(),
      verification_valid_until:
        validUntil != null ? validUntil : deleteField(),
    };
    try {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'users', user.id), userPayload)
      );
      await this.cascadeVerificationToUserAds(user, tierStored, validFrom, validUntil);
      this.showToast('تم تحديث التوثيق ومزامنة الإعلانات المرتبطة');
    } catch (e) {
      console.error('persistUserVerification', e);
      this.showToast('خطأ في الحفظ — تحقق من الاتصال أو صلاحيات الأدمن');
    }
  }

  private async persistUserVerificationClear(user: any): Promise<void> {
    const tierStored = canonicalTierForFirestore('free');
    try {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'users', user.id), {
          verifiedStatus: tierStored,
          verification_level: tierStored,
          max_active_ads: defaultMaxAdsForTier('free'),
          verification_valid_from: deleteField(),
          verification_valid_until: deleteField(),
        })
      );
      await this.cascadeVerificationToUserAds(user, tierStored, null, null);
      this.showToast('تم إلغاء التوثيق ومزامنة الإعلانات');
    } catch (e) {
      console.error('persistUserVerificationClear', e);
      this.showToast('خطأ في الحفظ — تحقق من الاتصال أو صلاحيات الأدمن');
    }
  }

  /** يطبّق طبقة الحساب على كل إعلانات المستخدم (uid + أرقام الهاتف المعروفة). */
  private async cascadeVerificationToUserAds(
    user: { id: string; uid?: string; phone?: string },
    tier: string,
    validFrom: Timestamp | null,
    validUntil: Timestamp | null
  ): Promise<void> {
    const adIds = new Set<string>();
    const firebaseUid =
      typeof user.uid === 'string' && user.uid.trim().length > 0
        ? user.uid.trim()
        : null;
    if (firebaseUid) {
      const snapUid = await runInInjectionContext(this.injector, () =>
        getDocs(
          query(
            collection(this.firestore, 'ads'),
            where('userId', '==', firebaseUid)
          )
        )
      );
      snapUid.docs.forEach((d) => adIds.add(d.id));
    }
    const phones = new Set<string>();
    if (user.phone != null && String(user.phone).trim()) {
      phones.add(String(user.phone).trim());
    }
    if (user.id != null && String(user.id).trim()) {
      phones.add(String(user.id).trim());
    }
    for (const p of phones) {
      const byOwner = await runInInjectionContext(this.injector, () =>
        getDocs(
          query(collection(this.firestore, 'ads'), where('owner_phone', '==', p))
        )
      );
      byOwner.docs.forEach((d) => adIds.add(d.id));
    }
    const ids = [...adIds];
    if (!ids.length) {
      return;
    }
    const chunk = 400;
    for (let i = 0; i < ids.length; i += chunk) {
      await runInInjectionContext(this.injector, async () => {
        const slice = ids.slice(i, i + chunk);
        const snaps = await Promise.all(
          slice.map((id) => getDoc(doc(this.firestore, 'ads', id)))
        );
        const batch = writeBatch(this.firestore);
        for (let j = 0; j < slice.length; j++) {
          const snap = snaps[j];
          if (!snap.exists()) {
            continue;
          }
          const adData = snap.data() as Record<string, unknown>;
          if (normalizeVerificationTier(adData['verification_level']) === 'vip') {
            continue;
          }
          batch.update(doc(this.firestore, 'ads', slice[j]), {
            verification_level: tier,
            is_verified: tier,
            verification_valid_from:
              validFrom != null ? validFrom : deleteField(),
            verification_valid_until:
              validUntil != null ? validUntil : deleteField(),
            updated_at: serverTimestamp(),
          });
        }
        await batch.commit();
      });
    }
  }

  async toggleStatus(user: any) {
    const willDeactivate = user.isActive === true;
    try {
      if (willDeactivate) {
        await this.rejectAllAdsForDeactivatedUser(user);
      }
      await runInInjectionContext(this.injector, () => 
        updateDoc(doc(this.firestore, 'users', user.id), { isActive: !user.isActive })
      );
      this.showToast(
        willDeactivate
          ? 'تم تعطيل الحساب ورفض الإعلانات المرتبطة'
          : 'تم تنشيط الحساب'
      );
    } catch (e) {
      this.showToast('فشل التعديل: راجع قواعد الحماية');
    }
  }

  /** عند تعطيل الحساب: جعل كل إعلانات المستخدم مرفوضة مع سبب إداري موحّد. */
  private async rejectAllAdsForDeactivatedUser(user: any): Promise<void> {
    const reason = UsersPage.DEACTIVATE_ACCOUNT_REJECTION_REASON;
    const adIds = new Set<string>();

    const firebaseUid =
      typeof user.uid === 'string' && user.uid.trim().length > 0
        ? user.uid.trim()
        : '';
    if (firebaseUid) {
      const snapByUserId = await runInInjectionContext(this.injector, () =>
        getDocs(
          query(
            collection(this.firestore, 'ads'),
            where('userId', '==', firebaseUid)
          )
        )
      );
      snapByUserId.docs.forEach((d) => adIds.add(d.id));
    }

    const phoneKeys = new Set<string>();
    if (user.phone != null && String(user.phone).trim()) {
      phoneKeys.add(String(user.phone).trim());
    }
    if (user.id != null && String(user.id).trim()) {
      phoneKeys.add(String(user.id).trim());
    }
    for (const p of phoneKeys) {
      const byOwner = await runInInjectionContext(this.injector, () => 
        getDocs(query(collection(this.firestore, 'ads'), where('owner_phone', '==', p)))
      );
      byOwner.docs.forEach((d) => adIds.add(d.id));
      const byPhone = await runInInjectionContext(this.injector, () => 
        getDocs(query(collection(this.firestore, 'ads'), where('phone', '==', p)))
      );
      byPhone.docs.forEach((d) => adIds.add(d.id));
    }

    const ids = [...adIds];
    if (!ids.length) return;

    const chunkSize = 400;
    for (let i = 0; i < ids.length; i += chunkSize) {
      await runInInjectionContext(this.injector, () => {
        const batch = writeBatch(this.firestore);
        for (const adId of ids.slice(i, i + chunkSize)) {
          batch.update(doc(this.firestore, 'ads', adId), {
            status: 'rejected',
            admin_reason: reason,
            reject_reason: reason,
            updated_at: serverTimestamp(),
          });
        }
        return batch.commit();
      });
    }
  }

  async confirmDeleteUser(user: any) {
    const label = user.fullName || user.phone || user.id;
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف',
      message: `هل تريد حذف المستخدم «${label}» نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`,
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف نهائياً',
          role: 'destructive',
          handler: () => {
            void this.deleteUser(user);
          },
        },
      ],
    });
    await alert.present();
  }

  async deleteUser(user: any) {
    try {
      await runInInjectionContext(this.injector, () =>
        deleteDoc(doc(this.firestore, 'users', user.id))
      );
      this.showToast('تم حذف المستند بنجاح');
    } catch {
      this.showToast('خطأ في الحذف');
    }
  }

  async openEditModal(user: any) {
    const modal = await this.modalCtrl.create({
      component: EditUserModalComponent,
      componentProps: { userData: { ...user } }
    });
    
    await modal.present();
    const { data } = await modal.onWillDismiss();
    
    if (data) {
      try {
        await runInInjectionContext(this.injector, () =>
          updateDoc(doc(this.firestore, 'users', user.id), {
            fullName: data.fullName,
            phone: data.phone,
            city: data.city,
          })
        );
        this.showToast('تم تحديث البيانات بنجاح');
      } catch (e) {
        this.showToast('خطأ في التحديث: راجع الـ Rules');
      }
    }
  }

  /** تهيئة مستخدمين بلا طبقة صريحة أو بـ none/free لمستندات قديمة — دون تعديل من له ذهبي/VIP وما شابه */
  async confirmMigrateLegacyFreeDefaults(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'تهيئة التوثيق المجاني',
      message:
        'يتم تعيين توثيق مجاني (free) والحد الافتراضي لإعلانات المستخدمين الذين بحكم حقولهم لا يزالون بدءًا أو none/free فقط. لا يُغيَّر من له ذهبي أو ماسي أو VIP وهكذا.',
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'تنفيذ',
          handler: () => {
            void this.runMigrateLegacyFreeDefaults();
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async runMigrateLegacyFreeDefaults(): Promise<void> {
    const tierStored = canonicalTierForFirestore('free');
    const maxAds = defaultMaxAdsForTier('free');
    try {
      let updated = 0;
      await runInInjectionContext(this.injector, async () => {
        const snap = await getDocs(collection(this.firestore, 'users'));
        let batch = writeBatch(this.firestore);
        let ops = 0;
        for (const d of snap.docs) {
          const data = d.data() as Record<string, unknown>;
          const nt = normalizeVerificationTier(
            data['verification_level'] ?? data['verifiedStatus'] ?? 'none'
          );
          if (nt !== 'none' && nt !== 'free') {
            continue;
          }
          const lv = String(data['verification_level'] ?? '').trim().toLowerCase();
          const sv = String(data['verifiedStatus'] ?? '').trim().toLowerCase();
          const mx = data['max_active_ads'];
          if (
            (lv === 'free' || lv === '') &&
            (sv === 'free' || sv === '') &&
            typeof mx === 'number' &&
            mx === maxAds
          ) {
            continue;
          }
          batch.update(doc(this.firestore, 'users', d.id), {
            verification_level: tierStored,
            verifiedStatus: tierStored,
            max_active_ads: maxAds,
          });
          ops++;
          updated++;
          if (ops >= 400) {
            await batch.commit();
            batch = writeBatch(this.firestore);
            ops = 0;
          }
        }
        if (ops > 0) {
          await batch.commit();
        }
      });
      await this.showToast(
        updated
          ? `تم تحديث ${updated} مستخدماً`
          : 'لا حساب بحاجة للتهيئة (أو مُطبَّقة مسبقاً)'
      );
    } catch (e) {
      console.error('runMigrateLegacyFreeDefaults', e);
      await this.showToast('فشل التهيئة — تحقق من الصلاحيات أو الاتصال');
    }
  }

  goBack() { this.navCtrl.back(); }
  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({ message: msg, duration: 2000, position: 'bottom' });
    toast.present();
  }
}

@Component({
  selector: 'app-edit-user-modal',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>تعديل: {{ userData.fullName }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-item lines="full">
        <ion-label position="stacked">الاسم الكامل</ion-label>
        <ion-input [(ngModel)]="userData.fullName" type="text" placeholder="اكتب الاسم"></ion-input>
      </ion-item>
      <ion-item lines="full">
        <ion-label position="stacked">رقم الهاتف</ion-label>
        <ion-input [(ngModel)]="userData.phone" type="tel" placeholder="اكتب الرقم"></ion-input>
      </ion-item>
      <ion-item lines="full">
        <ion-label position="stacked">المدينة</ion-label>
        <ion-input [(ngModel)]="userData.city" type="text" placeholder="اكتب المدينة"></ion-input>
      </ion-item>
      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <ion-button expand="block" (click)="save()" style="flex: 1;">حفظ</ion-button>
        <ion-button expand="block" color="light" (click)="close()" style="flex: 1;">إلغاء</ion-button>
      </div>
    </ion-content>
  `,
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule]
})
export class EditUserModalComponent {
  userData: any;
  private modalCtrl = inject(ModalController);
  save() { this.modalCtrl.dismiss(this.userData); }
  close() { this.modalCtrl.dismiss(); }
}