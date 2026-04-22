import { Component, OnInit, OnDestroy, inject, Input, EnvironmentInjector, runInInjectionContext, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonicModule, LoadingController, ToastController, NavController, ModalController, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { AppLauncher } from '@capacitor/app-launcher';
import { DELIVERY_CATEGORY } from '../../../../core/constants/delivery-data';
import { AppTaxonomyService, type TaxonomyBundle } from '../../../../core/services/app-taxonomy.service';
import { NewAdNtfyService } from 'src/app/core/services/new-ad-ntfy.service';
import { readIonTextInputValueFromEvent } from 'src/app/core/utils/order-form-fields.util';
import { applyOrderPhoneInputState } from 'src/app/core/utils/egyptian-phone-order.util';
import { findDuplicateAd, presentDuplicateAdAlert } from 'src/app/core/utils/duplicate-ad.util';
import { addIcons } from 'ionicons';
import { chevronDownOutline, chevronForwardOutline, logoWhatsapp, locationOutline } from 'ionicons/icons';

@Component({
  selector: 'app-delivery-form',
  templateUrl: './delivery-form.component.html',
  styleUrls: ['./delivery-form.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class DeliveryFormComponent implements OnInit, OnDestroy {
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
  private locationListenerHandles: PluginListenerHandle[] = [];
  private locationResumeRetryInFlight = false;

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

  ngOnDestroy(): void {
    void this.clearLocationResumeListener();
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
    const loader = await this.loadingCtrl.create({
      message: 'جارى تحديث موقعك',
      mode: 'ios'
    });
    await loader.present();

    try {
      if (this.locationFunc) {
        const coords = await this.locationFunc();
        if (coords) {
          this.deliveryData.lat = coords.lat;
          this.deliveryData.lng = coords.lng;
          console.log('Location Updated:', coords);
          return;
        }
      } else {
        const permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted') {
          const requested = await Geolocation.requestPermissions();
          if (requested.location !== 'granted') {
            await this.presentGpsEnableAlert();
            return;
          }
        }

        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 30000
        });
        this.deliveryData.lat = pos.coords.latitude;
        this.deliveryData.lng = pos.coords.longitude;
        return;
      }

      await this.presentGpsEnableAlert();
    } catch (error) {
      const msg = String((error as { message?: string; code?: string | number })?.message || (error as { code?: string | number })?.code || '').toLowerCase();
      const isGpsDisabled =
        msg.includes('location disabled') ||
        msg.includes('location services') ||
        msg.includes('gps') ||
        msg.includes('unavailable');

      if (isGpsDisabled) {
        await this.presentGpsEnableAlert();
      } else {
        await this.presentToast('تعذر تحديد موقعك الآن، حاول مرة أخرى');
      }
    } finally {
      await loader.dismiss();
    }
  }

  private async presentGpsEnableAlert(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'تنبيه الموقع',
      message: 'عفوا, تأكد من تفعيل ال gps في هاتفك',
      mode: 'ios',
      buttons: [
        {
          text: 'إلغاء',
          role: 'cancel'
        },
        {
          text: 'تفعيل',
          role: 'confirm',
          handler: () => {
            void this.openLocationSettings();
          }
        }
      ]
    });
    await alert.present();
  }

  private async openLocationSettings(): Promise<void> {
    await this.registerRetryGetLocationOnNextResume();
    const candidates = [
      'android.settings.LOCATION_SOURCE_SETTINGS',
      'intent://settings/location#Intent;scheme=android-app;end',
      'app-settings:'
    ];

    for (const url of candidates) {
      try {
        const can = await AppLauncher.canOpenUrl({ url });
        if (can.value) {
          await AppLauncher.openUrl({ url });
          return;
        }
      } catch {
        // try next candidate
      }
    }
  }

  private async registerRetryGetLocationOnNextResume(): Promise<void> {
    await this.clearLocationResumeListener();

    const onForeground = () => {
      void this.runLocationRetryAfterForeground();
    };

    const h1 = await App.addListener('resume', onForeground);
    const h2 = await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        onForeground();
      }
    });
    this.locationListenerHandles.push(h1, h2);
  }

  private async runLocationRetryAfterForeground(): Promise<void> {
    if (this.locationResumeRetryInFlight) {
      return;
    }
    this.locationResumeRetryInFlight = true;
    try {
      await this.clearLocationResumeListener();
      // Give the OS a moment to apply location settings before retry.
      await new Promise((resolve) => setTimeout(resolve, 900));
      await this.requestLocation();
    } finally {
      this.locationResumeRetryInFlight = false;
    }
  }

  private async clearLocationResumeListener(): Promise<void> {
    for (const handle of this.locationListenerHandles) {
      try {
        await handle.remove();
      } catch {
        // ignore
      }
    }
    this.locationListenerHandles = [];
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

      /**
       * runInInjectionContext لا يغطي استكمال async بعد await — لذلك نفصل:
       * 1) فحص التكرار (getDocs فقط داخل سياق)
       * 2) setDoc/updateDoc كلٌ في استدعاء منفصل بلا await سابق لنفس الـ callback
       */
      if (!this.isEditMode) {
        const duplicate = await runInInjectionContext(this.injector, () =>
          findDuplicateAd({
            firestore: this.firestore,
            phone: this.deliveryData.contactPhone,
            adType: 'delivery',
            categoryId: this.deliveryData.category_id,
          })
        );
        if (duplicate) {
          await loader.dismiss();
          await presentDuplicateAdAlert({
            alertCtrl: this.alertCtrl,
            adType: 'delivery',
            activityNameAr: categoryNameAr,
            existingStatus: duplicate.status,
          });
          return;
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
        ntfySnapshot = {
          ad_type: 'delivery',
          category_id: adPayload.category_id,
          owner_name: adPayload.owner_name,
          details: { ...adPayload.details },
        };
        await runInInjectionContext(this.injector, async () => {
          await updateDoc(doc(this.firestore, 'ads', adId), adPayload);
        });
      } else {
        adPayload.status = 'pending';
        adPayload.created_at = serverTimestamp();
        adPayload.reject_reason = '';
        adPayload.call_clicks = 0;
        adPayload.whatsapp_clicks = 0;
        adPayload.impression_count = 0;
        adPayload.stats = { views: 0, calls: 0, whatsapp: 0 };
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        adPayload.expiry_date = expiry;
        await runInInjectionContext(this.injector, async () => {
          await setDoc(doc(this.firestore, 'ads', adId), adPayload);
        });
        ntfySnapshot = {
          ad_type: 'delivery',
          category_id: adPayload.category_id,
          owner_name: adPayload.owner_name,
          details: { ...adPayload.details },
        };
      }

      this.isSubmitting = true;
      await loader.dismiss();
      this.presentToast(this.isEditMode ? 'تم تحديث الإعلان بنجاح' : 'تم إرسال طلب الانضمام بنجاح');
      
      await this.modalCtrl.dismiss({ submitted: true }, 'confirm');
      if (ntfySnapshot) {
        if (this.isEditMode) {
          void this.newAdNtfy.notifyAfterAdUpdated(user.uid, ntfySnapshot);
        } else {
          void this.newAdNtfy.notifyAfterNewAdSubmitted(user.uid, ntfySnapshot);
        }
      }
      if (!this.isEditMode) {
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
