import {
  Component,
  OnInit,
  ViewChild,
  inject,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import { AlertController, IonInput, IonTextarea, LoadingController, ModalController } from '@ionic/angular';
import { OTHER_SERVICES_DATA } from '../../core/constants/other-services-data';
import { Firestore, collection, query, where, getDocs, Timestamp, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { NewOrderNtfyService } from '../../core/services/new-order-ntfy.service';
import {
  applyOrderPhoneInputState,
  isOrderPhoneValid,
  ORDER_PHONE_DIGITS_ONLY_MSG,
  ORDER_PHONE_INVALID_MSG,
  orderPhoneToEnglishDigits,
} from '../../core/utils/egyptian-phone-order.util';
import {
  findMatchingNameArItem,
  findMatchingStringInList,
  normalizeUserFreeText,
  readIonTextInputValueFromEvent,
} from '../../core/utils/order-form-fields.util';
import {
  mergeGuestStoredContactIntoOrderData,
  writeGuestOrderContact,
} from '../../core/utils/guest-order-contact-storage.util';

@Component({
  selector: 'app-other-service',
  templateUrl: './other-service.component.html',
  styleUrls: ['./other-service.component.scss'],
  standalone: false
})
export class OtherServiceComponent implements OnInit {

  @ViewChild('inputCustomerName', { read: IonInput }) private inputCustomerName?: IonInput;
  @ViewChild('textareaShortNote', { read: IonTextarea }) private textareaShortNote?: IonTextarea;

  otherItems = OTHER_SERVICES_DATA.items;
  private readonly orderCityOptions = ['الخارجة', 'الداخلة'] as const;
  phoneLiveWarning: string | null = null;
  private loadingCtrl = inject(LoadingController);
  private firestore = inject(Firestore);
  private auth = inject(Auth); 
  private injector = inject(Injector);
  private newOrderNtfy = inject(NewOrderNtfyService);

  orderData = {
    customerName: '',
    customerPhone: '',
    subService: '',
    shortNote: '',
    city: ''
  };

  constructor(
    private modalCtrl: ModalController,
    private alertCtrl: AlertController
  ) {}

  async ngOnInit() {
    await this.loadUserProfile();
    mergeGuestStoredContactIntoOrderData(
      this.orderData,
      !!this.auth.currentUser?.email
    );
    const st = applyOrderPhoneInputState(this.orderData.customerPhone);
    this.orderData.customerPhone = st.cleaned;
    this.phoneLiveWarning = st.warning;
  }

  onCustomerPhoneKeyDown(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) {
      return;
    }
    const key = ev.key;
    if (key.length !== 1) {
      return;
    }
    const asDigit = orderPhoneToEnglishDigits(key);
    if (/^[0-9]$/.test(asDigit)) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    this.phoneLiveWarning = ORDER_PHONE_DIGITS_ONLY_MSG;
  }

  onCustomerPhoneBeforeInput(ev: InputEvent): void {
    const t = ev.inputType || '';
    if (t !== 'insertText' && t !== 'insertCompositionText') {
      return;
    }
    const chunk = ev.data ?? '';
    if (!chunk) {
      return;
    }
    if (/\D/.test(orderPhoneToEnglishDigits(chunk))) {
      ev.preventDefault();
      this.phoneLiveWarning = ORDER_PHONE_DIGITS_ONLY_MSG;
    }
  }

  onCustomerPhoneInput(ev: Event): void {
    const raw = readIonTextInputValueFromEvent(ev);
    const st = applyOrderPhoneInputState(raw);
    this.orderData.customerPhone = st.cleaned;
    this.phoneLiveWarning = st.warning;
  }

  onOtherFreeTextInput(ev: Event, field: 'customerName' | 'shortNote'): void {
    this.orderData[field] = readIonTextInputValueFromEvent(ev);
  }

  private async syncFreeTextFieldsFromNativeInputs(): Promise<void> {
    if (this.inputCustomerName) {
      try {
        const el = await this.inputCustomerName.getInputElement();
        const v = el?.value;
        if (typeof v === 'string') {
          this.orderData.customerName = v;
        }
      } catch {
        /* ignore */
      }
    }
    if (this.textareaShortNote) {
      try {
        const el = await this.textareaShortNote.getInputElement();
        const v = el?.value;
        if (typeof v === 'string') {
          this.orderData.shortNote = v;
        }
      } catch {
        /* ignore */
      }
    }
  }

  async loadUserProfile() {
    const user = this.auth.currentUser;
    if (user?.email) {
      const userKey = user.email.split('@')[0];
      try {
        const userDoc = await runInInjectionContext(this.injector, () =>
          getDoc(doc(this.firestore, 'users', userKey))
        );
        if (userDoc.exists()) {
          const data = userDoc.data();
          this.orderData.customerName = data['fullName'] || '';
          this.orderData.customerPhone = data['phone'] || '';
          const profileCity = String(data['city'] ?? '').trim();
          this.orderData.city =
            findMatchingStringInList(this.orderCityOptions as readonly string[], profileCity) ??
            '';
        }
      } catch (e) {
        console.error("Error loading profile:", e);
      }
    }
  }

  dismiss() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  async submitOrder() {
    await this.syncFreeTextFieldsFromNativeInputs();
    this.orderData.customerName = normalizeUserFreeText(this.orderData.customerName);
    const phoneSt = applyOrderPhoneInputState(this.orderData.customerPhone);
    this.orderData.customerPhone = phoneSt.cleaned;
    this.phoneLiveWarning = phoneSt.warning;
    this.orderData.subService = (this.orderData.subService || '').trim();
    this.orderData.shortNote = normalizeUserFreeText(this.orderData.shortNote);
    this.orderData.city = (this.orderData.city || '').trim();

    const customerName = this.orderData.customerName;
    const { customerPhone, shortNote } = this.orderData;

    const cityMatch = findMatchingStringInList(
      this.orderCityOptions as readonly string[],
      this.orderData.city
    );
    const cityValid = !!cityMatch;
    const canonicalCity = cityMatch ?? '';

    const subMatch = findMatchingNameArItem(this.otherItems, this.orderData.subService);
    const subOk = !!subMatch;
    const canonicalSub = subMatch?.nameAr ?? '';

    const missingParts: string[] = [];
    if (!customerName) {
      missingParts.push('الاسم');
    }
    if (!customerPhone) {
      missingParts.push('رقم الهاتف');
    }
    if (!cityValid) {
      missingParts.push('المدينة');
    }
    if (!subOk) {
      missingParts.push('الخدمة المطلوبة');
    }
    if (!shortNote) {
      missingParts.push('ملاحظات إضافية');
    }

    if (missingParts.length > 0) {
      const alert = await this.alertCtrl.create({
        header: 'بيانات ناقصة',
        message: `يرجى تعبئة: ${missingParts.join('، ')}`,
        buttons: ['موافق'],
        mode: 'ios'
      });
      await alert.present();
      return;
    }

    if (!isOrderPhoneValid(customerPhone)) {
      const alert = await this.alertCtrl.create({
        header: 'رقم الهاتف غير صحيح',
        message: ORDER_PHONE_INVALID_MSG,
        buttons: ['موافق'],
        mode: 'ios'
      });
      await alert.present();
      return;
    }

    this.orderData.city = canonicalCity;
    this.orderData.subService = canonicalSub;
    const subService = canonicalSub;
    const city = canonicalCity;

    const loader = await this.loadingCtrl.create({ 
      message: 'جاري معالجة طلبك...', 
      mode: 'ios' 
    });
    await loader.present();

    try {
      // --- 1. فحص الحظر (Blacklist Check) ---
      const blockedSnap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'blocked_users', customerPhone))
      );

      if (blockedSnap.exists()) {
        await loader.dismiss();
        const alert = await this.alertCtrl.create({
          header: 'تنبيه الحظر',
          message: 'نأسف، تم حظر هذا الرقم ولا يمكن إجراء طلبات في الوقت الحالي. يرجى التواصل مع الإدارة لحل المشكلة.',
          mode: 'ios',
          buttons: [
            {
              text: 'إلغاء',
              role: 'cancel'
            },
            {
              text: 'تواصل مع الإدارة',
              handler: () => {
                const msg = encodeURIComponent("السلام عليكم.. عندي مشكلة حظر لطلبات الخدمات على مُتاح");
                window.open(`whatsapp://send?phone=201002288812&text=${msg}`, '_system');
              }
            }
          ]
        });
        await alert.present();
        return;
      }

      // --- 2. إعداد المعرف الفريد للمستند (Phone + Other Key) ---
      const other_match_key = `${subService}_${city}`;
      const customDocId = `${customerPhone}_${other_match_key}`;
      const now = Date.now();

      // --- 3. فحص التكرار باستخدام المعرف المباشر ---
      const orderSnap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'orders', customDocId))
      );
      if (orderSnap.exists()) {
        const existingData = orderSnap.data();
        const hold =
          existingData['pendingHoldExpiresAt']?.toMillis?.() ||
          existingData['expiresAt']?.toMillis?.() ||
          0;

        if (existingData['status'] === 'pending' && hold > now) {
          await loader.dismiss();
          const alert = await this.alertCtrl.create({
            header: 'طلب مكرر',
            message: `لديك طلب نشط بالفعل لهذه الخدمة. يمكنك متابعته من صفحة "طلباتي".`,
            mode: 'ios',
            buttons: ['موافق']
          });
          await alert.present();
          return;
        }
      }

      // --- 4. إرسال الطلب باستخدام setDoc لضمان المعرف الموحد ---
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + 1);

      let finalOrder: Record<string, unknown>;
      await runInInjectionContext(this.injector, () => {
        finalOrder = {
          customerName,
          customerPhone,
          subService,
          shortNote: shortNote || '',
          city,
          other_match_key: other_match_key,
          serviceType: 'other',
          status: 'pending',
          createdAt: Timestamp.now(),
          pendingHoldExpiresAt: Timestamp.fromDate(expiryDate),
        };
        return setDoc(doc(this.firestore, 'orders', customDocId), finalOrder);
      });
      writeGuestOrderContact(customerName, customerPhone);
      void this.newOrderNtfy.publishPendingOrder({ ...finalOrder! });

      await loader.dismiss();
      this.modalCtrl.dismiss({ confirmed: true }, 'confirm');

    } catch {
      await loader.dismiss();
      const alert = await this.alertCtrl.create({
        header: 'خطأ',
        message: 'حدثت مشكلة أثناء إرسال الطلب، يرجى المحاولة مرة أخرى.',
        buttons: ['موافق'],
        mode: 'ios'
      });
      await alert.present();
    }
  }
}