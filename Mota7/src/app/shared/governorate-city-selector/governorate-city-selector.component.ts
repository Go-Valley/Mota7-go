import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { GovernorateService } from '../../core/services/governorate.service';
import { Governorate, City } from '../../core/models/governorate.model';
import { Observable, combineLatest, of } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { addIcons } from 'ionicons';
import {
  chevronDownOutline,
  chevronForwardOutline,
  chevronBackOutline,
  locationOutline,
  ellipseOutline,
  checkmarkCircle,
} from 'ionicons/icons';
import { governorateDisplayShort } from '../../core/utils/governorate-display-name.util';

export type GovernorateCitySelectorVariant =
  | 'hubMulti'
  | 'signupSingle'
  | 'profileSingle'
  | 'requestMultiNoWhole'
  | 'coverageMultiRestricted';

/** اختيار الشبكة الرئيسية (زر المدينة) — قد يشمل أكثر من محافظة / كل المحافظة */
export interface HubGeoSelectionEmit {
  isAll: boolean;
  flatCityIds: string[];
  arabicTokens: string[];
  summaryLabel: string;
  /** نص زر المدينة في الرئيسية: محافظة كاملة = اسم المحافظة فقط؛ مدينة واحدة = اسم المدينة؛ عدة مدن = المحافظة (العدد) */
  hubButtonLabel: string;
}

export interface SingleCityEmit {
  governorateId: string;
  cityId: string;
  /** اسم محافظة كما في Firebase */
  governorateNameAr: string;
  /** اسم مختصر للعرض */
  governorateDisplay: string;
  cityNameAr: string;
}

export interface CoverageMultiEmit {
  cityIds: string[];
  arabicTokens: string[];
  primaryCityDisplay: string;
}

type GovWithCities = Governorate & { cities: City[] };

