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
} from 'ionicons/icons';
import { NavController } from '@ionic/angular';
import { Auth, authState } from '@angular/fire/auth';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage implements OnInit {
  private navCtrl = inject(NavController);
  private auth = inject(Auth);
  private injector = inject(Injector);
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  isServiceModalOpen: boolean = false;
  isLoggedIn: boolean = false;
  /** تنقل بعد اكتمال إغلاق المودال (يمنع بقاء الطبقة فوق الصفحة الجديدة) */
  private pendingNavigation: string | null = null;

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
    });
  }

  ngOnInit() {
    runInInjectionContext(this.injector, () =>
      authState(this.auth).subscribe((user) => {
        this.isLoggedIn = !!user;
      })
    );
  }

  openServiceModal() {
    this.pendingNavigation = null;
    this.isServiceModalOpen = true;
    this.cdr.markForCheck();
  }

  closeServiceModal(ev?: Event) {
    ev?.stopPropagation();
    ev?.preventDefault();
    this.pendingNavigation = null;
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
    if (url) {
      this.ngZone.run(() => {
        void this.navCtrl.navigateRoot(url, { animated: true });
      });
    }
    this.cdr.markForCheck();
  }

  goToServiceOrder() {
    this.pendingNavigation = '/tabs/my-order';
    this.isServiceModalOpen = false;
    this.cdr.markForCheck();
  }

  goToAdvertiseNow() {
    this.pendingNavigation = this.isLoggedIn ? '/my-ads' : '/register';
    this.isServiceModalOpen = false;
    this.cdr.markForCheck();
  }
}
