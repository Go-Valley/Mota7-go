import {
  ChangeDetectorRef,
  Component,
  inject,
  Injector,
  NgZone,
  OnDestroy,
  OnInit,
  runInInjectionContext,
} from '@angular/core';
import { addIcons } from 'ionicons';
import {
  personOutline,
  homeOutline,
  addCircleOutline,
  person,
  home,
  addCircle,
  closeOutline,
  megaphoneOutline,
  carOutline,
  schoolOutline,
  constructOutline,
  listOutline,
  bookOutline,
  chevronBackOutline,
  logoWhatsapp,
} from 'ionicons/icons';
import { ModalController, NavController, Platform } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { ServiceSelectionComponent } from '../my-order/service-selection.component';
import { DeliveryServiceComponent } from '../my-order/delivery-service/delivery-service.component';
import { EducationalServiceComponent } from '../my-order/educational-service/educational-service.component';
import { OtherServiceComponent } from '../my-order/other-service/other-service.component';
import { WtsappGroupLinkService } from '../core/services/wtsapp-group-link.service';
import { DELIVERY_CATEGORY } from '../core/constants/delivery-data';
import { OTHER_SERVICES_DATA } from '../core/constants/other-services-data';

const QUICK_TRANSPORT_TILES: ReadonlyArray<{ img: string; label: string; presetId: string }> = [
  { img: 'assets/order/Car.png', label: 'ملاكي', presetId: 'private-car' },
  { img: 'assets/order/Taxi.png', label: 'تاكسي', presetId: 'taxi' },
  { img: 'assets/order/Delivery.png', label: 'دليفري', presetId: 'delivery' },
  { img: 'assets/order/Tricycle.png', label: 'تروسيكل', presetId: 'tricycle' },
  { img: 'assets/order/Pickup.png', label: 'ربع نقل', presetId: 'quarter-transport' },
];

const QUICK_OTHER_TILES: ReadonlyArray<{ img: string; label: string; presetId: string }> = [
  { img: 'assets/order/Plumber.png', label: 'سباك', presetId: 'plumbing' },
  { img: 'assets/order/Electrician.png', label: 'كهربائي', presetId: 'electrician' },
  { img: 'assets/order/Carpenter.png', label: 'نجار', presetId: 'carpentry' },
  { img: 'assets/order/Painter.png', label: 'نقاش', presetId: 'painting' },
  { img: 'assets/order/Plasterer.png', label: 'محارة', presetId: 'plastering' },
  { img: 'assets/order/Conditioning.png', label: 'صيانة تكييفات', presetId: 'ac-maintenance' },
  { img: 'assets/order/Receiver.png', label: 'دش ورسيفر', presetId: 'satellite-installation' },
  { img: 'assets/order/Washing.png', label: 'صيانة غسالات', presetId: 'washing-machine-maintenance' },
];