@Component({
  selector: 'app-governorate-city-selector',
  templateUrl: './governorate-city-selector.component.html',
  styleUrls: ['./governorate-city-selector.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class GovernorateCitySelectorComponent implements OnInit, OnChanges {
  private govService = inject(GovernorateService);

  /** وضع الاستخدام */
  @Input() variant: GovernorateCitySelectorVariant = 'hubMulti';
  /** عند وجود قائمة؛ يُقيِّد ظهور المحافظات (مثلاً محافظة المستخدم واحدة عند الإعلان) */
  @Input() restrictGovernorateIds: string[] | null = null;
  /** تمييز اختيار أحادي موجود (تسجيل/ملف شخصي) بعد تحميل القائمة من Firebase */
  @Input() seedSingleSelection: { governorateId: string; cityId: string } | null = null;
  /** مدن مُسبقة الاختيار (إعلانات: مدينة الحساب من التسجيل) */
  @Input() seedCoverageCityIds: string[] | null = null;
  /** ارتفاع قائمة الداخل المنبثقة أو البطاقة */
  @Input() maxScrollHeight = '340px';

  /** نص الحقل كما يظهر على غلاف الاختيار (غير hub) */
  @Input() fieldLabel = 'المدينة';
  @Input() placeholder = 'اضغط للاختيار';
  /** ملخص الاختيار الحالي أسفل التسمية */
  @Input() displaySummary = '';
  /** تعطيل التفاعل (عرض فقط) */
  @Input() disabled = false;
  /** أقصى عدد مدن (مثلاً 1 للمتجر) — null = بدون حد */
  @Input() maxCoverageCities: number | null = null;
  /** إظهار «المحافظة — كل المدن» — false يخفيه (متجر) */
  @Input() allowWholeGovernorate: boolean | null = null;

  @Output() hubSelectionChange = new EventEmitter<HubGeoSelectionEmit>();
  @Output() singleCityChange = new EventEmitter<SingleCityEmit>();
  @Output() coverageMultiChange = new EventEmitter<CoverageMultiEmit>();

  governorates$: Observable<GovWithCities[]>;

  expandedGovernorateIds = new Set<string>();
  /** محافظة → { كلها | أو مجموعة دوك مدن } */
  private pickWhole = new Map<string, boolean>();
  private pickCities = new Map<string, Set<string>>();
  singleGovId: string | null = null;
  singleCityId: string | null = null;

  /** ورقة الاختيار + مودال المدن (أنماط متعددة المدن) */
  sheetOpen = false;
  cityModalGov: GovWithCities | null = null;

  isSingleSelected(govId: string, cityId: string): boolean {
    return this.singleGovId === govId && this.singleCityId === cityId;
  }

  /** آخر شبكة مختارة لمزامنة خارجية */
  private lastHubPayload: HubGeoSelectionEmit | null = null;
  private lastAppliedCoverageSeedKey = '';
  /** منع إعادة فرض seed بعد اختيار المستخدم يدوياً (تعديل الملف / التسجيل) */
  private lastAppliedSingleSeedKey = '';
  private singleSelectionUserPicked = false;

  constructor() {
    addIcons({
      'chevron-down-outline': chevronDownOutline,
      'chevron-forward-outline': chevronForwardOutline,
      'chevron-back-outline': chevronBackOutline,
      'location-outline': locationOutline,
      'ellipse-outline': ellipseOutline,
      'checkmark-circle': checkmarkCircle,
    });

    this.governorates$ = this.govService.getActiveGovernorates().pipe(
      switchMap((governorates) => {
        if (!governorates?.length) return of([]);
        const filtered = this.filterGovernorateList(governorates);
        if (!filtered.length) return of([]);
        const chunks = filtered.map((gov) =>
          this.govService.getCitiesByGovernorate(gov.id).pipe(
            map((cities) => ({
              ...gov,
              cities: [...(cities || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
            }))
          )
        );
        return combineLatest(chunks).pipe(tap((list) => this.handleGovernorateList(list)));
      })
    );
  }

  ngOnInit(): void {
    /* أول تهيئة */
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['restrictGovernorateIds'] || ch['variant'] || ch['seedSingleSelection']) {
      if (ch['seedSingleSelection']) {
        const prev = ch['seedSingleSelection'].previousValue as
          | { governorateId: string; cityId: string }
          | null
          | undefined;
        const cur = ch['seedSingleSelection'].currentValue as
          | { governorateId: string; cityId: string }
          | null
          | undefined;
        const prevKey = `${String(prev?.governorateId ?? '').trim()}|${String(prev?.cityId ?? '').trim()}`;
        const curKey = `${String(cur?.governorateId ?? '').trim()}|${String(cur?.cityId ?? '').trim()}`;
        if (curKey !== prevKey) {
          this.lastAppliedSingleSeedKey = '';
          const matchesCurrent =
            `${this.singleGovId ?? ''}|${this.singleCityId ?? ''}` === curKey;
          if (!matchesCurrent) {
            this.singleSelectionUserPicked = false;
          }
        }
      }
      this.applySeedSingleIfNeeded();
    }
    if (
      ch['seedCoverageCityIds'] ||
      ch['restrictGovernorateIds'] ||
      ch['variant'] ||
      ch['maxCoverageCities'] ||
      ch['allowWholeGovernorate']
    ) {
      this.applySeedCoverageIfNeeded();
    }
  }

  /** الشبكة الرئيسية فقط بدون غلاف حقل */
  isHubEmbed(): boolean {
    return this.variant === 'hubMulti';
  }

  isModalMultiVariant(): boolean {
    return this.variant === 'requestMultiNoWhole' || this.variant === 'coverageMultiRestricted';
  }

  openSheet(): void {
    if (this.disabled) return;
    this.expandGovernoratesForSheet();
    if (this.variant === 'requestMultiNoWhole' && this.governoratesSnap.length === 1) {
      this.expandedGovernorateIds.add(this.governoratesSnap[0]!.id);
    }
    this.sheetOpen = true;
  }

  closeSheet(): void {
    this.sheetOpen = false;
  }

  confirmAndCloseSheet(): void {
    if (this.disabled) return;
    if (this.isModalMultiVariant()) {
      void this.emitCoverageAggregate();
    }
    this.closeSheet();
  }

  onSheetDidDismiss(): void {
    this.sheetOpen = false;
    this.cityModalGov = null;
    if (this.isModalMultiVariant() && this.variant !== 'requestMultiNoWhole') {
      void this.emitCoverageAggregate();
    }
  }

  governoratePickCount(govId: string): number {
    if (this.pickWhole.get(govId)) {
      const g = this.governoratesSnap.find((x) => x.id === govId);
      return g?.cities?.length ?? 0;
    }
    return this.pickCities.get(govId)?.size ?? 0;
  }

  onCoverageCityRowClick(gov: GovWithCities, city: City, ev: Event): void {
    if (this.disabled || this.variant !== 'coverageMultiRestricted') return;
    ev.stopPropagation();
    this.toggleCityCheckbox(gov, city, ev);
  }

  selectRequestCityInline(gov: GovWithCities, city: City, ev: Event): void {
    if (this.disabled || this.variant !== 'requestMultiNoWhole') return;
    ev.stopPropagation();
    this.toggleCityCheckbox(gov, city, ev);
    this.finishRequestCitySelection();
  }

  private expandGovernoratesForSheet(): void {
    if (!this.isModalMultiVariant()) return;
    const next = new Set(this.expandedGovernorateIds);
    for (const g of this.governoratesSnap) {
      if (this.governoratePickCount(g.id) > 0) {
        next.add(g.id);
      }
    }
    const only = this.restrictGovernorateIds;
    if (only?.length === 1) {
      next.add(String(only[0]).trim());
    }
    this.expandedGovernorateIds = next;
  }

  openCityPickerModal(g: GovWithCities): void {
    if (this.disabled) return;
    this.cityModalGov = g;
  }

  closeCityPickerModal(): void {
    this.cityModalGov = null;
  }

  onWholeCheckboxChange(gov: GovWithCities, ev: Event): void {
    if (this.disabled) return;
    const ce = ev as CustomEvent<{ checked: boolean }>;
    const checked = !!ce.detail?.checked;
    const cur = this.isWholeChosen(gov.id);
    if (checked === cur) return;
    this.toggleWholeGovernorate(gov);
  }

  onCityCheckboxIonChange(gov: GovWithCities, city: City, ev: Event): void {
    if (this.disabled) return;
    const ce = ev as CustomEvent<{ checked: boolean }>;
    const checked = !!ce.detail?.checked;
    const effectivelyChosen = this.isCityChosen(gov.id, city.id);
    if (checked === effectivelyChosen) return;
    this.toggleCityCheckbox(gov, city);
  }

  /**
   * طلب خدمة (requestMultiNoWhole): نقرة على المدينة تطبّق نفس منطق toggleCityCheckbox
   * (مدينة واحدة فقط) وتُغلق مودال المدن ثم الورقة — بدون تشيك بوكس.
   */
  selectRequestCityFromModal(gov: GovWithCities, city: City, ev?: Event): void {
    if (this.disabled || this.variant !== 'requestMultiNoWhole') return;
    ev?.stopPropagation?.();
    this.toggleCityCheckbox(gov, city, ev);
    this.finishRequestCitySelection();
  }

  /** طلب خدمة: بعد اختيار مدينة — إغلاق الورقة والعودة للنموذج مباشرة */
  private finishRequestCitySelection(): void {
    const hasCity = [...this.pickCities.values()].some((s) => s && s.size > 0);
    if (!hasCity) {
      return;
    }
    this.closeCityPickerModal();
    this.closeSheet();
  }

  governorateShort(g: Governorate): string {
    return governorateDisplayShort(g?.name ?? '');
  }

  isSingleCoverageCityMode(): boolean {
    return this.variant === 'coverageMultiRestricted' && this.maxCoverageCities === 1;
  }

  showWholeRow(_g: Governorate): boolean {
    if (this.allowWholeGovernorate === false) return false;
    if (this.isSingleCoverageCityMode()) return false;
    if (this.variant === 'requestMultiNoWhole') return false;
    if (this.variant === 'signupSingle' || this.variant === 'profileSingle') return false;
    /** تغطية إعلان: إن قُيدت لمحافظة واحدة اعرض «كل المحافظة المعروضة» */
    if (this.variant === 'coverageMultiRestricted') {
      return !!(this.restrictGovernorateIds?.length === 1);
    }
    return true;
  }

  isExpanded(id: string): boolean {
    return this.expandedGovernorateIds.has(id);
  }

  toggleExpand(govId: string, ev?: Event): void {
    if (this.disabled) return;
    ev?.stopPropagation?.();
    if (this.expandedGovernorateIds.has(govId)) this.expandedGovernorateIds.delete(govId);
    else this.expandedGovernorateIds.add(govId);
    this.expandedGovernorateIds = new Set(this.expandedGovernorateIds);
  }

  toggleWholeGovernorate(gov: GovWithCities, ev?: Event): void {
    if (this.disabled) return;
    ev?.stopPropagation?.();
    if (!this.showWholeRow(gov)) return;
    const cur = this.pickWhole.get(gov.id);
    if (cur) {
      this.pickWhole.delete(gov.id);
    } else {
      this.pickWhole.set(gov.id, true);
      this.pickCities.delete(gov.id);
    }
    if (this.variant === 'hubMulti') {
      this.emitHubIfApplicable();
    } else if (this.variant === 'coverageMultiRestricted' || this.variant === 'requestMultiNoWhole') {
      void this.emitCoverageAggregate();
    }
  }

  isWholeChosen(govId: string): boolean {
    return !!this.pickWhole.get(govId);
  }

  isCityChosen(govId: string, cityId: string): boolean {
    if (this.pickWhole.get(govId)) return true;
    return !!this.pickCities.get(govId)?.has(cityId);
  }

  toggleCityCheckbox(gov: GovWithCities, city: City, ev?: Event): void {
    if (this.disabled) return;
    ev?.stopPropagation?.();
    if (this.variant === 'signupSingle' || this.variant === 'profileSingle') {
      this.singleSelectionUserPicked = true;
      this.lastAppliedSingleSeedKey = `${gov.id}|${city.id}`;
      this.singleGovId = gov.id;
      this.singleCityId = city.id;
      this.pickWhole.clear();
      this.pickCities.clear();
      this.singleCityChange.emit({
        governorateId: gov.id,
        cityId: city.id,
        governorateNameAr: gov.name,
        governorateDisplay: this.governorateShort(gov),
        cityNameAr: city.name,
      });
      this.sheetOpen = false;
      this.cityModalGov = null;
      return;
    }

    if (this.variant === 'requestMultiNoWhole' || this.isSingleCoverageCityMode()) {
      const alreadyChosen = !!this.pickCities.get(gov.id)?.has(city.id);
      this.pickWhole.clear();
      this.pickCities.clear();
      if (!alreadyChosen) {
        this.pickCities.set(gov.id, new Set([city.id]));
      }
      void this.emitCoverageAggregate();
      return;
    }

    if (this.pickWhole.get(gov.id)) return;

    let set = this.pickCities.get(gov.id);
    if (!set) {
      set = new Set();
      this.pickCities.set(gov.id, set);
    }
    if (set.has(city.id)) set.delete(city.id);
    else set.add(city.id);
    this.pickCities.set(gov.id, new Set(set));

    if (this.variant === 'hubMulti') {
      this.emitHubIfApplicable();
    } else if (this.variant === 'coverageMultiRestricted') {
      void this.emitCoverageAggregate();
    }
  }

  /** صف عنوان المحافظة في وضع «طلب متعدّد»: يمتد المحافظة فقط بدون كل */
  onGovHeaderClick(gov: GovWithCities, ev: Event): void {
    if (this.disabled) return;
    ev.stopPropagation();
    this.toggleExpand(gov.id);
  }

  toggleWholeGovernorateClick(gov: GovWithCities, ev: Event): void {
    if (this.disabled) return;
    ev.stopPropagation();
    if (this.variant === 'coverageMultiRestricted' && this.restrictGovernorateIds?.length !== 1) {
      return;
    }
    this.toggleWholeGovernorate(gov, ev);
  }

  private filterGovernorateList(list: Governorate[]): Governorate[] {
    const ids = this.restrictGovernorateIds;
    if (!ids?.length) return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const set = new Set(ids.map((x) => String(x).trim()));
    return [...list].filter((g) => set.has(g.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  private emitHubIfApplicable(): void {
    void this.flatHubFromGovernorates$().then((payload) => {
      this.lastHubPayload = payload;
      this.hubSelectionChange.emit(payload);
    });
  }

  /** يحتاج بيان مدن كل محافظة للحساب؛ نأخذ أحدث قائمة من الستريم */
  private governoratesSnap: GovWithCities[] = [];

  handleGovernorateList(snapshot: GovWithCities[]): void {
    this.governoratesSnap = snapshot || [];
    this.applySeedSingleIfNeeded();
    this.applySeedCoverageIfNeeded();
  }

  private applySeedSingleIfNeeded(): void {
    if (this.variant !== 'signupSingle' && this.variant !== 'profileSingle') return;
    if (this.singleSelectionUserPicked) return;

    const seed = this.seedSingleSelection;
    const govId = String(seed?.governorateId ?? '').trim();
    const citId = String(seed?.cityId ?? '').trim();
    if (!govId || !citId || !this.governoratesSnap.length) return;

    const seedKey = `${govId}|${citId}`;
    if (seedKey === this.lastAppliedSingleSeedKey) return;

    const gov = this.governoratesSnap.find((g) => g.id === govId);
    if (!gov?.cities?.some((c) => c.id === citId)) return;

    this.singleGovId = govId;
    this.singleCityId = citId;
    this.lastAppliedSingleSeedKey = seedKey;
  }

  private applySeedCoverageIfNeeded(): void {
    if (!this.isModalMultiVariant()) return;
    let want = (this.seedCoverageCityIds ?? [])
      .map((id) => String(id).trim())
      .filter(Boolean)
      .sort();
    if (this.isSingleCoverageCityMode() && want.length > 1) {
      want = [want[0]!];
    }
    if (!want.length || !this.governoratesSnap.length) return;

    const seedKey = want.join('|');
    if (seedKey === this.lastAppliedCoverageSeedKey) return;

    const wantSet = new Set(want);
    this.pickWhole.clear();
    this.pickCities.clear();

    let matchedCityCount = 0;
    for (const g of this.governoratesSnap) {
      const cities = g.cities || [];
      const matched = cities.filter((c) => wantSet.has(c.id));
      if (!matched.length) continue;
      if (this.isSingleCoverageCityMode()) {
        this.pickCities.set(g.id, new Set([matched[0]!.id]));
        matchedCityCount += 1;
        continue;
      }
      matchedCityCount += matched.length;
      if (matched.length === cities.length && this.showWholeRow(g)) {
        this.pickWhole.set(g.id, true);
      } else {
        this.pickCities.set(g.id, new Set(matched.map((c) => c.id)));
      }
    }

    /** لا تُرسل emit فارغاً — يمسح coverageCityIds في نموذج الإعلان قبل اكتمال التحميل */
    if (matchedCityCount === 0) {
      return;
    }

    const expanded = new Set(this.expandedGovernorateIds);
    for (const g of this.governoratesSnap) {
      if (this.governoratePickCount(g.id) > 0) {
        expanded.add(g.id);
      }
    }
    if (this.restrictGovernorateIds?.length === 1) {
      expanded.add(String(this.restrictGovernorateIds[0]).trim());
    }
    this.expandedGovernorateIds = expanded;

    this.lastAppliedCoverageSeedKey = seedKey;
    void this.emitCoverageAggregate();
  }

  private async flatHubFromGovernorates$(): Promise<HubGeoSelectionEmit> {
    const governors = this.governoratesSnap.length ? this.governoratesSnap : [];
    let flatCityIds = new Set<string>();
    const arabic = new Set<string>();

    let any = false;
    for (const g of governors) {
      const whole = this.pickWhole.get(g.id);
      const pick = this.pickCities.get(g.id);
      const cities = g.cities || [];
      if (whole) {
        any = true;
        arabic.add(this.governorateShort(g));
        for (const c of cities) {
          flatCityIds.add(c.id);
          arabic.add(c.name.trim());
        }
        continue;
      }
      if (pick?.size) {
        any = true;
        for (const cid of pick) {
          flatCityIds.add(cid);
          const found = cities.find((c) => c.id === cid);
          if (found) arabic.add(found.name.trim());
        }
      }
    }

    if (!any) {
      /** لا شيء = الكل لتفادي فلتر فارغ خطير */
      return {
        isAll: true,
        flatCityIds: [],
        arabicTokens: [],
        summaryLabel: 'الكل',
        hubButtonLabel: 'الكل',
      };
    }

    const tok = [...arabic];
    const summaryLabel = this.buildSummaryLabel(tok);
    const hubButtonLabel = this.buildHubCapsuleButtonLabel(governors);
    return {
      isAll: false,
      flatCityIds: [...flatCityIds],
      arabicTokens: tok,
      summaryLabel,
      hubButtonLabel,
    };
  }

  /**
   * نص زر المدينة في الرئيسية حسب الاختيار:
   * محافظة كاملة → اسم المحافظة فقط (مختصر بدون بادئة «محافظة»)؛
   * مدينة واحدة → اسم المدينة فقط؛
   * أكثر من مدينة في نفس المحافظة → «المحافظة (عدد المدن)».
   * عدة محافظات باختيارات → دمج المقاطع بـ « · » بنفس القواعد.
   */
  private buildHubCapsuleButtonLabel(governors: GovWithCities[]): string {
    const segments: string[] = [];
    for (const g of governors) {
      const whole = this.pickWhole.get(g.id);
      const pick = this.pickCities.get(g.id);
      const cities = g.cities || [];
      if (whole) {
        segments.push(this.governorateShort(g));
        continue;
      }
      if (!pick?.size) continue;
      if (pick.size === 1) {
        const cid = [...pick][0];
        const city = cities.find((c) => c.id === cid);
        const cn = (city?.name ?? '').trim();
        segments.push(cn || this.governorateShort(g));
      } else {
        segments.push(`${this.governorateShort(g)} (${pick.size})`);
      }
    }
    const filtered = segments.map((s) => s.trim()).filter(Boolean);
    if (!filtered.length) return 'الكل';
    return this.buildSummaryLabel(filtered);
  }

  private buildSummaryLabel(names: string[]): string {
    if (!names.length) return 'مدن مختارة';
    if (names.length <= 2) return names.join(' · ');
    return `${names.slice(0, 2).join(' · ')} +${names.length - 2}`;
  }

  /** طلب أو تغطية إعلان: اجمع كل المحافظات المعروضة */
  async emitCoverageAggregate(): Promise<void> {
    const cov = await this.flatCoverageFromState(this.governoratesSnap);
    this.coverageMultiChange.emit({
      ...cov,
      primaryCityDisplay: cov.arabicTokens.join('، ') || '',
    });
  }

  /** نطوي كل محافظات الحالة المرئية */
  async flatCoverageFromState(scope: GovWithCities[]): Promise<{ cityIds: string[]; arabicTokens: string[] }> {
    const arabic = new Set<string>();
    const ids = new Set<string>();

    const pool = scope.length ? scope : this.governoratesSnap;
    for (const g of pool) {
      const whole = this.pickWhole.get(g.id);
      const pick = this.pickCities.get(g.id);
      const cities = g.cities || [];

      const applyCity = (c: City): void => {
        ids.add(c.id);
        arabic.add(c.name.trim());
      };

      if (whole) {
        cities.forEach(applyCity);
        continue;
      }
      if (pick?.size) {
        cities.filter((c) => pick!.has(c.id)).forEach(applyCity);
      }
    }

    return { cityIds: [...ids], arabicTokens: [...arabic] };
  }

  /** للاختبار من خارج القالب */
  prefetchSnapshot(list: GovWithCities[]): void {
    this.handleGovernorateList(list);
  }
}
