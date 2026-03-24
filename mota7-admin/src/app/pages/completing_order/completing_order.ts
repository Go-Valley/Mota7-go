import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Firestore, collection, collectionData, query, where, deleteDoc, doc } from '@angular/fire/firestore';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { openWhatsappNative } from '../../core/utils/whatsapp-open.util';
import { addIcons } from 'ionicons';
import { 
  searchOutline, checkmarkDoneCircle, logoWhatsapp, 
  trashOutline, bookOutline, carOutline, call, locationOutline, 
  timeOutline, hammerOutline, cubeOutline, cashOutline
} from 'ionicons/icons';

registerLocaleData(localeAr);

@Component({
  selector: 'app-completing-order',
  templateUrl: './completing_order.html',
  styleUrls: ['./completing_order.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, Mota7HeaderComponent]
})
export class CompletingOrderPage implements OnInit {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private router = inject(Router);

  allOrders: any[] = [];
  filteredOrders: any[] = [];
  searchQuery: string = '';

  constructor() {
    addIcons({ 
      searchOutline, checkmarkDoneCircle, logoWhatsapp, 
      trashOutline, bookOutline, carOutline, call, locationOutline, 
      timeOutline, hammerOutline, cubeOutline, cashOutline 
    });
  }

  ngOnInit() {
    this.loadCompletedOrders();
  }

  loadCompletedOrders() {
    runInInjectionContext(this.injector, () => {
      const q = query(
        collection(this.firestore, 'orders'),
        where('status', '==', 'completed')
      );
      collectionData(q, { idField: 'id' }).subscribe((res: any[]) => {
        this.allOrders = res.sort(
          (a, b) => (b.completedAt?.toMillis() || 0) - (a.completedAt?.toMillis() || 0)
        );
        this.filterOrders();
      });
    });
  }

  filterOrders() {
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      this.filteredOrders = [...this.allOrders];
      return;
    }
    const q = this.searchQuery.trim().toLowerCase();
    this.filteredOrders = this.allOrders.filter(order => 
      (order.customerPhone?.toString().includes(q)) || 
      (order.providerPhone?.toString().includes(q)) ||
      (order.providerId?.toString().includes(q)) ||
      (order.customerName?.toLowerCase().includes(q))
    );
  }

  getServiceIcon(type: string): string {
    switch (type) {
      case 'education': return 'book-outline';
      case 'delivery': return 'car-outline';
      case 'other': return 'hammer-outline';
      default: return 'cube-outline';
    }
  }

  getServiceLabel(order: any): string {
    if (order.serviceType === 'education') return `${order.stageName} - ${order.subjectName || ''}`;
    if (order.serviceType === 'delivery') return `توصيل: ${order.subService || 'ملاكي'}`;
    return order.subService || 'خدمة أخرى';
  }

  // --- تحديث دوال الواتساب بالرسائل الجديدة ---

  whatsappToCustomer(order: any) {
    const phone = order.customerPhone;
    const serviceLabel = this.getServiceLabel(order);
    const providerName = order.providerName || 'مزود الخدمة';
    if (phone) {
      const msg = `السلام عليكم أ/${order.customerName || ''} .. بتواصل معاك بخصوص طلبك لخدمة (${serviceLabel}) - تم استقبال الطلب بواسطة (${providerName}) - هل الخدمة تمت بشكل مُرضي مع حضرتك ؟`;
      openWhatsappNative(phone, msg);
    }
  }

  whatsappToProvider(order: any) {
    const phone = order.providerPhone || order.providerId;
    const serviceLabel = this.getServiceLabel(order);
    const customerName = order.customerName || '';
    const providerName = order.providerName || 'كابتن';
    if (phone) {
      const msg = `السلام عليكم أ/${providerName} .. بتواصل معاك بخصوص الطلب الي استقبلته لخدمة (${serviceLabel}) - الطلب كان متقدم من أ/ (${customerName}) - هل الخدمة تمت بشكل مُرضي مع حضرتك ؟`;
      openWhatsappNative(phone, msg);
    }
  }

  // ---------------------------------

  async deleteOrder(order: any) {
    if (confirm('هل أنت متأكد من حذف سجل هذا الطلب نهائياً؟')) {
      await runInInjectionContext(this.injector, () =>
        deleteDoc(doc(this.firestore, 'orders', order.id))
      );
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}