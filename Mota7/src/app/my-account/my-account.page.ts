import {
  IonicModule,
  ActionSheetController,
  AlertController,
  LoadingController,
  ToastController,
  Platform,
  ModalController,
} from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { Router } from '@angular/router';
import {
  Firestore, doc, onSnapshot, getDoc, updateDoc, Timestamp,
  collection, query, where, getDocs, writeBatch,
} from '@angular/fire/firestore';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
  OnDestroy,
  inject,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Auth, authState, signOut } from '@angular/fire/auth';
import { Observable, Subscription } from 'rxjs';
import { 
  personAddOutline, chatbubbleEllipsesOutline, documentTextOutline,
  callOutline, logoWhatsapp, chevronBackOutline, personOutline,
  megaphoneOutline, peopleOutline, logOutOutline, createOutline, locationOutline,
  closeOutline,
  pricetagOutline,
  bookOutline,
} from 'ionicons/icons';
import { Mota7HeaderComponent } from '../top_header/header';
import { AppTutorialModalComponent } from '../shared/app-tutorial-modal/app-tutorial-modal.component';
import { UserAccountStatusService } from './user-account-status.service';
import { openWhatsappNative } from '../core/utils/whatsapp-open.util';
import {
  isFirestoreActiveFlag,
  getSubscriptionsContentHtmlFromDoc,
  SUBSCRIPTIONS_MISSING_CONTENT_HTML,
  SUBSCRIPTIONS_EMPTY_FALLBACK,
} from './subscriptions_page/subscriptions-default-html';
import {
  normalizeSubscriptionsConfig,
  sortPlansForDisplay,
  SubscriptionPlan,
} from '../core/models/subscriptions-config.model';
import { WtsappGroupLinkService } from '../core/services/wtsapp-group-link.service';
import { SubscriptionsModalBridgeService } from '../core/services/subscriptions-modal-bridge.service';
import { VerificationBadgeComponent } from '../shared/verification-badge/verification-badge.component';
import { HARDWARE_BACK_SUBSCRIPTIONS_PACKAGES_MODAL_PRIORITY } from '../core/utils/hardware-back-my-account.util';
import {
  effectiveTierFromUserFields,
  parseFirestoreMillis,
} from '../core/utils/verification-tiers.util';

@Component({
  selector: 'app-my-account',
  templateUrl: './my-account.page.html',
  styleUrls: ['./my-account.page.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    Mota7HeaderComponent,
    FormsModule,
    AppTutorialModalComponent,
    VerificationBadgeComponent,
  ],
})
export class MyAccountPage implements OnInit, OnDestroy {
  isLoggedIn: boolean = false; 
  isTermsModalOpen: boolean = false;
  isAppTutorialOpen = false;
  isSubscriptionsModalOpen: boolean = false;
  /** none | empty | plans (Firestore config) | current (HTML subscriptions/page) */
  subscriptionsModalView: 'none' | 'empty' | 'plans' | 'current' = 'none';
  /** HTML من Firestore — SafeHtml حتى لا يُعاد تعقيمه ويُحذف منه الوسوم/الصفات */
  subscriptionsHtmlSafe = inject(DomSanitizer).bypassSecurityTrustHtml('');
  subscriptionsAddonsHtmlSafe: SafeHtml =
    inject(DomSanitizer).bypassSecurityTrustHtml('');
  subscriptionsEmptyMessage = '';
  subsPlansMain: SubscriptionPlan[] = [];
  subsPlansSwiper: SubscriptionPlan[] = [];
  /** واتساب الشركة لطلبات الاشتراك — من subscriptions/config */
  subsOrdersWhatsapp = '';
  /** وجود HTML للإضافات لعرض القسم دون الاعتماد على كائن SafeHtml */
  subsAddonsHtmlPresent = false;
  private contactSheetOpen = false;
  termsContent: string = 'جاري التحميل...'; // متغير لتخزين النص
  userName: string = 'جاري التحميل...';
  userPhone: string = '';
  userCity: string = '';
  /** حقول التوثيق من مستند المستخدم — تُمرَّر لمكون الشارة الموحد */
  profileBadgeTier: string | undefined;
  profileBadgeVerified: string | undefined;
  profileBadgeValidFrom: unknown = null;
  profileBadgeValidUntil: unknown = null;
  /** حالة التوثيق الفعلية للمستخدم */
  userEffectiveTier: string = 'empty';
  /** هل استخدم المستخدم الباقة التجريبية */
  userFreeTrialUsed = false;
  /** مفتاح مستند المستخدم في Firestore */
  private userDocKey = '';
  private unsubscribeSnapshot: any;
  private subsModalHardwareBackSub?: Subscription;
  private readonly alertCtrl = inject(AlertController);

  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private domSanitizer = inject(DomSanitizer);
  private injector = inject(EnvironmentInjector);
  private cdr = inject(ChangeDetectorRef);
  private authState$!: Observable<any>;
  readonly acct = inject(UserAccountStatusService);
  private readonly wtsappGroupLink = inject(WtsappGroupLinkService);
  private readonly subsModalBridge = inject(SubscriptionsModalBridgeService);
  private readonly toastCtrl = inject(ToastController);
  private readonly platform = inject(Platform);
  private readonly modalCtrl = inject(ModalController);

