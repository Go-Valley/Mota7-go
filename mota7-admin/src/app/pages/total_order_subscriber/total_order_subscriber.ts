import { Component, OnInit, ViewChildren, QueryList, inject, Injector, runInInjectionContext } from '@angular/core';
import { IonicModule, AlertController, LoadingController, ToastController, IonItemSliding } from '@ionic/angular';
import { CommonModule, registerLocaleData, Location } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
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
import { openWhatsappNative } from '../../core/utils/whatsapp-open.util';
import { addIcons } from 'ionicons';
import { searchOutline, personCircleOutline, logoWhatsapp, trashOutline } from 'ionicons/icons';

registerLocaleData(localeAr);

@Component({
  selector: 'app-total-order-subscriber',
  templateUrl: './total_order_subscriber.html',
  styleUrls: ['./total_order_subscriber.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, Mota7HeaderComponent],
})
export class TotalOrderSubscriberPage implements OnInit {
  @ViewChildren(IonItemSliding) private itemSlidings!: QueryList<IonItemSliding>;

  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private location = inject(Location);
  private alertCtrl = inject(AlertController);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);

  allProvidersStats: any[] = [];
  filteredProviders: any[] = [];
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
          const phone = order['providerPhone'] || order['providerId'];
          if (!phone) return;

          if (!statsMap.has(phone)) {
            statsMap.set(phone, {
              phone: phone,
              name: order['providerName'] || 'مشترك متاح',
              pending: 0,
              accepted: 0,
              completed: 0,
            });
          }

          const providerStat = statsMap.get(phone);
          if (order['status'] === 'pending') providerStat.pending++;
          else if (order['status'] === 'accepted') providerStat.accepted++;
          else if (order['status'] === 'completed') providerStat.completed++;
        });

        this.allProvidersStats = Array.from(statsMap.values());
        this.filteredProviders = [...this.allProvidersStats];
      });
    });
  }

  filterProviders() {
    const queryText = this.searchQuery.toLowerCase().trim();
    if (!queryText) {
      this.filteredProviders = [...this.allProvidersStats];
    } else {
      this.filteredProviders = this.allProvidersStats.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(queryText)) ||
          (p.phone && String(p.phone).includes(queryText))
      );
    }
  }

  goBack() {
    this.location.back();
  }

  closeOpenSlidings(ev: Event): void {
    const t = ev.target as HTMLElement | undefined;
    if (t?.closest?.('ion-item-option')) return;
    this.itemSlidings?.forEach((s) => void s.close());
  }

  contactProvider(phone: string) {
    if (phone) {
      const msg = `السلام عليكم.. استفسار بخصوص سجل طلباتك كمشترك في تطبيق متاح.`;
      openWhatsappNative(phone, msg);
    }
  }

  async confirmDeleteProviderOrders(provider: any, sliding?: IonItemSliding) {
    await sliding?.close();
    const alert = await this.alertCtrl.create({
      header: 'حذف جميع الطلبات',
      message: `سيتم حذف جميع طلبات المشترك «${provider.name}» (${provider.phone}) نهائياً من Firestore. لا يمكن التراجع.`,
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف نهائياً',
          role: 'destructive',
          handler: () => {
            void this.deleteAllOrdersForProvider(provider);
          },
        },
      ],
    });
    await alert.present();
  }

  private async deleteAllOrdersForProvider(provider: { phone: string }): Promise<void> {
    const phoneKey = String(provider.phone).trim();
    const loader = await this.loadingCtrl.create({ message: 'جاري حذف الطلبات...', mode: 'ios' });
    await loader.present();
    let deleted = 0;
    try {
      await runInInjectionContext(this.injector, async () => {
        const ordersCol = collection(this.firestore, 'orders');
        const idSet = new Set<string>();
        const [s1, s2] = await Promise.all([
          getDocs(query(ordersCol, where('providerPhone', '==', phoneKey))),
          getDocs(query(ordersCol, where('providerId', '==', phoneKey))),
        ]);
        s1.forEach((d) => idSet.add(d.id));
        s2.forEach((d) => idSet.add(d.id));
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
