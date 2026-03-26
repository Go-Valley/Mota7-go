import { Component, OnInit, inject, Input, EnvironmentInjector, runInInjectionContext, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonicModule, LoadingController, ToastController, NavController, ModalController, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { OTHER_SERVICES_DATA } from '../../../../core/constants/other-services-data';
import { AppTaxonomyService } from '../../../../core/services/app-taxonomy.service';
import { NewAdNtfyService } from 'src/app/core/services/new-ad-ntfy.service';
import { readIonTextInputValueFromEvent } from 'src/app/core/utils/order-form-fields.util';
import { applyOrderPhoneInputState } from 'src/app/core/utils/egyptian-phone-order.util';
import { addIcons } from 'ionicons';
import { chevronDownOutline, chevronForwardOutline, logoWhatsapp, shieldCheckmark, checkmarkCircle } from 'ionicons/icons';

@Component({
  selector: 'app-other-services-form',
  templateUrl: './other-services-form.component.html',
  styleUrls: ['./other-services-form.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class OtherServicesFormComponent implements OnInit {
  @Input() editAdData: any; 
  categories: any[] = [...OTHER_SERVICES_DATA.items];
  isEditMode = false;
  currentAdId: string | null = null;
  userVerificationStatus: string = 'none';

  serviceData = {
    category_id: '',
    providerName: '', 
    isAvailable: true,
    contactPhone: '',
    whatsappEnabled: true,
    whatsappPhone: '',
    lat: 0,
    lng: 0,
    city: ''
  };

  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private injector = inject(EnvironmentInjector);
  private newAdNtfy = inject(NewAdNtfyService);
  private taxonomy = inject(AppTaxonomyService);
  private destroyRef = inject(DestroyRef);

  constructor(
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController
  ) {
    addIcons({ chevronDownOutline, chevronForwardOutline, logoWhatsapp, shieldCheckmark, checkmarkCircle });
  }

  async ngOnInit() {
    this.taxonomy.bundle$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((b) => {
      this.categories = b.otherItems;
    });

    if (this.editAdData) {
      this.isEditMode = true;
      this.loadExistingAdData(this.editAdData);
    } else {
      // تحميل بيانات البروفايل فور فتح الصفحة
      await this.loadUserProfile();
    }
  }

  loadExistingAdData(ad: any) {
    this.currentAdId = ad.id || ad.ad_id;
    this.serviceData = {
      category_id: ad.category_id || '',
      providerName: ad.details?.provider_name || ad.owner_name || '',
      isAvailable: ad.is_available ?? true,
      contactPhone: ad.owner_phone || '',
      whatsappEnabled: !!ad.details?.whatsapp_phone,
      whatsappPhone: ad.details?.whatsapp_phone || ad.owner_phone || '',
      lat: ad.location?.lat || 0,
      lng: ad.location?.lng || 0,
      city: ad.city || ''
    };
  }

  async loadUserProfile() {
    const user = this.auth.currentUser;
    if (user && user.email) {
      const userKey = user.email.split('@')[0];
      try {
        const userDoc = await runInInjectionContext(this.injector, () =>
          getDoc(doc(this.firestore, 'users', userKey))
        );
        if (userDoc.exists()) {
          const data = userDoc.data();
          this.serviceData.contactPhone = data['phone'] || '';
          this.serviceData.whatsappPhone = data['phone'] || '';
          this.serviceData.city = data['city'] || '';
          this.serviceData.providerName = data['fullName'] || data['name'] || '';
          return data;
        }
      } catch (e) {
        console.error("Error loading profile:", e);
      }
    }
    return null;
  }

  onWhatsappPhoneInput(ev: Event): void {
    const st = applyOrderPhoneInputState(readIonTextInputValueFromEvent(ev));
    this.serviceData.whatsappPhone = st.cleaned;
  }

// دالة الحفظ المعدلة اللي هتحل المشكلة
async saveServiceAd() {
  if (!this.serviceData.category_id) {
    this.presentToast('يرجى اختيار نوع الخدمة');
    return;
  }

  const loader = await this.loadingCtrl.create({ 
    message: 'جاري الحفظ...', 
    mode: 'ios' 
  });
  await loader.present();

  try {
    const user = this.auth.currentUser;
    if (!user) {
      await loader.dismiss();
      this.presentToast('يجب تسجيل الدخول أولاً');
      return;
    }

    // محاولة جلب الاسم من البيانات المحملة مسبقاً في ngOnInit أو من الفورم
    let nameToSave = this.serviceData.providerName || 'مستخدم متاح';

    const adId = this.isEditMode ? this.currentAdId! : `${this.serviceData.contactPhone}_${this.serviceData.category_id}-${Date.now()}`;
    
    const selectedCategory = this.categories.find(cat => cat.id === this.serviceData.category_id);
    const serviceNameAr = selectedCategory ? selectedCategory.nameAr : '';
    const other_match_key = `${serviceNameAr}_${this.serviceData.city}`;
    let ntfySnapshot: Record<string, unknown> | null = null;

    await runInInjectionContext(this.injector, async () => {
      const adPayload: any = {
        ad_id: adId,
        userId: user.uid,
        owner_phone: this.serviceData.contactPhone,
        owner_name: nameToSave,
        ad_type: 'other',
        category_id: this.serviceData.category_id,
        other_match_key: other_match_key,
        verification_level: this.userVerificationStatus,
        sort_order: 999,
        details: {
          provider_name: nameToSave,
          whatsapp_phone: this.serviceData.whatsappEnabled ? this.serviceData.whatsappPhone : null,
          is_available: this.serviceData.isAvailable
        },
        location: { lat: this.serviceData.lat, lng: this.serviceData.lng },
        city: this.serviceData.city,
        is_available: this.serviceData.isAvailable,
        updated_at: serverTimestamp()
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
          ad_type: 'other',
          category_id: adPayload.category_id,
          owner_name: adPayload.owner_name,
          details: { ...adPayload.details },
        };
      }
    });

    await loader.dismiss();
    await this.modalCtrl.dismiss({ submitted: true }, 'confirm');
    this.presentToast(this.isEditMode ? 'تم تحديث البيانات بنجاح' : 'تم إرسال طلبك للمراجعة بنجاح');

    if (!this.isEditMode) {
      if (ntfySnapshot) {
        void this.newAdNtfy.notifyAfterNewAdSubmitted(user.uid, ntfySnapshot);
      }
      this.navCtrl.navigateRoot('/my-ads');
    }

  } catch (e) {
    if (loader) await loader.dismiss();
    console.error("Firebase Error: ", e);
    this.presentToast('حدث خطأ أثناء الحفظ');
  }
}

async close() {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  async presentToast(m: string) {
    const t = await this.toastCtrl.create({ 
      message: m, 
      duration: 2500, 
      mode: 'ios', 
      position: 'bottom' 
    });
    await t.present();
  }
}