const MY_ORDERS_MODAL_BACK_PRIORITY = 120;

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage implements OnInit, OnDestroy {
  private navCtrl = inject(NavController);
  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private platform = inject(Platform);
  private auth = inject(Auth);
  private injector = inject(Injector);
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private wtsappGroupLink = inject(WtsappGroupLinkService);

  isServiceModalOpen: boolean = false;
  isMyOrdersModalOpen = false;
  isAppTutorialOpen = false;
  isRequestTutorialOpen = false;
  isLoggedIn: boolean = false;
  private myOrdersModalBackSub?: Subscription;
  /** تنقل بعد اكتمال إغلاق المودال (يمنع بقاء الطبقة فوق الصفحة الجديدة) */
  private pendingNavigation: string | null = null;
  /** بعد إغلاق مودال «طلب / نشر» يُفتح مودال اختيار نوع الخدمة */
  private openServiceSelectionAfterIntroDismiss = false;
  /** بعد إغلاق المودال يُفتح نموذج طلب مباشرة (شبكة الاختصارات) */
  private pendingQuickServiceModal: {
    category: 'delivery' | 'education' | 'other';
    componentProps?: Record<string, unknown>;
  } | null = null;

  readonly quickTransportTiles = QUICK_TRANSPORT_TILES;
  readonly quickOtherTiles = QUICK_OTHER_TILES;
  readonly educationHubTileImg = 'assets/order/Teacher.png';

  constructor() {
    addIcons({
      'person-outline': personOutline,
      'home-outline': homeOutline,
      'add-circle-outline': addCircleOutline,
      person: person,
      home: home,
      'add-circle': addCircle,
      'close-outline': closeOutline,
      'megaphone-outline': megaphoneOutline,
      'car-outline': carOutline,
      'school-outline': schoolOutline,
      'construct-outline': constructOutline,
      'list-outline': listOutline,
      'book-outline': bookOutline,
      'chevron-back-outline': chevronBackOutline,
      'logo-whatsapp': logoWhatsapp,
    });
  }

  ngOnInit() {
    runInInjectionContext(this.injector, () =>
      authState(this.auth).subscribe((user) => {
        this.isLoggedIn = !!user;
      })
    );
  }

  ngOnDestroy(): void {
    this.detachMyOrdersModalBackHandler();
  }

  /**
   * إعادة اختيار تبويب «الرئيسية» وهو مفعّل لا يستدعي ionViewWillEnter على الصفحة.
   * عند فتح قسم (نقل، تعليم، …) نُرسل نفس حدث الرجوع بالهيدر للعودة للشبكة والبانر.
   */
  onHomeTabButtonClick(): void {
    const raw = this.router.url.split('?')[0].split('#')[0];
    const path = raw.replace(/\/$/, '') || '/';
    if (path !== '/tabs/home' && path !== '/tabs') {
      return;
    }
    window.dispatchEvent(new CustomEvent('reset-mota7-home'));
  }

  openAppTutorial(): void {
    this.isAppTutorialOpen = true;
    this.cdr.markForCheck();
  }

  openRequestServiceTutorial(ev?: Event): void {
    ev?.stopPropagation();
    ev?.preventDefault();
    this.isRequestTutorialOpen = true;
    this.cdr.markForCheck();
  }

  /** مجموعة «مُتاح» الخدمي — الرابط من Firestore wtsapp_group/mota7.link */
  openMota7ServiceGroupInvite(): void {
    this.wtsappGroupLink.openServiceGroupInvite();
  }

  openServiceModal() {
    this.pendingNavigation = null;
    this.openServiceSelectionAfterIntroDismiss = false;
    this.pendingQuickServiceModal = null;
    this.isServiceModalOpen = true;
    this.cdr.markForCheck();
  }

  closeServiceModal(ev?: Event) {
    ev?.stopPropagation();
    ev?.preventDefault();
    this.pendingNavigation = null;
    this.openServiceSelectionAfterIntroDismiss = false;
    this.pendingQuickServiceModal = null;
    this.isServiceModalOpen = false;
    this.cdr.markForCheck();
  }

  /**
   * يُستدعى بعد انتهاء أنيميشن الإغلاق (زر X، الخلفية، أو أي إغلاق).
   */
  onModalDidDismiss(): void {
    this.isServiceModalOpen = false;
    const url = this.pendingNavigation;
    this.pendingNavigation = null;
    const openSelection = this.openServiceSelectionAfterIntroDismiss;
    this.openServiceSelectionAfterIntroDismiss = false;
    const pendingQuick = this.pendingQuickServiceModal;
    this.pendingQuickServiceModal = null;

    if (pendingQuick) {
      this.ngZone.run(() =>
        void this.presentSpecificServiceModal(pendingQuick.category, pendingQuick.componentProps)
      );
    } else if (openSelection) {
      this.ngZone.run(() => void this.presentServiceSelectionFlow());
    } else if (url) {
      this.ngZone.run(() => void this.executePostIntroNavigation(url));
    }
    this.cdr.markForCheck();
  }

  /** إغلاق مودال «طلب / نشر» ثم فتح نموذج الخدمة المناسب (مع خيارات مسبقة إن وُجدت). */
  closeIntroAndOpenOrder(
    category: 'delivery' | 'education' | 'other',
    componentProps?: Record<string, unknown>
  ): void {
    this.pendingNavigation = null;
    this.openServiceSelectionAfterIntroDismiss = false;
    this.pendingQuickServiceModal = { category, componentProps };
    this.isServiceModalOpen = false;
    this.cdr.markForCheck();
  }

  onQuickTransportPreset(presetId: string): void {
    const item = DELIVERY_CATEGORY.items.find((i) => i.id === presetId);
    const nameAr = item?.nameAr ?? '';
    this.closeIntroAndOpenOrder('delivery', { initialVehicleNameAr: nameAr });
  }

  onQuickTransportMore(): void {
    this.closeIntroAndOpenOrder('delivery');
  }

  onQuickOtherPreset(presetId: string): void {
    const item = OTHER_SERVICES_DATA.items.find((i) => i.id === presetId);
    const tile = this.quickOtherTiles.find((t) => t.presetId === presetId);
    const nameAr = item?.nameAr ?? tile?.label ?? '';
    this.closeIntroAndOpenOrder('other', {
      initialSubServiceId: presetId,
      initialSubServiceNameAr: nameAr,
    });
  }

  onQuickOtherMore(): void {
    this.closeIntroAndOpenOrder('other');
  }

  /** دروس خصوصية: نفس نموذج الطلب التعليمي الكامل (مرحلة + مادة + بقية الحقول). */
  onQuickEducationHub(): void {
    this.closeIntroAndOpenOrder('education');
  }


  openMyOrdersModal(ev?: Event): void {
    ev?.stopPropagation();
    ev?.preventDefault();
    this.isMyOrdersModalOpen = true;
    this.attachMyOrdersModalBackHandler();
    this.cdr.markForCheck();
  }

  closeMyOrdersModal(ev?: Event): void {
    ev?.stopPropagation();
    ev?.preventDefault();
    this.isMyOrdersModalOpen = false;
    this.detachMyOrdersModalBackHandler();
    this.cdr.markForCheck();
  }

  onMyOrdersModalDidDismiss(): void {
    this.isMyOrdersModalOpen = false;
    this.detachMyOrdersModalBackHandler();
    this.cdr.markForCheck();
  }

  private attachMyOrdersModalBackHandler(): void {
    this.detachMyOrdersModalBackHandler();
    this.myOrdersModalBackSub = this.platform.backButton.subscribeWithPriority(
      MY_ORDERS_MODAL_BACK_PRIORITY,
      () => {
        if (this.isMyOrdersModalOpen) {
          this.closeMyOrdersModal();
        }
      }
    );
  }

  private detachMyOrdersModalBackHandler(): void {
    this.myOrdersModalBackSub?.unsubscribe();
    this.myOrdersModalBackSub = undefined;
  }

  /** من شريط التبويب «إضافة إعلان» — نفس مسار «نشر إعلان» السابق. */
  openAddAdvertisement(): void {
    this.pendingNavigation = null;
    this.openServiceSelectionAfterIntroDismiss = false;
    this.pendingQuickServiceModal = null;
    if (this.isServiceModalOpen) {
      const loggedIn = !!this.auth.currentUser || this.isLoggedIn;
      this.pendingNavigation = loggedIn ? '/add-ad-type' : '/register';
      this.isServiceModalOpen = false;
      this.cdr.markForCheck();
      return;
    }
    void this.navigateToAdvertiseFlow();
  }

  goToAdvertiseNow() {
    const loggedIn = !!this.auth.currentUser || this.isLoggedIn;
    this.pendingNavigation = loggedIn ? '/add-ad-type' : '/register';
    this.openServiceSelectionAfterIntroDismiss = false;
    this.pendingQuickServiceModal = null;
    this.isServiceModalOpen = false;
    this.cdr.markForCheck();
  }

  private navigateToAdvertiseFlow(): void {
    const loggedIn = !!this.auth.currentUser || this.isLoggedIn;
    const url = loggedIn ? '/add-ad-type' : '/register';
    this.ngZone.run(() => void this.executePostIntroNavigation(url));
  }

  private async executePostIntroNavigation(url: string): Promise<void> {
    if (url === '/add-ad-type') {
      await this.navCtrl.navigateRoot('/tabs/my-account', { animated: false });
      await this.navCtrl.navigateForward('/add-ad-type', { animated: true });
    } else {
      await this.navCtrl.navigateRoot(url, { animated: true });
    }
  }

  private blurActiveElement(): void {
    const el = document.activeElement;
    if (el instanceof HTMLElement) {
      el.blur();
    }
  }

  private async presentServiceSelectionFlow(): Promise<void> {
    this.blurActiveElement();
    const modal = await this.modalCtrl.create({
      component: ServiceSelectionComponent,
      initialBreakpoint: 0.7,
      breakpoints: [0, 0.7, 0.9],
      handle: true,
      cssClass: 'mota7-modal-style',
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss();
    if (role === 'confirm' && data?.selectedCategory) {
      await this.presentSpecificServiceModal(data.selectedCategory);
    }
  }

  private async presentSpecificServiceModal(
    category: 'delivery' | 'education' | 'other',
    componentProps?: Record<string, unknown>
  ): Promise<void> {
    let componentToOpen: typeof DeliveryServiceComponent | typeof EducationalServiceComponent | typeof OtherServiceComponent;
    switch (category) {
      case 'delivery':
        componentToOpen = DeliveryServiceComponent;
        break;
      case 'education':
        componentToOpen = EducationalServiceComponent;
        break;
      case 'other':
        componentToOpen = OtherServiceComponent;
        break;
    }

    this.blurActiveElement();
    const modal = await this.modalCtrl.create({
      component: componentToOpen,
      componentProps: componentProps ?? {},
      initialBreakpoint: 1,
      breakpoints: [0, 1],
      handle: true,
      cssClass: 'mota7-modal-style',
    });
    await modal.present();
    await modal.onDidDismiss();
  }

  trackByQuickTileId(_index: number, tile: { presetId: string }): string {
    return tile.presetId;
  }
}
