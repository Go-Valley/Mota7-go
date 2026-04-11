import { Component, OnDestroy, OnInit, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, NavController, AlertController, LoadingController, ModalController, Platform } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { subscribeHardwareBackToMyAccount } from '../../core/utils/hardware-back-my-account.util';
import { Firestore, collection, query, where, onSnapshot, doc, getDoc, deleteDoc, orderBy } from '@angular/fire/firestore';
import { CloudinaryCleanupService } from '../../core/services/cloudinary-cleanup.service';
import { collectCloudinaryPublicIdsFromAd } from '../../core/utils/cloudinary-public-id.util';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { addIcons } from 'ionicons';
import { Mota7HeaderComponent } from '../../top_header/header';
import { FormsModule } from '@angular/forms';
import {
  rocketOutline,
  addCircleOutline,
  arrowForwardOutline,
  callOutline,
  personOutline,
  locationOutline,
  chevronForwardOutline,
  documentTextOutline,
  createOutline,
  personCircle,
  gridOutline,
  carSportOutline,
  sparklesOutline,
  megaphoneOutline,
} from 'ionicons/icons';

// الكروت والعمليات
import { StoreCardComponent } from './components/store-form/store-card.component';
import { ProductCardComponent } from './components/product-form/product-card.component';
import { DeliveryCardComponent } from './components/delivery-form/delivery-card.component';
import { EducationCardComponent } from './components/education-form/education-card.component';
import { OtherServicesCardComponent } from './components/other-services-form/other-services-card.component';

// الفورمات
import { StoreFormComponent } from './components/store-form/store-form.component';
import { ProductFormComponent } from './components/product-form/product-form.component';
import { DeliveryFormComponent } from './components/delivery-form/delivery-form.component';
import { EducationFormComponent } from './components/education-form/education-form.component';
import { OtherServicesFormComponent } from './components/other-services-form/other-services-form.component';
import { UserAccountStatusService } from '../user-account-status.service';
import { getDeliveryAdCurrentLocation } from '../../core/utils/delivery-ad-geolocation.util';

@Component({
  selector: 'app-my-ads',
  templateUrl: './my-ads.page.html',
  styleUrls: ['./my-ads.page.scss'],
  standalone: true,
  imports: [
    IonicModule, CommonModule, Mota7HeaderComponent,
    StoreCardComponent, ProductCardComponent, DeliveryCardComponent, 
    EducationCardComponent, OtherServicesCardComponent, FormsModule
  ]
})

