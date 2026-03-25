import {
  Component,
  Input,
  OnInit,
  ViewChild,
  inject,
  EnvironmentInjector,
} from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  IonTextarea,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { readIonTextInputValueFromEvent } from '../../core/utils/order-form-fields.util';
import { submitOrderProviderRating } from '../../core/utils/order-provider-rating.firestore';
import { addIcons } from 'ionicons';
import { star, starOutline } from 'ionicons/icons';

const RATING_THANKS_MS = 3000;

@Component({
  selector: 'app-provider-rating-modal',
  templateUrl: './provider-rating-modal.component.html',
  styleUrls: ['./provider-rating-modal.component.scss'],
  standalone: false,
})
export class ProviderRatingModalComponent implements OnInit {
  @Input() order: any;
  @Input() orderId = '';

  @ViewChild('ratingComment', { read: IonTextarea }) private ratingComment?: IonTextarea;

  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  providerName = '';
  selectedStars = 0;
  commentText = '';
  readonly maxComment = 50;
  readonly starSlots = [1, 2, 3, 4, 5];
  isSubmitting = false;

  constructor() {
    addIcons({ star, starOutline });
  }

  ngOnInit(): void {
    this.providerName =
      this.order?.providerName ||
      this.order?.provider_name ||
      'مقدم الخدمة';
  }

  setStars(n: number): void {
    this.selectedStars = n;
  }

  onCommentInput(ev: Event): void {
    let v = readIonTextInputValueFromEvent(ev);
    if (v.length > this.maxComment) {
      v = v.slice(0, this.maxComment);
    }
    this.commentText = v;
  }

  cancel(): void {
    try {
      if (this.orderId) {
        localStorage.setItem(`mota7_rating_skip_${this.orderId}`, '1');
      }
    } catch {
      /* ignore */
    }
    void this.modalCtrl.dismiss({ submitted: false }, 'cancel');
  }

  async syncCommentFromNative(): Promise<void> {
    if (!this.ratingComment) return;
    try {
      const el = await this.ratingComment.getInputElement();
      const v = el?.value;
      if (typeof v === 'string') {
        this.commentText = v.slice(0, this.maxComment);
      }
    } catch {
      /* ignore */
    }
  }

  async submit(): Promise<void> {
    if (this.selectedStars < 1 || this.isSubmitting) return;
    this.isSubmitting = true;
    await this.syncCommentFromNative();
    try {
      await submitOrderProviderRating(
        this.injector,
        this.firestore,
        this.orderId,
        this.order as Record<string, unknown>,
        this.selectedStars,
        this.commentText
      );

      const toast = await this.toastCtrl.create({
        message: 'شكرا لاستخدامك تطبيق "مُتاح"',
        duration: RATING_THANKS_MS,
        position: 'bottom',
        mode: 'ios',
      });
      await toast.present();

      await this.modalCtrl.dismiss({ submitted: true }, 'confirm');
    } catch (e) {
      console.error('submitOrderProviderRating', e);
      const errToast = await this.toastCtrl.create({
        message: 'تعذر إرسال التقييم. حاول مرة أخرى.',
        duration: 2500,
        position: 'bottom',
        mode: 'ios',
        color: 'danger',
      });
      await errToast.present();
    } finally {
      this.isSubmitting = false;
    }
  }
}
