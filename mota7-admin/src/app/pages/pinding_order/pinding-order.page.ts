import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule, Location } from '@angular/common'; // استيراد Location للرجوع للخلف
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { Firestore, collection, collectionData, doc, updateDoc, deleteDoc, query, where, orderBy } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { addIcons } from 'ionicons';
import { 
  logoWhatsapp, 
  trashOutline, 
  createOutline, 
  schoolOutline, 
  carOutline, 
  constructOutline, 
  calendarOutline, 
  locationOutline,
  personOutline,
  callOutline,
  chevronBackOutline,
  chevronDownCircleOutline
} from 'ionicons/icons';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { openWhatsappNative } from '../../core/utils/whatsapp-open.util';
import { presentAdminOrderCardEdit } from '../../core/utils/admin-order-card-edit.util';
import { formatOrderCoverageDisplay } from '../../core/utils/ad-coverage-display.util';

@Component({
  selector: 'app-pinding-order',
  templateUrl: './pinding-order.page.html',
  styleUrls: ['./pinding-order.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, Mota7HeaderComponent] // إضافة الهيدر هنا
})
export class PindingOrderPage implements OnInit {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private location = inject(Location); // حقن خدمة الموقع للرجوع

  pendingOrders$!: Observable<any[]>;

  constructor() {
    addIcons({ 
      logoWhatsapp, trashOutline, createOutline, 
      schoolOutline, carOutline, constructOutline, 
      calendarOutline, locationOutline, personOutline, callOutline,
      chevronBackOutline,
      'chevron-down-circle-outline': chevronDownCircleOutline
    });
  }

  ngOnInit() {
    this.loadPendingOrders();
  }

  doRefresh(event: any) {
    this.loadPendingOrders();
    setTimeout(() => {
      event.target.complete();
    }, 1000);
  }

  loadPendingOrders() {
    runInInjectionContext(this.injector, () => {
      const ordersRef = collection(this.firestore, 'orders');
      const q = query(ordersRef, where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
      this.pendingOrders$ = collectionData(q, { idField: 'id' });
    });
  }

  // دالة الرجوع للخلف المرتبطة بالهيدر
  goBack() {
    this.location.back();
  }

  openWhatsApp(order: any) {
    const service = this.getServiceLabel(order);
    const message = `السلام عليكم.. بتواصل مع حضرتك بخصوص طلبك لخدمة : (${service})`;
    openWhatsappNative(order.customerPhone, message);
  }

  getServiceLabel(order: any): string {
    if (order.serviceType === 'education') return order.subjectName;
    if (order.serviceType === 'delivery') return `توصيل ${order.subService}`;
    return order.subService || 'خدمة أخرى';
  }

  async deleteOrder(orderId: string) {
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف',
      message: 'هل أنت متأكد من حذف هذا الطلب نهائياً؟',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        { 
          text: 'حذف', 
          role: 'destructive',
          handler: async () => {
            await deleteDoc(doc(this.firestore, 'orders', orderId));
            this.showToast('تم حذف الطلب بنجاح');
          }
        }
      ]
    });
    await alert.present();
  }

  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 2000,
      color: 'dark'
    });
    toast.present();
  }

  orderCoverageLabel(order: unknown): string {
    return formatOrderCoverageDisplay((order ?? {}) as Record<string, unknown>);
  }

  async editOrder(order: any) {
    await presentAdminOrderCardEdit(this.firestore, this.alertCtrl, this.toastCtrl, order);
  }
}