import { Component, OnDestroy, OnInit, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { CommonModule, registerLocaleData } from '@angular/common'; // أضف registerLocaleData
import localeAr from '@angular/common/locales/ar'; // استيراد بيانات اللغة العربية
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Firestore, collection, collectionData, query, where, deleteDoc, doc, getDoc } from '@angular/fire/firestore';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { openWhatsappNative } from '../../core/utils/whatsapp-open.util';
import {
  ORDER_ACCEPTED_WINDOW_MS,
  buildGoogleMapsDirectionsUrl,
  formatAcceptedRemainingMs,
  hasValidLatLng,
  openMapsUrlWithFallback,
  orderFieldToMs,
} from '../../core/utils/delivery-maps-admin.util';
import { presentAdminOrderCardEdit } from '../../core/utils/admin-order-card-edit.util';
import { formatOrderCoverageDisplay } from '../../core/utils/ad-coverage-display.util';
import { addIcons } from 'ionicons';
import { 
  searchOutline, checkmarkCircle, logoWhatsapp, createOutline, 
  trashOutline, bookOutline, carOutline, call, locationOutline, 
  timeOutline, informationCircleOutline, hammerOutline, cubeOutline,
  navigateOutline, cashOutline
} from 'ionicons/icons';

// تسجيل اللغة العربية للعمل مع الـ Pipes
registerLocaleData(localeAr);

