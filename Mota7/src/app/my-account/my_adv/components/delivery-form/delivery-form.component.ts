import { Component, OnInit, inject, Input, EnvironmentInjector, runInInjectionContext, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonicModule, LoadingController, ToastController, NavController, ModalController, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { DELIVERY_CATEGORY } from '../../../../core/constants/delivery-data';
import { AppTaxonomyService, type TaxonomyBundle } from '../../../../core/services/app-taxonomy.service';
import { NewAdNtfyService } from 'src/app/core/services/new-ad-ntfy.service';
import { readIonTextInputValueFromEvent } from 'src/app/core/utils/order-form-fields.util';
import { applyOrderPhoneInputState } from 'src/app/core/utils/egyptian-phone-order.util';
import { addIcons } from 'ionicons';
import { chevronDownOutline, chevronForwardOutline, logoWhatsapp, locationOutline } from 'ionicons/icons';

@Component({
  selector: 'app-delivery-form',
  templateUrl: './delivery-form.component.html',
  styleUrls: ['./delivery-form.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class DeliveryFormComponent implements OnInit {
  @Input() editAdData: any; 
  @Input() locationFunc: any; // استقبال دالة الموقع من الصفحة الأب

  deliveryCategories: any[] = [...DELIVERY_CATEGORY.items];
  isSubmitting = false;
  isEditMode = false; 
  currentAdId: string | null = null; 
  userVerificationStatus: string = 'none'; // لتخزين حالة التوثيق (none, blue, gold)

  deliveryData = {
    category_id: '', 
    driverName: '',
    contactPhone: '',
    isAvailable: true,
    canTravel: false, 
    forRent: false,   
    whatsappEnabled: true,
    whatsappPhone: '',
    lat: 0,
    lng: 0,
    city: ''
  };

  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private modalCtrl = inject(ModalController);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private navCtrl = inject(NavController);
  private injector = inject(EnvironmentInjector);
  private newAdNtfy = inject(NewAdNtfyService);
  private taxonomy = inject(AppTaxonomyService);
  private destroyRef = inject(DestroyRef);

  constructor() {
    addIcons({ chevronDownOutline, chevronForwardOutline, logoWhatsapp, locationOutline });
  }

  async ngOnInit() {
    this.taxonomy.bundle$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((b: TaxonomyBundle) => {
      this.deliveryCategories = b.deliveryItems;
    });

    if (this.editAdData) {
      this.initEditData(this.editAdData);
    } else {
      await this.loadUserProfile();
    }
  }

  initEditData(ad: any) {
    this.isEditMode = true;
    this.currentAdId = ad.id || ad.ad_id; 
    this.userVerificationStatus = ad.verification_level || 'none';
    this.deliveryData = {
      category_id: ad.category_id || '',
      driverName: ad.details?.driver_name || '',
      contactPhone: ad.owner_phone || '',
      isAvailable: ad.is_available ?? true,
      canTravel: ad.details?.can_travel || false,
      forRent: ad.details?.for_rent || false,
      whatsappEnabled: !!ad.details?.whatsapp_phone,
      whatsappPhone: ad.details?.whatsapp_phone || ad.owner_phone || '',
      city: ad.city || '',
      lat: ad.location?.lat || 0,
      lng: ad.location?.lng || 0
    };
  }

  async loadUserProfile() {
    const user = this.auth.currentUser;
    if (user?.email) {
      const userKey = user.email.split('@')[0];
      const userDoc = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'users', userKey))
      );
      if (userDoc.exists()) {
        const data = userDoc.data();
        this.deliveryData.contactPhone = data['phone'] || '';
        this.deliveryData.whatsappPhone = data['phone'] || '';
        this.deliveryData.city = data['city'] || '';
        this.deliveryData.driverName = data['fullName'] || '';
        // جلب حالة التوثيق من حساب المستخدم لتعيينها للإعلان
        this.userVerificationStatus = data['verificationStatus'] || 'none';
      }
    }
  }

  async requestLocation() {
    if (this.locationFunc) {
      const coords = await this.locationFunc();
      if (coords) {
        this.deliveryData.lat = coords.lat;
        this.deliveryData.lng = coords.lng;
        console.log('Location Updated:', coords);
      }
    }
  }

  onWhatsappPhoneInput(ev: Event): void {
    const st = applyOrderPhoneInputState(readIonTextInputValueFromEvent(ev));
    this.deliveryData.whatsappPhone = st.cleaned;
  }

  async saveDeliveryAd() {
    if (!this.deliveryData.category_id) {
      this.presentToast('يرجى اختيار نوع الخدمة');
      return;
    }
  
    const user = this.auth.currentUser;
    if (!user) {
      this.presentToast('يجب تسجيل الدخول أولاً');
      return;
    }
  
    const loader = await this.loadingCtrl.create({ 
      message: this.isEditMode ? 'جاري تحديث الإعلان...' : 'جاري التحقق والحفظ...',
      mode: 'ios'
    });
    await loader.present();
  
    try {
      const selectedCategory = this.deliveryCategories.find(cat => cat.id === this.deliveryData.category_id);
      const categoryNameAr = selectedCategory ? selectedCategory.nameAr : '';
      const delivery_match_key = `${categoryNameAr}_${this.deliveryData.city}`;
      let ntfySnapshot: Record<string, unknown> | null = null;

      const outcome = await runInInjectionContext(this.injector, async (): Promise<'duplicate' | 'ok'> => {
        if (!this.isEditMode) {
          const adsRef = collection(this.firestore, 'ads');
          const q = query(
            adsRef,
            where('owner_phone', '==', this.deliveryData.contactPhone),
            where('category_id', '==', this.deliveryData.category_id),
            where('ad_type', '==', 'delivery')
          );
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            return 'duplicate';
          }
        }

        const adId = this.isEditMode ? this.currentAdId! : `${this.deliveryData.contactPhone}_${this.deliveryData.category_id}-${Date.now()}`;

        const adPayload: any = {
          ad_id: adId,
          userId: user.uid,
          owner_name: this.deliveryData.driverName,
          owner_phone: this.deliveryData.contactPhone,
          category_id: this.deliveryData.category_id,
          ad_type: 'delivery',
          delivery_match_key: delivery_match_key,
          verification_level: this.userVerificationStatus,
          sort_order: 999,
          details: {
            driver_name: this.deliveryData.driverName,
            can_travel: this.deliveryData.canTravel,
            for_rent: this.deliveryData.forRent,
            whatsapp_phone: this.deliveryData.whatsappEnabled ? this.deliveryData.whatsappPhone : null,
            is_available: this.deliveryData.isAvailable
          },
          location: { lat: this.deliveryData.lat, lng: this.deliveryData.lng },
          city: this.deliveryData.city,
          is_available: this.deliveryData.isAvailable,
          updated_at: serverTimestamp(),
        };

        if (this.isEditMode) {
          adPayload.status = 'pending';
          await updateDoc(doc(this.firestore, 'ads', adId), adPayload);
        } else {
          adPayload.status = 'pending';
          adPayload.created_at = serverTimestamp();
          adPayload.reject_reason = '';
          const expiry = new Date();
          expiry.setDate(expiry.getDate() + 30);
          adPayload.expiry_date = expiry;
          await setDoc(doc(this.firestore, 'ads', adId), adPayload);
          ntfySnapshot = {
            ad_type: 'delivery',
            category_id: adPayload.category_id,
            owner_name: adPayload.owner_name,
            details: { ...adPayload.details },
          };
        }
        return 'ok';
      });

      if (outcome === 'duplicate') {
        await loader.dismiss();
        this.presentToast('لديك إعلان مضاف بالفعل لنفس نوع الخدمة');
        return;
      }

      this.isSubmitting = true;
      await loader.dismiss();
      this.presentToast(this.isEditMode ? 'تم تحديث الإعلان بنجاح' : 'تم إرسال طلب الانضمام بنجاح');
      
      await this.modalCtrl.dismiss({ submitted: true }, 'confirm');
      if (!this.isEditMode) {
        if (ntfySnapshot) {
          void this.newAdNtfy.notifyAfterNewAdSubmitted(user.uid, ntfySnapshot);
        }
          this.navCtrl.navigateRoot('/my-ads');
      }
  
    } catch (e) {
      console.error(e);
      if (loader) await loader.dismiss();
      this.presentToast('حدث خطأ أثناء الحفظ - تواصل مع الإدارة');
    }
  }
  
  async close() {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  async presentToast(m: string) {
    const t = await this.toastCtrl.create({ message: m, duration: 2500, mode: 'ios', position: 'bottom' });
    await t.present();
  }
}
