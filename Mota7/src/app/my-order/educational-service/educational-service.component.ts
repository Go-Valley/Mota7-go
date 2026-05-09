import {
  Component,
  OnInit,
  ViewChild,
  inject,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import { AlertController, IonInput, IonTextarea, LoadingController, ModalController } from '@ionic/angular';
import { EDUCATION_CATEGORY } from '../../core/constants/educational-data';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs, Timestamp, doc, getDoc, setDoc } from '@angular/fire/firestore';
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
  findMatchingSubject,
  normalizeUserFreeText,
  readIonTextInputValueFromEvent,
} from '../../core/utils/order-form-fields.util';
import {
  mergeGuestStoredContactIntoOrderData,
  writeGuestOrderContact,
} from '../../core/utils/guest-order-contact-storage.util';

@Component({
  selector: 'app-educational-service',
  templateUrl: './educational-service.component.html',
  styleUrls: ['./educational-service.component.scss'],
  standalone: false
})
export class EducationalServiceComponent implements OnInit {

  /** فتح من مودال الطلب: دروس خصوصية دون فرض مرحلة/مادة في النموذج */
  hubQuickEntry = false;

  @ViewChild('inputCustomerName', { read: IonInput }) private inputCustomerName?: IonInput;
  @ViewChild('textareaShortNote', { read: IonTextarea }) private textareaShortNote?: IonTextarea;

  educationItems = EDUCATION_CATEGORY.items;
  /** تطابق قيم ion-select حتى لا تبقى المدينة فارغة منطقياً عند جلب مدينة غير مدعومة من الملف الشخصي */
  private readonly orderCityOptions = ['الخارجة', 'الداخلة'] as const;
  availableSubjects: string[] = [];
  phoneLiveWarning: string | null = null;
  
  private loadingCtrl = inject(LoadingController);
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private injector = inject(Injector);
  private newOrderNtfy = inject(NewOrderNtfyService);

