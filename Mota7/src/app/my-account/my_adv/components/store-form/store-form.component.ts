import { Component, OnInit, ViewChild, inject, Input, EnvironmentInjector, runInInjectionContext, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonicModule, IonInput, LoadingController, ToastController, NavController, ModalController, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { STORES_CATEGORIES_DATA } from '../../../../core/constants/stores-data';
import { AppTaxonomyService, type TaxonomyBundle } from '../../../../core/services/app-taxonomy.service';
import { ImageService } from 'src/app/image.service';
import { NewAdNtfyService } from 'src/app/core/services/new-ad-ntfy.service';
import { CloudinaryCleanupService } from 'src/app/core/services/cloudinary-cleanup.service';
import {
  normalizeUserFreeText,
  readIonTextInputValueFromEvent,
} from '../../../../core/utils/order-form-fields.util';
import {
  applyOrderPhoneInputState,
  ORDER_PHONE_DIGITS_ONLY_MSG,
  orderPhoneToEnglishDigits,
} from '../../../../core/utils/egyptian-phone-order.util';

import { addIcons } from 'ionicons';
import { camera, callOutline, logoWhatsapp, chevronDownOutline, chevronForwardOutline, shieldCheckmark, checkmarkCircle } from 'ionicons/icons';

@Component({
  selector: 'app-store-form',
  templateUrl: './store-form.component.html',
  styleUrls: ['./store-form.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class StoreFormComponent implements OnInit {
  @Input() editAdData: any; 
  @ViewChild('inputStoreName', { read: IonInput }) private inputStoreName?: IonInput;
  @ViewChild('inputWhatsappPhone', { read: IonInput }) private inputWhatsappPhone?: IonInput;
  isEditMode = false;
  whatsappPhoneLiveWarning: string | null = null;

  storeCategories: any[] = [...STORES_CATEGORIES_DATA.items];
  isSubmitting = false; 
  ownerRealName: string = '';
  userVerificationStatus: string = 'none'; // متغير حالة التوثيق

  /** معرف Cloudinary للوجو الحالي (للحذف عند الاستبدال أو حذف الإعلان) */
  logoCloudinaryPublicId: string | null = null;

  storeData = {
    category_id: '',
    storeName: '',
    contactPhone: '',
    whatsappEnabled: true,
    whatsappPhone: '',
    logo: '',
    lat: 0,
    lng: 0,
    city: ''
  };

  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private imageService = inject(ImageService);
  private injector = inject(EnvironmentInjector);
  private newAdNtfy = inject(NewAdNtfyService);
  private cloudinaryCleanup = inject(CloudinaryCleanupService);
  private taxonomy = inject(AppTaxonomyService);
  private destroyRef = inject(DestroyRef);

  constructor(
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController
  ) {
    addIcons({ camera, callOutline, logoWhatsapp, chevronDownOutline, chevronForwardOutline, shieldCheckmark, checkmarkCircle });
  }

  async ngOnInit() {
    this.taxonomy.bundle$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((b: TaxonomyBundle) => {
      this.storeCategories = b.storeItems;
    });

    if (this.editAdData) {
      this.isEditMode = true;
      this.fillFormForEdit();
    } else {
      await this.loadUserProfile();
    }
  }

  fillFormForEdit() {
    const d = this.editAdData;
    this.ownerRealName = d.owner_name || ''; 
    this.userVerificationStatus = d.verification_level || 'none'; // جلب الحالة من الإعلان عند التعديل
    
    let rawWhatsapp = d.whatsapp_phone || '';
    if (rawWhatsapp.startsWith('20')) {
      rawWhatsapp = '0' + rawWhatsapp.substring(2);
    }

    this.storeData = {
      category_id: d.category_id || '',
      storeName: d.store_name || '',
      contactPhone: d.owner_phone || '',
      whatsappEnabled: !!d.whatsapp_phone,
      whatsappPhone: rawWhatsapp,
      logo: d.logo || '',
      lat: d.location?.lat || 0,
      lng: d.location?.lng || 0,
      city: d.city || ''
    };
    const lid = d.logo_cloudinary_public_id;
    this.logoCloudinaryPublicId = typeof lid === 'string' && lid ? lid : null;
  }

  async loadUserProfile() {
    const user = this.auth.currentUser;
    if (user && user.email) {
      const userKey = user.email.split('@')[0];
      const userDoc = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'users', userKey))
      );
      if (userDoc.exists()) {
        const data = userDoc.data();
        // تأكدنا من جلب fullName أو name حسب بياناتك
        this.ownerRealName = data['fullName'] || data['name'] || 'صاحب متجر';
        this.userVerificationStatus = data['verification_status'] || 'none';
        this.storeData.contactPhone = data['phone'] || '';
        this.storeData.whatsappPhone = data['phone'] || '';
        this.storeData.city = data['city'] || 'الخارجة';
      }
    }
  }

  async onLogoUpload(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const loader = await this.loadingCtrl.create({ 
      message: 'جاري معالجة اللوجو...', 
      mode: 'ios' 
    });
    await loader.present();

    try {
      if (this.logoCloudinaryPublicId) {
        await this.cloudinaryCleanup.deletePublicIds([this.logoCloudinaryPublicId]).catch(() => {});
      }
      const { url, publicId } = await this.imageService.uploadToCloudinary(file, 'stores');
      this.storeData.logo = url;
      this.logoCloudinaryPublicId = publicId || null;
      this.presentToast('تم رفع اللوجو بنجاح');
    } catch (error) {
      console.error("Logo upload error:", error);
      this.presentToast('فشل رفع اللوجو، حاول مرة أخرى');
    } finally {
      loader.dismiss();
    }
  }

  onStoreNameInput(ev: Event): void {
    this.storeData.storeName = readIonTextInputValueFromEvent(ev);
  }

  onStoreWhatsappPhoneKeyDown(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) {
      return;
    }
    const key = ev.key;
    if (key.length !== 1) {
      return;
    }
    const asDigit = key.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776));
    if (/^[0-9]$/.test(asDigit)) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    this.whatsappPhoneLiveWarning = 'لايمكن قبول حروف - ارقام فقط';
  }

  onStoreWhatsappPhoneChange(val: string): void {
    const raw = val || '';
    const st = applyOrderPhoneInputState(raw);
    this.storeData.whatsappPhone = st.cleaned;
    this.whatsappPhoneLiveWarning = st.warning;
    
    if (this.inputWhatsappPhone) {
      this.inputWhatsappPhone.value = st.cleaned;
    }
  }

  private async syncStoreNameFromNativeInput(): Promise<void> {
    if (!this.inputStoreName) {
      return;
    }
    try {
      const el = await this.inputStoreName.getInputElement();
      const v = el?.value;
      if (typeof v === 'string') {
        this.storeData.storeName = v;
      }
    } catch {
      /* ignore */
    }
  }

  async saveStore() {
    await this.syncStoreNameFromNativeInput();
    this.storeData.storeName = normalizeUserFreeText(this.storeData.storeName);
    if (!this.storeData.storeName || !this.storeData.category_id) {
      this.presentToast('يرجى إكمال البيانات الأساسية');
      return;
    }

    const user = this.auth.currentUser;
    if (!user) {
      this.presentToast('يرجى تسجيل الدخول أولاً');
      return;
    }

    const loader = await this.loadingCtrl.create({
      message: this.isEditMode ? 'جاري تحديث البيانات...' : 'جاري إنشاء المتجر...',
      mode: 'ios',
    });
    await loader.present();

    try {
      let ntfySnapshot: Record<string, unknown> | null = null;

      if (!this.isEditMode) {
        const duplicate = await runInInjectionContext(this.injector, async () => {
          const adsRef = collection(this.firestore, 'ads');
          const q = query(
            adsRef,
            where('owner_phone', '==', this.storeData.contactPhone),
            where('category_id', '==', this.storeData.category_id),
            where('ad_type', '==', 'store')
          );
          const querySnapshot = await getDocs(q);
          return !querySnapshot.empty;
        });
        if (duplicate) {
          await loader.dismiss();
          this.presentToast('لقد قمت بإضافة متجر بنفس النشاط مسبقاً');
          return;
        }
      }

      const adId = this.isEditMode ? (this.editAdData.ad_id || this.editAdData.id) : `store_${this.storeData.contactPhone}_${Date.now()}`;
      const finalStatus = 'pending';
      const logoUrl = this.storeData.logo || 'assets/mota7.png';
      const adPayload: any = {
        ad_id: adId,
        userId: user.uid,
        owner_name: this.ownerRealName,
        category_id: this.storeData.category_id,
        store_name: this.storeData.storeName,
        owner_phone: this.storeData.contactPhone,
        whatsapp_phone: this.storeData.whatsappEnabled ? this.storeData.whatsappPhone : null,
        logo: logoUrl,
        logo_cloudinary_public_id:
          logoUrl.includes('assets/mota7') || !this.logoCloudinaryPublicId
            ? null
            : this.logoCloudinaryPublicId,
        location: { lat: this.storeData.lat, lng: this.storeData.lng },
        city: this.storeData.city,
        ad_type: 'store',
        isStore: true,
        status: finalStatus,
        verification_level: this.userVerificationStatus,
        sort_order: 999,
        admin_reason: this.isEditMode ? (this.editAdData.admin_reason || '') : '',
        created_at: this.isEditMode ? this.editAdData.created_at : serverTimestamp(),
        updated_at: serverTimestamp(),
        stats: this.isEditMode
          ? this.editAdData.stats
          : { views: 0, calls: 0, whatsapp: 0, ratings: 0 },
        ...(this.isEditMode
          ? {}
          : {
              call_clicks: 0,
              whatsapp_clicks: 0,
              impression_count: 0,
            }),
      };

      if (!this.isEditMode) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        adPayload.expiry_date = expiryDate;
        ntfySnapshot = {
          ad_type: 'store',
          store_name: adPayload.store_name,
          category_id: adPayload.category_id,
          owner_name: adPayload.owner_name,
        };
      } else {
        adPayload.expiry_date = this.editAdData.expiry_date;
      }

      await runInInjectionContext(this.injector, async () => {
        const adRef = doc(this.firestore, 'ads', adId);
        await setDoc(adRef, adPayload);
      });

      await loader.dismiss();
      this.presentToast(this.isEditMode ? 'تم تحديث البيانات بنجاح' : 'تم إرسال متجرك للمراجعة بنجاح');
      await this.modalCtrl.dismiss({ saved: true }, 'confirm');

      if (!this.isEditMode) {
        if (ntfySnapshot && user) {
          void this.newAdNtfy.notifyAfterNewAdSubmitted(user.uid, ntfySnapshot);
        }
        this.navCtrl.navigateRoot('/my-ads');
      }
    } catch (e: any) {
      if (loader) await loader.dismiss();
      console.error('Error saving store:', e);
      this.presentToast('حدث خطأ أثناءالحفظ - تواصل مع الادارة');
    }
  }

  async close() {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  async presentToast(m: string) {
    const t = await this.toastCtrl.create({ 
      message: m, 
      duration: 3000, 
      mode: 'ios', 
      position: 'bottom' 
    });
    await t.present();
  }
}
