import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { IonicModule, ActionSheetController, AlertController, ModalController, ToastController } from '@ionic/angular';
import { Firestore, collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, serverTimestamp, where, getDocs, getDoc } from '@angular/fire/firestore';
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

@Component({
  selector: 'app-adv',
  templateUrl: './adv.html',
  styleUrls: ['./adv.scss'],
  standalone: true,
  imports: [
    CommonModule, IonicModule, Mota7HeaderComponent,
    DeliveryCard, EducationCard, OtherCard, ProductCard, StoreCard
  ]
})
export class AdvPage implements OnInit {
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
    });
  }

  private firestore = inject(Firestore);
  private injector = inject(Injector);
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

  readonly longPressMs = 500;
  selectionMode = false;
  selectedAdIds = new Set<string>();
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTriggered = false;

  ngOnInit() {
    this.fetchAds();
  }

  fetchAds() {
    this.isLoading = true;
    runInInjectionContext(this.injector, () => {
      const adsRef = collection(this.firestore, 'ads');
      const q = query(adsRef, orderBy('created_at', 'desc'));
      onSnapshot(
        q,
        (snapshot) => {
          this.adsList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          this.isLoading = false;
          this.pruneAdSelectionToVisible();
        },
        (error) => {
          console.error('Error fetching ads:', error);
          this.isLoading = false;
        }
      );
    });
  }

  onTabChange(event: CustomEvent) {
    this.selectedTab = event.detail.value as string;
    this.pruneAdSelectionToVisible();
  }

  onTypeChange(event: CustomEvent) {
    this.selectedType = event.detail.value as string;
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
              await runInInjectionContext(this.injector, async () => {
                for (const id of ids) {
                  const ad = this.adsList.find((a) => a.id === id);
                  if (ad) {
                    const cloudIds = collectCloudinaryPublicIdsFromAd(ad as Record<string, unknown>);
                    if (cloudIds.length) {
                      await this.cloudinaryCleanup.deletePublicIds(cloudIds).catch(() => {});
                    }
                  }
                  await deleteDoc(doc(this.firestore, 'ads', id));
                }
              });
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

  getFilteredAds(status: string): any[] {
    let statusFiltered = this.adsList.filter(ad => ad.status === status);
    if (this.selectedType !== 'all') {
      statusFiltered = statusFiltered.filter(ad => ad.ad_type === this.selectedType);
    }
    if (status !== 'active') return statusFiltered;

    const getSort = (a: any) => Number.isFinite(a?.sort_order) ? a.sort_order : 999;
    const getVer = (a: any) => a?.verification_level || 'none';
    const verRank = (v: any) => v === 'gold' ? 0 : (v === 'blue' ? 1 : 2);
    const getDate = (a: any) => {
      const d = a?.created_at?.toDate ? a.created_at.toDate() : a?.created_at;
      return d ? new Date(d).getTime() : 0;
    };

    return [...statusFiltered].sort((a, b) => {
      const sa = getSort(a);
      const sb = getSort(b);
      const aManual = sa < 999;
      const bManual = sb < 999;
      if (aManual !== bManual) return aManual ? -1 : 1;
      if (aManual && bManual && sa !== sb) return sa - sb;

      const va = verRank(getVer(a));
      const vb = verRank(getVer(b));
      if (va !== vb) return va - vb;

      const aNormal = !aManual && va === 2;
      const bNormal = !bManual && vb === 2;
      if (aNormal && bNormal) return getDate(b) - getDate(a);
      if (aNormal !== bNormal) return aNormal ? 1 : -1;

      return getDate(b) - getDate(a);
    });
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

    const isExpired = ad.status === 'expired';

    const actionSheet = await this.actionSheetCtrl.create({
      header: 'إدارة إعلان: ' + (ad.details?.title || ad.details?.driver_name || ad.details?.teacher_name || 'بدون عنوان'),
      mode: 'ios',
      cssClass: 'mota7-action-sheet',
      buttons: [
        { 
          text: 'قبول الإعلان', 
          icon: 'checkmark-circle-outline',
          handler: () => { this.updateAdStatus(ad.id, 'active'); }
        },
        { 
          text: 'تعديل الإعلان', 
          icon: 'create-outline',
          handler: () => { this.editAd(ad); }
        },
        { 
          text: 'رفض الإعلان (سبب)', 
          icon: 'close-circle-outline',
          handler: () => { this.promptReason(ad.id, 'rejected'); }
        },
        { 
          text: isExpired ? 'تفعيل الإعلان' : 'إيقاف الإعلان (سبب)', 
          icon: isExpired ? 'play-circle-outline' : 'pause-circle-outline',
          handler: () => { 
            if (isExpired) {
              this.updateAdStatus(ad.id, 'active'); 
            } else {
              this.promptReason(ad.id, 'expired'); 
            }
          }
        },
        { 
          text: 'بدون توثيق', 
          icon: 'remove-circle-outline',
          handler: () => { this.updateVerification(ad.id, 'none'); }
        },
        { 
          text: 'توثيق أزرق', 
          icon: 'ribbon-outline',
          cssClass: 'blue-verify-btn',
          handler: () => { this.updateVerification(ad.id, 'blue'); }
        },
        { 
          text: 'توثيق ذهبي', 
          icon: 'star-outline',
          cssClass: 'gold-verify-btn',
          handler: () => { this.updateVerification(ad.id, 'gold'); }
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
      ]
    });
    await actionSheet.present();
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

  async updateVerification(adId: string, level: string) {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'ads', adId), {
        is_verified: level,
        verification_level: level,
        updated_at: serverTimestamp(),
      })
    );
  }

  async promptReason(adId: string, status: string) {
    const modal = await this.modalCtrl.create({
      component: AdReasonModalComponent,
      componentProps: {
        headerTitle: status === 'rejected' ? 'سبب الرفض' : 'سبب الإيقاف',
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
      snap.docs.forEach(d => {
        const data: any = d.data();
        const so = data?.sort_order;
        const isSameAd = (d.id === (ad.id || ad.ad_id));
        if (!isSameAd && Number.isFinite(so) && so >= 1 && so <= 50) reserved.add(so);
      });
      
      const inputs: any[] = [];
      const currentValue = Number(ad?.sort_order);
      const current = Number.isFinite(currentValue) ? currentValue : null;
      inputs.push({
        name: 'order',
        type: 'radio',
        label: 'بدون ترتيب (افتراضي 999)',
        value: 'none',
        checked: !current || current === 999
      });
      for (let i = 1; i <= 50; i++) {
        const taken = reserved.has(i);
        inputs.push({
          name: 'order',
          type: 'radio',
          label: taken ? `${i} (محجوز)` : `${i}`,
          value: i,
          disabled: taken,
          checked: current === i
        });
      }
      
      const alert = await this.alertCtrl.create({
        header: 'تعديل الترتيب اليدوي',
        mode: 'ios',
        inputs,
        buttons: [
          { text: 'إلغاء', role: 'cancel' },
          {
            text: 'حفظ',
            handler: async (selected) => {
              if (!selected) return;
              const sortOrder = selected === 'none' ? 999 : selected;
              await runInInjectionContext(this.injector, () =>
                updateDoc(doc(this.firestore, 'ads', ad.id || ad.ad_id), {
                  sort_order: sortOrder,
                  updated_at: serverTimestamp(),
                })
              );
            },
          },
        ]
      });
      await alert.present();
    } catch (e) {
      console.error('Error updating manual order:', e);
    }
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
      return await runInInjectionContext(this.injector, async () => {
        const docRef = doc(this.firestore, 'users', cleanPhone);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return docSnap.data();

        const qPhone = query(
          collection(this.firestore, 'users'),
          where('phone', '==', cleanPhone)
        );
        const snapPhone = await getDocs(qPhone);
        return !snapPhone.empty ? snapPhone.docs[0].data() : null;
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