  orderData = {
    customerName: '',
    customerPhone: '',
    stage: '',    
    stageId: '',  
    subject: '',  
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

  onEducationNameInput(ev: Event): void {
    this.orderData.customerName = readIonTextInputValueFromEvent(ev);
  }

  onEducationShortNoteInput(ev: Event): void {
    this.orderData.shortNote = readIonTextInputValueFromEvent(ev);
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

  onStageChange() {
    const selectedStage = findMatchingNameArItem(this.educationItems, this.orderData.stage);
    if (selectedStage) {
      this.orderData.stage = selectedStage.nameAr;
      this.availableSubjects = selectedStage.subjects;
      this.orderData.stageId = selectedStage.id;
    } else {
      this.availableSubjects = [];
      this.orderData.stageId = '';
    }
    this.orderData.subject = ''; 
  }

  dismiss() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  async submitOrder() {
    if (this.hubQuickEntry) {
      await this.submitHubQuickEducationOrder();
      return;
    }
    await this.syncFreeTextFieldsFromNativeInputs();
    this.orderData.customerName = normalizeUserFreeText(this.orderData.customerName);
    const phoneSt = applyOrderPhoneInputState(this.orderData.customerPhone);
    this.orderData.customerPhone = phoneSt.cleaned;
    this.phoneLiveWarning = phoneSt.warning;
    this.orderData.stage = (this.orderData.stage || '').trim();
    this.orderData.stageId = (this.orderData.stageId || '').trim();
    this.orderData.subject = (this.orderData.subject || '').trim();
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

    const stageItem = findMatchingNameArItem(this.educationItems, this.orderData.stage);
    let stageId = (this.orderData.stageId || '').trim();
    if (stageItem && !stageId) {
      stageId = stageItem.id;
      this.orderData.stageId = stageItem.id;
    }
    const stage = stageItem?.nameAr ?? (this.orderData.stage || '').trim();
    const stageOk = !!stageItem && !!stageId;

    const subjectMatch = findMatchingSubject(stageItem?.subjects, this.orderData.subject);
    const subjectOk = !!stageItem && !!subjectMatch;
    const canonicalSubject = subjectMatch ?? (this.orderData.subject || '').trim();

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
    if (!stageOk) {
      missingParts.push('المرحلة التعليمية');
    }
    if (!subjectOk) {
      missingParts.push('المادة التعليمية');
    }

    if (missingParts.length > 0) {
      this.showAlert('بيانات ناقصة', `يرجى تعبئة: ${missingParts.join('، ')}`);
      return;
    }

    if (!isOrderPhoneValid(customerPhone)) {
      this.showAlert('رقم الهاتف غير صحيح', ORDER_PHONE_INVALID_MSG);
      return;
    }

    this.orderData.city = canonicalCity;
    this.orderData.stage = stage;
    this.orderData.subject = canonicalSubject;
    const subject = canonicalSubject;
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

      // --- 2. إعداد المعرف الفريد للمستند (Phone + Education Key) ---
      const education_match_key = `${stage}+${subject}+${city}`;
      const customDocId = `${customerPhone}_${education_match_key}`;
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
          stageName: stage,
          stageId: stageId,
          subjectName: subject,
          shortNote: shortNote || '',
          city: city,
          education_match_key: education_match_key,
          serviceType: 'education',
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
      await this.showAlert('خطأ', 'حدثت مشكلة أثناء إرسال الطلب، حاول مرة أخرى.');
    }
  }

  async showAlert(header: string, message: string) {
    const alert = await this.alertCtrl.create({
      header, message, buttons: ['موافق'], mode: 'ios'
    });
    await alert.present();
  }

  /** طلب «دروس خصوصية» من الشبكة السريعة: نفس بيانات الطلب دون اشتراط مرحلة/مادة */
  private async submitHubQuickEducationOrder(): Promise<void> {
    await this.syncFreeTextFieldsFromNativeInputs();
    this.orderData.customerName = normalizeUserFreeText(this.orderData.customerName);
    const phoneSt = applyOrderPhoneInputState(this.orderData.customerPhone);
    this.orderData.customerPhone = phoneSt.cleaned;
    this.phoneLiveWarning = phoneSt.warning;
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

    if (missingParts.length > 0) {
      await this.showAlert('بيانات ناقصة', `يرجى تعبئة: ${missingParts.join('، ')}`);
      return;
    }

    if (!isOrderPhoneValid(customerPhone)) {
      await this.showAlert('رقم الهاتف غير صحيح', ORDER_PHONE_INVALID_MSG);
      return;
    }

    const stage = 'دروس خصوصية';
    const stageId = 'hub-general';
    const subject = 'غير محدد';
    const city = canonicalCity;
    const education_match_key = `${stage}+${subject}+${city}`;
    const customDocId = `${customerPhone}_${education_match_key}`;
    const now = Date.now();

    const loader = await this.loadingCtrl.create({
      message: 'جاري معالجة طلبك...',
      mode: 'ios',
    });
    await loader.present();

    try {
      const blockedSnap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'blocked_users', customerPhone))
      );

      if (blockedSnap.exists()) {
        await loader.dismiss();
        const alert = await this.alertCtrl.create({
          header: 'تنبيه الحظر',
          message:
            'نأسف، تم حظر هذا الرقم ولا يمكن إجراء طلبات في الوقت الحالي. يرجى التواصل مع الإدارة لحل المشكلة.',
          mode: 'ios',
          buttons: [
            { text: 'إلغاء', role: 'cancel' },
            {
              text: 'تواصل مع الإدارة',
              handler: () => {
                const msg = encodeURIComponent('السلام عليكم.. عندي مشكلة حظر لطلبات الخدمات على مُتاح');
                window.open(`whatsapp://send?phone=201002288812&text=${msg}`, '_system');
              },
            },
          ],
        });
        await alert.present();
        return;
      }

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
          await this.showAlert(
            'طلب مكرر',
            `لديك طلب نشط بالفعل لهذه الخدمة. يمكنك متابعته من صفحة "طلباتي".`
          );
          return;
        }
      }

      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + 1);

      let finalOrder: Record<string, unknown>;
      await runInInjectionContext(this.injector, () => {
        finalOrder = {
          customerName,
          customerPhone,
          stageName: stage,
          stageId: stageId,
          subjectName: subject,
          shortNote: shortNote || '',
          city: city,
          education_match_key: education_match_key,
          serviceType: 'education',
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
      await this.showAlert('خطأ', 'حدثت مشكلة أثناء إرسال الطلب، حاول مرة أخرى.');
    }
  }
}