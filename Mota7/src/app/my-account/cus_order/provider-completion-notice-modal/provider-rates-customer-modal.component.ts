import {
  Component,
  Input,
  OnInit,
  ViewChild,
  inject,
  EnvironmentInjector,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore } from '@angular/fire/firestore';
import {
  IonTextarea,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { IonicModule } from '@ionic/angular';
import { readIonTextInputValueFromEvent } from '../../../core/utils/order-form-fields.util';
import { submitProviderRatesCustomer } from '../../../core/utils/order-provider-rates-customer.firestore';
import { addIcons } from 'ionicons';
import { star, starOutline } from 'ionicons/icons';

@Component({
  selector: 'app-provider-rates-customer-modal',
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
  templateUrl: './provider-rates-customer-modal.component.html',
  styleUrls: ['./provider-rates-customer-modal.component.scss'],
})
export class ProviderRatesCustomerModalComponent implements OnInit {
  @Input() order: any;
  @Input() orderId = '';

  @ViewChild('ratingComment', { read: IonTextarea }) private ratingComment?: IonTextarea;

  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  customerName = '';
  selectedStars = 0;
  commentText = '';
  readonly maxComment = 50;
  readonly starSlots = [1, 2, 3, 4, 5];
  isSubmitting = false;

  constructor() {
    addIcons({ star, starOutline });
  }

  ngOnInit(): void {
    this.customerName =
      this.order?.customerName || this.order?.customer_name || 'طالب الخدمة';
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
        localStorage.setItem(`mota7_prov_cust_rating_skip_${this.orderId}`, '1');
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
      await submitProviderRatesCustomer(
        this.injector,
        this.firestore,
        this.orderId,
        this.selectedStars,
        this.commentText
      );

      const toast = await this.toastCtrl.create({
        message: 'شكرا لاستخدامك تطبيق "مُتاح"',
        duration: 3000,
        position: 'bottom',
        mode: 'ios',
      });
      await toast.present();

      await this.modalCtrl.dismiss({ submitted: true }, 'confirm');
    } catch (e) {
      console.error('submitProviderRatesCustomer', e);
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
