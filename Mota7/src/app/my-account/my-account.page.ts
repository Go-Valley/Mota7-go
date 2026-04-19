import { IonicModule, ActionSheetController, LoadingController } from '@ionic/angular'; 
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { Router } from '@angular/router';
import { Firestore, doc, onSnapshot, getDoc } from '@angular/fire/firestore';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Auth, authState, signOut } from '@angular/fire/auth';
import { Observable } from 'rxjs';
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


@Component({
  selector: 'app-my-account',
  templateUrl: './my-account.page.html',
  styleUrls: ['./my-account.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, Mota7HeaderComponent, FormsModule, AppTutorialModalComponent]
})
export class MyAccountPage implements OnInit {
  isLoggedIn: boolean = false; 
  isTermsModalOpen: boolean = false;
  isAppTutorialOpen = false;
  isSubscriptionsModalOpen: boolean = false;
  /** none: لا وضع مفعّل | empty: رسالة الفراغ | current: جدول الباقات */
  subscriptionsModalView: 'none' | 'empty' | 'current' = 'none';
  /** HTML من Firestore — SafeHtml حتى لا يُعاد تعقيمه ويُحذف منه الوسوم/الصفات */
  subscriptionsHtmlSafe = inject(DomSanitizer).bypassSecurityTrustHtml('');
  subscriptionsEmptyMessage = '';
  private contactSheetOpen = false;
  termsContent: string = 'جاري التحميل...'; // متغير لتخزين النص
  userName: string = 'جاري التحميل...';
  userPhone: string = '';
  userCity: string = ''; 
  verificationLevel: string = 'none';
  private unsubscribeSnapshot: any;

  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private domSanitizer = inject(DomSanitizer);
  private injector = inject(EnvironmentInjector);
  private cdr = inject(ChangeDetectorRef);
  private document = inject(DOCUMENT);
  private authState$!: Observable<any>;
  readonly acct = inject(UserAccountStatusService);

  /** مسارات أصول مطلقة من baseURI — ضرورية لـ Capacitor/APK مع baseHref: ./ */
  assetUrl(relativePath: string): string {
    try {
      const base = this.document.baseURI || '/';
      return new URL(relativePath, base).href;
    } catch {
      return relativePath;
    }
  }

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

  ngOnInit() { this.monitorAuthState(); }

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
              const fromAdmin = data['verifiedStatus'];
              const legacy = data['verification_level'];
              const raw =
                fromAdmin !== undefined && fromAdmin !== null ? fromAdmin : legacy;
              this.verificationLevel =
                raw === 'blue' || raw === 'gold' ? raw : 'none';
            } else {
              this.verificationLevel = 'none';
            }
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
  }

  closeSubscriptionsModal(): void {
    this.isSubscriptionsModalOpen = false;
  }

  async openSubscriptionsModal(): Promise<void> {
    await this.fetchSubscriptionsPage();
    this.isSubscriptionsModalOpen = true;
  }

  /**
   * Firestore: subscriptions/page
   * current_status / empty_status: "active" | غير نشط
   * أولوية العرض: إن وُجد current نشط → محتوى الباقات؛ وإلا empty نشط → الرسالة؛ وإلا none.
   */
  private async fetchSubscriptionsPage(): Promise<void> {
    this.subscriptionsModalView = 'none';
    this.subscriptionsHtmlSafe = this.domSanitizer.bypassSecurityTrustHtml('');
    this.subscriptionsEmptyMessage = '';

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
        this.subscriptionsHtmlSafe = this.domSanitizer.bypassSecurityTrustHtml(html);
        this.cdr.markForCheck();
        return;
      }

      if (emptyOn) {
        this.subscriptionsModalView = 'empty';
        const em =
          typeof d['empty_message'] === 'string' ? d['empty_message'].trim() : '';
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

  // تحديث الدالة لتصبح احترافية (Action Sheet)
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
      this.verificationLevel = 'none';
      
      this.router.navigateByUrl('/tabs/my-account');
    } finally { loading.dismiss(); }
  }
}