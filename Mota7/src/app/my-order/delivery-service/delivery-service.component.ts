import { Capacitor } from '@capacitor/core';
import {
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AlertController, IonInput, IonTextarea, LoadingController, ModalController } from '@ionic/angular';
import { DELIVERY_CATEGORY } from '../../core/constants/delivery-data';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { Mota7Location } from '../../plugins/mota7-location.plugin';
import { App } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import type { PluginListenerHandle } from '@capacitor/core';
import { Firestore, collection, addDoc, query, where, getDocs, Timestamp, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth'; 
import { addIcons } from 'ionicons'; 
import { checkmarkCircle } from 'ionicons/icons';
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
  hasOrderLocationCoordinates,
  normalizeUserFreeText,
  readIonTextInputValueFromEvent,
} from '../../core/utils/order-form-fields.util';
import {
  mergeGuestStoredContactIntoOrderData,
  writeGuestOrderContact,
} from '../../core/utils/guest-order-contact-storage.util';
import { AppTaxonomyService } from '../../core/services/app-taxonomy.service';

@Component({
  selector: 'app-delivery-service',
  templateUrl: './delivery-service.component.html',
  styleUrls: ['./delivery-service.component.scss'],
  standalone: false
})
export class DeliveryServiceComponent implements OnInit, OnDestroy {

  /** يُمرَّر من مودال التبويب عند اختيار نوع مركبة من الشبكة السريعة */
  initialVehicleNameAr?: string;
  /** عند true: قبول الطلب دون اختيار نوع مركبة (زر «المزيد») */
  allowUnspecifiedVehicle = false;

  @ViewChild('inputCustomerName', { read: IonInput }) private inputCustomerName?: IonInput;
  @ViewChild('inputCustomerPhone', { read: IonInput }) private inputCustomerPhone?: IonInput;
  @ViewChild('inputFromLocation', { read: IonInput }) private inputFromLocation?: IonInput;
  @ViewChild('inputToLocation', { read: IonInput }) private inputToLocation?: IonInput;
  @ViewChild('textareaShortNote', { read: IonTextarea }) private textareaShortNote?: IonTextarea;

  deliveryItems = [...DELIVERY_CATEGORY.items];
  availableCities = ['الخارجة', 'الداخلة'];

  /** بعد فتح الإعدادات: إعادة محاولة التحديد عند العودة للتطبيق */
  private locationListenerHandles: PluginListenerHandle[] = [];
  private locationResumeRetryInFlight = false;
  /** بعد «موافق» لفتح الإعدادات: نؤخر ونُعيد طلب الصلاحية (أندرويد يحدّث الحالة متأخراً) */
  private afterLocationSettingsReturn = false;

  private loadingCtrl = inject(LoadingController);
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private auth = inject(Auth);
  private newOrderNtfy = inject(NewOrderNtfyService); 
  private taxonomy = inject(AppTaxonomyService);
  private destroyRef = inject(DestroyRef);

  /** تحذير فوري تحت حقل الهاتف */
  phoneLiveWarning: string | null = null;
  /** تحذير تحت حقل المبلغ عند كتابة غير رقمية */
  priceLiveWarning: string | null = null;

  /** تحذير عند إدخال حرف أو رمز غير رقمي في المبلغ */
  private static readonly PRICE_NON_DIGIT_MSG = 'لايمكن قبول حروف - ارقام فقط';

  orderData = {
    customerName: '',
    customerPhone: '',
    subService: '',
    fromLocation: '',
    toLocation: '',
    shortNote: '',
    price: '',
    lat: 0,
    lng: 0,
    city: ''
  };

  constructor(
    private modalCtrl: ModalController,
    private alertCtrl: AlertController
  ) {
    addIcons({ checkmarkCircle });
  }
  
