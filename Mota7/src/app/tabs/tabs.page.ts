import {
  ChangeDetectorRef,
  Component,
  inject,
  Injector,
  NgZone,
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
  briefcaseOutline,
  megaphoneOutline,
  carOutline,
  schoolOutline,
  constructOutline,
  listOutline,
  bookOutline,
} from 'ionicons/icons';
import { ModalController, NavController } from '@ionic/angular';
import { Auth, authState } from '@angular/fire/auth';
import { ServiceSelectionComponent } from '../my-order/service-selection.component';
import { DeliveryServiceComponent } from '../my-order/delivery-service/delivery-service.component';
import { EducationalServiceComponent } from '../my-order/educational-service/educational-service.component';
import { OtherServiceComponent } from '../my-order/other-service/other-service.component';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage implements OnInit {
  private navCtrl = inject(NavController);
  private modalCtrl = inject(ModalController);
  private auth = inject(Auth);
  private injector = inject(Injector);
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  isServiceModalOpen: boolean = false;
  isAppTutorialOpen = false;
  isLoggedIn: boolean = false;
  /** تنقل بعد اكتمال إغلاق المودال (يمنع بقاء الطبقة فوق الصفحة الجديدة) */
  private pendingNavigation: string | null = null;
  /** بعد إغلاق مودال «طلب / نشر» يُفتح مودال اختيار نوع الخدمة */
  private openServiceSelectionAfterIntroDismiss = false;

  constructor() {
    addIcons({
      'person-outline': personOutline,
      'home-outline': homeOutline,
      'add-circle-outline': addCircleOutline,
      person: person,
      home: home,
      'add-circle': addCircle,
      'close-outline': closeOutline,
      'briefcase-outline': briefcaseOutline,
      'megaphone-outline': megaphoneOutline,
      'car-outline': carOutline,
      'school-outline': schoolOutline,
      'construct-outline': constructOutline,
      'list-outline': listOutline,
      'book-outline': bookOutline,
    });
  }

  ngOnInit() {
    runInInjectionContext(this.injector, () =>
      authState(this.auth).subscribe((user) => {
        this.isLoggedIn = !!user;
      })
    );
  }

  openAppTutorial(): void {
    this.isAppTutorialOpen = true;
    this.cdr.markForCheck();
  }

  openServiceModal() {
    this.pendingNavigation = null;
    this.openServiceSelectionAfterIntroDismiss = false;
    this.isServiceModalOpen = true;
    this.cdr.markForCheck();
  }

  closeServiceModal(ev?: Event) {
    ev?.stopPropagation();
    ev?.preventDefault();
    this.pendingNavigation = null;
    this.openServiceSelectionAfterIntroDismiss = false;
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

    if (openSelection) {
      this.ngZone.run(() => void this.presentServiceSelectionFlow());
    } else if (url) {
      this.ngZone.run(() => {
        void (async () => {
          /**
           * «نشر إعلان» من المودال: نضع تبويب «حسابي» تحت add-ad-type ليعود المستخدم للحساب لا لإدارة الإعلانات.
           */
          if (url === '/add-ad-type') {
            await this.navCtrl.navigateRoot('/tabs/my-account', { animated: false });
            await this.navCtrl.navigateForward('/add-ad-type', { animated: true });
          } else {
            await this.navCtrl.navigateRoot(url, { animated: true });
          }
        })();
      });
    }
    this.cdr.markForCheck();
  }

  /** «طلب خدمة»: فتح مودال اختيار نوع الخدمة بعد إغلاق المودال الحالي. */
  goToServiceOrder() {
    this.pendingNavigation = null;
    this.openServiceSelectionAfterIntroDismiss = true;
    this.isServiceModalOpen = false;
    this.cdr.markForCheck();
  }

  /** الانتقال إلى صفحة طلباتي (بعد إغلاق المودال). */
  goToMyOrdersPage() {
    this.pendingNavigation = '/tabs/my-order';
    this.openServiceSelectionAfterIntroDismiss = false;
    this.isServiceModalOpen = false;
    this.cdr.markForCheck();
  }

  goToAdvertiseNow() {
    const loggedIn = !!this.auth.currentUser || this.isLoggedIn;
    this.pendingNavigation = loggedIn ? '/add-ad-type' : '/register';
    this.openServiceSelectionAfterIntroDismiss = false;
    this.isServiceModalOpen = false;
    this.cdr.markForCheck();
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
    category: 'delivery' | 'education' | 'other'
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
      initialBreakpoint: 1,
      breakpoints: [0, 1],
      handle: true,
      cssClass: 'mota7-modal-style',
    });
    await modal.present();
    await modal.onDidDismiss();
  }
}
