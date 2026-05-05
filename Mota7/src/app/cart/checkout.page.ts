import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EnvironmentInjector,
  OnInit,
  ViewChild,
  computed,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  personOutline,
  phonePortraitOutline,
  locationOutline,
  cashOutline,
  chevronForwardOutline,
  trashOutline,
} from 'ionicons/icons';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Mota7HeaderComponent } from '../top_header/header';
import { CartService } from '../core/services/cart.service';
import { MyShoppingOrdersService } from '../core/services/my-shopping-orders.service';
import { NewOrderNtfyService } from '../core/services/new-order-ntfy.service';
import {
  SHOPPING_COLLECTION,
  SHOPPING_DELIVERY_CHARGES_DOC_ID,
  generateShoppingOrderDocumentId,
} from '../core/services/shopping-firestore-seed.service';
import {
  applyOrderPhoneInputState,
  getOrderPhoneFieldLiveWarning,
  isOrderPhoneValid,
  ORDER_PHONE_INVALID_MSG,
  orderPhoneRawHasNonDigitChars,
  orderPhoneToEnglishDigits,
  sanitizeOrderPhoneInput,
} from '../core/utils/egyptian-phone-order.util';
import { normalizeUserFreeText, readIonTextInputValueFromEvent } from '../core/utils/order-form-fields.util';
import { parseProductPriceToNumber } from '../core/utils/price-parse.util';
import { sellerCityLabelFromFirestoreOrderItemRow } from '../core/utils/product-seller-location.util';
import { normalizeShoppingOrderStatusKey } from '../core/utils/shopping-order-status.util';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map, take } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import type { Subscription } from 'rxjs';
import { Auth, User, authState } from '@angular/fire/auth';
import {
  IonInput,
  IonicModule,
  LoadingController,
  NavController,
  Platform,
  ToastController,
  ViewWillEnter,
  ViewWillLeave,
} from '@ionic/angular';
import {
  normalizeProfileCityToShoppingCheckout,
  readStoredShoppingBuyer,
  writeStoredShoppingBuyer,
  type ShoppingCheckoutCity,
} from '../core/utils/shopping-checkout-buyer-storage.util';
import { HARDWARE_BACK_CART_CHECKOUT_PRIORITY } from '../core/utils/hardware-back-my-account.util';

type CityValue = ShoppingCheckoutCity;

function normalizeOrderLinesFromFirestoreDoc(itemsRaw: unknown): {
  adId: string;
  title: string;
  shortNote: string;
  unitPrice: number;
  sellerName: string;
  sellerPhone: string;
  locationLabel: string;
  condition: string;
}[] {
  const itemsNorm = Array.isArray(itemsRaw) ? (itemsRaw as unknown[]) : [];
  return itemsNorm
    .map((raw) =>
      typeof raw === 'object' && raw != null ? (raw as Record<string, unknown>) : {}
    )
    .map((r) => {
      const adId =
        typeof r['adId'] === 'string'
          ? r['adId']
          : typeof r['ad_id'] === 'string'
            ? r['ad_id']
            : '';
      const title = typeof r['title'] === 'string' ? r['title'].trim() : '';
      let shortNote = '';
      if (typeof r['shortNote'] === 'string') {
        shortNote = r['shortNote'];
      } else if (typeof r['short_desc'] === 'string') {
        shortNote = String(r['short_desc']);
      } else if (typeof r['description'] === 'string') {
        shortNote = String(r['description']);
      }
      const unitPriceNum = parseProductPriceToNumber({ price: r['unitPrice'] });
      const sellerName =
        typeof r['sellerName'] === 'string'
          ? r['sellerName']
          : typeof r['seller_name'] === 'string'
            ? String(r['seller_name'])
            : '';
      const sellerPhone =
        typeof r['sellerPhone'] === 'string'
          ? String(r['sellerPhone'])
          : typeof r['seller_phone'] === 'string'
            ? String(r['seller_phone'])
            : '';
      const conditionRaw =
        typeof r['condition'] === 'string'
          ? r['condition'].trim()
          : typeof r['productCondition'] === 'string'
            ? String(r['productCondition']).trim()
            : '';
      return {
        adId,
        title,
        shortNote: shortNote.trim() ? shortNote.trim() : title,
        unitPrice: unitPriceNum,
        sellerName,
        sellerPhone,
        locationLabel: sellerCityLabelFromFirestoreOrderItemRow(r),
        condition: conditionRaw || 'غير محدد',
      };
    })
    .filter((x) => x.adId && x.title && x.unitPrice > 0);
}

