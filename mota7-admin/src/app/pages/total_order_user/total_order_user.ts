import { Component, OnInit, ViewChildren, QueryList, inject, Injector, runInInjectionContext } from '@angular/core';
import { IonicModule, AlertController, LoadingController, ToastController, IonItemSliding } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { addIcons } from 'ionicons';
import { searchOutline, personCircleOutline, logoWhatsapp, trashOutline } from 'ionicons/icons';

@Component({
  selector: 'app-total-order-user',
  templateUrl: './total_order_user.html',
  styleUrls: ['./total_order_user.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, Mota7HeaderComponent],
})
export class TotalOrderUserPage implements OnInit {
  @ViewChildren(IonItemSliding) private itemSlidings!: QueryList<IonItemSliding>;

  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private alertCtrl = inject(AlertController);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);

  allUsersStats: any[] = [];
  filteredUsers: any[] = [];
  searchQuery: string = '';

  constructor() {
    addIcons({ searchOutline, personCircleOutline, logoWhatsapp, trashOutline });
  }

  ngOnInit() {
    this.loadAndProcessOrders();
  }

  loadAndProcessOrders() {
    runInInjectionContext(this.injector, () => {
      const ordersRef = collection(this.firestore, 'orders');
      collectionData(ordersRef).subscribe((orders: any[]) => {
        const statsMap = new Map();

        orders.forEach((order) => {
          const phone = order.customerPhone;
          if (!phone) return;

          if (!statsMap.has(phone)) {
            statsMap.set(phone, {
              phone: phone,
              name: order.customerName || 'مستخدم متاح',
              pending: 0,
              accepted: 0,
              completed: 0,
            });
          }

          const userStat = statsMap.get(phone);
          if (order.status === 'pending') userStat.pending++;
          else if (order.status === 'accepted') userStat.accepted++;
          else if (order.status === 'completed') userStat.completed++;
        });

        this.allUsersStats = Array.from(statsMap.values());
        this.filteredUsers = [...this.allUsersStats];
      });
    });
  }

  filterUsers() {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) {
      this.filteredUsers = [...this.allUsersStats];
      return;
    }
    this.filteredUsers = this.allUsersStats.filter(
      (user) =>
        String(user.phone).includes(q) || (user.name && user.name.toLowerCase().includes(q))
    );
  }

  goBack() {
    window.history.back();
  }

  closeOpenSlidings(ev: Event): void {
    const t = ev.target as HTMLElement | undefined;
    if (t?.closest?.('ion-item-option')) return;
    this.itemSlidings?.forEach((s) => void s.close());
  }

  contactUser(phone: string) {
    window.open(`https://wa.me/2${phone}`, '_system');
  }

  async confirmDeleteUserOrders(user: any, sliding?: IonItemSliding) {
    await sliding?.close();
    const alert = await this.alertCtrl.create({
      header: 'حذف جميع الطلبات',
      message: `سيتم حذف جميع طلبات المستخدم «${user.name}» (${user.phone}) نهائياً من Firestore. لا يمكن التراجع.`,
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف نهائياً',
          role: 'destructive',
          handler: () => {
            void this.deleteAllOrdersForCustomer(user);
          },
        },
      ],
    });
    await alert.present();
  }

  private async deleteAllOrdersForCustomer(user: { phone: string }): Promise<void> {
    const phoneKey = String(user.phone).trim();
    const loader = await this.loadingCtrl.create({ message: 'جاري حذف الطلبات...', mode: 'ios' });
    await loader.present();
    let deleted = 0;
    try {
      await runInInjectionContext(this.injector, async () => {
        const ordersCol = collection(this.firestore, 'orders');
        const idSet = new Set<string>();
        const variants: (string | number)[] = [phoneKey];
        if (/^\d+$/.test(phoneKey)) {
          const n = Number(phoneKey);
          if (!Number.isNaN(n)) variants.push(n);
        }
        for (const v of variants) {
          const snap = await getDocs(
            query(ordersCol, where('customerPhone', '==', v))
          );
          snap.forEach((d) => idSet.add(d.id));
        }
        const ids = [...idSet];
        deleted = ids.length;
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500);
          const batch = writeBatch(this.firestore);
          chunk.forEach((id) => batch.delete(doc(this.firestore, 'orders', id)));
          await batch.commit();
        }
      });
      await this.showToast(deleted ? `تم حذف ${deleted} طلباً` : 'لا توجد طلبات للحذف');
    } catch (e) {
      console.error(e);
      await this.showToast('فشل الحذف — تحقق من الصلاحيات والقواعد');
    } finally {
      await loader.dismiss();
    }
  }

  private async showToast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'bottom',
      mode: 'ios',
    });
    await t.present();
  }
}
