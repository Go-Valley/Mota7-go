import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonicModule,
  NavController,
  AlertController,
  ToastController,
  LoadingController,
  ViewWillLeave,
} from '@ionic/angular';
import {
  Firestore,
  collection,
  collectionData,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { addIcons } from 'ionicons';
import {
  callOutline,
  logoWhatsapp,
  createOutline,
  trashOutline,
  chevronBackOutline,
  bagHandleOutline,
  personOutline,
  locationOutline,
  closeOutline,
  pricetagOutline,
  chevronDownCircleOutline,
} from 'ionicons/icons';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import {
  SHOPPING_COLLECTION,
  SHOPPING_DELIVERY_CHARGES_DOC_ID,
} from '../../core/constants/shopping-firestore-admin.const';
import { telHrefFromEgyptPhone } from '../../core/utils/admin-phone-links.util';
import { openWhatsappNative } from '../../core/utils/whatsapp-open.util';
import {
  ShoppingOrderStatusKey,
  normalizeShoppingOrderStatusKey,
  shoppingOrderStatusDescription,
  shoppingOrderStatusTitle,
} from '../../core/utils/shopping-order-status.util';

export interface ShoppingOrderItemVm {
  adId: string;
  title: string;
  shortNote: string;
  unitPrice: number;
  sellerName: string;
  sellerPhone: string;
  locationLabel: string;
  condition: string;
}

export interface ShoppingOrderVm {
  id: string;
  buyerName: string;
  buyerPhone: string;
  buyerCity: string;
  grandTotal: number;
  itemsTotal: number;
  deliveryFee: number;
  status: string;
  paymentMethod: string;
  items: ShoppingOrderItemVm[];
  createdLabel: string;
}

function coerceNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeItems(raw: unknown): ShoppingOrderItemVm[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it) => {
    const r =
      typeof it === 'object' && it != null ? (it as Record<string, unknown>) : {};
    const adId =
      typeof r['adId'] === 'string'
        ? r['adId']
        : typeof r['ad_id'] === 'string'
          ? String(r['ad_id'])
          : '';
    const title = typeof r['title'] === 'string' ? r['title'] : '';
    let shortNote = '';
    if (typeof r['shortNote'] === 'string') shortNote = r['shortNote'];
    else if (typeof r['short_desc'] === 'string') shortNote = String(r['short_desc']);
    return {
      adId,
      title: title.trim(),
      shortNote: (shortNote || title).trim(),
      unitPrice: coerceNumber(r['unitPrice']),
      sellerName:
        typeof r['sellerName'] === 'string'
          ? r['sellerName']
          : typeof r['seller_name'] === 'string'
            ? String(r['seller_name'])
            : '',
      sellerPhone:
        typeof r['sellerPhone'] === 'string'
          ? String(r['sellerPhone'])
          : typeof r['seller_phone'] === 'string'
            ? String(r['seller_phone'])
            : '',
      locationLabel:
        typeof r['locationLabel'] === 'string'
          ? r['locationLabel']
          : typeof r['location_label'] === 'string'
            ? String(r['location_label'])
            : '',
      condition:
        typeof r['condition'] === 'string'
          ? r['condition']
          : typeof r['productCondition'] === 'string'
            ? String(r['productCondition'])
            : '—',
    };
  });
}

function sortKeyFromDoc(d: Record<string, unknown>): number {
  const c = d['createdAt'] as { seconds?: number; toMillis?: () => number } | undefined;
  if (!c) return 0;
  if (typeof c.seconds === 'number') return c.seconds;
  if (typeof c.toMillis === 'function') return Math.floor(c.toMillis() / 1000);
  return 0;
}

