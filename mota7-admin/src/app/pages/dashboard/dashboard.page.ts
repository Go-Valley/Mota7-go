import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
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
  layersOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class DashboardPage implements OnInit {
  
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
      layersOutline
    });
  }

  ngOnInit() {
    runInInjectionContext(this.injector, () => this.loadRealTimeStats());
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
  }

  goTo(path: string) {
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.router.navigate(['/' + path]);
  }

  async logout() {
    console.log('جاري تسجيل الخروج...');
    this.router.navigate(['/login']);
  }
}