  constructor(
    private actionSheetCtrl: ActionSheetController,
    private loadingCtrl: LoadingController,
    private router: Router
  ) { 
    addIcons({
      'person-add-outline': personAddOutline,
      'chatbubble-ellipses-outline': chatbubbleEllipsesOutline,
      'document-text-outline': documentTextOutline,
      'call-outline': callOutline,
      'logo-whatsapp': logoWhatsapp,
      'chevron-back': chevronBackOutline,
      'person-outline': personOutline,
      'megaphone-outline': megaphoneOutline,
      'people-outline': peopleOutline,
      'log-out-outline': logOutOutline,
      'create-outline': createOutline,
      'location-outline': locationOutline,
      'close-outline': closeOutline,
      'pricetag-outline': pricetagOutline,
      'book-outline': bookOutline,
    });
  }

  ngOnInit() {
    this.monitorAuthState();
    this.subsModalBridge.register(() => this.openSubscriptionsModal());
  }

  ngOnDestroy(): void {
    this.subsModalBridge.unregister();
    this.detachSubscriptionsModalHardwareBack();
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
    }
  }

  monitorAuthState() {
    this.authState$ = runInInjectionContext(this.injector, () => authState(this.auth));
    this.authState$.subscribe((user) => {
      if (user) {
        this.isLoggedIn = true;
        runInInjectionContext(this.injector, () => {
          const userIdentifier = user.email ? user.email.split('@')[0] : user.uid;
          const docRef = doc(this.firestore, 'users', userIdentifier);
          
          if (this.unsubscribeSnapshot) this.unsubscribeSnapshot();

          this.unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              this.userName = data['fullName'] || 'مُشترك';
              this.userPhone = data['phone'] || '';
              this.userCity = data['city'] || '';
              this.profileBadgeTier = data['verification_level'];
              this.profileBadgeVerified =
                data['verifiedStatus'] ??
                data['is_verified'] ??
                data['verification_status'] ??
                data['verificationStatus'];
              this.profileBadgeValidFrom = data['verification_valid_from'];
              this.profileBadgeValidUntil = data['verification_valid_until'];
              this.userDocKey = userIdentifier;
              this.userEffectiveTier = effectiveTierFromUserFields(
                data as Record<string, unknown>
              );
              this.userFreeTrialUsed = !!data['free_trial_used'];
              this.checkAndExpireFreeTrialAds(
                data as Record<string, unknown>,
                userIdentifier
              );
            } else {
              this.profileBadgeTier = undefined;
              this.profileBadgeVerified = undefined;
              this.profileBadgeValidFrom = null;
              this.profileBadgeValidUntil = null;
              this.userDocKey = userIdentifier;
              this.userEffectiveTier = 'empty';
              this.userFreeTrialUsed = false;
            }
            this.cdr.markForCheck();
          });
        });
      } else {
        this.isLoggedIn = false;
        if (this.unsubscribeSnapshot) this.unsubscribeSnapshot();
      }
    });
  }

  openAppTutorial(): void {
    this.isAppTutorialOpen = true;
  }

  /** مجموعة «مُتاح» الخدمي — الرابط من Firestore: wtsapp_group / mota7 → link */
  openMota7ServiceGroupInvite(): void {
    this.wtsappGroupLink.openServiceGroupInvite();
  }

  async setOpenTerms(isOpen: boolean) { 
    this.isTermsModalOpen = isOpen; 
    if (isOpen) { 
      await this.fetchTerms(); 
    } 
  } 

  async fetchTerms() { 
    try { 
      const docSnap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'TermsAndConditions', 'current'))
      ); 
      if (docSnap.exists()) { 
        this.termsContent = docSnap.data()['content']; 
      } else { 
        this.termsContent = 'لا توجد شروط متاحة حالياً.'; 
      } 
    } catch (error) { 
      console.error('Error fetching terms:', error); 
      this.termsContent = 'حدث خطأ أثناء تحميل الشروط.'; 
    } 
  }

  setOpenSubscriptions(isOpen: boolean): void {
    this.isSubscriptionsModalOpen = isOpen;
    if (!isOpen) {
      this.detachSubscriptionsModalHardwareBack();
    }
  }

  closeSubscriptionsModal(): void {
    this.setOpenSubscriptions(false);
  }

  async openSubscriptionsModal(): Promise<void> {
    await this.fetchSubscriptionsPage();
    this.isSubscriptionsModalOpen = true;
    this.attachSubscriptionsModalHardwareBack();
    this.cdr.markForCheck();
  }

  private attachSubscriptionsModalHardwareBack(): void {
    this.detachSubscriptionsModalHardwareBack();
    this.subsModalHardwareBackSub = this.platform.backButton.subscribeWithPriority(
      HARDWARE_BACK_SUBSCRIPTIONS_PACKAGES_MODAL_PRIORITY,
      () => void this.onHardwareBackWhileSubscriptionsPackagesModalOpen()
    );
  }

  /** إغلاق مودال الباقات فقط — بدون تراك مسار أو الانتقال إلى إدارة الإعلانات */
  private async onHardwareBackWhileSubscriptionsPackagesModalOpen(): Promise<void> {
    if (!this.isSubscriptionsModalOpen) {
      return;
    }
    try {
      const top = await this.modalCtrl.getTop();
      if (top) {
        await top.dismiss();
        return;
      }
    } catch {
      /* نكمل بإيقاف الحالة المحلية */
    }
    this.setOpenSubscriptions(false);
    this.cdr.markForCheck();
  }

  private detachSubscriptionsModalHardwareBack(): void {
    this.subsModalHardwareBackSub?.unsubscribe();
    this.subsModalHardwareBackSub = undefined;
  }

  /**
   * أولوية العرض:
   * 1) مستند subscriptions/config — باقات منظمة + تصميم التطبيق
   * 2) عدم وجود config → النظام القديم subscriptions/page (HTML)
   */
  private async fetchSubscriptionsPage(): Promise<void> {
    this.subscriptionsModalView = 'none';
    this.subscriptionsHtmlSafe = this.domSanitizer.bypassSecurityTrustHtml('');
    this.subscriptionsAddonsHtmlSafe =
      this.domSanitizer.bypassSecurityTrustHtml('');
    this.subscriptionsEmptyMessage = '';
    this.subsPlansMain = [];
    this.subsPlansSwiper = [];
    this.subsAddonsHtmlPresent = false;
    this.subsOrdersWhatsapp = '';

    try {
      const cfgSnap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'subscriptions', 'config'))
      );

      if (cfgSnap.exists()) {
        const cfg = normalizeSubscriptionsConfig(
          cfgSnap.data() as Record<string, unknown>
        );
        this.subsOrdersWhatsapp = (
          cfg.subscription_orders_whatsapp ?? ''
        ).trim();
        const visible = sortPlansForDisplay(
          cfg.plans.filter((p) => p.visible)
        );

        if (cfg.active && visible.length > 0) {
          this.subscriptionsModalView = 'plans';
          this.subsPlansMain = visible.filter((p) => p.section === 'main');
          this.subsPlansSwiper = visible.filter((p) => p.section === 'swiper');
          const rawAddons = (cfg.addons_html || '').trim();
          this.subsAddonsHtmlPresent = rawAddons.length > 0;
          this.subscriptionsAddonsHtmlSafe =
            this.domSanitizer.bypassSecurityTrustHtml(cfg.addons_html || '');
          this.cdr.markForCheck();
          return;
        }

        if (cfg.show_empty_message) {
          this.subscriptionsModalView = 'empty';
          const em = cfg.empty_message?.trim() ?? '';
          this.subscriptionsEmptyMessage =
            em.length > 0 ? em : SUBSCRIPTIONS_EMPTY_FALLBACK;
          this.cdr.markForCheck();
          return;
        }

        this.subscriptionsModalView = 'none';
        this.cdr.markForCheck();
        return;
      }

      await this.fetchSubscriptionsLegacyPage();
    } catch (e) {
      console.error('subscriptions:', e);
      this.subscriptionsModalView = 'none';
      this.cdr.markForCheck();
    }
  }

  /** النظام السابق: subscriptions/page مع content_html */
  private async fetchSubscriptionsLegacyPage(): Promise<void> {
    try {
      const docSnap = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, 'subscriptions', 'page'))
      );

      if (!docSnap.exists()) {
        this.subscriptionsModalView = 'none';
        this.cdr.markForCheck();
        return;
      }

      const d = docSnap.data() as Record<string, unknown>;
      const nestedEmpty = d['empty'] as { status?: unknown } | undefined;
      const nestedCurrent = d['current'] as { status?: unknown } | undefined;

      const currentOn =
        isFirestoreActiveFlag(d['current_status']) ||
        isFirestoreActiveFlag(nestedCurrent?.status);
      const emptyOn =
        isFirestoreActiveFlag(d['empty_status']) ||
        isFirestoreActiveFlag(nestedEmpty?.status);

      if (currentOn) {
        this.subscriptionsModalView = 'current';
        const raw = getSubscriptionsContentHtmlFromDoc(d);
        const html = raw.length > 0 ? raw : SUBSCRIPTIONS_MISSING_CONTENT_HTML;
        this.subscriptionsHtmlSafe =
          this.domSanitizer.bypassSecurityTrustHtml(html);
        this.cdr.markForCheck();
        return;
      }

      if (emptyOn) {
        this.subscriptionsModalView = 'empty';
        const em =
          typeof d['empty_message'] === 'string'
            ? d['empty_message'].trim()
            : '';
        this.subscriptionsEmptyMessage =
          em.length > 0 ? em : SUBSCRIPTIONS_EMPTY_FALLBACK;
        this.cdr.markForCheck();
        return;
      }

      this.subscriptionsModalView = 'none';
      this.cdr.markForCheck();
    } catch (e) {
      console.error('subscriptions/page:', e);
      this.subscriptionsModalView = 'none';
      this.cdr.markForCheck();
    }
  }

  tierClass(plan: SubscriptionPlan): Record<string, boolean> {
    const t = plan.tier ?? 'slate';
    return {
      [`subs-plan-card--tier-${t}`]: true,
      'subs-plan-card--highlight': !!plan.highlight,
    };
  }

  tierGalleryClass(plan: SubscriptionPlan): Record<string, boolean> {
    const t = plan.tier ?? 'slate';
    return {
      [`subs-gcard--tier-${t}`]: true,
      'subs-gcard--highlight': !!plan.highlight,
    };
  }

  isTrialPlan(plan: SubscriptionPlan): boolean {
    return plan.tier === 'trial' || plan.price === 0;
  }

  /** تحويل tier الباقة إلى tier المستخدم */
  private planTierToUserTier(planTier?: string): string | null {
    switch (planTier) {
      case 'trial': return 'free';
      case 'bronze': return 'bronze';
      case 'silver': return 'silver';
      case 'gold': return 'golden';
      case 'diamond': return 'Diamonds';
      default: return null;
    }
  }

  /** هل المستخدم مشترك حالياً بهذه الباقة */
  isPlanCurrentlyActive(plan: SubscriptionPlan): boolean {
    if (this.isTrialPlan(plan)) {
      return this.userEffectiveTier === 'free' && this.userFreeTrialUsed;
    }
    const mapped = this.planTierToUserTier(plan.tier);
    return mapped != null && this.userEffectiveTier === mapped;
  }

  /** هل زر الباقة معطّل */
  isPlanCtaDisabled(plan: SubscriptionPlan): boolean {
    if (this.isTrialPlan(plan)) {
      return this.userFreeTrialUsed || this.userEffectiveTier !== 'empty';
    }
    return this.isPlanCurrentlyActive(plan);
  }

  /** نص زر الاشتراك */
  planCtaLabel(plan: SubscriptionPlan): string {
    if (this.isTrialPlan(plan)) {
      if (this.userEffectiveTier === 'free' && this.userFreeTrialUsed) {
        return 'أنت مشترك حاليا بهذة الباقة';
      }
      if (this.userFreeTrialUsed) {
        return 'سبق لك الاشتراك بهذة الباقة';
      }
      return 'اشترك الآن';
    }
    if (this.isPlanCurrentlyActive(plan)) {
      return 'أنت مشترك حاليا بهذة الباقة';
    }
    return 'اشترك الآن';
  }

  /** تنسيق تاريخ التوثيق للعرض */
  formatVerificationDate(raw: unknown): string {
    const ms = parseFirestoreMillis(raw);
    if (ms == null) return '';
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  }

  get userSubStartDate(): string {
    return this.formatVerificationDate(this.profileBadgeValidFrom);
  }

  get userSubEndDate(): string {
    return this.formatVerificationDate(this.profileBadgeValidUntil);
  }

  get hasActiveDateRange(): boolean {
    return !!this.userSubStartDate && !!this.userSubEndDate;
  }

  async subscribePlanNow(plan: SubscriptionPlan, ev?: Event): Promise<void> {
    ev?.stopPropagation?.();
    ev?.preventDefault?.();

    if (this.isTrialPlan(plan)) {
      await this.handleTrialSubscription();
      return;
    }

    const biz = this.subsOrdersWhatsapp.trim();
    if (!biz) {
      const t = await this.toastCtrl.create({
        message:
          'لم يُعرَّف رقم واتساب استلام طلبات الاشتراك من لوحة الإدارة بعد.',
        duration: 2800,
        position: 'bottom',
        mode: 'ios',
      });
      await t.present();
      return;
    }
    const phone = (this.userPhone || '').trim() || 'غير متوفر';
    const msg = `السلام عليكم، أرغب بالاشتراك في باقة «${plan.name}» — السعر المعروض: ${plan.priceLabel}. رقم حسابي للتواصل: ${phone}`;
    openWhatsappNative(biz, msg);
  }

  private async handleTrialSubscription(): Promise<void> {
    if (!this.userDocKey) {
      const t = await this.toastCtrl.create({
        message: 'يرجى تسجيل الدخول مرة أخرى.',
        duration: 2800, position: 'bottom', mode: 'ios',
      });
      await t.present();
      return;
    }
    if (this.userFreeTrialUsed || this.userEffectiveTier !== 'empty') {
      const t = await this.toastCtrl.create({
        message: 'لقد استخدمت الباقة التجريبية مسبقاً.',
        duration: 2800, position: 'bottom', mode: 'ios',
      });
      await t.present();
      return;
    }
    const confirmAlert = await this.alertCtrl.create({
      header: 'تأكيد الاشتراك',
      message: 'هل ترغب بالاشتراك في الباقة التجريبية المجانية؟ مدتها 30 يوم — يمكنك الاشتراك مرة واحدة فقط.',
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        { text: 'اشترك الآن', role: 'confirm' },
      ],
    });
    await confirmAlert.present();
    const { role } = await confirmAlert.onDidDismiss();
    if (role !== 'confirm') return;

    const loading = await this.loadingCtrl.create({
      message: 'جاري تفعيل الباقة التجريبية...', spinner: 'crescent',
    });
    await loading.present();

    try {
      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000);
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'users', this.userDocKey), {
          verification_level: 'free',
          verifiedStatus: 'free',
          max_active_ads: 1,
          free_trial_used: true,
          free_trial_started_at: now,
          free_trial_expires_at: expiresAt,
          verification_valid_from: now,
          verification_valid_until: expiresAt,
        })
      );
      await loading.dismiss();
      const t = await this.toastCtrl.create({
        message: 'تم تفعيل الباقة التجريبية بنجاح!',
        duration: 3000, position: 'bottom', color: 'success', mode: 'ios',
      });
      await t.present();
    } catch (e) {
      console.error('handleTrialSubscription', e);
      await loading.dismiss();
      const t = await this.toastCtrl.create({
        message: 'حدث خطأ — حاول مرة أخرى.',
        duration: 2800, position: 'bottom', mode: 'ios',
      });
      await t.present();
    }
  }

  private freeTrialExpiryCheckDone = false;

  private checkAndExpireFreeTrialAds(
    data: Record<string, unknown>,
    userKey: string
  ): void {
    if (this.freeTrialExpiryCheckDone) return;
    const trialUsed = !!data['free_trial_used'];
    if (!trialUsed) return;

    const expiresMs = parseFirestoreMillis(
      data['free_trial_expires_at'] ?? data['verification_valid_until']
    );
    if (expiresMs == null || Date.now() <= expiresMs) return;

    const alreadyExpired = !!data['free_trial_ads_expired'];
    if (alreadyExpired) {
      this.freeTrialExpiryCheckDone = true;
      return;
    }

    this.freeTrialExpiryCheckDone = true;
    void this.expireAllUserAds(userKey, data);
  }

  private async expireAllUserAds(
    userKey: string,
    userData: Record<string, unknown>
  ): Promise<void> {
    try {
      await runInInjectionContext(this.injector, async () => {
        const adIds = new Set<string>();
        const uid = String(userData['uid'] ?? '').trim();
        const phone = String(userData['phone'] ?? '').trim();

        if (uid) {
          const snap = await getDocs(
            query(collection(this.firestore, 'ads'), where('userId', '==', uid))
          );
          snap.docs.forEach((d) => adIds.add(d.id));
        }
        const phoneKeys = new Set<string>();
        if (phone) phoneKeys.add(phone);
        if (userKey) phoneKeys.add(userKey);
        for (const p of phoneKeys) {
          const snap = await getDocs(
            query(collection(this.firestore, 'ads'), where('owner_phone', '==', p))
          );
          snap.docs.forEach((d) => adIds.add(d.id));
        }

        if (adIds.size === 0) {
          await updateDoc(doc(this.firestore, 'users', userKey), {
            free_trial_ads_expired: true,
          });
          return;
        }

        const ids = [...adIds];
        const chunkSize = 400;
        for (let i = 0; i < ids.length; i += chunkSize) {
          const batch = writeBatch(this.firestore);
          for (const adId of ids.slice(i, i + chunkSize)) {
            batch.update(doc(this.firestore, 'ads', adId), {
              status: 'expired',
            });
          }
          await batch.commit();
        }

        await updateDoc(doc(this.firestore, 'users', userKey), {
          free_trial_ads_expired: true,
          verification_level: 'empty',
          verifiedStatus: 'empty',
          max_active_ads: 0,
        });
      });
    } catch (e) {
      console.error('expireAllUserAds', e);
    }
  }

  async openContactOptions() {
    if (this.contactSheetOpen) {
      return;
    }
    this.contactSheetOpen = true;
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'للاستفسار أو الدعم الفني تواصل معنا',
      subHeader: 'اختر الوسيلة المناسبة للتواصل معنا',
      mode: 'ios',
      cssClass: 'mota7-premium-sheet', // نفس التصميم الحالي
      backdropDismiss: true,
      buttons: [
        { 
          text: 'الاتصال هاتفي', 
          icon: 'call-outline', 
          handler: () => { window.open('tel:01220883999', '_self'); } 
        },
        { 
          text: 'تواصل عبر واتساب', 
          icon: 'logo-whatsapp', 
          handler: () => { 
            openWhatsappNative('201220883999', 'مرحبا .. اريد التواصل مع الدعم الفني');
          }
        },
        { 
          text: 'إلغاء', 
          role: 'cancel',
          icon: 'close-outline'
        }
      ]
    });
    void actionSheet.onDidDismiss().then(() => {
      this.contactSheetOpen = false;
    });
    await actionSheet.present();
  }

  goToLogin() { this.router.navigateByUrl('/login'); }
  goToRegister() { this.router.navigateByUrl('/register'); }
  openEditProfile() { this.router.navigateByUrl('/edit-profile'); }
  goToMyAds() { this.router.navigateByUrl('/my-ads'); }

  goToCusOrder() {
    this.router.navigateByUrl('/tabs/my-account/cus-order');
  }

  async logout() {
    const loading = await this.loadingCtrl.create({ message: 'جاري تسجيل الخروج...' });
    await loading.present();
    try {
      if (this.unsubscribeSnapshot) this.unsubscribeSnapshot();
      await runInInjectionContext(this.injector, () => signOut(this.auth));
      
      this.isLoggedIn = false;
      this.userName = 'جاري التحميل...';
      this.userPhone = '';
      this.userCity = '';
      this.profileBadgeTier = undefined;
      this.profileBadgeVerified = undefined;
      this.profileBadgeValidFrom = null;
      this.profileBadgeValidUntil = null;
      
      this.router.navigateByUrl('/tabs/my-account');
    } finally { loading.dismiss(); }
  }
}