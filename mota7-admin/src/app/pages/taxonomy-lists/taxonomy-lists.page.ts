import { Component, OnInit, inject, EnvironmentInjector, runInInjectionContext, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  AlertController,
  ToastController,
  LoadingController,
  NavController,
} from '@ionic/angular';
import { Firestore, doc, getDoc, updateDoc, setDoc } from '@angular/fire/firestore';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  addOutline,
  createOutline,
  trashOutline,
  cloudUploadOutline,
  refreshOutline,
  storefrontOutline,
} from 'ionicons/icons';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import {
  CATEGORY_DOC_IDS,
  type CategoryDocId,
  allDefaultCategoryPayloads,
} from './taxonomy-seed.defaults';

type SectionMode = 'delivery' | 'education' | 'simple' | 'product' | 'store';

@Component({
  selector: 'app-taxonomy-lists',
  templateUrl: './taxonomy-lists.page.html',
  styleUrls: ['./taxonomy-lists.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule, Mota7HeaderComponent],
})
export class TaxonomyListsPage implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private loadingCtrl = inject(LoadingController);
  private navCtrl = inject(NavController);

  readonly sections: { docId: CategoryDocId; label: string; mode: SectionMode }[] = [
    { docId: 'transportation', label: 'النقل والتوصيل', mode: 'delivery' },
    { docId: 'education', label: 'التعليم', mode: 'education' },
    { docId: 'other_services', label: 'خدمات أخرى', mode: 'simple' },
    { docId: 'products', label: 'المنتجات', mode: 'product' },
    { docId: 'stores_types', label: 'المتاجر', mode: 'store' },
  ];

  /** عناوين اختيار التهيئة (كما طُلب للواجهة) */
  readonly seedPickerRows: { docId: CategoryDocId; label: string }[] = [
    { docId: 'transportation', label: 'نقل وتوصيل' },
    { docId: 'education', label: 'تعليمية' },
    { docId: 'other_services', label: 'خدمات أخرى' },
    { docId: 'products', label: 'منتجات' },
    { docId: 'stores_types', label: 'متاجر' },
  ];

  seedPickerOpen = false;
  seedPick: Record<CategoryDocId, boolean> = {
    transportation: false,
    education: false,
    other_services: false,
    products: false,
    stores_types: false,
  };
  private pendingSeedDocIds: CategoryDocId[] = [];

  selectedDocId: CategoryDocId = 'stores_types';
  items: any[] = [];
  metaNameAr = '';
  metaIcon = '';
  loading = false;
  private live = true;

  constructor() {
    addIcons({
      chevronBackOutline,
      addOutline,
      createOutline,
      trashOutline,
      cloudUploadOutline,
      refreshOutline,
      storefrontOutline,
    });
  }

  ngOnInit(): void {
    void this.loadCurrentDoc();
  }

  ngOnDestroy(): void {
    this.live = false;
  }

  get currentMode(): SectionMode {
    return this.sections.find((s) => s.docId === this.selectedDocId)?.mode ?? 'simple';
  }

  onSegmentChange(ev: Event): void {
    const v = (ev as CustomEvent<{ value: CategoryDocId }>).detail?.value;
    if (v && (CATEGORY_DOC_IDS as readonly string[]).includes(v)) {
      this.onSectionChange(v);
    }
  }

  onSectionChange(id: CategoryDocId): void {
    this.selectedDocId = id;
    void this.loadCurrentDoc();
  }

  async loadCurrentDoc(): Promise<void> {
    this.loading = true;
    try {
      const snap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'Categories', this.selectedDocId))
      );
      if (!this.live) return;
      if (!snap.exists()) {
        this.items = [];
        this.metaNameAr = '';
        this.metaIcon = '';
        await this.presentToast('المستند غير موجود — استخدم «تهيئة القيم الافتراضية»', 'warning');
        return;
      }
      const d = snap.data() as any;
      this.items = Array.isArray(d.items) ? JSON.parse(JSON.stringify(d.items)) : [];
      this.metaNameAr = d.nameAr ?? '';
      this.metaIcon = d.icon ?? '';
    } catch (e) {
      console.error(e);
      await this.presentToast('تعذر القراءة من Firestore', 'danger');
    } finally {
      if (this.live) this.loading = false;
    }
  }

  async saveAll(): Promise<void> {
    const loader = await this.loadingCtrl.create({ message: 'جاري الحفظ...', mode: 'ios' });
    await loader.present();
    try {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'Categories', this.selectedDocId), {
          items: this.items,
          nameAr: this.metaNameAr || null,
          icon: this.metaIcon || null,
        } as any)
      );
      await this.presentToast('تم حفظ القائمة بنجاح', 'success');
    } catch (e) {
      console.error(e);
      await this.presentToast('فشل الحفظ — تحقق من الصلاحيات', 'danger');
    } finally {
      await loader.dismiss();
    }
  }

  openSeedPicker(): void {
    for (const id of CATEGORY_DOC_IDS) {
      this.seedPick[id] = id === this.selectedDocId;
    }
    this.seedPickerOpen = true;
  }

  onSeedPickerDismiss(): void {
    this.seedPickerOpen = false;
  }

  async proceedSeedAfterPick(): Promise<void> {
    const ids = CATEGORY_DOC_IDS.filter((id) => this.seedPick[id]);
    if (ids.length === 0) {
      await this.presentToast('اختر قسماً واحداً على الأقل', 'warning');
      return;
    }
    this.pendingSeedDocIds = ids;
    this.seedPickerOpen = false;
    await this.presentSeedConfirm();
  }

  private async presentSeedConfirm(): Promise<void> {
    const a = await this.alertCtrl.create({
      header: 'تأكيد التهيئة',
      message: 'هل انت متأكد من اعادة تعيين قوائم الاقسام المختارة بالتطبيق؟',
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'تأكيد',
          role: 'destructive',
          handler: () => {
            void this.runSeedSelected([...this.pendingSeedDocIds]);
          },
        },
      ],
    });
    await a.present();
  }

  private async runSeedSelected(ids: CategoryDocId[]): Promise<void> {
    if (!ids.length) return;
    const loader = await this.loadingCtrl.create({ message: 'جاري التهيئة...', mode: 'ios' });
    await loader.present();
    try {
      const all = allDefaultCategoryPayloads();
      await runInInjectionContext(this.injector, async () => {
        for (const id of ids) {
          await setDoc(doc(this.firestore, 'Categories', id), all[id] as any, { merge: true });
        }
      });
      await this.presentToast(
        ids.length === 1 ? 'تمت تهيئة القسم المحدد' : `تمت تهيئة ${ids.length} أقسام`,
        'success'
      );
      await this.loadCurrentDoc();
    } catch (e) {
      console.error(e);
      await this.presentToast('فشلت التهيئة', 'danger');
    } finally {
      await loader.dismiss();
    }
  }

  async addItem(): Promise<void> {
    const mode = this.currentMode;
    if (mode === 'delivery') {
      await this.promptItemDialog('إضافة نوع توصيل', {});
      return;
    }
    if (mode === 'education') {
      await this.promptEducationDialog('إضافة مرحلة', null);
      return;
    }
    if (mode === 'product') {
      await this.promptProductDialog('إضافة فئة منتجات', null);
      return;
    }
    if (mode === 'store') {
      await this.promptStoreDialog('إضافة نشاط متجر', null);
      return;
    }
    await this.promptSimpleDialog('إضافة خدمة', null);
  }

  async editItem(index: number): Promise<void> {
    const row = this.items[index];
    if (!row) return;
    const mode = this.currentMode;
    if (mode === 'delivery') {
      await this.promptItemDialog('تعديل نوع توصيل', row, index);
      return;
    }
    if (mode === 'education') {
      await this.promptEducationDialog('تعديل مرحلة', row, index);
      return;
    }
    if (mode === 'product') {
      await this.promptProductDialog('تعديل فئة', row, index);
      return;
    }
    if (mode === 'store') {
      await this.promptStoreDialog('تعديل نشاط', row, index);
      return;
    }
    await this.promptSimpleDialog('تعديل خدمة', row, index);
  }

  async deleteItem(index: number): Promise<void> {
    const a = await this.alertCtrl.create({
      header: 'حذف العنصر',
      message: 'هل تريد حذف هذا البند من القائمة؟',
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف',
          role: 'destructive',
          handler: () => {
            this.items.splice(index, 1);
          },
        },
      ],
    });
    await a.present();
  }

  moveUp(index: number): void {
    if (index <= 0) return;
    const t = this.items[index - 1];
    this.items[index - 1] = this.items[index];
    this.items[index] = t;
  }

  moveDown(index: number): void {
    if (index >= this.items.length - 1) return;
    const t = this.items[index + 1];
    this.items[index + 1] = this.items[index];
    this.items[index] = t;
  }

  itemPreview(row: any): string {
    return row?.nameAr || row?.id || '—';
  }

  private async promptSimpleDialog(
    title: string,
    existing: any | null,
    index?: number
  ): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: title,
      mode: 'ios',
      inputs: [
        { name: 'id', type: 'text', placeholder: 'المعرّف (id)', value: existing?.id ?? '' },
        { name: 'nameAr', type: 'text', placeholder: 'الاسم بالعربية', value: existing?.nameAr ?? '' },
        { name: 'nameEn', type: 'text', placeholder: 'الاسم بالإنجليزية', value: existing?.nameEn ?? '' },
      ],
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حفظ',
          handler: (data) => {
            if (!data.id?.trim() || !data.nameAr?.trim()) return false;
            const o = { id: data.id.trim(), nameAr: data.nameAr.trim(), nameEn: (data.nameEn || '').trim() };
            if (index != null) this.items[index] = o;
            else this.items.push(o);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async promptStoreDialog(
    title: string,
    existing: any | null,
    index?: number
  ): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: title,
      mode: 'ios',
      inputs: [
        { name: 'id', type: 'text', placeholder: 'المعرّف (id)', value: existing?.id ?? '' },
        { name: 'nameAr', type: 'text', placeholder: 'الاسم بالعربية', value: existing?.nameAr ?? '' },
        { name: 'nameEn', type: 'text', placeholder: 'الاسم بالإنجليزية', value: existing?.nameEn ?? '' },
        {
          name: 'icon',
          type: 'text',
          placeholder: 'مفتاح الأيقونة (مثل shopping_cart)',
          value: existing?.icon ?? '',
        },
      ],
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حفظ',
          handler: (data) => {
            if (!data.id?.trim() || !data.nameAr?.trim()) return false;
            const o = {
              id: data.id.trim(),
              nameAr: data.nameAr.trim(),
              nameEn: (data.nameEn || '').trim(),
              icon: (data.icon || '').trim() || 'storefront',
            };
            if (index != null) this.items[index] = o;
            else this.items.push(o);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async promptItemDialog(
    title: string,
    existing: Record<string, unknown>,
    index?: number
  ): Promise<void> {
    const ex = existing;
    const alert = await this.alertCtrl.create({
      header: title,
      mode: 'ios',
      inputs: [
        { name: 'id', type: 'text', placeholder: 'id', value: String(ex['id'] ?? '') },
        { name: 'nameAr', type: 'text', placeholder: 'nameAr', value: String(ex['nameAr'] ?? '') },
        { name: 'nameEn', type: 'text', placeholder: 'nameEn', value: String(ex['nameEn'] ?? '') },
        { name: 'icon', type: 'text', placeholder: 'icon', value: String(ex['icon'] ?? 'car') },
        {
          name: 'order',
          type: 'number',
          placeholder: 'order',
          value: ex['order'] != null ? String(ex['order']) : '',
        },
        {
          name: 'value',
          type: 'text',
          placeholder: 'value',
          value: String(ex['value'] ?? ex['id'] ?? ''),
        },
      ],
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حفظ',
          handler: (data) => {
            if (!data.id?.trim() || !data.nameAr?.trim()) return false;
            const orderNum = parseInt(data.order, 10);
            const o = {
              id: data.id.trim(),
              nameAr: data.nameAr.trim(),
              nameEn: (data.nameEn || '').trim(),
              icon: (data.icon || 'car').trim(),
              active: true,
              order: Number.isFinite(orderNum) ? orderNum : this.items.length + 1,
              value: (data.value || data.id).trim(),
            };
            if (index != null) this.items[index] = o;
            else this.items.push(o);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async promptEducationDialog(
    title: string,
    existing: any | null,
    index?: number
  ): Promise<void> {
    const subjText = Array.isArray(existing?.subjects) ? existing.subjects.join('\n') : '';
    const alert = await this.alertCtrl.create({
      header: title,
      message: 'المواد: سطر لكل مادة',
      mode: 'ios',
      inputs: [
        { name: 'id', type: 'text', placeholder: 'id', value: existing?.id ?? '' },
        { name: 'nameAr', type: 'text', placeholder: 'nameAr', value: existing?.nameAr ?? '' },
        { name: 'nameEn', type: 'text', placeholder: 'nameEn', value: existing?.nameEn ?? '' },
        {
          name: 'subjects',
          type: 'textarea',
          placeholder: 'مواد (سطر لكل مادة)',
          value: subjText,
        },
      ],
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حفظ',
          handler: (data) => {
            if (!data.id?.trim() || !data.nameAr?.trim()) return false;
            const subjects = String(data.subjects || '')
              .split('\n')
              .map((s: string) => s.trim())
              .filter(Boolean);
            const o = {
              id: data.id.trim(),
              nameAr: data.nameAr.trim(),
              nameEn: (data.nameEn || '').trim(),
              subjects,
            };
            if (index != null) this.items[index] = o;
            else this.items.push(o);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async promptProductDialog(
    title: string,
    existing: any | null,
    index?: number
  ): Promise<void> {
    const subText = Array.isArray(existing?.subcategories) ? existing.subcategories.join('\n') : '';
    const alert = await this.alertCtrl.create({
      header: title,
      message: 'التصنيفات الفرعية: سطر لكل تصنيف',
      mode: 'ios',
      inputs: [
        { name: 'id', type: 'text', placeholder: 'id', value: existing?.id ?? '' },
        { name: 'nameAr', type: 'text', placeholder: 'nameAr', value: existing?.nameAr ?? '' },
        { name: 'nameEn', type: 'text', placeholder: 'nameEn', value: existing?.nameEn ?? '' },
        { name: 'icon', type: 'text', placeholder: 'icon', value: existing?.icon ?? 'cart' },
        {
          name: 'subcategories',
          type: 'textarea',
          placeholder: 'تصنيفات فرعية',
          value: subText,
        },
      ],
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حفظ',
          handler: (data) => {
            if (!data.id?.trim() || !data.nameAr?.trim()) return false;
            const subcategories = String(data.subcategories || '')
              .split('\n')
              .map((s: string) => s.trim())
              .filter(Boolean);
            const o = {
              id: data.id.trim(),
              nameAr: data.nameAr.trim(),
              nameEn: (data.nameEn || '').trim(),
              icon: (data.icon || 'cart').trim(),
              subcategories,
            };
            if (index != null) this.items[index] = o;
            else this.items.push(o);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async presentToast(message: string, color: string): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2600, position: 'bottom', color, mode: 'ios' });
    await t.present();
  }

  goDashboard(): void {
    void this.navCtrl.navigateRoot('/dashboard');
  }
}
