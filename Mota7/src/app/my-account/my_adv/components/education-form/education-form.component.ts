import { Component, OnInit, inject, Input, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { IonicModule, LoadingController, ToastController, NavController, ModalController, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { EDUCATION_CATEGORY } from '../../../../core/constants/educational-data';
import { NewAdNtfyService } from 'src/app/core/services/new-ad-ntfy.service';
import { addIcons } from 'ionicons';
import { schoolOutline, logoWhatsapp, chevronDownOutline, chevronForwardOutline, shieldCheckmark, checkmarkCircle } from 'ionicons/icons';

@Component({
  selector: 'app-education-form',
  templateUrl: './education-form.component.html',
  styleUrls: ['./education-form.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class EducationFormComponent implements OnInit {
  @Input() editAdData: any; 

  eduCategories = EDUCATION_CATEGORY.items;
  availableSubjects: string[] = [];
  isSubmitting = false;
  isEditMode = false;
  currentAdId: string | null = null;
  userVerificationStatus: string = 'none';

  eduData = {
    category_id: '',
    teacherName: '',
    subjectName: '',
    description: '',
    location_type: 'مركز تعليمي',
    contactPhone: '',
    isAvailable: true,
    whatsappEnabled: true,
    whatsappPhone: '',
    lat: 0,
    lng: 0,
    city: 'الخارجة'
  };
  
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private injector = inject(EnvironmentInjector);
  private newAdNtfy = inject(NewAdNtfyService);

  constructor(
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController
  ) {
    addIcons({ schoolOutline, logoWhatsapp, chevronDownOutline, chevronForwardOutline, shieldCheckmark, checkmarkCircle });
  }

  ngOnInit(): void {
    if (this.editAdData) {
      this.setupEditData(this.editAdData);
    } else {
      this.loadUserProfile().then(() => {
        this.requestLocation();
      });
    }
  }

  setupEditData(ad: any) {
    this.isEditMode = true;
    this.currentAdId = ad.id || ad.ad_id;
    
    let tName = ad.details?.teacher_name || '';
    if (tName && !tName.startsWith('أ/ ')) {
      tName = `أ/ ${tName}`;
    }
  
    this.eduData = {
      category_id: ad.category_id || '',
      teacherName: tName,
      subjectName: ad.details?.subject || '',
      description: ad.details?.description || '',
      location_type: ad.details?.location_type || 'مركز تعليمي',
      contactPhone: ad.owner_phone || '',
      isAvailable: ad.is_available ?? true,
      whatsappEnabled: !!ad.details?.whatsapp_phone,
      whatsappPhone: ad.details?.whatsapp_phone || '',
      lat: ad.location?.lat || 0,
      lng: ad.location?.lng || 0,
      city: ad.city || ''
    };
    this.onCategoryChange();
  }

  onCategoryChange() {
    const selectedCat = this.eduCategories.find(c => c.id === this.eduData.category_id);
    this.availableSubjects = selectedCat ? selectedCat.subjects : [];
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
        let fullName = data['fullName'] || 'ميدو'; 
        if (!fullName.startsWith('أ/ ')) {
          fullName = `أ/ ${fullName}`;
        }
        this.eduData.teacherName = fullName; 
        this.eduData.city = data['city'] || 'الخارجة';
        this.eduData.contactPhone = data['phone'] || '';
        this.eduData.whatsappPhone = data['phone'] || '';
      }
    }
  }

  requestLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        this.eduData.lat = pos.coords.latitude;
        this.eduData.lng = pos.coords.longitude;
      });
    }
  }



  async saveEduAd() {
    if (!this.eduData.category_id || !this.eduData.subjectName) {
      this.presentToast('يرجى اختيار المرحلة التعليمية والمادة');
      return;
    }

    const user = this.auth.currentUser; // تعريف المستخدم
    if (!user) {
      this.presentToast('يجب تسجيل الدخول أولاً');
      return;
    }

    const loader = await this.loadingCtrl.create({ 
      message: this.isEditMode ? 'جاري الحفظ...' : 'جاري التحقق والحفظ...', 
      mode: 'ios' 
    });
    await loader.present();

    try {
      const selectedCat = this.eduCategories.find(c => c.id === this.eduData.category_id);
      const stageNameAr = selectedCat ? (selectedCat as any).nameAr : this.eduData.category_id;
      const educationMatchKey = `${stageNameAr}+${this.eduData.subjectName}+${this.eduData.city}`;
      let ntfySnapshot: Record<string, unknown> | null = null;

      const outcome = await runInInjectionContext(this.injector, async (): Promise<'duplicate' | 'ok'> => {
        if (!this.isEditMode) {
          const adsRef = collection(this.firestore, 'ads');
          const q = query(
            adsRef,
            where('owner_phone', '==', this.eduData.contactPhone),
            where('education_match_key', '==', educationMatchKey),
            where('ad_type', '==', 'education')
          );
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            return 'duplicate';
          }
        }

        const adId = this.isEditMode ? this.currentAdId! : `${this.eduData.contactPhone}_${Date.now()}`;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);

        const adPayload: any = {
          ad_id: adId,
          userId: user.uid,
          owner_name: this.eduData.teacherName,
          owner_phone: this.eduData.contactPhone,
          category_id: this.eduData.category_id,
          ad_type: 'education',
          education_match_key: educationMatchKey,
          verification_level: this.userVerificationStatus,
          sort_order: 999,
          details: {
            teacher_name: this.eduData.teacherName,
            subject: this.eduData.subjectName,
            description: this.eduData.description,
            location_type: this.eduData.location_type,
            whatsapp_phone: this.eduData.whatsappEnabled ? this.eduData.whatsappPhone : null
          },
          location: { lat: this.eduData.lat, lng: this.eduData.lng },
          city: this.eduData.city,
          is_available: this.eduData.isAvailable,
          updated_at: serverTimestamp(),
        };

        if (this.isEditMode) {
          adPayload.status = 'pending';
          await updateDoc(doc(this.firestore, 'ads', adId), adPayload);
        } else {
          adPayload.status = 'pending';
          adPayload.created_at = serverTimestamp();
          adPayload.expiry_date = expiry;
          adPayload.reject_reason = '';
          await setDoc(doc(this.firestore, 'ads', adId), adPayload);
          ntfySnapshot = {
            ad_type: 'education',
            category_id: adPayload.category_id,
            owner_name: adPayload.owner_name,
            details: { ...adPayload.details },
          };
        }
        return 'ok';
      });

      if (outcome === 'duplicate') {
        await loader.dismiss();
        this.presentToast('لديك إعلان سابق مضاف بالفعل لنفس المرحلة والمادة');
        return;
      }

      this.isSubmitting = true;
      await loader.dismiss();
      this.presentToast(this.isEditMode ? 'تم تحديث الإعلان بنجاح' : 'تم إرسال إعلانك التعليمي بنجاح');
      await this.modalCtrl.dismiss({ submitted: true }, 'confirm');
      if (!this.isEditMode && ntfySnapshot) {
        void this.newAdNtfy.notifyAfterNewAdSubmitted(user.uid, ntfySnapshot);
      }
      this.navCtrl.navigateRoot('/my-ads');

    } catch (e) {
      console.error(e);
      await loader.dismiss();
      this.presentToast('حدث خطأ أثناء الحفظ - تواصل مع الإدارة');
    }
  }
  
  async close() {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  async presentToast(m: string) {
    const t = await this.toastCtrl.create({ message: m, duration: 2500, mode: 'ios' });
    await t.present();
  }
}
