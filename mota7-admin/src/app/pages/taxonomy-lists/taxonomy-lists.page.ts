import { Component, OnInit, inject, EnvironmentInjector, runInInjectionContext, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  AlertController,
  ToastController,
  LoadingController,
  NavController,
} from '@ionic/angular';
import { Firestore, doc, updateDoc, setDoc } from '@angular/fire/firestore';
import { onSnapshot, Unsubscribe } from 'firebase/firestore';
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
  private ngZone = inject(NgZone);
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
  savingNameIndex: number | null = null;
  /** فهرس البند الذي يجري حذفه حالياً — لإظهار سبينر وتعطيل الأزرار أثناء العملية */
  deletingIndex: number | null = null;
  private live = true;
  private nameDraftCache: Record<number, string> = {};
  private lastLoadedHash = '';
  /** إلغاء الاشتراك في المستند الحالي عند تغيير القسم أو إغلاق الصفحة */
  private categoriesDocUnsub: Unsubscribe | null = null;

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
    this.detachCategoriesDocListener();
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
    // لضمان تطبيق أول لقطة بعد تبديل القسم (حتى لا يُحجب التحميل بسبب hasUnsavedChanges)
    this.lastLoadedHash = '';
    void this.loadCurrentDoc();
  }

  /**
   * تحميل/مزامنة المستند الحالي من Firestore — اشتراك مباشر (onSnapshot)
   * حتى يظهر أي تعديل من جهاز آخر أو من التطبيق دون إعادة فتح الصفحة.
   */
  async loadCurrentDoc(): Promise<void> {
    this.attachCategoriesDocListener();
  }

  private detachCategoriesDocListener(): void {
    if (this.categoriesDocUnsub) {
      this.categoriesDocUnsub();
      this.categoriesDocUnsub = null;
    }
  }

  private attachCategoriesDocListener(): void {
    this.detachCategoriesDocListener();
    this.loading = true;
    this.categoriesDocUnsub = runInInjectionContext(this.injector, () =>
      onSnapshot(
        doc(this.firestore, 'Categories', this.selectedDocId),
        (snap) => {
          this.ngZone.run(() => {
            if (!this.live) return;
            this.loading = false;
            if (!snap.exists()) {
              this.items = [];
              this.metaNameAr = '';
              this.metaIcon = '';
              void this.presentToast(
                'المستند غير موجود — استخدم «تهيئة القيم الافتراضية»',
                'warning'
              );
              return;
            }
            const d = snap.data() as any;
            const remoteItems = Array.isArray(d.items)
              ? JSON.parse(JSON.stringify(d.items))
              : [];
            const remoteNameAr = d.nameAr ?? '';
            const remoteIcon = d.icon ?? '';
            // لا نستبدل مسودّة المستخدم بعد أول مزامنة ناجحة وطالما هناك تغييرات غير محفوظة
            if (this.remoteApplyBlockedByDirty()) {
              return;
            }
            this.items = remoteItems;
            this.metaNameAr = remoteNameAr;
            this.metaIcon = remoteIcon;
            this.lastLoadedHash = this.buildCurrentHash();
          });
        },
        (err) => {
          console.error(err);
          this.ngZone.run(() => {
            this.loading = false;
            void this.presentToast('تعذر القراءة من Firestore', 'danger');
          });
        }
      )
    );
  }

  async saveAll(): Promise<void> {
    if (!this.hasUnsavedChanges()) {
      await this.presentToast('لا توجد تغييرات للحفظ', 'medium');
      return;
    }

    const ok = await this.presentSaveConfirm('تم العثور على تغييرات، هل تريد حفظها؟');
    if (!ok) {
      return;
    }

    const loader = await this.loadingCtrl.create({ message: 'جاري الحفظ...', mode: 'ios' });
    await loader.present();
    try {
      this.assignSequentialOrderToItems();
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'Categories', this.selectedDocId), {
          items: this.items,
          nameAr: this.metaNameAr || null,
          icon: this.metaIcon || null,
        } as any)
      );
      this.lastLoadedHash = this.buildCurrentHash();
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
    if (this.selectedDocId === 'other_services') {
      await this.promptOtherServicesDialog('إضافة خدمة', null);
      return;
    }
    await this.promptSimpleDialog('إضافة بند', null);
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
    if (this.selectedDocId === 'other_services') {
      await this.promptOtherServicesDialog('تعديل خدمة', row, index);
      return;
    }
    await this.promptSimpleDialog('تعديل بند', row, index);
  }

  async deleteItem(index: number): Promise<void> {
    if (this.deletingIndex !== null) {
      return;
    }
    const row = this.items[index];
    if (!row) {
      return;
    }
    const itemLabel = String(row?.nameAr || row?.id || '').trim() || 'هذا البند';

    const a = await this.alertCtrl.create({
      header: 'حذف العنصر',
      message: `سيتم حذف "${itemLabel}" نهائياً من Firestore وسيختفي من تطبيق العملاء فوراً. هل تريد المتابعة؟`,
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف',
          role: 'destructive',
          handler: () => {
            void this.commitDeleteItem(index);
            return true;
          },
        },
      ],
    });
    await a.present();
  }

  /**
   * يحذف البند من القائمة المحلية ويحفظ التغيير على Firestore فوراً.
   * في حالة فشل الكتابة على Firestore، يُعاد البند إلى مكانه الأصلي (rollback)
   * حتى لا يضيع البند من القائمة المعروضة دون تأكيد فعلي على السحابة.
   */
  private async commitDeleteItem(index: number): Promise<void> {
    if (index < 0 || index >= this.items.length) {
      return;
    }
    const removed = this.items[index];
    this.items.splice(index, 1);
    this.assignSequentialOrderToItems();
    this.deletingIndex = index;
    try {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'Categories', this.selectedDocId), {
          items: this.items,
        } as any)
      );
      this.lastLoadedHash = this.buildCurrentHash();
      await this.presentToast('تم حذف البند نهائياً', 'success');
    } catch (e) {
      console.error(e);
      this.items.splice(index, 0, removed);
      this.assignSequentialOrderToItems();
      await this.presentToast('تعذر حذف البند، حاول مرة أخرى', 'danger');
    } finally {
      this.deletingIndex = null;
    }
  }

  moveUp(index: number): void {
    if (index <= 0) return;
    const t = this.items[index - 1];
    this.items[index - 1] = this.items[index];
    this.items[index] = t;
    this.assignSequentialOrderToItems();
  }

  moveDown(index: number): void {
    if (index >= this.items.length - 1) return;
    const t = this.items[index + 1];
    this.items[index + 1] = this.items[index];
    this.items[index] = t;
    this.assignSequentialOrderToItems();
  }

  itemPreview(row: any): string {
    return row?.nameAr || row?.id || '—';
  }

  onNameInputFocus(index: number): void {
    const row = this.items[index];
    this.nameDraftCache[index] = String(row?.nameAr ?? '');
  }

  async onInlineNameBlur(index: number): Promise<void> {
    const row = this.items[index];
    if (!row) return;

    const previous = (this.nameDraftCache[index] ?? '').trim();
    const next = String(row.nameAr ?? '').trim();
    row.nameAr = next;
    delete this.nameDraftCache[index];

    if (!next) {
      row.nameAr = previous;
      await this.presentToast('الاسم لا يمكن أن يكون فارغاً', 'warning');
      return;
    }

    if (next === previous) {
      return;
    }

    const ok = await this.presentSaveConfirm('تم تعديل الاسم، هل تريد حفظ التغيير؟');
    if (!ok) {
      row.nameAr = previous;
      return;
    }

    this.savingNameIndex = index;
    try {
      this.assignSequentialOrderToItems();
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'Categories', this.selectedDocId), {
          items: this.items,
        } as any)
      );
      this.lastLoadedHash = this.buildCurrentHash();
      await this.presentToast('تم تحديث الاسم', 'success');
    } catch (e) {
      console.error(e);
      row.nameAr = previous;
      await this.presentToast('تعذر تحديث الاسم، حاول مرة أخرى', 'danger');
    } finally {
      if (this.savingNameIndex === index) {
        this.savingNameIndex = null;
      }
    }
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

  /** خدمات أخرى: نفس حقول البسيط + تصنيفات فرعية (سطر لكل تصنيف) كما في المنتجات */
  private async promptOtherServicesDialog(
    title: string,
    existing: any | null,
    index?: number
  ): Promise<void> {
    const subText = Array.isArray(existing?.subcategories) ? existing.subcategories.join('\n') : '';
    const alert = await this.alertCtrl.create({
      header: title,
      message: 'التصنيفات الفرعية (اختياري): سطر لكل تصنيف',
      mode: 'ios',
      inputs: [
        { name: 'id', type: 'text', placeholder: 'المعرّف (id)', value: existing?.id ?? '' },
        { name: 'nameAr', type: 'text', placeholder: 'الاسم بالعربية', value: existing?.nameAr ?? '' },
        { name: 'nameEn', type: 'text', placeholder: 'الاسم بالإنجليزية', value: existing?.nameEn ?? '' },
        {
          name: 'subcategories',
          type: 'textarea',
          placeholder: 'تصنيفات فرعية (سطر لكل تصنيف)',
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
            const o: Record<string, unknown> = {
              id: data.id.trim(),
              nameAr: data.nameAr.trim(),
              nameEn: (data.nameEn || '').trim(),
            };
            if (subcategories.length) {
              o['subcategories'] = subcategories;
            }
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

  /** يمنع استبدال الشاشة من لقطة بعيدة إن وُجدت تعديلات محلية غير محفوظة (بعد أول تحميل). */
  private remoteApplyBlockedByDirty(): boolean {
    if (this.lastLoadedHash === '') {
      return false;
    }
    return this.hasUnsavedChanges();
  }

  private hasUnsavedChanges(): boolean {
    return this.buildCurrentHash() !== this.lastLoadedHash;
  }

  private buildCurrentHash(): string {
    return JSON.stringify({
      items: this.items,
      nameAr: this.metaNameAr || null,
      icon: this.metaIcon || null,
    });
  }

  /**
   * يُطابق حقل order على كل بند مع موضعه في المصفوفة (0..n-1) كما يظهر في الإدارة.
   * يضمن أن تطبيق Mota7 يعرض نفس الترتيب عندما يرتّب حسب order بعد الحفظ.
   */
  private assignSequentialOrderToItems(): void {
    this.items.forEach((row: any, index: number) => {
      if (row && typeof row === 'object') {
        row.order = index;
      }
    });
  }

  private async presentSaveConfirm(message: string): Promise<boolean> {
    const a = await this.alertCtrl.create({
      header: 'تأكيد الحفظ',
      message,
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        { text: 'تأكيد', role: 'confirm' },
      ],
    });
    await a.present();
    const res = await a.onDidDismiss();
    return res.role === 'confirm';
  }

  goDashboard(): void {
    void this.navCtrl.navigateRoot('/dashboard');
  }
}
