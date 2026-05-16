import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EnvironmentInjector,
  ViewChild,
  computed,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AlertController,
  IonList,
  IonicModule,
  NavController,
  Platform,
  ToastController,
  ViewWillEnter,
  ViewWillLeave,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { bagOutline, createOutline, trashOutline, logoWhatsapp, addOutline, removeOutline } from 'ionicons/icons';
import { Firestore, deleteDoc, doc } from '@angular/fire/firestore';
import { CartService, cartLineQty, type CartLine } from '../core/services/cart.service';
import {
  ADMIN_SUPPORT_WHATSAPP_E164_LOCAL,
  MyShoppingOrdersService,
  ShoppingOrderView,
} from '../core/services/my-shopping-orders.service';
import { SHOPPING_COLLECTION } from '../core/services/shopping-firestore-seed.service';
import { Mota7HeaderComponent } from '../top_header/header';
import {
  shoppingOrderStatusDescription,
  shoppingOrderStatusTitle,
} from '../core/utils/shopping-order-status.util';
import { shoppingPaymentMethodLabel } from '../core/utils/shopping-payment-label.util';
import { HARDWARE_BACK_CART_CHECKOUT_PRIORITY } from '../core/utils/hardware-back-my-account.util';
import type { Subscription } from 'rxjs';