export class MyAdsPage implements OnInit, OnDestroy {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private navCtrl = inject(NavController);
  private platform = inject(Platform);
  private loadingCtrl = inject(LoadingController);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController); // حقن مباشر للـ AlertController لتجنب الأخطاء
  private cloudinaryCleanup = inject(CloudinaryCleanupService);
  private hardwareBackSub?: Subscription;
  readonly acct = inject(UserAccountStatusService);

  userName: string = 'جاري التحميل...';
  userPhone: string = '';
  userCity: string = ''; 
  
  storesAndProducts: any[] = [];
  servicesAds: any[] = [];
  
  selectedTab: string = 'commercial';
  isLoading: boolean = true;
  hasAds: boolean = false; 

  constructor() {
    addIcons({
      rocketOutline,
      addCircleOutline,
      arrowForwardOutline,
      callOutline,
      personOutline,
      locationOutline,
      chevronForwardOutline,
      documentTextOutline,
      createOutline,
      personCircle,
      gridOutline,
      carSportOutline,
      sparklesOutline,
      'megaphone-outline': megaphoneOutline,
    });
  }

  ngOnInit() {
    this.hardwareBackSub = subscribeHardwareBackToMyAccount(
      this.platform,
      this.navCtrl,
      this.modalCtrl
    );
    runInInjectionContext(this.injector, () =>
      onAuthStateChanged(this.auth, (user) => {
        if (user) {
          this.loadUserData(user);
        } else {
          this.isLoading = false;
          this.navCtrl.navigateRoot('/login');
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.hardwareBackSub?.unsubscribe();
    this.hardwareBackSub = undefined;
  }

  async loadUserData(user: any) {
    try {
      if (user && user.email) {
        this.userPhone = user.email.split('@')[0];
        const userDoc = await runInInjectionContext(this.injector, () =>
          getDoc(doc(this.firestore, 'users', this.userPhone))
        );
        if (userDoc.exists()) {
          const data = userDoc.data() as any;
          this.userName = data.fullName || data.name || 'مستخدم متاح';
          this.userCity = data.city || 'الخارجة';
        }
        this.listenToAds();
      }
    } catch (e) {
      this.isLoading = false;
    }
  }

  listenToAds() {
    runInInjectionContext(this.injector, () => {
      const adsRef = collection(this.firestore, 'ads');
      const q = query(
        adsRef,
        where('owner_phone', '==', this.userPhone),
        orderBy('created_at', 'desc')
      );

      onSnapshot(
        q,
        (snapshot) => {
          const allAds = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

          this.storesAndProducts = allAds.filter(
            (ad: any) => ad?.ad_type === 'store' || ad?.ad_type === 'product'
          );
          this.servicesAds = allAds.filter(
            (ad: any) =>
              ad?.ad_type === 'delivery' ||
              ad?.ad_type === 'education' ||
              ad?.ad_type === 'other_services' ||
              ad?.ad_type === 'other' ||
              ad?.ad_type === 'services'
          );

          this.hasAds = allAds.length > 0;
          this.isLoading = false;
        },
        (error) => {
          console.error('Snapshot error:', error);
          this.isLoading = false;
        }
      );
    });
  }
  
  async editAd(ad: any) {
    if (!this.acct.accountUsable()) {
      return;
    }
    let componentToOpen: any;
    let props: any = { editAdData: ad };

    switch (ad.ad_type) {
      case 'product': componentToOpen = ProductFormComponent; break;
      case 'store': componentToOpen = StoreFormComponent; break;
      case 'delivery': componentToOpen = DeliveryFormComponent; break;
      case 'education': componentToOpen = EducationFormComponent; break;
      case 'other': 
      case 'services':
      case 'other_services':
        componentToOpen = OtherServicesFormComponent; 
        break;
      default: componentToOpen = StoreFormComponent;
    }

    if (ad.ad_type === 'delivery') {
      props = {
        ...props,
        locationFunc: () => getDeliveryAdCurrentLocation(),
      };
    }

    const modal = await this.modalCtrl.create({
      component: componentToOpen,
      componentProps: props,
      mode: 'ios'
    });
    await modal.present();
  }

  async deleteAd(adId: string) {
    if (!this.acct.accountUsable()) {
      return;
    }
    // تم تصحيح طريقة استدعاء الـ AlertController باستخدام الحقن المباشر
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف',
      message: 'هل أنت متأكد من حذف هذا الإعلان نهائياً؟',
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف',
          role: 'destructive',
          handler: async () => {
            const loader = await this.loadingCtrl.create({ message: 'جاري الحذف...', mode: 'ios' });
            await loader.present();
            try {
              const snap = await runInInjectionContext(this.injector, () =>
                getDoc(doc(this.firestore, 'ads', adId))
              );
              const data = snap.data() as Record<string, unknown> | undefined;
              const ids = data ? collectCloudinaryPublicIdsFromAd(data) : [];
              if (ids.length) {
                await this.cloudinaryCleanup.deletePublicIds(ids).catch(() => {});
              }
              await runInInjectionContext(this.injector, () =>
                deleteDoc(doc(this.firestore, 'ads', adId))
              );
            } catch (e) { console.error(e); }
            await loader.dismiss();
          }
        }
      ]
    });
    await alert.present();
  }

  goToEditProfile() {
    if (!this.acct.accountUsable()) {
      return;
    }
    this.navCtrl.navigateForward('/edit-profile');
  }
  openAddAdModal() {
    if (!this.acct.accountUsable()) {
      return;
    }
    this.navCtrl.navigateForward('/add-ad-type');
  }
  goBack(): void {
    void this.navCtrl.navigateRoot('/tabs/my-account', { animated: true });
  }
}