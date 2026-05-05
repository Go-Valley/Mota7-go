import { ChangeDetectorRef, Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  NavController,
  ToastController,
  LoadingController,
} from '@ionic/angular';
import { Firestore, doc, getDoc, setDoc, updateDoc } from '@angular/fire/firestore';
import { addIcons } from 'ionicons';
import {
  carOutline,
  saveOutline,
  chevronDownCircleOutline,
  chevronBackOutline,
  informationCircleOutline,
} from 'ionicons/icons';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import {
  SHOPPING_COLLECTION,
  SHOPPING_DELIVERY_CHARGES_DOC_ID,
} from '../../core/constants/shopping-firestore-admin.const';

@Component({
  selector: 'app-delivery-charges',
  standalone: true,
  templateUrl: './delivery-charges.page.html',
  styleUrls: ['./delivery-charges.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule, Mota7HeaderComponent],
})
export class DeliveryChargesPage implements OnInit {
  private fs = inject(Firestore);
  private inj = inject(Injector);
  private navCtrl = inject(NavController);
  private toastCtrl = inject(ToastController);
  private loadingCtrl = inject(LoadingController);
  private cdr = inject(ChangeDetectorRef);

  /** ضمن المدينة (جميع منتجات الكارت ضمن مدينة المشتري) — كما في تطبيق المستخدم */
  inAmount = '';

  /** بين المدن — كما في تطبيق المستخدم */
  outAmount = '';

  loadingDoc = true;

  constructor() {
    addIcons({
      carOutline,
      saveOutline,
      'chevron-down-circle-outline': chevronDownCircleOutline,
      'chevron-back-outline': chevronBackOutline,
      informationCircleOutline,
    });
  }

  ngOnInit(): void {
    void this.loadDoc();
  }

  goBack(): void {
    void this.navCtrl.navigateBack(['/dashboard']);
  }

  async loadDoc(): Promise<void> {
    this.loadingDoc = true;
    this.cdr.markForCheck();
    try {
      const snap = await runInInjectionContext(this.inj, () =>
        getDoc(doc(this.fs, SHOPPING_COLLECTION, SHOPPING_DELIVERY_CHARGES_DOC_ID))
      );
      if (snap.exists()) {
        const d = snap.data() as Record<string, unknown>;
        this.inAmount = String(d['in'] ?? '0').trim();
        this.outAmount = String(d['out'] ?? '0').trim();
      } else {
        this.inAmount = '0';
        this.outAmount = '0';
      }
    } catch (e) {
      console.warn('[delivery-charges]', e);
      await this.showToast('تعذر تحميل الإعدادات');
    } finally {
      this.loadingDoc = false;
      this.cdr.markForCheck();
    }
  }

  async saveCharges(): Promise<void> {
    const loader = await this.loadingCtrl.create({ message: 'جاري الحفظ...' });
    await loader.present();
    const inch = normalizeMoneyInput(this.inAmount);
    const outch = normalizeMoneyInput(this.outAmount);
    try {
      const ref = doc(this.fs, SHOPPING_COLLECTION, SHOPPING_DELIVERY_CHARGES_DOC_ID);
      await runInInjectionContext(this.inj, async () => {
        const snap = await getDoc(ref);
        const payload = {
          docType: 'delivery_config' as const,
          in: inch,
          out: outch,
        };
        if (snap.exists()) {
          await updateDoc(ref, payload);
        } else {
          await setDoc(ref, payload);
        }
      });
      this.inAmount = inch;
      this.outAmount = outch;
      await this.showToast('تم حفظ مصاريف التوصيل');
    } catch (e) {
      console.error(e);
      await this.showToast('تعذر الحفظ — تحقق من الصلاحيات');
    } finally {
      await loader.dismiss();
      this.cdr.markForCheck();
    }
  }

  private async showToast(msg: string): Promise<void> {
    const t = await this.toastCtrl.create({ message: msg, duration: 2200, position: 'bottom' });
    await t.present();
  }

  doRefresh(ev: Event): void {
    const target = ev.target as { complete?: () => void };
    void this.loadDoc().finally(() => target.complete?.());
  }
}

function normalizeMoneyInput(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '0';
  const n = parseFloat(s.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) return '0';
  return String(n);
}
