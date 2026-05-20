import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonicModule, ViewWillLeave } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { addIcons } from 'ionicons';
import { Firestore, collection, collectionData } from '@angular/fire/firestore'; 
import { 
  peopleOutline, 
  megaphoneOutline, 
  imagesOutline, 
  timeOutline, 
  shieldHalfOutline, 
  chevronBackOutline,
  briefcaseOutline,
  cartOutline,
  listOutline,
  analyticsOutline,
  locateOutline,
  logOutOutline,
  personRemoveOutline,
  checkmarkDoneCircle,
  layersOutline,
  chevronDownCircleOutline,
  bagHandleOutline,
  carOutline,
  cashOutline,
} from 'ionicons/icons';
import {
  SHOPPING_COLLECTION,
  SHOPPING_DELIVERY_CHARGES_DOC_ID,
} from '../../core/constants/shopping-firestore-admin.const';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, RouterLink]
})
export class DashboardPage implements OnInit, ViewWillLeave {
  
  private router = inject(Router);
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  // بيانات الإحصائيات الحقيقية
  stats = {
    pendingAds: 0,
    activeAds: 0,
    rejectedAds: 0,
    expiredAds: 0,
    totalUsers: 0,
    activeBanners: 0,
    blockedUsers: 0,
    pendingRequests: 0,
    pendingShoppingOrders: 0,
    completedRequests: 0,
    acceptedRequests: 0,
    totalOrders: 0 // إضافة عداد إجمالي الطلبات
  };

  constructor() {
    addIcons({ 
      peopleOutline, 
      megaphoneOutline, 
      imagesOutline, 
      timeOutline, 
      shieldHalfOutline, 
      chevronBackOutline,
      briefcaseOutline,
      cartOutline,
      listOutline,
      analyticsOutline,
      locateOutline,
      logOutOutline,
      personRemoveOutline,
      checkmarkDoneCircle,
      layersOutline,
      'chevron-down-circle-outline': chevronDownCircleOutline,
      'bag-handle-outline': bagHandleOutline,
      'car-outline': carOutline,
      cashOutline,
    });
  }

  ngOnInit() {
    runInInjectionContext(this.injector, () => this.loadRealTimeStats());
  }

  /**
   * يمنع تحذير المتصفح: صفحة مخفية (ion-page-hidden + aria-hidden) بينما كارت ما زال مُركّزاً.
   * لا علاقة له بقائمة الإعلانات الفارغة على الأندرويد.
   */
  ionViewWillLeave(): void {
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  /**
   * إزالة التركيز من كارت التنقّل قبل أن يضع Ionic aria-hidden على الـ outlet.
   * pointerdown أبكر من الانتقال؛ click يغطي تفعيل لوحة المفاتيح (Enter على role="link").
   */
  onLuxuryNavInteraction(ev: Event): void {
    const t = ev.target as HTMLElement | null;
    if (!t?.closest('.luxury-nav-card')) {
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  doRefresh(event: any) {
    // إعادة تحميل الإحصائيات (بما أنها Real-time قد لا نحتاج لها فعلياً، ولكننا نؤكد التحديث للمستخدم)
    runInInjectionContext(this.injector, () => this.loadRealTimeStats());
    
    setTimeout(() => {
      event.target.complete();
    }, 1000);
  }

  loadRealTimeStats() {
    // 1. إحصائيات الإعلانات
    const adsRef = collection(this.firestore, 'ads');
    collectionData(adsRef).subscribe((ads: any[]) => {
      this.stats.pendingAds = ads.filter(a => a.status === 'pending').length;
      this.stats.activeAds = ads.filter(a => a.status === 'active').length;
      this.stats.rejectedAds = ads.filter(a => a.status === 'rejected').length;
      this.stats.expiredAds = ads.filter(a => a.status === 'expired').length;
    });

    // 2. إحصائيات المستخدمين
    const usersRef = collection(this.firestore, 'users');
    collectionData(usersRef).subscribe(users => {
      this.stats.totalUsers = users.length;
    });

    // 3. إحصائيات البانرات
    const bannersRef = collection(this.firestore, 'banners');
    collectionData(bannersRef).subscribe((banners: any[]) => {
      this.stats.activeBanners = banners.filter(b => b.status === 'active').length;
    });

    // 4. إحصائيات المحظورين
    const blockedRef = collection(this.firestore, 'blocked_users');
    collectionData(blockedRef).subscribe(blocked => {
      this.stats.blockedUsers = blocked.length;
    });

    // 5. إحصائيات الطلبات
    const ordersRef = collection(this.firestore, 'orders');
    collectionData(ordersRef).subscribe((orders: any[]) => {
      this.stats.pendingRequests = orders.filter(o => o.status === 'pending').length;
      this.stats.acceptedRequests = orders.filter(o => o.status === 'accepted').length;
      this.stats.completedRequests = orders.filter(o => o.status === 'completed').length;
      
      // حساب إجمالي كافة الطلبات
      this.stats.totalOrders = orders.length;
    });

    // 6. طلبات العربة (shopping) — الطلبات المعلقة فقط لشارة القائمة
    const shoppingRef = collection(this.firestore, SHOPPING_COLLECTION);
    collectionData(shoppingRef, { idField: 'id' }).subscribe((shoppingDocs: { id?: string; status?: string }[]) => {
      this.stats.pendingShoppingOrders = shoppingDocs.filter(
        (d) =>
          d.id &&
          d.id !== SHOPPING_DELIVERY_CHARGES_DOC_ID &&
          String(d.status ?? 'pending').toLowerCase().includes('pending')
      ).length;
    });
  }

  /**
   * navigate(['/x']) بولاية واحدة قد يفسَّر بشكل غير متسق مع base href على WebView/Capacitor.
   * navigateByUrl يضمن مساراً مطلقاً صحيحاً؛ RouterLink في القالب يُفضّل للّمس.
   */
  goTo(path: string) {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const p = String(path ?? '').replace(/^\/+/, '').trim();
    if (!p) {
      return;
    }
    void this.router.navigateByUrl('/' + p, { replaceUrl: false }).catch((e) => {
      console.error('Navigation failed:', p, e);
    });
  }

  async logout() {
    console.log('جاري تسجيل الخروج...');
    this.router.navigate(['/login']);
  }
}