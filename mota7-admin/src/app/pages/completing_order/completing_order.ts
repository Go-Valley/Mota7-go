import { Component, OnInit, QueryList, ViewChildren, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { AlertController, IonicModule, IonItemSliding, ToastController } from '@ionic/angular';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Firestore, collection, collectionData, query, where, deleteDoc, doc, updateDoc, Timestamp } from '@angular/fire/firestore';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { openWhatsappNative } from '../../core/utils/whatsapp-open.util';
import { addIcons } from 'ionicons';
import { 
  searchOutline, checkmarkDoneCircle, logoWhatsapp, 
  trashOutline, bookOutline, carOutline, call, locationOutline, 
  timeOutline, hammerOutline, cubeOutline, cashOutline, star, starOutline,
  calendarOutline
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
  private injector = inject(EnvironmentInjector);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  allOrders: any[] = [];
  filteredOrders: any[] = [];
  searchQuery: string = '';
  /** 1..5 لعرض النجوم في بطاقة التقييم */
  readonly ratingStarSlots = [1, 2, 3, 4, 5];

  // ----------------------------
  // Multi-select (long press)
  // ----------------------------
  readonly longPressMs = 500;
  selectionMode = false;
  selectedOrderIds = new Set<string>();
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressOrderId: string | null = null;
  private longPressTriggered = false;

  get selectedCount(): number {
    return this.selectedOrderIds.size;
  }

  get isAllVisibleSelected(): boolean {
    if (!this.filteredOrders.length) return false;
    return this.selectedOrderIds.size === this.filteredOrders.length;
  }

  isSelected(orderId: string): boolean {
    return this.selectedOrderIds.has(orderId);
  }

  constructor() {
    addIcons({ 
      searchOutline, checkmarkDoneCircle, logoWhatsapp, 
      trashOutline, bookOutline, carOutline, call, locationOutline, 
      timeOutline, hammerOutline, cubeOutline, cashOutline, star, starOutline,
      calendarOutline
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
      this.pruneSelectionToVisible();
      return;
    }
    const q = this.searchQuery.trim().toLowerCase();
    this.filteredOrders = this.allOrders.filter(order => 
      (order.customerPhone?.toString().includes(q)) || 
      (order.providerPhone?.toString().includes(q)) ||
      (order.providerId?.toString().includes(q)) ||
      (order.customerName?.toLowerCase().includes(q))
    );
    this.pruneSelectionToVisible();
  }

  private pruneSelectionToVisible() {
    if (!this.selectionMode) return;
    const visible = new Set(this.filteredOrders.map(o => o.id).filter(Boolean));
    const next = new Set<string>();
    for (const id of this.selectedOrderIds) {
      if (visible.has(id)) next.add(id);
    }
    this.selectedOrderIds = next;
    if (this.selectedOrderIds.size === 0) {
      this.selectionMode = false;
    }
  }

  private enterSelectionForOrder(orderId: string) {
    this.selectionMode = true;
    this.selectedOrderIds = new Set(this.selectedOrderIds);
    this.selectedOrderIds.add(orderId);
  }

  toggleSelectedOrder(orderId: string) {
    if (!this.selectionMode) return;
    const next = new Set(this.selectedOrderIds);
    if (next.has(orderId)) next.delete(orderId);
    else next.add(orderId);
    this.selectedOrderIds = next;
    if (this.selectedOrderIds.size === 0) this.selectionMode = false;
  }

  toggleSelectAll(checked: boolean) {
    if (!checked) {
      this.selectedOrderIds = new Set();
      this.selectionMode = false;
      return;
    }
    this.selectionMode = true;
    this.selectedOrderIds = new Set(this.filteredOrders.map(o => o.id).filter(Boolean));
  }

  onOrderPointerDown(orderId: string, ev: PointerEvent) {
    if (ev.pointerType === 'mouse' && ev.buttons !== 1) return;
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.longPressOrderId = orderId;
    this.longPressTriggered = false;
    this.longPressTimer = setTimeout(() => {
      this.longPressTriggered = true;
      // أغلق أي سلايدات مفتوحة ثم ادخل وضع التحديد
      this.itemSlidings?.forEach((s) => void s.close());
      this.enterSelectionForOrder(orderId);
    }, this.longPressMs);
  }

  onOrderPointerUp() {
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
    this.longPressOrderId = null;
  }

  onOrderPointerCancel() {
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
    this.longPressOrderId = null;
  }

  onOrderClick(orderId: string, ev: Event) {
    if (!this.selectionMode) return;
    // منع تفعيل toggle مرتين عند release بعد long-press
    if (this.longPressTriggered) {
      this.longPressTriggered = false;
      return;
    }
    ev.stopPropagation();
    this.toggleSelectedOrder(orderId);
  }

  async confirmDeleteSelectedOrders() {
    const count = this.selectedCount;
    if (count <= 0) return;

    this.itemSlidings?.forEach((s) => void s.close());

    const ids = Array.from(this.selectedOrderIds);
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف',
      message: `هل أنت متأكد من حذف عدد (${count}) طلب مكتمل؟`,
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'تأكيد',
          role: 'destructive',
          handler: async () => {
            try {
              for (const id of ids) {
                await runInInjectionContext(this.injector, () =>
                  deleteDoc(doc(this.firestore, 'orders', id))
                );
              }

              // حدّث الواجهة محلياً
              const remaining = (o: any) => !ids.includes(o.id);
              this.allOrders = this.allOrders.filter(remaining);
              this.filteredOrders = this.filteredOrders.filter(remaining);
              this.selectedOrderIds = new Set();
              this.selectionMode = false;

              const toast = await this.toastCtrl.create({
                message: 'تم حذف الطلبات',
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

  // ----------------------------
  // expiresAt (date only)
  // ----------------------------
  private toDateInputValue(d: Date): string {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  getExpiresAtDisplay(order: any): string {
    const v = order?.expiresAt;
    const d: Date | null =
      v?.toDate && typeof v.toDate === 'function' ? v.toDate() :
      v instanceof Date ? v :
      null;
    if (!d) return '--';
    return d.toLocaleDateString('ar', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  /** يظهر زر تاريخ الانتهاء لطلبات التوصيل والتعليم فقط. */
  showExpiresAtControl(order: any): boolean {
    return order?.serviceType === 'delivery' || order?.serviceType === 'education';
  }

  async editExpiresAt(order: any, ev: Event) {
    ev.stopPropagation();
    const v = order?.expiresAt;
    const currentDate: Date | null =
      v?.toDate && typeof v.toDate === 'function' ? v.toDate() :
      v instanceof Date ? v :
      null;

    const defaultValue = currentDate ? this.toDateInputValue(currentDate) : '';

    const alert = await this.alertCtrl.create({
      header: 'تعديل تاريخ انتهاء الطلب',
      mode: 'ios',
      inputs: [
        {
          name: 'expiresDate',
          type: 'date',
          value: defaultValue,
        },
      ],
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حفظ',
          handler: async (data) => {
            const expiresDate = data?.expiresDate;
            if (!expiresDate) return false;
            const d = new Date(`${expiresDate}T00:00:00`);
            if (isNaN(d.getTime())) return false;
            const ts = Timestamp.fromDate(d);

            try {
              await runInInjectionContext(this.injector, () =>
                updateDoc(doc(this.firestore, 'orders', order.id), { expiresAt: ts })
              );

              // حدّث القيم محلياً
              order.expiresAt = ts;
            } catch (e) {
              console.error(e);
            }
            return true;
          },
        },
      ],
    });
    await alert.present();
  }



  private async updateOrderExpiresAt(orderId: string, expiresAt: Timestamp) {
    try {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'orders', orderId), { expiresAt })
      );
      const toast = await this.toastCtrl.create({
        message: 'تم تحديث تاريخ الانتهاء بنجاح',
        duration: 2000,
        color: 'success'
      });
      await toast.present();
    } catch (e) {
      console.error(e);
    }
  }

  goBack() { this.router.navigate(['/dashboard']); }
}