import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule, registerLocaleData } from '@angular/common'; // أضف registerLocaleData
import localeAr from '@angular/common/locales/ar'; // استيراد بيانات اللغة العربية
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Firestore, collection, collectionData, query, where, deleteDoc, doc } from '@angular/fire/firestore';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { openWhatsappNative } from '../../core/utils/whatsapp-open.util';
import { addIcons } from 'ionicons';
import { 
  searchOutline, checkmarkCircle, logoWhatsapp, createOutline, 
  trashOutline, bookOutline, carOutline, call, locationOutline, 
  timeOutline, informationCircleOutline, hammerOutline, cubeOutline
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
export class AcceptingOrderPage implements OnInit {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private router = inject(Router);

  allOrders: any[] = [];
  filteredOrders: any[] = [];
  searchQuery: string = '';

  constructor() {
    addIcons({ 
      searchOutline, checkmarkCircle, logoWhatsapp, createOutline, 
      trashOutline, bookOutline, carOutline, call, locationOutline, 
      timeOutline, informationCircleOutline, hammerOutline, cubeOutline 
    });
  }

  ngOnInit() {
    this.loadAcceptedOrders();
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

filterOrders() {
  // إذا كان حقل البحث فارغاً، نعرض كل الطلبات
  if (!this.searchQuery || this.searchQuery.trim() === '') {
    this.filteredOrders = [...this.allOrders];
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

  editOrder(order: any) {
    console.log('تعديل الطلب:', order);
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}