@Component({
  selector: 'app-cart',
  standalone: true,
  templateUrl: './cart.page.html',
  styleUrls: ['./cart.page.scss'],
  imports: [CommonModule, IonicModule, Mota7HeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartPage implements ViewWillEnter, ViewWillLeave {
  private cart = inject(CartService);
  private toast = inject(ToastController);
  private navCtrl = inject(NavController);
  private platform = inject(Platform);
  private alert = inject(AlertController);
  private fs = inject(Firestore);
  private inj = inject(EnvironmentInjector);
  private cdr = inject(ChangeDetectorRef);
  private myOrders = inject(MyShoppingOrdersService);

  private hardwareBackSub?: Subscription;

  @ViewChild('cartListEl', { read: IonList }) private cartItemsList?: IonList;

  readonly lines = this.cart.linesRo;
  readonly count = this.cart.itemCount;
  readonly total = this.cart.itemsTotalAmount;

  readonly orderRows = this.myOrders.orders;

  readonly hasItems = computed(() => this.cart.itemCount() > 0);
  readonly hasOrders = computed(() => this.orderRows().length > 0);

  constructor() {
    addIcons({ bagOutline, createOutline, trashOutline, logoWhatsapp, addOutline, removeOutline });
  }

  ionViewWillEnter(): void {
    this.hardwareBackSub?.unsubscribe();
    this.hardwareBackSub = this.platform.backButton.subscribeWithPriority(
      HARDWARE_BACK_CART_CHECKOUT_PRIORITY,
      () => {
        void this.navCtrl.navigateRoot('/tabs/home', { animated: true });
      }
    );
  }

  ionViewWillLeave(): void {
    this.hardwareBackSub?.unsubscribe();
    this.hardwareBackSub = undefined;
  }

  remove(rowId: string) {
    this.cart.removeLine(rowId);
    this.cdr.markForCheck();
  }

  cartRowQty(row: CartLine): number {
    return cartLineQty(row);
  }

  cartRowLineTotal(row: CartLine): number {
    return row.unitPrice * cartLineQty(row);
  }

  incrementCartRow(row: CartLine, ev: Event): void {
    ev.stopPropagation();
    this.cart.incrementQtyByAdId(row.adId);
    this.cdr.markForCheck();
  }

  decrementCartRow(row: CartLine, ev: Event): void {
    ev.stopPropagation();
    this.cart.decrementQtyByAdId(row.adId);
    this.cdr.markForCheck();
  }

  /** إغلاق السحب عند اللمس بعيداً عن منطقة «حذف» (مع دعم ظل Ionic) */
  async onCartContentTap(ev: Event): Promise<void> {
    const rawPath =
      typeof ev.composedPath === 'function' ? ev.composedPath() : [ev.target as EventTarget | null];

    const isDeleteRail = rawPath.some((n) => {
      if (!(n instanceof HTMLElement)) {
        return false;
      }
      return (
        n.tagName === 'ION-ITEM-OPTIONS' ||
        n.tagName === 'ION-ITEM-OPTION' ||
        !!(n.closest && n.closest('ion-item-options'))
      );
    });
    if (isDeleteRail) {
      return;
    }
    try {
      await this.cartItemsList?.closeSlidingItems();
    } catch {
      /* ignore */
    }
  }

  async clearAll() {
    if (!this.cart.itemCount()) {
      return;
    }
    const a = await this.alert.create({
      header: 'إفراغ العربة؟',
      message: 'هل تريد إزالة كل المنتجات من العربة فقط؟ (لن يمسّ هذا طلباتك المؤكَّدة)',
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'إفراغ',
          role: 'destructive',
          handler: () => {
            this.cart.clearCart();
            void this.toast.create({ message: 'تم إفراغ العربة.', duration: 1400, position: 'bottom' }).then((t) => t.present());
          },
        },
      ],
    });
    await a.present();
  }

  goToHome(): void {
    void this.navCtrl.navigateRoot('/tabs/home', { animated: true });
  }

  goToCheckout(): void {
    if (!this.cart.itemCount()) {
      return;
    }
    void this.navCtrl.navigateForward('/tabs/checkout', { animated: true });
  }

  statusTitle(o: ShoppingOrderView): string {
    return shoppingOrderStatusTitle(o.status);
  }

  statusDescription(o: ShoppingOrderView): string {
    return shoppingOrderStatusDescription(o.status);
  }

  statusClass(o: ShoppingOrderView): string {
    return `ord-st--${o.status}`;
  }

  canEditOrder(o: ShoppingOrderView): boolean {
    return o.status === 'pending';
  }

  canDeleteOrder(o: ShoppingOrderView): boolean {
    return o.status === 'pending' || o.status === 'reject';
  }

  editOrder(o: ShoppingOrderView): void {
    if (!this.canEditOrder(o)) {
      return;
    }
    void this.navCtrl.navigateForward(
      `/tabs/checkout?editOrder=${encodeURIComponent(o.id)}`,
      { animated: true }
    );
  }

  async deleteOrderPermanently(o: ShoppingOrderView): Promise<void> {
    if (!this.canDeleteOrder(o)) {
      return;
    }

    const alert = await this.alert.create({
      header: 'حذف الطلب نهائياً؟',
      message:
        'سيُحذف الطلب بالكامل من التطبيق ومزامنة السحابة ولن يمكن استرجاعه. هل أنت متأكد؟',
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف نهائياً',
          cssClass: 'danger-ok',
          handler: () => {
            void this.performOrderDelete(o.id);
          },
        },
      ],
    });
    await alert.present();
  }

  private async performOrderDelete(orderId: string): Promise<void> {
    const ld = await this.toast.create({
      message: 'جاري الحذف...',
      duration: 4000,
      position: 'bottom',
    });
    await ld.present();
    try {
      await runInInjectionContext(this.inj, async () =>
        deleteDoc(doc(this.fs, SHOPPING_COLLECTION, orderId))
      );
      this.myOrders.forgetOrderLocal(orderId);
      const t = await this.toast.create({
        message: 'تم حذف الطلب.',
        duration: 2000,
        position: 'bottom',
        color: 'success',
      });
      await ld.dismiss();
      await t.present();
    } catch (e) {
      console.error('[cart] delete order', e);
      await ld.dismiss();
      const t = await this.toast.create({
        message: 'تعذّر حذف الطلب. تحقق من الاتصال أو الصلاحيات.',
        duration: 2800,
        position: 'bottom',
        color: 'danger',
      });
      await t.present();
    } finally {
      this.cdr.markForCheck();
    }
  }

  openAdminWhatsapp(o: ShoppingOrderView): void {
    const phone = ADMIN_SUPPORT_WHATSAPP_E164_LOCAL;
    const totalFmt = `${o.grandTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const txt = `السلام عليكم .. بتواصل مع حضرتك بخصوص طلب شراء منتجات برقم (${o.buyerPhone}) - باجمالي مبلغ (${totalFmt})`;
    const url = `https://api.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(txt)}`;
    window.open(url, '_system');
  }

  /** النص المعروض كوصف للمنتج (الوصف أو العنوان) */
  productLineDescription(it: { title: string; shortNote: string }): string {
    const s = (it.shortNote || '').trim();
    const t = (it.title || '').trim();
    return s || t || '—';
  }

  /** مرجع الطلب في الشريط العلوي — رقم الموبايل فقط */
  orderRefLabel(o: ShoppingOrderView): string {
    const phone = (o.buyerPhone || '').trim();
    if (phone) {
      return phone;
    }
    return o.id.length > 16 ? `${o.id.slice(0, 16)}…` : o.id;
  }

  paymentMethodLabel(o: ShoppingOrderView): string {
    return shoppingPaymentMethodLabel(o.paymentMethod);
  }
}
