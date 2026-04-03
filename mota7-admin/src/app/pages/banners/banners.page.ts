import { Component, OnInit, ViewChild, inject, Injector, runInInjectionContext } from '@angular/core';
import { IonicModule, IonInput, AlertController, ToastController, LoadingController, NavController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, doc, setDoc, updateDoc, deleteDoc, query, orderBy, Timestamp } from '@angular/fire/firestore';
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
import { Observable } from 'rxjs';
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
export class BannersPage implements OnInit {
  @ViewChild('inputBannerTitle', { read: IonInput }) private inputBannerTitle?: IonInput;
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private uploadSvc = inject(CloudinaryUploadService);
  private cleanupSvc = inject(CloudinaryCleanupService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private loadingCtrl = inject(LoadingController);
  private navCtrl = inject(NavController);

  banners$: Observable<any[]> | undefined;
  previewImage: string | null = null;
  selectedFile: File | null = null;
  isAdding: boolean = false;

  bannerData = {
    title: '',
    startDate: '',
    endDate: '',
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
  }

  doRefresh(event: any) {
    this.loadBanners();
    setTimeout(() => {
      event.target.complete();
    }, 1000);
  }

  loadBanners() {
    runInInjectionContext(this.injector, () => {
      const bannersRef = collection(this.firestore, 'banners');
      const q = query(bannersRef, orderBy('createdAt', 'desc'));
      this.banners$ = collectionData(q, { idField: 'id' });
    });
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
      await runInInjectionContext(this.injector, () =>
        setDoc(doc(this.firestore, 'banners', bannerId), {
          title: this.bannerData.title || '',
          imageUrl,
          cloudinary_public_id: publicId,
          startDate: this.bannerData.startDate,
          endDate: this.bannerData.endDate,
          status: 'active',
          createdAt: Timestamp.now(),
        })
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
    this.bannerData = { title: '', startDate: '', endDate: '', status: 'active' };
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
