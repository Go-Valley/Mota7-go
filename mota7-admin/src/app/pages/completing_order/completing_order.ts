import { Component, OnInit, QueryList, ViewChildren, inject, Injector, runInInjectionContext } from '@angular/core';
import { AlertController, IonicModule, IonItemSliding, ToastController } from '@ionic/angular';
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
  timeOutline, hammerOutline, cubeOutline, cashOutline, star, starOutline
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
  @ViewChildren(IonItemSliding) private itemSlidings!: QueryList<IonItemSliding>;

  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  allOrders: any[] = [];
  filteredOrders: any[] = [];
  searchQuery: string = '';
  /** 1..5 لعرض النجوم في بطاقة التقييم */
  readonly ratingStarSlots = [1, 2, 3, 4, 5];

  constructor() {
    addIcons({ 
      searchOutline, checkmarkDoneCircle, logoWhatsapp, 
      trashOutline, bookOutline, carOutline, call, locationOutline, 
      timeOutline, hammerOutline, cubeOutline, cashOutline, star, starOutline
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

  closeOpenSlidings(ev: Event): void {
    const t = ev.target as HTMLElement | undefined;
    if (t?.closest?.('ion-item-option')) return;
    this.itemSlidings?.forEach((s) => void s.close());
  }

  async confirmDeleteOrder(order: any, sliding?: IonItemSliding) {
    await sliding?.close();

    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف',
      message: 'هل أنت متأكد من حذف سجل هذا الطلب نهائياً من Firestore؟',
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف',
          role: 'destructive',
          handler: async () => {
            try {
              await runInInjectionContext(this.injector, () =>
                deleteDoc(doc(this.firestore, 'orders', order.id))
              );
              const toast = await this.toastCtrl.create({
                message: 'تم حذف الطلب',
                duration: 2000,
                color: 'success',
                mode: 'ios',
              });
              await toast.present();
            } catch (e) {
              console.error(e);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}