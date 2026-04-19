import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, inject, Injector, runInInjectionContext } from '@angular/core';
import { IonicModule, IonInput, AlertController, ToastController, LoadingController, NavController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, doc, setDoc, updateDoc, deleteDoc, query, orderBy, Timestamp } from '@angular/fire/firestore';
import { deleteField } from 'firebase/firestore';
import { Subscription, interval } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { addIcons } from 'ionicons';
import {
  imagesOutline,
  addOutline,
  trashOutline,
  powerOutline,
  cloudUploadOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  calendarOutline,
  chevronDownCircleOutline
} from 'ionicons/icons';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { CloudinaryUploadService } from '../../services/cloudinary-upload.service';
import { CloudinaryCleanupService } from '../../services/cloudinary-cleanup.service';
import { tryParseCloudinaryPublicIdFromUrl } from '../../core/utils/cloudinary-public-id.util';
import { normalizeUserFreeText, readIonTextInputValueFromEvent } from '../../core/utils/ion-text-input.util';

@Component({
  selector: 'app-banners',
  templateUrl: './banners.page.html',
  styleUrls: ['./banners.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, Mota7HeaderComponent],
})
export class BannersPage implements OnInit, OnDestroy {
  /** خيارات ترتيب الظهور 1…100 لقوائم الاختيار */
  readonly displayOrderSlots: number[] = Array.from({ length: 100 }, (_, i) => i + 1);

  readonly displayOrderAlertOptions = {
    header: 'ترتيب الظهور',
    subHeader: 'الأرقام المحجوزة لبانر آخر غير قابلة للاختيار',
  };

  readonly displayOrderAlertOptionsNew = {
    header: 'اختر ترتيب الظهور',
    subHeader: 'المحجوز لبانر موجود مسبقاً غير متاح',
  };
  @ViewChild('inputBannerTitle', { read: IonInput }) private inputBannerTitle?: IonInput;
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private uploadSvc = inject(CloudinaryUploadService);
  private cleanupSvc = inject(CloudinaryCleanupService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private loadingCtrl = inject(LoadingController);
  private navCtrl = inject(NavController);
  private cdr = inject(ChangeDetectorRef);

  bannersList: any[] = [];
  /** يعاد رسم القائمة ليعكس ترتيب الساعة كما في التطبيق */
  private displayOrderTickSub: Subscription | null = null;
  /** حقول تعديل لكل بانر (مفتاح: id المستند) */
  bannerEdits: Record<
    string,
    { startDate: string; endDate: string; displayOrderStr: string; createdAtDate: string }
  > = {};
  private bannersSub: Subscription | null = null;

  previewImage: string | null = null;
  selectedFile: File | null = null;
  isAdding: boolean = false;

  bannerData = {
    title: '',
    startDate: '',
    endDate: '',
    /** 1–100: الأصغر يظهر أولاً في التطبيق؛ فارغ = ترتيب غير مرقّم يتجدد كل ساعة */
    displayOrder: '',
    /** تاريخ الإضافة (مخزَّن في Firestore؛ لا يحدد ظهور البانر غير المرقّم في التطبيق)؛ فارغ = وقت الرفع الحالي */
    createdAtDate: '',
    status: 'active',
  };

  constructor() {
    addIcons({
      imagesOutline,
      addOutline,
      trashOutline,
      powerOutline,
      cloudUploadOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      calendarOutline,
      'chevron-down-circle-outline': chevronDownCircleOutline,
    });
  }

  ngOnInit() {
    this.loadBanners();
    this.displayOrderTickSub?.unsubscribe();
    this.displayOrderTickSub = interval(60_000)
      .pipe(startWith(0))
      .subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy() {
    this.bannersSub?.unsubscribe();
    this.bannersSub = null;
    this.displayOrderTickSub?.unsubscribe();
    this.displayOrderTickSub = null;
  }

  /** نفس ترتيب الظهور في تطبيق المستخدم (مرقّمون أولاً، ثم عشوائية ساعية لغير المرقّمين) */
  get bannersListForDisplay(): any[] {
    return this.sortBannersLikeApp([...this.bannersList]);
  }

  private sortBannersLikeApp(banners: any[]): any[] {
    const hourSlot = Math.floor(Date.now() / (60 * 60 * 1000));
    const displayRank = (x: any): number | null =>
      typeof x.displayOrder === 'number' &&
      Number.isFinite(x.displayOrder) &&
      x.displayOrder >= 1 &&
      x.displayOrder <= 100
        ? Math.floor(x.displayOrder)
        : null;

    const ranked: any[] = [];
    const unranked: any[] = [];
    for (const b of banners) {
      if (displayRank(b) != null) {
        ranked.push(b);
      } else {
        unranked.push(b);
      }
    }

    ranked.sort((a, b) => {
      const ra = displayRank(a)!;
      const rb = displayRank(b)!;
      if (ra !== rb) {
        return ra - rb;
      }
      return this.bannerCreatedMillisForSort(b) - this.bannerCreatedMillisForSort(a);
    });

    unranked.sort(
      (a, b) =>
        this.hourlyShuffleScore(hourSlot, String(a?.id ?? '')) -
        this.hourlyShuffleScore(hourSlot, String(b?.id ?? ''))
    );

    return [...ranked, ...unranked];
  }

  private hourlyShuffleScore(hourSlot: number, bannerId: string): number {
    const s = `${hourSlot}:${bannerId}`;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  private bannerCreatedMillisForSort(b: any): number {
    const ts = b?.createdAt;
    if (ts && typeof ts.toMillis === 'function') {
      return ts.toMillis();
    }
    if (ts && typeof ts.toDate === 'function') {
      try {
        return ts.toDate().getTime();
      } catch {
        /* ignore */
      }
    }
    if (ts && typeof ts.seconds === 'number') {
      return ts.seconds * 1000;
    }
    return 0;
  }

  trackByBannerId(_index: number, banner: any) {
    return banner?.id ?? _index;
  }

  doRefresh(event: any) {
    this.loadBanners();
    setTimeout(() => {
      event.target.complete();
    }, 1000);
  }

  loadBanners() {
    this.bannersSub?.unsubscribe();
    runInInjectionContext(this.injector, () => {
      const bannersRef = collection(this.firestore, 'banners');
      const q = query(bannersRef, orderBy('createdAt', 'desc'));
      this.bannersSub = collectionData(q, { idField: 'id' }).subscribe((list) => {
        this.bannersList = list;
        this.syncBannerEditsFromServer(list);
      });
    });
  }

  private syncBannerEditsFromServer(list: any[]) {
    const ids = new Set(list.map((b) => b.id));
    for (const id of Object.keys(this.bannerEdits)) {
      if (!ids.has(id)) {
        delete this.bannerEdits[id];
      }
    }
    for (const b of list) {
      if (!this.bannerEdits[b.id]) {
        this.bannerEdits[b.id] = {
          startDate: b.startDate || '',
          endDate: b.endDate || '',
          displayOrderStr:
            typeof b.displayOrder === 'number' && b.displayOrder >= 1 && b.displayOrder <= 100
              ? String(Math.floor(b.displayOrder))
              : '',
          createdAtDate: this.timestampToDateInput(b.createdAt),
        };
      }
    }
  }

  private timestampToDateInput(ts: any): string {
    if (!ts) return '';
    let d: Date | null = null;
    if (typeof ts?.toDate === 'function') {
      try {
        d = ts.toDate();
      } catch {
        d = null;
      }
    } else if (typeof ts?.seconds === 'number') {
      d = new Date(ts.seconds * 1000);
    }
    if (!d || isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private dateInputToTimestampAtNoon(dateStr: string): Timestamp | null {
    if (!dateStr || !String(dateStr).trim()) return null;
    const d = new Date(`${dateStr.trim()}T12:00:00`);
    if (isNaN(d.getTime())) return null;
    return Timestamp.fromDate(d);
  }

  private parseDisplayOrder(raw: string): number | null {
    const n = parseInt(String(raw ?? '').trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 100) return null;
    return n;
  }

  /**
   * الترتيب الفعلي المعروض في النموذج (مسودة التعديل أولاً؛ إن أُفرغ الرقم لا نعود لقيمة السيرفر لحساب الحجز).
   */
  getEffectiveDisplayOrder(bannerId: string): number | null {
    const e = this.bannerEdits[bannerId];
    if (e) {
      return this.parseDisplayOrder(e.displayOrderStr);
    }
    const b = this.bannersList.find((x) => x.id === bannerId);
    if (b && typeof b.displayOrder === 'number' && b.displayOrder >= 1 && b.displayOrder <= 100) {
      return Math.floor(b.displayOrder);
    }
    return null;
  }

  /** هل الرقم محجوز لبانر آخر (أو لمسودة بانر آخر) */
  isDisplayOrderReserved(excludeBannerId: string | null, slot: number): boolean {
    for (const b of this.bannersList) {
      if (excludeBannerId !== null && b.id === excludeBannerId) continue;
      const ord = this.getEffectiveDisplayOrder(b.id);
      if (ord === slot) return true;
    }
    return false;
  }

  /** للبانر الجديد قبل الحفظ: أي رقم مأخوذ في القائمة الحالية */
  isDisplayOrderReservedForNew(slot: number): boolean {
    return this.isDisplayOrderReserved(null, slot);
  }

  async saveBannerSchedule(banner: any) {
    const id = banner?.id;
    if (!id) return;
    const e = this.bannerEdits[id];
    if (!e) {
      this.showToast('لا توجد بيانات للحفظ');
      return;
    }

    const patch: {
      startDate: string;
      endDate: string;
      displayOrder: number | ReturnType<typeof deleteField>;
      createdAt?: Timestamp;
    } = {
      startDate: e.startDate || '',
      endDate: e.endDate || '',
      displayOrder: deleteField(),
    };

    const ord = this.parseDisplayOrder(e.displayOrderStr);
    if (ord != null) {
      patch.displayOrder = ord;
    }

    const created = this.dateInputToTimestampAtNoon(e.createdAtDate);
    if (created) {
      patch.createdAt = created;
    }

    const loader = await this.loadingCtrl.create({
      message: 'جاري حفظ التعديلات...',
      mode: 'ios',
    });
    await loader.present();
    try {
      await runInInjectionContext(this.injector, () => updateDoc(doc(this.firestore, 'banners', id), patch));
      this.bannerEdits[id] = {
        startDate: e.startDate || '',
        endDate: e.endDate || '',
        displayOrderStr: ord != null ? String(ord) : '',
        createdAtDate: e.createdAtDate,
      };
      this.showToast('تم حفظ التعديلات');
    } catch (err) {
      console.error(err);
      this.showToast('تعذّر الحفظ، حاول مرة أخرى');
    } finally {
      loader.dismiss();
    }
  }

  goBack() {
    this.navCtrl.back();
  }

  selectImage(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        this.previewImage = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  onBannerTitleInput(ev: Event): void {
    const v = readIonTextInputValueFromEvent(ev);
    if (this.bannerData.title === v) {
      return;
    }
    this.bannerData.title = v;
  }

  private async syncBannerTitleFromNativeInput(): Promise<void> {
    if (!this.inputBannerTitle) {
      return;
    }
    try {
      const el = await this.inputBannerTitle.getInputElement();
      const v = el?.value;
      if (typeof v === 'string') {
        this.bannerData.title = v;
      }
    } catch {
      /* ignore */
    }
  }

  async uploadBanner() {
    await this.syncBannerTitleFromNativeInput();
    this.bannerData.title = normalizeUserFreeText(this.bannerData.title);
    if (!this.selectedFile) {
      this.showToast('يرجى اختيار صورة للبانر');
      return;
    }

    const loader = await this.loadingCtrl.create({
      message: 'جاري رفع البانر الآن...',
      mode: 'ios',
    });
    await loader.present();

    try {
      const { url: imageUrl, publicId } = await this.uploadSvc.uploadImage(this.selectedFile, 'banners');

      const bannerId = Date.now().toString();
      const ord = this.parseDisplayOrder(this.bannerData.displayOrder);
      const createdAt =
        this.dateInputToTimestampAtNoon(this.bannerData.createdAtDate) ?? Timestamp.now();

      const docPayload: {
        title: string;
        imageUrl: string;
        cloudinary_public_id: string;
        startDate: string;
        endDate: string;
        status: string;
        createdAt: Timestamp;
        displayOrder?: number;
      } = {
        title: this.bannerData.title || '',
        imageUrl,
        cloudinary_public_id: publicId,
        startDate: this.bannerData.startDate,
        endDate: this.bannerData.endDate,
        status: 'active',
        createdAt,
      };
      if (ord != null) {
        docPayload.displayOrder = ord;
      }

      await runInInjectionContext(this.injector, () =>
        setDoc(doc(this.firestore, 'banners', bannerId), docPayload)
      );

      this.resetForm();
      this.showToast('تم رفع وتنشيط البانر بنجاح');
    } catch (e) {
      console.error('Cloudinary Error:', e);
      this.showToast('حدث خطأ أثناء الاتصال بكلاوديناري');
    } finally {
      loader.dismiss();
    }
  }

  async toggleStatus(banner: any) {
    const newStatus = banner.status === 'active' ? 'inactive' : 'active';
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, 'banners', banner.id), { status: newStatus })
    );
    this.showToast(`تم ${newStatus === 'active' ? 'تنشيط' : 'إيقاف'} البانر`);
  }

  async deleteBanner(banner: any) {
    const alert = await this.alertCtrl.create({
      header: 'حذف البانر',
      message: 'هل تريد حذف هذا البانر نهائياً؟',
      mode: 'ios',
      buttons: [
        { text: 'تراجع', role: 'cancel' },
        {
          text: 'نعم، حذف',
          handler: async () => {
            const ids: string[] = [];
            if (typeof banner.cloudinary_public_id === 'string' && banner.cloudinary_public_id.trim()) {
              ids.push(banner.cloudinary_public_id.trim());
            } else if (typeof banner.imageUrl === 'string') {
              const parsed = tryParseCloudinaryPublicIdFromUrl(banner.imageUrl);
              if (parsed?.startsWith('banners/')) {
                ids.push(parsed);
              }
            }
            if (ids.length) {
              await this.cleanupSvc.deletePublicIds(ids).catch(() => {});
            }
            await runInInjectionContext(this.injector, () =>
              deleteDoc(doc(this.firestore, 'banners', banner.id))
            );
            this.showToast('تم حذف البانر');
          },
        },
      ],
    });
    await alert.present();
  }

  resetForm() {
    this.previewImage = null;
    this.selectedFile = null;
    this.bannerData = {
      title: '',
      startDate: '',
      endDate: '',
      displayOrder: '',
      createdAtDate: '',
      status: 'active',
    };
    this.isAdding = false;
  }

  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 2000,
      mode: 'ios',
      position: 'bottom',
    });
    await toast.present();
  }
}