  async ngOnInit() {
    this.taxonomy.bundle$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((b) => {
        const nextItems = (b?.deliveryItems ?? []).filter((i: any) => i?.id && i?.nameAr);
        if (!nextItems.length) {
          return;
        }
        const prevItems = this.deliveryItems;
        const prevSelected = findMatchingNameArItem(prevItems, this.orderData.subService);
        this.deliveryItems = nextItems;
        if (prevSelected?.id) {
          const renamed = this.deliveryItems.find((i: any) => i?.id === prevSelected.id);
          if (renamed?.nameAr) {
            this.orderData.subService = renamed.nameAr;
          }
        }
      });

    await this.loadUserProfile();
    mergeGuestStoredContactIntoOrderData(
      this.orderData,
      !!this.auth.currentUser?.email
    );
    const st = applyOrderPhoneInputState(this.orderData.customerPhone);
    this.orderData.customerPhone = st.cleaned;
    this.phoneLiveWarning = st.warning;

    if (this.initialVehicleNameAr) {
      const m = findMatchingNameArItem(this.deliveryItems, this.initialVehicleNameAr);
      this.orderData.subService = m?.nameAr ?? '';
    }

    await this.primeLocationPermissionOnFirstOpen();
  }

  /**
   * أول فتح لطلب التوصيل: طلب سماح الموقع مبكراً.
   * عند الرفض لا نمنع استخدام النموذج؛ زر «تحديد موقعي» يعيد طلب الصلاحية.
   */
  private async primeLocationPermissionOnFirstOpen(): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      return;
    }
    try {
      if (Capacitor.getPlatform() === 'android') {
        try {
          await Mota7Location.requestLocationAccess();
        } catch (nativePermErr: unknown) {
          const m = String(
            (nativePermErr as { message?: string })?.message ?? nativePermErr ?? ''
          ).toLowerCase();
          const userDenied =
            m.includes('denied') || m.includes('location permission denied');
          if (userDenied) {
            return;
          }
        }
      }
      let p = await Geolocation.checkPermissions();
      if (p.location !== 'granted') {
        await Geolocation.requestPermissions();
      }
    } catch {
      /* التفاصيل والتنبيهات عند الضغط على زر التحديد */
    }
  }

  /** منع الحرف/الرمز فور الضغط — رسالة فورية مثل حقل المبلغ */
  onCustomerPhoneKeyDown(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) {
      return;
    }
    if (ev.isComposing) {
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
    const english = orderPhoneToEnglishDigits(chunk);
    if (/\D/.test(english)) {
      ev.preventDefault();
      this.phoneLiveWarning = ORDER_PHONE_DIGITS_ONLY_MSG;
    }
  }

  onCustomerPhoneChange(val: string): void {
    const raw = val || '';
    const st = applyOrderPhoneInputState(raw);
    this.orderData.customerPhone = st.cleaned;
    this.phoneLiveWarning = st.warning;
    
    if (this.inputCustomerPhone) {
      this.inputCustomerPhone.value = st.cleaned;
    }
  }

  /** مزامنة فورية مع ion-input — دمج detail + قيمة العنصر لدعم IME العربي على الموبايل */
  onDeliveryFreeTextInput(
    ev: Event,
    field: 'customerName' | 'fromLocation' | 'toLocation' | 'shortNote'
  ): void {
    this.orderData[field] = readIonTextInputValueFromEvent(ev);
  }

  /** قبل التحقق: سحب النص من الـ native input (إصلاح فراغ ngModel/detail على أندرويد) */
  private async syncFreeTextFieldsFromNativeInputs(): Promise<void> {
    const pairs: Array<
      [IonInput | undefined, 'customerName' | 'fromLocation' | 'toLocation']
    > = [
      [this.inputCustomerName, 'customerName'],
      [this.inputFromLocation, 'fromLocation'],
      [this.inputToLocation, 'toLocation'],
    ];
    for (const [cmp, key] of pairs) {
      if (!cmp) {
        continue;
      }
      try {
        const native = await cmp.getInputElement();
        const v = native?.value;
        if (typeof v === 'string') {
          this.orderData[key] = v;
        }
      } catch {
        /* تجاهل — نعتمد على ngModel */
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

  /**
   * اعتراض مفتاح غير رقمي قبل دخوله للحقل — يظهر التحذير فوراً (لوحة numeric أحياناً لا تمرّر الحرف لـ ionInput).
   */
  onPriceKeyDown(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) {
      return;
    }
    if (ev.isComposing) {
      return;
    }
    const key = ev.key;
    if (key.length !== 1) {
      return;
    }
    const asDigit = this.toEnglishDigits(key);
    if (/^[0-9]$/.test(asDigit)) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    this.priceLiveWarning = DeliveryServiceComponent.PRICE_NON_DIGIT_MSG;
  }

  /** لصق نص يحتوي غير أرقام */
  onPriceBeforeInput(ev: InputEvent): void {
    const t = ev.inputType || '';
    if (t !== 'insertText' && t !== 'insertCompositionText') {
      return;
    }
    const chunk = ev.data ?? '';
    if (!chunk) {
      return;
    }
    const english = this.toEnglishDigits(chunk);
    if (/\D/.test(english)) {
      ev.preventDefault();
      this.priceLiveWarning = DeliveryServiceComponent.PRICE_NON_DIGIT_MSG;
    }
  }

  /**
   * المبلغ: أرقام فقط؛ لا حروف؛ لا يبدأ بـ 0 (الرقم ٠ العربي يُحوَّل ثم يُطبَّق نفس الشرط).
   */
  onPriceInput(ev: Event): void {
    const raw = readIonTextInputValueFromEvent(ev);
    const english = this.toEnglishDigits(raw);
    const hasNonDigit = /\D/.test(english);
    const digitsOnly = english.replace(/\D/g, '');
    const normalized = digitsOnly.replace(/^0+/, '') || '';
    const leadingZeroAttempt = digitsOnly.length > 0 && digitsOnly[0] === '0';

    if (hasNonDigit) {
      this.priceLiveWarning = DeliveryServiceComponent.PRICE_NON_DIGIT_MSG;
    } else if (leadingZeroAttempt) {
      this.priceLiveWarning = 'مبلغ غير صحيح';
    } else {
      this.priceLiveWarning = null;
    }

    this.orderData.price = normalized;
  }

  ngOnDestroy(): void {
    void this.clearLocationResumeListener();
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
            findMatchingStringInList(this.availableCities, profileCity) ?? '';
        }
      } catch (e) {
        console.error("Error loading profile:", e);
      }
    }
  }

  async getCurrentLocation() {
    const loader = await this.loadingCtrl.create({
      message: 'جاري تحديد موقعك بدقة...',
      mode: 'ios'
    });
    await loader.present();

    const isNative = Capacitor.getPlatform() !== 'web';

    if (isNative) {
      if (this.afterLocationSettingsReturn) {
        this.afterLocationSettingsReturn = false;
        await new Promise((r) => setTimeout(r, 1200));
      }

      let geoAlreadyGranted = false;
      try {
        const pre = await Geolocation.checkPermissions();
        geoAlreadyGranted = pre.location === 'granted';
      } catch {
        geoAlreadyGranted = false;
      }

      /** صلاحية ممنوحة مسبقاً: لا نعيد Mota7 ولا حوارات الطلب — قراءة الموقع مباشرة */
      if (geoAlreadyGranted) {
        try {
          const coordinates = await this.tryGetPositionWithFallback();
          await this.applyLocationSuccess(coordinates, loader);
          return;
        } catch (e: any) {
          await loader.dismiss();
          await this.presentGeolocationFailureAlerts(e, isNative);
          return;
        }
      }

      /**
       * أندرويد: طلب الأذونات عبر بلجن أصلي أولاً — @capacitor/geolocation يفحص GPS قبل الطلب
       * فيتعذّر إظهار حوار النظام ولا يُدرَج التطبيق تحت «صلاحيات الموقع».
       */
      if (Capacitor.getPlatform() === 'android') {
        try {
          await Mota7Location.requestLocationAccess();
        } catch (nativePermErr: unknown) {
          const m = String(
            (nativePermErr as { message?: string })?.message ?? nativePermErr ?? ''
          ).toLowerCase();
          const userDenied =
            m.includes('denied') || m.includes('location permission denied');
          if (userDenied) {
            await loader.dismiss();
            await this.showLocationAlert(
              'لم تُمنَح صلاحية الموقع. من إعدادات التطبيق اختر «الأذونات» ثم فعّل «الموقع» (أثناء الاستخدام)، ثم «إعادة المحاولة».',
              'app'
            );
            return;
          }
          // أخطاء أخرى (مؤقتة): نكمل مع مسار Geolocation
        }
      }

      try {
        let p = await Geolocation.checkPermissions();
        if (p.location !== 'granted') {
          p = await Geolocation.requestPermissions();
        }
        if (p.location !== 'granted') {
          await new Promise((r) => setTimeout(r, 450));
          p = await Geolocation.requestPermissions();
        }
        if (p.location !== 'granted') {
          await new Promise((r) => setTimeout(r, 450));
          p = await Geolocation.checkPermissions();
        }

        if (p.location !== 'granted') {
          try {
            const coordinates = await this.tryGetPositionWithFallback();
            await this.applyLocationSuccess(coordinates, loader);
            return;
          } catch {
            await loader.dismiss();
            await this.showLocationAlert(
              'لم يُحدَّد موقعك بعد. من إعدادات التطبيق فعّل «الموقع» (أثناء الاستخدام)، ثم اضغط «إعادة المحاولة» أو «موافق» لفتح الإعدادات.',
              'app'
            );
            return;
          }
        }
      } catch (permErr: any) {
        await loader.dismiss();
        const m = String(permErr?.message ?? permErr ?? '').toLowerCase();
        const gpsLikely =
          m.includes('disabled') ||
          m.includes('location service') ||
          m.includes('location unavailable');
        await this.showLocationAlert(
          gpsLikely
            ? 'خدمة الموقع (GPS) غير مفعلة أو غير متاحة. اضغط «موافق» لفتح إعدادات الموقع، ثم عُد للتطبيق.'
            : 'تعذر التحقق من الموقع. اضغط «موافق» لفتح إعدادات الموقع.',
          'location'
        );
        return;
      }
    }

    try {
      const coordinates = await this.tryGetPositionWithFallback();
      await this.applyLocationSuccess(coordinates, loader);
    } catch (e: any) {
      await loader.dismiss();
      await this.presentGeolocationFailureAlerts(e, isNative);
    }
  }

  private async presentGeolocationFailureAlerts(e: any, isNative: boolean): Promise<void> {
    const msg = String(e?.message || e?.code || '').toLowerCase();
    const isGpsOff =
      msg.includes('location disabled') ||
      msg.includes('location services') ||
      (msg.includes('gps') && msg.includes('off')) ||
      msg.includes('unavailable');

    let permGranted = false;
    if (isNative) {
      try {
        const p = await Geolocation.checkPermissions();
        permGranted = p.location === 'granted';
      } catch {
        permGranted = false;
      }
    }

    if (permGranted && !isGpsOff) {
      await this.showLocationAlert(
        'تعذر تحديد الموقع حالياً. تأكد أنك في مكان مكشوف للأقمار، ثم اضغط «إعادة المحاولة».',
        false
      );
      return;
    }

    if (isGpsOff) {
      await this.showLocationAlert(
        'خدمة الموقع (GPS) غير مفعلة. اضغط «موافق» لفتح إعدادات الموقع، فعّلها ثم عد للتطبيق.',
        'location'
      );
      return;
    }

    await this.showLocationAlert(
      'تعذر تحديد الموقع. اضغط «موافق» لفتح إعدادات التطبيق ومنح صلاحية الموقع.',
      'app'
    );
  }

  private async applyLocationSuccess(
    coordinates: Position,
    loader: HTMLIonLoadingElement
  ): Promise<void> {
    await this.clearLocationResumeListener();
    const lat = coordinates.coords.latitude;
    const lng = coordinates.coords.longitude;
    this.orderData.lat = lat;
    this.orderData.lng = lng;
    this.orderData.fromLocation = `تم تحديد الموقع بنجاح — ${lat.toFixed(5)} ، ${lng.toFixed(5)}`;
    await loader.dismiss();
  }

  /**
   * على أندرويد غالباً يعمل watchPosition + enableLocationFallback أفضل من getCurrentPosition وحده.
   */
  private async tryGetPositionWithFallback(): Promise<Position> {
    const isNative = Capacitor.getPlatform() !== 'web';

    if (isNative) {
      try {
        return await this.getFirstPositionFromWatch(35000);
      } catch {
        // يكمل للـ getCurrentPosition
      }
    }

    try {
      return await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: isNative ? 30000 : 20000,
        maximumAge: 0,
        ...(isNative
          ? { enableLocationFallback: true, minimumUpdateInterval: 500, interval: 3000 }
          : {})
      });
    } catch {
      return await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: isNative ? 35000 : 25000,
        maximumAge: 120000,
        ...(isNative ? { enableLocationFallback: true } : {})
      });
    }
  }

  private getFirstPositionFromWatch(timeoutMs: number): Promise<Position> {
    return new Promise((resolve, reject) => {
      let watchId: string | undefined;
      let settled = false;

      const timer = window.setTimeout(async () => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          if (watchId) {
            await Geolocation.clearWatch({ id: watchId });
          }
        } catch {
          /* ignore */
        }
        reject(new Error('watch timeout'));
      }, timeoutMs);

      void Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0,
          minimumUpdateInterval: 500,
          interval: 2500,
          enableLocationFallback: true
        },
        async (position, err) => {
          if (settled || err || !position) {
            return;
          }
          settled = true;
          window.clearTimeout(timer);
          try {
            if (watchId) {
              await Geolocation.clearWatch({ id: watchId });
            }
          } catch {
            /* ignore */
          }
          resolve(position);
        }
      )
        .then((id) => {
          watchId = id;
        })
        .catch((e) => {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            reject(e);
          }
        });
    });
  }

  private async showLocationAlert(
    message: string,
    settings: 'app' | 'location' | false
  ) {
    const alert = await this.alertCtrl.create({
      header: 'تنبيه الموقع',
      message,
      mode: 'ios',
      buttons:
        settings !== false
          ? [
              {
                text: 'إعادة المحاولة',
                handler: () => {
                  void this.getCurrentLocation();
                }
              },
              {
                text: 'موافق',
                role: 'confirm',
                handler: () => {
                  void this.onLocationAlertConfirm(settings);
                }
              }
            ]
          : [
              {
                text: 'إعادة المحاولة',
                handler: () => {
                  void this.getCurrentLocation();
                }
              }
            ]
    });
    await alert.present();
  }

  /** «موافق»: فتح الإعدادات ثم عند العودة للتطبيق إعادة تحديد الموقع تلقائياً (بدون تنبيه إضافي عند النجاح) */
  private async onLocationAlertConfirm(settings: 'app' | 'location') {
    this.afterLocationSettingsReturn = true;
    await this.registerRetryGetLocationOnNextResume();
    if (settings === 'app') {
      await this.openAppLocationSettings();
    } else {
      await this.openSystemLocationSettings();
    }
  }

  private async registerRetryGetLocationOnNextResume(): Promise<void> {
    await this.clearLocationResumeListener();
    if (Capacitor.getPlatform() === 'web') {
      return;
    }

    const onForeground = () => {
      void this.runLocationRetryAfterForeground();
    };

    const h1 = await App.addListener('resume', onForeground);
    const h2 = await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        onForeground();
      }
    });
    this.locationListenerHandles.push(h1, h2);
  }

  private async runLocationRetryAfterForeground(): Promise<void> {
    if (this.locationResumeRetryInFlight) {
      return;
    }
    this.locationResumeRetryInFlight = true;
    try {
      await this.clearLocationResumeListener();
      // إعطاء GPS/النظام وقتاً بعد العودة من الإعدادات
      await new Promise((r) => setTimeout(r, 900));
      await this.getCurrentLocation();
    } finally {
      this.locationResumeRetryInFlight = false;
    }
  }

  private async clearLocationResumeListener(): Promise<void> {
    for (const h of this.locationListenerHandles) {
      try {
        await h.remove();
      } catch {
        /* ignore */
      }
    }
    this.locationListenerHandles = [];
  }

  /** إعدادات صلاحية الموقع للتطبيق */
  private async openAppLocationSettings() {
    const candidates = ['app-settings:'];
    for (const url of candidates) {
      try {
        const can = await AppLauncher.canOpenUrl({ url });
        if (can.value) {
          await AppLauncher.openUrl({ url });
          return;
        }
      } catch (_) {}
    }
    await this.openSystemLocationSettings();
  }

  /** شاشة تفعيل GPS / الموقع على النظام */
  private async openSystemLocationSettings() {
    const candidates = [
      'android.settings.LOCATION_SOURCE_SETTINGS',
      'intent://settings/location#Intent;scheme=android-app;end',
      'app-settings:'
    ];

    for (const url of candidates) {
      try {
        const can = await AppLauncher.canOpenUrl({ url });
        if (can.value) {
          await AppLauncher.openUrl({ url });
          return;
        }
      } catch (_) {}
    }
  }

  private toEnglishDigits(value: any): string {
    return (value ?? '')
      .toString()
      .replace(/[٠-٩]/g, (d: string) => String(d.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, (d: string) => String(d.charCodeAt(0) - 1776));
  }

  private normalizePrice(value: any): string {
    const digits = this.toEnglishDigits(value).replace(/\D/g, '');
    return digits.replace(/^0+/, '') || '';
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
    this.orderData.fromLocation = normalizeUserFreeText(this.orderData.fromLocation);
    this.orderData.toLocation = normalizeUserFreeText(this.orderData.toLocation);
    this.orderData.shortNote = normalizeUserFreeText(this.orderData.shortNote);
    this.orderData.city = (this.orderData.city || '').trim();
    this.orderData.price = this.normalizePrice(this.orderData.price);
    this.priceLiveWarning = null;

    const customerName = this.orderData.customerName;
    const { customerPhone, lat, lng } = this.orderData;
    const fromLocation = this.orderData.fromLocation;
    const toLocation = this.orderData.toLocation;
    this.orderData.fromLocation = fromLocation;
    this.orderData.toLocation = toLocation;

    const cityMatch = findMatchingStringInList(this.availableCities, this.orderData.city);
    const cityValid = !!cityMatch;
    const canonicalCity = cityMatch ?? '';

    const subMatch = findMatchingNameArItem(this.deliveryItems, this.orderData.subService);
    const canonicalSub = subMatch?.nameAr ?? (this.allowUnspecifiedVehicle ? 'غير محدد' : '');
    const subOk = !!subMatch || this.allowUnspecifiedVehicle;

    const fromOk =
      fromLocation.length > 0 || hasOrderLocationCoordinates(lat, lng);

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
      missingParts.push('نوع المركبة');
    }
    if (!toLocation) {
      missingParts.push('جهة الوصول');
    }
    if (!fromOk) {
      missingParts.push('نقطة الانطلاق أو تفعيل «تحديد موقعك»');
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
      message: 'جاري فحص الطلب...', 
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

      // --- 2. إعداد الـ Match Key والمعرف الجديد للمستند ---
      const delivery_match_key = `${subService}_${city}`;
      const customDocId = `${customerPhone}_${delivery_match_key}`;
      const now = Date.now();

      // --- 3. فحص التكرار باستخدام المعرف المباشر (أسرع وأدق) ---
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

      // --- 4. إرسال الطلب باستخدام setDoc ---
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + 1);

      let finalOrder: Record<string, unknown>;
      await runInInjectionContext(this.injector, () => {
        finalOrder = {
          customerName,
          customerPhone,
          subService,
          shortNote: this.orderData.shortNote || '',
          fromLocation,
          toLocation,
          price: this.orderData.price,
          lat: this.orderData.lat,
          lng: this.orderData.lng,
          city,
          delivery_match_key: delivery_match_key,
          serviceType: 'delivery',
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
        message: 'حدثت مشكلة أثناء إرسال الطلب، حاول مرة أخرى.',
        buttons: ['موافق'],
        mode: 'ios'
      });
      await alert.present();
    }
  }
}