@Component({
  selector: 'app-accepting-order',
  templateUrl: './accepting_order.html',
  styleUrls: ['./accepting_order.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, Mota7HeaderComponent]
})
export class AcceptingOrderPage implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);

  allOrders: any[] = [];
  filteredOrders: any[] = [];
  searchQuery: string = '';
  /** متبقي لكل طلب توصيل مقبول (مفتاح: id الطلب) */
  deliveryAcceptedRemaining: Record<string, string> = {};
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    addIcons({ 
      searchOutline, checkmarkCircle, logoWhatsapp, createOutline, 
      trashOutline, bookOutline, carOutline, call, locationOutline, 
      timeOutline, informationCircleOutline, hammerOutline, cubeOutline,
      navigateOutline, cashOutline
    });
  }

  ngOnInit() {
    this.loadAcceptedOrders();
    this.countdownInterval = setInterval(() => this.refreshDeliveryAcceptedCountdowns(), 1000);
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  loadAcceptedOrders() {
    runInInjectionContext(this.injector, () => {
      const q = query(
        collection(this.firestore, 'orders'),
        where('status', '==', 'accepted')
      );
      collectionData(q, { idField: 'id' }).subscribe((res: any[]) => {
        this.allOrders = res;
        this.filterOrders();
      });
    });
  }

  private refreshDeliveryAcceptedCountdowns(): void {
    const now = Date.now();
    const merged: Record<string, string> = {};
    for (const order of this.filteredOrders) {
      if (order.serviceType !== 'delivery' || order.status !== 'accepted') continue;
      const acceptedAt = orderFieldToMs(order.acceptedAt, now);
      const diff = ORDER_ACCEPTED_WINDOW_MS - (now - acceptedAt);
      merged[order.id] = formatAcceptedRemainingMs(diff);
    }
    this.deliveryAcceptedRemaining = merged;
  }

filterOrders() {
  // إذا كان حقل البحث فارغاً، نعرض كل الطلبات
  if (!this.searchQuery || this.searchQuery.trim() === '') {
    this.filteredOrders = [...this.allOrders];
    this.refreshDeliveryAcceptedCountdowns();
    return;
  }

  const query = this.searchQuery.trim().toLowerCase();

  this.filteredOrders = this.allOrders.filter((order) => {
    const customerPhone = order.customerPhone ? String(order.customerPhone).toLowerCase() : '';
    const providerPhone = order.providerPhone ? String(order.providerPhone).toLowerCase() : '';
    const providerId = order.providerId ? String(order.providerId).toLowerCase() : '';
    const customerName = order.customerName ? String(order.customerName).toLowerCase() : '';

    return (
      customerPhone.includes(query) ||
      providerPhone.includes(query) ||
      providerId.includes(query) ||
      customerName.includes(query)
    );
  });
  this.refreshDeliveryAcceptedCountdowns();
}

  getServiceIcon(type: string) {
    switch(type) {
      case 'education': return 'book-outline';
      case 'delivery': return 'car-outline';
      case 'other': return 'hammer-outline';
      default: return 'cube-outline';
    }
  }

  getServiceLabel(order: any): string {
    if (order.serviceType === 'education') {
      return `${order.stageName} - ${order.education_match_key?.split('+')[1] || ''}`;
    } else if (order.serviceType === 'delivery') {
      return `توصيل: ${order.subService || 'ملاكي'}`;
    } else if (order.serviceType === 'other') {
      return order.subService || 'خدمات أخرى';
    }
    return order.stageName || 'خدمة عامة';
  }

  contactWhatsApp(target: 'customer' | 'provider', order: any) {
    const serviceLabel = this.getServiceLabel(order);
    let message = '';
    let phone = '';

    if (target === 'customer') {
      phone = order.customerPhone;
      message = `السلام عليكم أ/ ${order.customerName}.. بخصوص طلبك لخدمة (${serviceLabel}) من تطبيق متاح.`;
    } else {
      phone = order.providerId;
      message = `السلام عليكم.. بخصوص الطلب الذي قبلته لخدمة (${serviceLabel}) للعميل (${order.customerName}).`;
    }

    openWhatsappNative(phone, message);
  }

  async deleteOrder(order: any) {
    if (confirm('هل أنت متأكد من حذف هذا الطلب؟')) {
      await runInInjectionContext(this.injector, () =>
        deleteDoc(doc(this.firestore, 'orders', order.id))
      );
    }
  }

  async editOrder(order: any) {
    await presentAdminOrderCardEdit(this.firestore, this.alertCtrl, this.toastCtrl, order);
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  /**
   * في كل ضغطة: جلب أحدث الإحداثيات من Firestore ثم فتح المسار
   * من مقدم الخدمة → طالب الخدمة (يُحدَّث عند كل فتح للخرائط).
   */
  async navigateDeliveryAdmin(order: any): Promise<void> {
    const id = order?.id;
    if (!id) {
      await this.presentToast('تعذّر التتبع');
      return;
    }
    try {
      const snap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'orders', id))
      );
      if (!snap.exists()) {
        await this.presentToast('الطلب غير موجود');
        return;
      }
      const d = snap.data();
      Object.assign(order, d);
      const i = this.allOrders.findIndex((o) => o.id === id);
      if (i >= 0) Object.assign(this.allOrders[i], d);
    } catch (e) {
      console.error('navigateDeliveryAdmin fetch', e);
      await this.presentToast('تعذّر جلب أحدث مواقع الطرفين');
      return;
    }

    const pLat = order?.providerLat;
    const pLng = order?.providerLng;
    if (!hasValidLatLng(pLat, pLng)) {
      await this.presentToast(
        'موقع مقدم الخدمة غير متاح بعد — انتظر التحديث من تطبيق المندوب بعد القبول'
      );
      return;
    }
    const cLat = order?.lat;
    const cLng = order?.lng;
    if (!hasValidLatLng(cLat, cLng)) {
      await this.presentToast('موقع طالب الخدمة (من الطلب) غير محدد على الخريطة');
      return;
    }
    const url = buildGoogleMapsDirectionsUrl(
      Number(pLat),
      Number(pLng),
      Number(cLat),
      Number(cLng)
    );
    await openMapsUrlWithFallback(url);
  }

  orderCoverageLabel(order: unknown): string {
    return formatOrderCoverageDisplay((order ?? {}) as Record<string, unknown>);
  }

  private async presentToast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({
      message,
      duration: 2800,
      position: 'bottom',
      mode: 'ios',
      color: 'dark',
    });
    await t.present();
  }
}