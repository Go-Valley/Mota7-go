import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CdkVirtualScrollViewport,
  ScrollingModule,
} from '@angular/cdk/scrolling';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonItemSliding,
  IonicModule,
  LoadingController,
  NavController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  analyticsOutline,
  calendarOutline,
  cashOutline,
  chevronBackOutline,
  copyOutline,
  documentTextOutline,
  downloadOutline,
  gridOutline,
  peopleOutline,
  refreshOutline,
  saveOutline,
  shieldCheckmarkOutline,
  trashOutline,
} from 'ionicons/icons';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { SubscriptionService } from '../../services/subscription.service';
import { PaymentLedgerService } from '../../services/payment-ledger.service';
import {
  AdminVerificationApplyService,
  highestPackageVariant,
} from '../../services/admin-verification-apply.service';
import {
  DEFAULT_SUBSCRIPTIONS_CONFIG,
  SubscriptionsConfig,
} from '../../core/models/subscriptions-config.model';
import type {
  CashierLineDraft,
  PackageTierVariant,
  PaymentLedgerEntry,
  PaymentLedgerCompareReport,
  PaymentLedgerMonthReport,
  PaymentProductType,
  PaymentTransferMethod,
  VipLevelVariant,
} from '../../core/models/payment-ledger.model';
import {
  PAYMENT_METHOD_OPTIONS,
  aggregateMonthReport,
  buildWhatsAppSummary,
  buildWhatsAppSummaryFromEntries,
  compareMonthReports,
  defaultPeriodForProduct,
  downloadCsvFile,
  groupEntriesByUser,
  type UserPaymentGroupRow,
  ledgerEntriesToCsv,
  listPriceFromConfig,
  monthKeyFromDate,
  newCashierLine,
  normalizeUserKey,
  paymentMethodLabelAr,
  previousMonthKey,
  productTypeLabelAr,
  productVariantLabelAr,
  refreshLineForVariant,
  timestampToYyyyMmDd,
  writeInputFromCashierLine,
  yyyyMmDd,
  PAYMENT_LEDGER_GROUP_VIRTUAL_ITEM_PX,
  PAYMENT_LEDGER_LINE_VIRTUAL_ITEM_PX,
  PAYMENT_LEDGER_USER_FILTER_DEBOUNCE_MS,
  PAYMENT_LEDGER_VIRTUAL_SCROLL_MIN_ITEMS,
} from '../../core/utils/payment-ledger.util';

type MainTab = 'cashier' | 'ledger' | 'reports';