@Component({
  selector: 'app-checkout',
  standalone: true,
  templateUrl: './checkout.page.html',
  styleUrls: ['./checkout.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule, Mota7HeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPage implements OnInit, ViewWillEnter, ViewWillLeave {
  @ViewChild('inputName', { read: IonInput }) private inputName?: IonInput;
  @ViewChild('inputPhone', { read: IonInput }) private inputPhone?: IonInput;

  private cart = inject(CartService);
  private myOrders = inject(MyShoppingOrdersService);
  private orderNtfy = inject(NewOrderNtfyService);
  private toast = inject(ToastController);
  private loading = inject(LoadingController);
  private navCtrl = inject(NavController);
  private platform = inject(Platform);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);
  private fs = inject(Firestore);
  private inj = inject(EnvironmentInjector);
  private destroyRef = inject(DestroyRef);
  private auth = inject(Auth);

  private hardwareBackSub?: Subscription;

  /** تسلسل لتحديث العربة من المسار + تعبئة المشتري دون تنفيذ متزامن مزدوج */
  private buyerContextReloadTail: Promise<void> = Promise.resolve();

  readonly lines = this.cart.linesRo;
  readonly itemsTotal = this.cart.itemsTotalAmount;
  readonly itemCount = this.cart.itemCount;

  /** معرّف الطلب النشط للتعديل (من queryParam editOrder) */
  readonly editingFirestoreId = signal<string | null>(null);

  /** يمنع إعادة ضخّ البيانات من السحابة فوق ما عدّله المستخدم لنفس المُعرَّف خلال هذه الزيارة */
  private lastHydratedEditOrderId: string | null = null;
  /** يمنع طلبّي تحميل متزامنين لنفس التعديل */
  private hydrationInFlightOrderId: string | null = null;

  readonly isEditingOrder = computed(() => this.editingFirestoreId() != null);

  readonly nameMaxLen = 30;
  name = '';
  phone = '';
  /** إشارة لأن رسوم التوصيل تعتمد عليها داخل computed ويجب إعادة الحساب عند تغيير القائمة */
  readonly buyerCity = signal<CityValue>('الخارجة');

  phoneLiveWarning: string | null = null;

  private readonly deliveryConfig = signal<{ in: number; out: number }>({ in: 0, out: 0 });

  /**
   * مدينة المشتري × مدن البائعين في العربة:
   * - منتجات من نفس مدينة المشتري فقط → رسوم `in`
   * - منتجات من المدينة الأخرى فقط → رسوم `out`
   * - وجود الطرفَين على العربة → `in + out`
   */
  readonly deliveryFee = computed(() => {
    const cfg = this.deliveryConfig();
    const userCity = this.buyerCity();
    const cartLines = this.lines();
    if (!cartLines.length) {
      return 0;
    }
    let needsIn = false;
    let needsOut = false;
    for (const l of cartLines) {
      const loc = (l.locationLabel || '').trim();
      const matchesBuyerCity =
        userCity === 'الخارجة' ? this.isKharga(loc) : this.isDakhla(loc);
      const matchesOtherCity =
        userCity === 'الخارجة' ? this.isDakhla(loc) : this.isKharga(loc);
      if (matchesBuyerCity && matchesOtherCity) {
        needsIn = true;
        needsOut = true;
      } else if (matchesBuyerCity) {
        needsIn = true;
      } else if (matchesOtherCity) {
        needsOut = true;
      }
    }
    let total = 0;
    if (needsIn) {
      total += cfg.in;
    }
    if (needsOut) {
      total += cfg.out;
    }
    return total;
  });

  readonly grandTotal = computed(() => this.itemsTotal() + this.deliveryFee());

  constructor() {
    addIcons({
      personOutline,
      phonePortraitOutline,
      locationOutline,
      cashOutline,
      chevronForwardOutline,
      trashOutline,
    });
  }

  ngOnInit(): void {
    void this.loadDeliveryConfig();
    this.route.queryParamMap
      .pipe(
        map((pm) => pm.get('editOrder')?.trim() ?? ''),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.enqueueBuyerContextReload();
      });
  }

  ionViewWillEnter(): void {
    this.hardwareBackSub?.unsubscribe();
    this.hardwareBackSub = this.platform.backButton.subscribeWithPriority(
      HARDWARE_BACK_CART_CHECKOUT_PRIORITY,
      () => {
        this.goBack();
      }
    );
    this.enqueueBuyerContextReload();
  }

  ionViewWillLeave(): void {
    this.hardwareBackSub?.unsubscribe();
    this.hardwareBackSub = undefined;
    this.persistGuestBuyerDraftIfApplicable();
  }

  readonly checkoutToolbarTitle = computed(() =>
    this.isEditingOrder() ? 'تعديل طلب الشراء' : 'تأكيد طلب الشراء'
  );

  readonly confirmButtonLabel = computed(() =>
    this.isEditingOrder() ? 'حفظ تعديلات الطلب' : 'تأكيد عملية الشراء'
  );

  removeLine(lineId: string): void {
    this.cart.removeLine(lineId);
    this.cdr.markForCheck();
  }

  /** مطابقة وصف منتج العربة في كارت سلة المشتريات */
  productLineDescription(row: { title: string; shortNote: string }): string {
    const s = (row.shortNote || '').trim();
    const t = (row.title || '').trim();
    return s || t || '—';
  }

  private enqueueBuyerContextReload(): void {
    this.buyerContextReloadTail = this.buyerContextReloadTail
      .then(() => this.runBuyerContextReload())
      .catch((e) => {
        console.warn('[checkout] reload buyer checkout context:', e);
      });
  }

  private async runBuyerContextReload(): Promise<void> {
    await this.refreshEditingStateFromRoute();
    await this.maybeHydrateBuyerDefaults();
    await this.refreshIonBuyerInputsUi();
    this.cdr.markForCheck();
  }

  /** حساب له بريد (مثل @mota7.com) ⇒ يعتبر مسجّلاً لتعبئة ملف تعريف نارين */
  private isRegisteredAuthUser(user: User | null): boolean {
    return !!(user?.email && user.email.includes('@'));
  }

  private async resolvedAuthUser(): Promise<User | null> {
    let u = this.auth.currentUser;
    if (u) {
      return u;
    }
    try {
      u = await runInInjectionContext(this.inj, () =>
        firstValueFrom(authState(this.auth).pipe(take(1)))
      );
    } catch {
      u = null;
    }
    return u ?? null;
  }

  /** بعد تحميل/عدم وجود حالة التعديل: ملء من حساب مستخدم أو تخزين الجهاز (زائر) */
  private async maybeHydrateBuyerDefaults(): Promise<void> {
    if (this.editingFirestoreId()) {
      return;
    }
    const u = await this.resolvedAuthUser();
    if (this.isRegisteredAuthUser(u)) {
      await this.applyBuyerFieldsFromFirestoreProfile(this.userFirestoreDocKey(u!));
      return;
    }
    const stored = readStoredShoppingBuyer();
    if (stored) {
      this.name = normalizeUserFreeText(stored.name).slice(0, this.nameMaxLen);
      this.phone = sanitizeOrderPhoneInput(stored.phone);
      if (stored.city === 'الخارجة' || stored.city === 'الداخلة') {
        this.buyerCity.set(stored.city as CityValue);
      }
      this.phoneLiveWarning = getOrderPhoneFieldLiveWarning(this.phone, false);
    }
  }

  private userFirestoreDocKey(u: User): string {
    return u.email?.includes('@') ? u.email.split('@')[0] : u.uid;
  }

  private async applyBuyerFieldsFromFirestoreProfile(userDocId: string): Promise<void> {
    try {
      const snap = await runInInjectionContext(this.inj, () =>
        getDoc(doc(this.fs, 'users', userDocId))
      );
      if (!snap.exists()) {
        return;
      }
      const d = snap.data() as Record<string, unknown>;
      const rawName =
        typeof d['fullName'] === 'string'
          ? d['fullName'].trim()
          : typeof d['name'] === 'string'
            ? String(d['name']).trim()
            : '';
      this.name = normalizeUserFreeText(rawName).slice(0, this.nameMaxLen);

      const rawPhone =
        typeof d['phone'] === 'string' ? sanitizeOrderPhoneInput(d['phone']) : '';
      this.phone = rawPhone;

      const cityGuess = normalizeProfileCityToShoppingCheckout(d['city']);
      this.buyerCity.set(cityGuess ?? 'الخارجة');

      this.phoneLiveWarning = getOrderPhoneFieldLiveWarning(this.phone, false);
    } catch (e) {
      console.warn('[checkout] profile hydrate:', e);
    }
  }

  private async refreshIonBuyerInputsUi(): Promise<void> {
    if (this.inputName) {
      try {
        const el = await this.inputName.getInputElement();
        if (el && el.value !== this.name) {
          el.value = this.name;
        }
      } catch {
        /* ignore */
      }
    }
    if (this.inputPhone) {
      this.inputPhone.value = this.phone;
    }
  }

  /** حفظ مسودّة الزائر عند مغادرة الصفحة (وليس مستخدم حساب له بريد) */
  private persistGuestBuyerDraftIfApplicable(): void {
    if (this.editingFirestoreId()) {
      return;
    }
    if (this.isRegisteredAuthUser(this.auth.currentUser)) {
      return;
    }
    const n = normalizeUserFreeText(this.name).slice(0, this.nameMaxLen);
    const pSt = applyOrderPhoneInputState(this.phone);
    const p = pSt.cleaned;
    if (!n.trim() && !isOrderPhoneValid(p)) {
      return;
    }
    writeStoredShoppingBuyer(n, p, this.buyerCity());
    this.phone = p;
  }

  private async refreshEditingStateFromRoute(): Promise<void> {
    const editIdRaw = this.route.snapshot.queryParamMap.get('editOrder')?.trim() ?? '';
    if (!editIdRaw || editIdRaw === SHOPPING_DELIVERY_CHARGES_DOC_ID) {
      this.editingFirestoreId.set(null);
      this.lastHydratedEditOrderId = null;
      this.cdr.markForCheck();
      return;
    }

    this.editingFirestoreId.set(editIdRaw);

    if (this.lastHydratedEditOrderId === editIdRaw && this.cart.itemCount() > 0) {
      this.cdr.markForCheck();
      return;
    }

    if (this.hydrationInFlightOrderId === editIdRaw) {
      return;
    }
    this.hydrationInFlightOrderId = editIdRaw;

    try {
      const snap = await runInInjectionContext(this.inj, () =>
        getDoc(doc(this.fs, SHOPPING_COLLECTION, editIdRaw))
      );

      if (!snap.exists()) {
        this.editingFirestoreId.set(null);
        this.lastHydratedEditOrderId = null;
        await this.showToast('تعذر تحميل الطلب');
        this.cdr.markForCheck();
        return;
      }

      const d = snap.data() as Record<string, unknown>;
      const st = normalizeShoppingOrderStatusKey(d['status']);

      if (st !== 'pending') {
        this.editingFirestoreId.set(null);
        this.lastHydratedEditOrderId = null;
        await this.showToast('لا يمكن تعديل هذا الطلب في هذه الحالة');
        this.cdr.markForCheck();
        return;
      }

      const rebuilt = normalizeOrderLinesFromFirestoreDoc(d['items']);

      if (rebuilt.length === 0) {
        await this.showToast('تعذر استعادة منتجات الطلب');
        this.cdr.detectChanges();
        return;
      }

      this.cart.replaceLinesFromOrderSnapshot(rebuilt);

      this.name =
        typeof d['buyerName'] === 'string'
          ? normalizeUserFreeText(d['buyerName']).slice(0, this.nameMaxLen)
          : '';
      this.phone =
        typeof d['buyerPhone'] === 'string' ? sanitizeOrderPhoneInput(d['buyerPhone']) : '';
      const c = typeof d['buyerCity'] === 'string' ? d['buyerCity'].trim() : '';
      if (c === 'الداخلة' || c === 'الخارجة') {
        this.buyerCity.set(c as CityValue);
      }

      this.lastHydratedEditOrderId = editIdRaw;
      this.cdr.detectChanges();
      await this.showToast('يمكنك تعديل أو حذف المنتجات ثم تأكيد الحفظ');
    } catch (e) {
      console.warn('[checkout] edit load:', e);
      await this.showToast('تعذر تحميل بيانات التعديل');
      this.editingFirestoreId.set(null);
      this.lastHydratedEditOrderId = null;
      this.cdr.markForCheck();
    } finally {
      if (this.hydrationInFlightOrderId === editIdRaw) {
        this.hydrationInFlightOrderId = null;
      }
    }
  }

  private async loadDeliveryConfig(): Promise<void> {
    try {
      const snap = await runInInjectionContext(this.inj, () =>
        getDoc(doc(this.fs, SHOPPING_COLLECTION, SHOPPING_DELIVERY_CHARGES_DOC_ID))
      );
      if (snap.exists()) {
        const d = snap.data() as Record<string, unknown>;
        const inVal = this.parseChargeNumber(d['in']);
        const outVal = this.parseChargeNumber(d['out']);
        this.deliveryConfig.set({ in: inVal, out: outVal });
        this.cdr.markForCheck();
      }
    } catch (e) {
      console.warn('[checkout] failed to load delivery config:', e);
    }
  }

  private parseChargeNumber(v: unknown): number {
    if (typeof v === 'number' && Number.isFinite(v)) {
      return v >= 0 ? v : 0;
    }
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/[^\d.]/g, ''));
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
    return 0;
  }

  private isKharga(loc: string): boolean {
    const s = (loc || '').trim().toLowerCase();
    return s.includes('خارجة') || s.includes('kharga') || s === 'الخارجة';
  }

  private isDakhla(loc: string): boolean {
    const s = (loc || '').trim().toLowerCase();
    return s.includes('داخلة') || s.includes('dakhla') || s === 'الداخلة';
  }

  goBack(): void {
    this.navCtrl.back();
  }

  onNameInput(ev: Event): void {
    const v = readIonTextInputValueFromEvent(ev);
    this.name = normalizeUserFreeText(v).slice(0, this.nameMaxLen);
  }

  onNameBeforeInput(ev: InputEvent): void {
    const t = ev.inputType || '';
    if (!t.startsWith('insert')) {
      return;
    }
    const data = ev.data;
    if (data == null || data === '') {
      return;
    }
    const target = ev.target as HTMLInputElement | undefined;
    if (!target || typeof target.selectionStart !== 'number') {
      return;
    }
    const start = target.selectionStart;
    const end = target.selectionEnd ?? start;
    const val = target.value ?? '';
    const nextLen = val.length - (end - start) + data.length;
    if (nextLen > this.nameMaxLen) {
      ev.preventDefault();
    }
  }

  async onNameCompositionEnd(): Promise<void> {
    this.name = normalizeUserFreeText(this.name).slice(0, this.nameMaxLen);
    if (this.inputName) {
      try {
        const el = await this.inputName.getInputElement();
        if (el && el.value !== this.name) {
          el.value = this.name;
        }
      } catch {
        /* ignore */
      }
    }
    this.cdr.detectChanges();
  }

  onPhoneKeyDown(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) {
      return;
    }
    const key = ev.key;
    if (
      key === 'Backspace' ||
      key === 'Delete' ||
      key === 'Tab' ||
      key === 'Enter' ||
      key.startsWith('Arrow') ||
      key === 'Home' ||
      key === 'End'
    ) {
      return;
    }
    if (key.length === 1) {
      const asDigit = orderPhoneToEnglishDigits(key);
      if (/^[0-9]$/.test(asDigit)) {
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      this.phoneLiveWarning = ORDER_PHONE_INVALID_MSG;
    }
  }

  onPhoneBeforeInput(ev: InputEvent): void {
    const t = ev.inputType || '';
    if (!t.startsWith('insert')) {
      return;
    }
    if (t === 'insertLineBreak' || t === 'insertParagraph') {
      ev.preventDefault();
      this.phoneLiveWarning = ORDER_PHONE_INVALID_MSG;
      return;
    }
    const chunk = ev.data ?? '';
    if (chunk && orderPhoneRawHasNonDigitChars(chunk)) {
      ev.preventDefault();
      this.phoneLiveWarning = ORDER_PHONE_INVALID_MSG;
    }
  }

  onPhonePaste(ev: ClipboardEvent): void {
    const text = ev.clipboardData?.getData('text/plain') ?? '';
    if (text && orderPhoneRawHasNonDigitChars(text)) {
      ev.preventDefault();
      this.phoneLiveWarning = ORDER_PHONE_INVALID_MSG;
    }
  }

  onPhoneChange(val: string): void {
    const raw = val || '';
    const englishRaw = orderPhoneToEnglishDigits(String(raw));
    const hadNonDigit = /[^\d]/.test(englishRaw);
    const cleaned = sanitizeOrderPhoneInput(raw);
    this.phone = cleaned;
    this.phoneLiveWarning = getOrderPhoneFieldLiveWarning(cleaned, hadNonDigit);
    if (this.inputPhone) {
      this.inputPhone.value = cleaned;
    }
  }

  onBuyerCityChange(value: unknown): void {
    const v = typeof value === 'string' ? value.trim() : '';
    if (v === 'الخارجة' || v === 'الداخلة') {
      this.buyerCity.set(v as CityValue);
    }
    this.cdr.markForCheck();
  }

  private async refreshNameFromIonInput(): Promise<void> {
    if (!this.inputName) {
      return;
    }
    try {
      const el = await this.inputName.getInputElement();
      if (el?.value != null) {
        this.name = normalizeUserFreeText(el.value).slice(0, this.nameMaxLen);
      }
    } catch {
      /* ignore */
    }
  }

  async confirmOrder(): Promise<void> {
    await this.refreshNameFromIonInput();
    this.name = normalizeUserFreeText(this.name).slice(0, this.nameMaxLen);
    const phoneSt = applyOrderPhoneInputState(this.phone);
    this.phone = phoneSt.cleaned;
    this.phoneLiveWarning = getOrderPhoneFieldLiveWarning(phoneSt.cleaned, false);

    if (!this.name.trim()) {
      await this.showToast('يرجى إدخال الاسم');
      return;
    }
    if (!isOrderPhoneValid(this.phone)) {
      await this.showToast(ORDER_PHONE_INVALID_MSG);
      return;
    }
    if (!this.buyerCity()) {
      await this.showToast('يرجى اختيار المدينة');
      return;
    }
    if (!this.itemCount()) {
      await this.showToast('لا توجد سلع في هذا الطلب');
      return;
    }

    const itemsPayload = this.lines().map((l) => ({
      adId: l.adId,
      title: l.title,
      shortNote: l.shortNote,
      unitPrice: l.unitPrice,
      sellerName: l.sellerName,
      sellerPhone: l.sellerPhone,
      locationLabel: l.locationLabel,
      condition: l.condition,
    }));

    const basePayload = {
      buyerName: this.name.trim(),
      buyerPhone: this.phone,
      buyerCity: this.buyerCity(),
      items: itemsPayload,
      itemsTotal: this.itemsTotal(),
      deliveryFee: this.deliveryFee(),
      grandTotal: this.grandTotal(),
      paymentMethod: 'cod',
      status: 'pending',
    };

    const loader = await this.loading.create({
      message: this.editingFirestoreId() ? 'جاري حفظ التعديلات...' : 'جاري تأكيد الطلب...',
      spinner: 'crescent',
    });
    await loader.present();

    try {
      const editId = this.editingFirestoreId();
      if (editId) {
        await runInInjectionContext(this.inj, async () => {
          await updateDoc(doc(this.fs, SHOPPING_COLLECTION, editId), {
            ...basePayload,
            updatedAt: serverTimestamp(),
          });
        });
      } else {
        const idNew = generateShoppingOrderDocumentId(this.phone);
        await runInInjectionContext(this.inj, async () => {
          await setDoc(doc(this.fs, SHOPPING_COLLECTION, idNew), {
            ...basePayload,
            createdAt: serverTimestamp(),
          });
        });
        this.myOrders.rememberOrderId(idNew);
        const plainForUi: Record<string, unknown> = { ...basePayload, createdAt: null };
        this.myOrders.upsertPlaceholderFromFirestore(idNew, plainForUi);
        void this.orderNtfy.publishShoppingOrder({
          ...basePayload,
          orderId: idNew,
          itemsCount: itemsPayload.length,
        });
      }

      if (!this.isRegisteredAuthUser(this.auth.currentUser)) {
        writeStoredShoppingBuyer(this.name.trim(), this.phone, this.buyerCity());
      }

      await loader.dismiss();

      this.editingFirestoreId.set(null);
      this.lastHydratedEditOrderId = null;
      this.hydrationInFlightOrderId = null;
      this.cart.clearCart();

      await this.showToast(editId ? 'تم حفظ تعديلات الطلب بنجاح' : 'تم تأكيد عملية الشراء بنجاح');
      await this.navCtrl.navigateRoot('/tabs/cart', { animated: true });
    } catch (e) {
      await loader.dismiss();
      console.error('[checkout] submission failed:', e);
      await this.showToast('حدث خطأ أثناء الإرسال، يرجى المحاولة لاحقاً');
    }
  }

  private async showToast(msg: string): Promise<void> {
    const t = await this.toast.create({
      message: msg,
      duration: 2500,
      position: 'bottom',
      color: 'dark',
    });
    await t.present();
  }
}