function createdAtLabel(raw: unknown): string {
  const t = raw as { seconds?: number; toDate?: () => Date } | undefined;
  if (!t) return '—';
  const sec = typeof t.seconds === 'number' ? t.seconds : t.toDate?.()?.getTime?.() != null ? (t.toDate()!.getTime() / 1000) | 0 : 0;
  if (!sec) return '—';
  try {
    return new Date(sec * 1000).toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

@Component({
  selector: 'app-shopping-orders',
  standalone: true,
  templateUrl: './shopping-orders.page.html',
  styleUrls: ['./shopping-orders.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    Mota7HeaderComponent,
  ],
})
export class ShoppingOrdersPage implements OnInit, OnDestroy, ViewWillLeave {
  private fs = inject(Firestore);
  private inj = inject(Injector);
  private navCtrl = inject(NavController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private loadingCtrl = inject(LoadingController);
  private cdr = inject(ChangeDetectorRef);

  orders: ShoppingOrderVm[] = [];
  detailModalOpen = false;
  editModalOpen = false;
  selectedOrder: ShoppingOrderVm | null = null;
  /** يُحدَّد عند فتح نموذج التعديل ويُستخدم في الحفظ دون الاعتماد على المودال */
  editingOrderId = '';

  editBuyerName = '';
  editBuyerPhone = '';
  editBuyerCity = '';
  editStatus: ShoppingOrderStatusKey = 'pending';

  private sub: Subscription | null = null;

  readonly tel = telHrefFromEgyptPhone;

  openWhatsappBuyer(order: ShoppingOrderVm, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const phone = order.buyerPhone ?? '';
    const name = order.buyerName?.trim() || 'حضرتك';
    const totalStr = new Intl.NumberFormat('ar-EG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(order.grandTotal);
    const n = Math.max(0, order.items?.length ?? 0);
    const msg =
      `السلام عليكم أ/ ${name} .. بتواصل مع حضرتك بخصوص طلبات الشراء الخاصة بكم للمنتجات بتطبيق \"مُتاح\"\n` +
      `بمبلغ ${totalStr} ج.م - لعدد ${n} منتج - نؤكد لحضرتك إتمام طلب الشراء ؟`;
    openWhatsappNative(phone, msg);
  }

  openWhatsappSeller(item: ShoppingOrderItemVm, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const phone = item.sellerPhone ?? '';
    const stripInnerQuotes = (s: string) => s.replace(/"/g, ' ');
    const name = stripInnerQuotes((item.sellerName?.trim() || 'اسم البائع').replace(/\s+/g, ' '));
    const descRaw =
      stripInnerQuotes((item.shortNote?.trim() || item.title?.trim() || '').replace(/\s+/g, ' ')) ||
      'وصف المنتج';
    const priceStr = new Intl.NumberFormat('ar-EG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(item.unitPrice);
    const amountQuoted = `"${priceStr} ج.م"`;
    const msg =
      `السلام عليكم أ/ "${name}"  ..  بتواصل مع حضرتك بخصوص طلب شراء منتج "${descRaw}" بتطبيق \"مُتاح\"\n` +
      ` - بمبلغ ${amountQuoted} - تم طلب المنتج للشراء من عميل - هل المنتج متوفر لديكم الآن ؟`;
    openWhatsappNative(phone, msg);
  }

  constructor() {
    addIcons({
      callOutline,
      logoWhatsapp,
      createOutline,
      trashOutline,
      bagHandleOutline,
      personOutline,
      locationOutline,
      closeOutline,
      pricetagOutline,
      'chevron-down-circle-outline': chevronDownCircleOutline,
      'chevron-back-outline': chevronBackOutline,
    });
  }

  ngOnInit(): void {
    this.sub = runInInjectionContext(this.inj, () =>
      collectionData(collection(this.fs, SHOPPING_COLLECTION), { idField: 'id' })
        .pipe(
          map((docs: Record<string, unknown>[]) => {
            const rows = docs.filter((d) => d['id'] !== SHOPPING_DELIVERY_CHARGES_DOC_ID);
            rows.sort((a, b) => sortKeyFromDoc(b) - sortKeyFromDoc(a));
            return rows.map((d): ShoppingOrderVm => {
              const id = String(d['id']);
              const rawSt = typeof d['status'] === 'string' ? d['status'].trim() : '';
              const st = normalizeShoppingOrderStatusKey(rawSt);
              return {
                id,
                buyerName: typeof d['buyerName'] === 'string' ? d['buyerName'] : '',
                buyerPhone: typeof d['buyerPhone'] === 'string' ? d['buyerPhone'] : '',
                buyerCity: typeof d['buyerCity'] === 'string' ? d['buyerCity'] : '',
                grandTotal: coerceNumber(d['grandTotal']),
                itemsTotal: coerceNumber(d['itemsTotal']),
                deliveryFee: coerceNumber(d['deliveryFee']),
                /** المفتاح المطبّع لعرض الشرائط والصفوف؛ يُحفظ في Firestore كنفس القيم عند الحفظ من اللوحة */
                status: st,
                paymentMethod:
                  typeof d['paymentMethod'] === 'string' ? d['paymentMethod'] : 'cod',
                items: normalizeItems(d['items']),
                createdLabel: createdAtLabel(d['createdAt']),
              };
            });
          })
        )
        .subscribe((list) => {
          this.orders = list;
          this.cdr.markForCheck();
        })
    );
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  goBack(): void {
    this.blurActiveUi();
    void this.navCtrl.navigateBack(['/dashboard']);
  }

  /**
   * يمنع تحذير المتصفح: تركيز على زر داخل المحتوى بينما ion-router-outlet يصبح aria-hidden بعد فتح مودال/تنبيه.
   */
  private blurActiveUi(): void {
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  ionViewWillLeave(): void {
    this.blurActiveUi();
  }

  openDetail(o: ShoppingOrderVm): void {
    this.blurActiveUi();
    this.selectedOrder = o;
    this.detailModalOpen = true;
    this.cdr.markForCheck();
  }

  closeDetail(): void {
    this.detailModalOpen = false;
    this.selectedOrder = null;
    this.cdr.markForCheck();
  }

  openEdit(o: ShoppingOrderVm, ev?: Event): void {
    ev?.stopPropagation();
    this.blurActiveUi();
    this.editingOrderId = o.id;
    this.editBuyerName = o.buyerName;
    this.editBuyerPhone = o.buyerPhone;
    this.editBuyerCity = o.buyerCity;
    this.editStatus = normalizeShoppingOrderStatusKey(o.status);
    this.editModalOpen = true;
    this.cdr.markForCheck();
  }

  /** من مودال التفاصيل: فتح التعديل وإغلاق المودال دون فقدان معرّف الطلب */
  openEditThenCloseDetail(o: ShoppingOrderVm): void {
    this.openEdit(o);
    this.detailModalOpen = false;
    this.selectedOrder = null;
    this.cdr.markForCheck();
  }

  closeEdit(): void {
    this.editModalOpen = false;
    this.editingOrderId = '';
    this.cdr.markForCheck();
  }

  async saveEdit(): Promise<void> {
    const id = this.editingOrderId;
    if (!id) return;
    const loader = await this.loadingCtrl.create({ message: 'جاري الحفظ...' });
    await loader.present();
    try {
      await runInInjectionContext(this.inj, () =>
        updateDoc(doc(this.fs, SHOPPING_COLLECTION, id), {
          buyerName: this.editBuyerName.trim(),
          buyerPhone: this.editBuyerPhone.trim(),
          buyerCity: this.editBuyerCity.trim(),
          status: this.editStatus,
          updatedAt: serverTimestamp(),
        })
      );
      await this.showToast('تم حفظ التعديلات');
      this.closeEdit();
    } catch (e) {
      console.error(e);
      await this.showToast('تعذر الحفظ');
    } finally {
      await loader.dismiss();
    }
  }

  async confirmDelete(o: ShoppingOrderVm, ev?: Event): Promise<void> {
    ev?.stopPropagation();
    this.blurActiveUi();
    const alert = await this.alertCtrl.create({
      header: 'حذف الطلب؟',
      message: `سيتم حذف طلب ${o.buyerName || o.id} نهائياً.`,
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف',
          role: 'destructive',
          handler: () => void this.deleteOrder(o.id),
        },
      ],
    });
    await alert.present();
  }

  private async deleteOrder(id: string): Promise<void> {
    const loader = await this.loadingCtrl.create({ message: 'جاري الحذف...' });
    await loader.present();
    try {
      await runInInjectionContext(this.inj, () =>
        deleteDoc(doc(this.fs, SHOPPING_COLLECTION, id))
      );
      if (this.selectedOrder?.id === id) this.closeDetail();
      await this.showToast('تم الحذف');
    } catch (e) {
      console.error(e);
      await this.showToast('تعذر الحذف');
    } finally {
      await loader.dismiss();
    }
  }

  private async showToast(msg: string): Promise<void> {
    const t = await this.toastCtrl.create({ message: msg, duration: 2200, position: 'bottom' });
    await t.present();
  }

  statusTitle(raw: string): string {
    return shoppingOrderStatusTitle(normalizeShoppingOrderStatusKey(raw));
  }

  statusBody(raw: string): string {
    return shoppingOrderStatusDescription(normalizeShoppingOrderStatusKey(raw));
  }

  statusPillClass(raw: string): string {
    return 'st-' + normalizeShoppingOrderStatusKey(raw);
  }

  /** توافق قديم مع القالب */
  statusLabel(s: string): string {
    return this.statusTitle(s);
  }

  doRefresh(ev: CustomEvent): void {
    setTimeout(() => {
      (ev.target as HTMLIonRefresherElement).complete();
    }, 600);
  }
}