@Component({
  selector: 'app-payment-ledger',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ScrollingModule,
    Mota7HeaderComponent,
  ],
  templateUrl: './payment-ledger.page.html',
  styleUrls: ['./payment-ledger.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentLedgerPage implements OnInit {
  private readonly subService = inject(SubscriptionService);
  private readonly ledgerService = inject(PaymentLedgerService);
  private readonly verificationApply = inject(AdminVerificationApplyService);
  private readonly navCtrl = inject(NavController);
  private readonly toastCtrl = inject(ToastController);
  private readonly loadingCtrl = inject(LoadingController);
  private readonly alertCtrl = inject(AlertController);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  mainTab: MainTab = 'cashier';
  config: SubscriptionsConfig = { ...DEFAULT_SUBSCRIPTIONS_CONFIG };

  /** ——— كاشير ——— */
  cashierUserKey = '';
  cashierUserPhone = '';
  cashierPaidDate = yyyyMmDd(new Date());
  cashierPaymentMethod: PaymentTransferMethod = 'wallet';
  cashierReference = '';
  cashierNotes = '';
  cashierLines: CashierLineDraft[] = [];
  readonly productTypes: PaymentProductType[] = [
    'package',
    'vip',
    'banner_design',
    'banner_upload',
  ];
  readonly packageTiers = [
    { v: 'bronze', l: 'برونزي' },
    { v: 'silver', l: 'فضي' },
    { v: 'gold', l: 'ذهبي' },
    { v: 'diamond', l: 'ماسي' },
  ];
  readonly vipLevels = [1, 2, 3, 4, 5];
  readonly paymentMethods = PAYMENT_METHOD_OPTIONS;
  lastWhatsAppSummary = '';
  /** بعد حفظ جلسة فيها باقة — لتطبيق التوثيق بزر واحد */
  pendingPackageVerification: {
    userKey: string;
    packageVariant: PackageTierVariant;
    periodStart: string;
    periodEnd: string;
  } | null = null;

  /** ——— سجل ——— */
  ledgerMonthKey = monthKeyFromDate(new Date());
  ledgerEntries: PaymentLedgerEntry[] = [];
  ledgerLoading = false;
  ledgerViewMode: 'lines' | 'grouped' = 'lines';
  ledgerFilterType: PaymentProductType | 'all' = 'all';
  /** نص حقل البحث (فوري في الواجهة) */
  ledgerFilterUserInput = '';
  /** قيمة مطبَّقة بعد debounce — تُستخدم في الفلترة */
  ledgerFilterUser = '';
  readonly ledgerLineItemPx = PAYMENT_LEDGER_LINE_VIRTUAL_ITEM_PX;
  readonly ledgerGroupItemPx = PAYMENT_LEDGER_GROUP_VIRTUAL_ITEM_PX;
  readonly ledgerVirtualScrollMin = PAYMENT_LEDGER_VIRTUAL_SCROLL_MIN_ITEMS;
  private readonly ledgerUserFilter$ = new Subject<string>();
  @ViewChild('ledgerLinesViewport')
  private ledgerLinesViewport?: CdkVirtualScrollViewport;
  @ViewChild('ledgerGroupedViewport')
  private ledgerGroupedViewport?: CdkVirtualScrollViewport;
  @ViewChildren(IonItemSliding) private ledgerItemSlidings!: QueryList<IonItemSliding>;
  /** مُحدَّث عند تغيّر البيانات/الفلاتر — لا تُستدعى دوال في القالب (تجنّب تجميد الموبايل) */
  ledgerDisplayEntries: PaymentLedgerEntry[] = [];
  ledgerGroupedRows: UserPaymentGroupRow[] = [];
  ledgerReportSnapshot: PaymentLedgerMonthReport = aggregateMonthReport(
    monthKeyFromDate(new Date()),
    []
  );

  /** تحديد متعدد في السجل (ضغط مطوّل) */
  readonly ledgerLongPressMs = 500;
  ledgerSelectionMode = false;
  selectedLedgerEntryIds = new Set<string>();
  private ledgerLongPressTimer: ReturnType<typeof setTimeout> | null = null;
  private ledgerLongPressTriggered = false;

  /** ——— تقارير ——— */
  reportMonthKey = monthKeyFromDate(new Date());
  reportCompare: PaymentLedgerCompareReport | null = null;
  reportLoading = false;

  constructor() {
    addIcons({
      chevronBackOutline,
      saveOutline,
      copyOutline,
      downloadOutline,
      calendarOutline,
      cashOutline,
      analyticsOutline,
      documentTextOutline,
      gridOutline,
      peopleOutline,
      refreshOutline,
      shieldCheckmarkOutline,
      trashOutline,
    });
  }

  /** مسح نموذج الكاشير لعميل جديد (لا يحذف من Firestore). */
  clearCashierForm(): void {
    this.cashierUserKey = '';
    this.cashierUserPhone = '';
    this.cashierPaidDate = yyyyMmDd(new Date());
    this.cashierPaymentMethod = 'wallet';
    this.cashierReference = '';
    this.cashierNotes = '';
    this.cashierLines = [];
    this.lastWhatsAppSummary = '';
    this.pendingPackageVerification = null;
    this.cdr.markForCheck();
    void this.toast('تم مسح النموذج — يمكنك إدخال حساب جديد');
  }

  async confirmClearCashierForm(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'مسح البيانات',
      message:
        'مسح حقول التسجيل السريع الحالية؟ لا يُحذف ما سبق حفظه في السجل.',
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'مسح',
          role: 'destructive',
          handler: () => this.clearCashierForm(),
        },
      ],
    });
    await alert.present();
  }

  ngOnInit(): void {
    this.subService
      .watchConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => {
        this.config = c;
        this.cdr.markForCheck();
      });
    this.ledgerUserFilter$
      .pipe(
        debounceTime(PAYMENT_LEDGER_USER_FILTER_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((query) => this.applyLedgerUserFilter(query));
    void this.loadLedgerMonth();
  }

  get ledgerUserFilterPending(): boolean {
    return this.ledgerFilterUserInput !== this.ledgerFilterUser;
  }

  ledgerUsesVirtualScroll(count: number): boolean {
    return count >= PAYMENT_LEDGER_VIRTUAL_SCROLL_MIN_ITEMS;
  }

  goBack(): void {
    void this.navCtrl.navigateBack(['/dashboard']);
  }

  onMainTabChange(ev: CustomEvent): void {
    const v = String((ev as CustomEvent<{ value?: string }>).detail?.value ?? 'cashier');
    this.mainTab = v as MainTab;
    if (this.mainTab === 'ledger') void this.loadLedgerMonth();
    if (this.mainTab === 'reports') void this.loadReports();
    this.cdr.markForCheck();
  }

  isProductActive(t: PaymentProductType): boolean {
    return this.cashierLines.some((l) => l.productType === t && l.selected);
  }

  toggleProductType(t: PaymentProductType): void {
    const existing = this.cashierLines.find((l) => l.productType === t);
    if (existing) {
      existing.selected = !existing.selected;
    } else {
      this.cashierLines.push(newCashierLine(t, this.config, this.cashierPaidDate));
    }
    this.cdr.markForCheck();
  }

  selectedCashierLines(): CashierLineDraft[] {
    return this.cashierLines.filter((l) => l.selected);
  }

  cashierTotal(): number {
    return this.selectedCashierLines().reduce((s, l) => s + (Number(l.amountEgp) || 0), 0);
  }

  onCashierPaidDateChange(): void {
    for (const line of this.cashierLines) {
      if (!line.selected) continue;
      const p = defaultPeriodForProduct(line.productType, this.cashierPaidDate);
      line.periodStart = p.periodStart;
      line.periodEnd = p.periodEnd;
    }
    this.cdr.markForCheck();
  }

  onLineVariantChange(line: CashierLineDraft): void {
    Object.assign(line, refreshLineForVariant(line, this.config));
    const p = defaultPeriodForProduct(line.productType, this.cashierPaidDate);
    line.periodStart = p.periodStart;
    line.periodEnd = p.periodEnd;
    this.cdr.markForCheck();
  }

  resetLinePeriods(line: CashierLineDraft): void {
    const p = defaultPeriodForProduct(line.productType, this.cashierPaidDate);
    line.periodStart = p.periodStart;
    line.periodEnd = p.periodEnd;
    this.cdr.markForCheck();
  }

  async saveCashierSession(): Promise<void> {
    const userKey = normalizeUserKey(this.cashierUserKey);
    if (!userKey) {
      void this.toast('أدخل رقم الحساب');
      return;
    }
    const lines = this.selectedCashierLines();
    if (!lines.length) {
      void this.toast('اختر خدمة واحدة على الأقل');
      return;
    }
    for (const ln of lines) {
      if (!ln.periodStart || !ln.periodEnd) {
        void this.toast('أكمل تواريخ الفترة لكل خدمة');
        return;
      }
      if ((Number(ln.amountEgp) || 0) <= 0) {
        void this.toast('المبلغ يجب أن يكون أكبر من صفر');
        return;
      }
    }
    const paid = parseYyyyMmDdLocal(this.cashierPaidDate);
    if (!paid) {
      void this.toast('تاريخ الدفع غير صالح');
      return;
    }

    const loader = await this.loadingCtrl.create({ message: 'جاري الحفظ...' });
    await loader.present();
    const sessionId = this.ledgerService.newSessionId();
    try {
      const inputs = lines.map((ln) =>
        writeInputFromCashierLine(ln, {
          userKey,
          userPhone: this.cashierUserPhone.trim() || undefined,
          paidAt: paid,
          paymentMethod: this.cashierPaymentMethod,
          reference: this.cashierReference.trim() || undefined,
          notes: this.cashierNotes.trim() || undefined,
          sessionId,
        })
      );
      await this.ledgerService.createBatch(inputs);
      this.lastWhatsAppSummary = buildWhatsAppSummary({
        userKey,
        lines: lines.map((ln) => ({
          productType: ln.productType,
          productVariant: ln.productVariant,
          amountEgp: ln.amountEgp,
          periodStart: ln.periodStart,
          periodEnd: ln.periodEnd,
        })),
        paidAtYyyyMmDd: this.cashierPaidDate,
        paymentMethod: this.cashierPaymentMethod,
        reference: this.cashierReference,
        totalEgp: this.cashierTotal(),
      });
      void this.toast('تم تسجيل الدفعة');

      const pkgLines = lines.filter((l) => l.productType === 'package');
      if (pkgLines.length) {
        const variant = highestPackageVariant(
          pkgLines.map((l) => l.productVariant as PackageTierVariant)
        );
        const refLine =
          pkgLines.find((l) => l.productVariant === variant) ?? pkgLines[0]!;
        this.pendingPackageVerification = {
          userKey,
          packageVariant: variant,
          periodStart: refLine.periodStart,
          periodEnd: refLine.periodEnd,
        };
      } else {
        this.pendingPackageVerification = null;
      }

      await this.offerPostSaveActions();
      this.cashierLines = [];
      this.cashierReference = '';
      this.cashierNotes = '';
      if (this.mainTab === 'ledger') void this.loadLedgerMonth();
    } catch (e) {
      console.error('[payment-ledger] save', e);
      void this.toast('فشل الحفظ — تحقق من الاتصال والصلاحيات');
    } finally {
      await loader.dismiss();
      this.cdr.markForCheck();
    }
  }

  async offerPostSaveActions(): Promise<void> {
    const hasWa = !!this.lastWhatsAppSummary;
    const pending = this.pendingPackageVerification;
    if (!hasWa && !pending) return;

    const tierLabel = pending
      ? this.verificationApply.tierLabelAr(
          this.verificationApply.packageVariantToTier(pending.packageVariant)
        )
      : '';

    const buttons: { text: string; role?: string; handler?: () => void }[] = [
      { text: 'إغلاق', role: 'cancel' },
    ];

    if (hasWa) {
      buttons.unshift({
        text: 'نسخ واتساب',
        handler: () => {
          void this.copyWhatsAppSummary();
        },
      });
    }

    if (pending) {
      buttons.unshift({
        text: 'تطبيق التوثيق',
        handler: () => {
          void this.applyPendingPackageVerification();
        },
      });
    }

    const alert = await this.alertCtrl.create({
      header: 'تم الحفظ',
      message: pending
        ? `يمكنك نسخ ملخص واتساب أو تطبيق توثيق ${tierLabel} على الحساب (${pending.userKey}) للفترة ${pending.periodStart} → ${pending.periodEnd}.`
        : 'هل تريد نسخ ملخص واتساب للعميل؟',
      mode: 'ios',
      buttons,
    });
    await alert.present();
  }

  async applyPendingPackageVerification(): Promise<void> {
    const pending = this.pendingPackageVerification;
    if (!pending) {
      void this.toast('لا توجد باقة لتطبيق التوثيق');
      return;
    }

    const confirm = await this.alertCtrl.create({
      header: 'تطبيق التوثيق',
      message: `تطبيق توثيق ${this.verificationApply.tierLabelAr(
        this.verificationApply.packageVariantToTier(pending.packageVariant)
      )} على ${pending.userKey}؟`,
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'تطبيق',
          handler: () => {
            void this.runApplyPendingVerification();
          },
        },
      ],
    });
    await confirm.present();
  }

  private async runApplyPendingVerification(): Promise<void> {
    const pending = this.pendingPackageVerification;
    if (!pending) return;

    const loader = await this.loadingCtrl.create({ message: 'جاري تطبيق التوثيق...' });
    await loader.present();
    try {
      const result = await this.verificationApply.applyPackageVerification({
        userKey: pending.userKey,
        packageVariant: pending.packageVariant,
        periodStart: pending.periodStart,
        periodEnd: pending.periodEnd,
        config: this.config,
      });
      void this.toast(result.message);
      if (result.ok) {
        this.pendingPackageVerification = null;
      }
    } finally {
      await loader.dismiss();
      this.cdr.markForCheck();
    }
  }

  async offerCopyWhatsApp(): Promise<void> {
    if (!this.lastWhatsAppSummary) return;
    const alert = await this.alertCtrl.create({
      header: 'نسخ ملخص واتساب',
      message: 'هل تريد نسخ رسالة الملخص لإرسالها للعميل؟',
      mode: 'ios',
      buttons: [
        { text: 'لاحقاً', role: 'cancel' },
        {
          text: 'نسخ',
          handler: () => {
            void this.copyWhatsAppSummary();
          },
        },
      ],
    });
    await alert.present();
  }

  async copyWhatsAppSummary(): Promise<void> {
    const text = this.lastWhatsAppSummary;
    if (!text) {
      void this.toast('لا يوجد ملخص');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      void this.toast('تم نسخ الملخص');
    } catch {
      const alert = await this.alertCtrl.create({
        header: 'ملخص واتساب',
        message: `<pre style="white-space:pre-wrap;text-align:right;direction:rtl">${escapeHtml(text)}</pre>`,
        buttons: ['إغلاق'],
        mode: 'ios',
      });
      await alert.present();
    }
  }

  async loadLedgerMonth(): Promise<void> {
    this.exitLedgerSelection();
    this.ledgerLoading = true;
    this.cdr.markForCheck();
    try {
      this.ledgerEntries = await this.ledgerService.listByPaidMonth(this.ledgerMonthKey);
      this.recomputeLedgerDisplay();
    } catch (e) {
      console.error('[payment-ledger] load month', e);
      this.ledgerEntries = [];
      this.recomputeLedgerDisplay();
      void this.toast('تعذر تحميل السجل — قد تحتاج فهرس Firestore لـ paid_at');
    } finally {
      this.ledgerLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** إعادة حساب قوائم العرض مرة واحدة بعد كل تغيير بيانات/فلتر */
  private recomputeLedgerDisplay(): void {
    let rows = [...this.ledgerEntries];
    if (this.ledgerFilterType !== 'all') {
      rows = rows.filter((e) => e.productType === this.ledgerFilterType);
    }
    const u = normalizeUserKey(this.ledgerFilterUser);
    if (u) {
      rows = rows.filter((e) => e.userKey.includes(u));
    }
    this.ledgerDisplayEntries = rows;
    this.ledgerReportSnapshot = aggregateMonthReport(this.ledgerMonthKey, rows);
    this.ledgerGroupedRows = groupEntriesByUser(rows);
    this.pruneLedgerSelection();
    this.refreshVirtualScrollLayouts();
  }

  private applyLedgerUserFilter(query: string): void {
    this.ledgerFilterUser = query;
    this.recomputeLedgerDisplay();
    this.resetLedgerScrollTop();
    this.cdr.markForCheck();
  }

  onLedgerFiltersChanged(): void {
    this.recomputeLedgerDisplay();
    this.resetLedgerScrollTop();
    this.cdr.markForCheck();
  }

  onLedgerViewModeChange(ev: CustomEvent): void {
    const v = String((ev as CustomEvent<{ value?: string }>).detail?.value ?? 'lines');
    if (v !== 'lines' && v !== 'grouped') {
      return;
    }
    this.ledgerViewMode = v;
    this.exitLedgerSelection();
    this.resetLedgerScrollTop();
    this.refreshVirtualScrollLayouts();
    this.cdr.markForCheck();
  }

  onLedgerFilterTypeChange(ev: CustomEvent): void {
    const v = String((ev as CustomEvent<{ value?: string }>).detail?.value ?? 'all');
    this.ledgerFilterType =
      v === 'all' ? 'all' : (v as PaymentProductType);
    this.onLedgerFiltersChanged();
  }

  onLedgerFilterUserInput(ev: CustomEvent): void {
    const v = String(
      (ev as CustomEvent<{ value?: string }>).detail?.value ?? ''
    );
    this.ledgerFilterUserInput = v;
    this.ledgerUserFilter$.next(v);
    this.cdr.markForCheck();
  }

  private resetLedgerScrollTop(): void {
    queueMicrotask(() => {
      const vp =
        this.ledgerViewMode === 'lines'
          ? this.ledgerLinesViewport
          : this.ledgerGroupedViewport;
      vp?.scrollToIndex(0, 'auto');
    });
  }

  private refreshVirtualScrollLayouts(): void {
    queueMicrotask(() => {
      this.ledgerLinesViewport?.checkViewportSize();
      this.ledgerGroupedViewport?.checkViewportSize();
    });
  }

  trackByLedgerEntryId(_index: number, e: PaymentLedgerEntry): string {
    return e.id;
  }

  trackByGroupedUser(_index: number, g: UserPaymentGroupRow): string {
    return g.userKey;
  }

  exportCsv(): void {
    const rows = this.ledgerDisplayEntries;
    if (!rows.length) {
      void this.toast('لا توجد بيانات للتصدير');
      return;
    }
    const csv = ledgerEntriesToCsv(rows);
    downloadCsvFile(`mota7-payments-${this.ledgerMonthKey}.csv`, csv);
    void this.toast('تم تنزيل الملف');
  }

  closeOpenLedgerSlidings(ev: Event): void {
    const t = ev.target as HTMLElement | undefined;
    if (t?.closest?.('ion-item-option')) return;
    if (t?.closest?.('.pl-multi-select-bar')) return;
    this.ledgerItemSlidings?.forEach((s) => void s.close());
  }

  get ledgerSelectedCount(): number {
    return this.selectedLedgerEntryIds.size;
  }

  get isAllVisibleLedgerSelected(): boolean {
    const visible = this.selectableLedgerEntries();
    if (!visible.length) return false;
    return visible.every((e) => this.selectedLedgerEntryIds.has(e.id));
  }

  selectableLedgerEntries(): PaymentLedgerEntry[] {
    if (this.ledgerViewMode === 'lines') {
      return this.ledgerDisplayEntries.filter((e) => e.status === 'recorded');
    }
    const out: PaymentLedgerEntry[] = [];
    for (const g of this.ledgerGroupedRows) {
      out.push(...g.entries.filter((e) => e.status === 'recorded'));
    }
    return out;
  }

  isLedgerEntrySelected(entryId: string): boolean {
    return this.selectedLedgerEntryIds.has(entryId);
  }

  isLedgerGroupSelected(group: UserPaymentGroupRow): boolean {
    const recorded = group.entries.filter((e) => e.status === 'recorded');
    if (!recorded.length) return false;
    return recorded.every((e) => this.selectedLedgerEntryIds.has(e.id));
  }

  exitLedgerSelection(): void {
    this.ledgerSelectionMode = false;
    this.selectedLedgerEntryIds = new Set();
    this.cdr.markForCheck();
  }

  toggleSelectAllLedger(checked: boolean): void {
    if (!checked) {
      this.exitLedgerSelection();
      return;
    }
    this.ledgerSelectionMode = true;
    this.selectedLedgerEntryIds = new Set(
      this.selectableLedgerEntries().map((e) => e.id)
    );
    this.cdr.markForCheck();
  }

  toggleLedgerEntry(entryId: string): void {
    if (!this.ledgerSelectionMode) return;
    const next = new Set(this.selectedLedgerEntryIds);
    if (next.has(entryId)) next.delete(entryId);
    else next.add(entryId);
    this.selectedLedgerEntryIds = next;
    if (next.size === 0) this.ledgerSelectionMode = false;
    this.cdr.markForCheck();
  }

  toggleLedgerGroup(group: UserPaymentGroupRow): void {
    if (!this.ledgerSelectionMode) return;
    const recorded = group.entries.filter((e) => e.status === 'recorded');
    if (!recorded.length) return;
    const allSelected = recorded.every((e) => this.selectedLedgerEntryIds.has(e.id));
    const next = new Set(this.selectedLedgerEntryIds);
    for (const e of recorded) {
      if (allSelected) next.delete(e.id);
      else next.add(e.id);
    }
    this.selectedLedgerEntryIds = next;
    if (next.size === 0) this.ledgerSelectionMode = false;
    this.cdr.markForCheck();
  }

  onLedgerEntryPointerDown(entry: PaymentLedgerEntry, ev: PointerEvent): void {
    if (entry.status !== 'recorded') return;
    this.startLedgerLongPress([entry.id], ev);
  }

  onLedgerGroupPointerDown(group: UserPaymentGroupRow, ev: PointerEvent): void {
    const ids = group.entries
      .filter((e) => e.status === 'recorded')
      .map((e) => e.id);
    if (!ids.length) return;
    this.startLedgerLongPress(ids, ev);
  }

  onLedgerPointerUp(): void {
    if (this.ledgerLongPressTimer) clearTimeout(this.ledgerLongPressTimer);
    this.ledgerLongPressTimer = null;
  }

  onLedgerPointerCancel(): void {
    if (this.ledgerLongPressTimer) clearTimeout(this.ledgerLongPressTimer);
    this.ledgerLongPressTimer = null;
  }

  onLedgerEntryClick(entry: PaymentLedgerEntry, ev: Event): void {
    if (!this.ledgerSelectionMode || entry.status !== 'recorded') return;
    if (this.ledgerLongPressTriggered) {
      this.ledgerLongPressTriggered = false;
      return;
    }
    ev.stopPropagation();
    this.toggleLedgerEntry(entry.id);
  }

  onLedgerGroupClick(group: UserPaymentGroupRow, ev: Event): void {
    if (!this.ledgerSelectionMode) return;
    if (this.ledgerLongPressTriggered) {
      this.ledgerLongPressTriggered = false;
      return;
    }
    ev.stopPropagation();
    this.toggleLedgerGroup(group);
  }

  async confirmDeleteSelectedLedger(): Promise<void> {
    const ids = Array.from(this.selectedLedgerEntryIds);
    if (!ids.length) return;

    this.ledgerItemSlidings?.forEach((s) => void s.close());
    const idSet = new Set(ids);
    const entries = this.ledgerEntries.filter(
      (e) => idSet.has(e.id) && e.status === 'recorded'
    );
    if (!entries.length) {
      this.exitLedgerSelection();
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'مسح المحدد',
      message: `إلغاء ${entries.length} عملية من سجل هذا الشهر؟`,
      mode: 'ios',
      buttons: [
        { text: 'تراجع', role: 'cancel' },
        {
          text: 'مسح',
          role: 'destructive',
          handler: () => {
            void this.cancelUserGroupEntries(entries).then(() =>
              this.exitLedgerSelection()
            );
          },
        },
      ],
    });
    await alert.present();
  }

  private startLedgerLongPress(entryIds: string[], ev: PointerEvent): void {
    if (ev.pointerType === 'mouse' && ev.buttons !== 1) return;
    if (this.ledgerLongPressTimer) clearTimeout(this.ledgerLongPressTimer);
    this.ledgerLongPressTriggered = false;
    this.ledgerLongPressTimer = setTimeout(() => {
      this.ledgerLongPressTriggered = true;
      this.enterLedgerSelection(entryIds);
    }, this.ledgerLongPressMs);
  }

  private enterLedgerSelection(entryIds: string[]): void {
    this.ledgerSelectionMode = true;
    const next = new Set(this.selectedLedgerEntryIds);
    for (const id of entryIds) next.add(id);
    this.selectedLedgerEntryIds = next;
    this.ledgerItemSlidings?.forEach((s) => void s.close());
    this.cdr.markForCheck();
  }

  private pruneLedgerSelection(): void {
    if (!this.ledgerSelectionMode) return;
    const visibleIds = new Set(this.selectableLedgerEntries().map((e) => e.id));
    const next = new Set<string>();
    for (const id of this.selectedLedgerEntryIds) {
      if (visibleIds.has(id)) next.add(id);
    }
    this.selectedLedgerEntryIds = next;
    if (next.size === 0) this.ledgerSelectionMode = false;
  }

  async confirmCancelEntry(
    entry: PaymentLedgerEntry,
    sliding?: IonItemSliding
  ): Promise<void> {
    await sliding?.close();
    if (entry.status !== 'recorded') {
      void this.toast('السطر ملغى مسبقاً');
      return;
    }
    await this.cancelEntry(entry);
  }

  async confirmCancelUserGroup(
    group: UserPaymentGroupRow,
    sliding?: IonItemSliding
  ): Promise<void> {
    await sliding?.close();
    const recorded = group.entries.filter((e) => e.status === 'recorded');
    if (!recorded.length) {
      void this.toast('لا توجد عمليات نشطة');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'مسح كارت المستخدم',
      message: `إلغاء ${recorded.length} عملية مسجّلة لـ ${group.userKey} من سجل هذا الشهر؟`,
      mode: 'ios',
      buttons: [
        { text: 'تراجع', role: 'cancel' },
        {
          text: 'مسح',
          role: 'destructive',
          handler: () => {
            void this.cancelUserGroupEntries(recorded);
          },
        },
      ],
    });
    await alert.present();
  }

  private async cancelUserGroupEntries(entries: PaymentLedgerEntry[]): Promise<void> {
    const loader = await this.loadingCtrl.create({ message: 'جاري المسح...' });
    await loader.present();
    try {
      await Promise.all(
        entries.map((e) => this.ledgerService.updateStatus(e.id, 'cancelled'))
      );
      for (const e of entries) {
        e.status = 'cancelled';
      }
      this.recomputeLedgerDisplay();
      void this.toast(`تم مسح ${entries.length} عملية`);
      if (this.mainTab === 'reports') void this.loadReports();
    } catch (e) {
      console.error('[payment-ledger] cancel group', e);
      void this.toast('فشل المسح — تحقق من الاتصال');
    } finally {
      await loader.dismiss();
      this.cdr.markForCheck();
    }
  }

  async cancelEntry(entry: PaymentLedgerEntry): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'إلغاء السطر',
      message: `إلغاء تسجيل ${productTypeLabelAr(entry.productType)} لـ ${entry.userKey}؟`,
      mode: 'ios',
      buttons: [
        { text: 'تراجع', role: 'cancel' },
        {
          text: 'إلغاء السطر',
          role: 'destructive',
          handler: () => {
            void this.ledgerService.updateStatus(entry.id, 'cancelled').then(() => {
              entry.status = 'cancelled';
              this.recomputeLedgerDisplay();
              void this.toast('تم الإلغاء');
              this.cdr.markForCheck();
              if (this.mainTab === 'reports') void this.loadReports();
            });
          },
        },
      ],
    });
    await alert.present();
  }

  copyEntryWhatsApp(entry: PaymentLedgerEntry): void {
    void this.copyTextToClipboard(
      buildWhatsAppSummaryFromEntries(entry.userKey, [entry])
    );
  }

  copyGroupWhatsApp(group: UserPaymentGroupRow): void {
    const summary = buildWhatsAppSummaryFromEntries(group.userKey, group.entries);
    if (!summary) {
      void this.toast('لا توجد اشتراكات نشطة للنسخ');
      return;
    }
    void this.copyTextToClipboard(summary);
  }

  private async copyTextToClipboard(text: string): Promise<void> {
    if (!text.trim()) {
      void this.toast('لا يوجد ملخص');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      void this.toast('تم نسخ ملخص واتساب');
    } catch {
      const alert = await this.alertCtrl.create({
        header: 'ملخص واتساب',
        message: `<pre style="white-space:pre-wrap;text-align:right;direction:rtl">${escapeHtml(text)}</pre>`,
        buttons: ['إغلاق'],
        mode: 'ios',
      });
      await alert.present();
    }
  }

  async loadReports(): Promise<void> {
    this.reportLoading = true;
    this.cdr.markForCheck();
    try {
      const curKey = this.reportMonthKey;
      const prevKey = previousMonthKey(curKey);
      const [curRows, prevRows] = await Promise.all([
        this.ledgerService.listByPaidMonth(curKey),
        this.ledgerService.listByPaidMonth(prevKey),
      ]);
      const current = aggregateMonthReport(curKey, curRows);
      const previous = aggregateMonthReport(prevKey, prevRows);
      this.reportCompare = compareMonthReports(current, previous);
    } catch (e) {
      console.error('[payment-ledger] reports', e);
      this.reportCompare = null;
      void this.toast('تعذر تحميل التقارير');
    } finally {
      this.reportLoading = false;
      this.cdr.markForCheck();
    }
  }

  reportMonthLabel(key: string): string {
    const m = /^(\d{4})-(\d{2})$/.exec(key);
    if (!m) return key;
    const months = [
      'يناير',
      'فبراير',
      'مارس',
      'أبريل',
      'مايو',
      'يونيو',
      'يوليو',
      'أغسطس',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر',
    ];
    return `${months[parseInt(m[2], 10) - 1]} ${m[1]}`;
  }

  productTypeLabel = productTypeLabelAr;
  variantLabel = productVariantLabelAr;
  methodLabel = paymentMethodLabelAr;
  paidLabel = timestampToYyyyMmDd;

  packageTierRevenue(tier: string): number {
    if (!this.reportCompare) return 0;
    const key = tier as PackageTierVariant;
    return this.reportCompare.current.byPackageTier[key] ?? 0;
  }

  vipLevelRevenue(level: number): number {
    if (!this.reportCompare) return 0;
    const key = `vip_${level}` as VipLevelVariant;
    return this.reportCompare.current.byVipLevel[key] ?? 0;
  }

  pendingVerificationLabel(): string {
    const p = this.pendingPackageVerification;
    if (!p) return '';
    const tier = this.verificationApply.packageVariantToTier(p.packageVariant);
    return `${this.verificationApply.tierLabelAr(tier)} · ${p.periodStart} → ${p.periodEnd}`;
  }

  private async toast(msg: string): Promise<void> {
    const t = await this.toastCtrl.create({
      message: msg,
      duration: 2400,
      position: 'bottom',
      mode: 'ios',
    });
    await t.present();
  }
}

function parseYyyyMmDdLocal(s: string): Date | null {
  const t = String(s ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
