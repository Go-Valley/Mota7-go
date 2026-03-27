import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  ActionSheetController,
  NavController,
  ToastController,
  ModalController,
  AlertController,
} from '@ionic/angular';
import {
  Firestore,
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { 
  personOutline, ellipsisVerticalOutline, trashOutline, createOutline, 
  banOutline, ribbonOutline, starOutline, closeOutline, checkmarkCircleOutline,
  closeCircleOutline, searchOutline // إضافة أيقونة البحث
} from 'ionicons/icons';

@Component({
  selector: 'app-users',
  templateUrl: './users.page.html',
  styleUrls: ['./users.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, Mota7HeaderComponent, FormsModule]
})
export class UsersPage implements OnInit {
  private static readonly DEACTIVATE_ACCOUNT_REJECTION_REASON =
    'اعلان مرفوض بسبب ايقاف تنشيط الحساب - لمزيد من الاستفسار, يرجى التواصل مع الادارة';

  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private actionSheetCtrl = inject(ActionSheetController);
  private modalCtrl = inject(ModalController);
  private navCtrl = inject(NavController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);

  usersList: any[] = [];
  filteredUsers: any[] = []; // قائمة المستخدمين بعد الفلترة
  searchQuery: string = '';   // نص البحث

  constructor() {
    addIcons({ 
      personOutline, ellipsisVerticalOutline, trashOutline, createOutline, 
      banOutline, ribbonOutline, starOutline, closeOutline, checkmarkCircleOutline,
      closeCircleOutline, searchOutline
    });
  }

  ngOnInit() {
    this.fetchUsers();
  }

  fetchUsers() {
    runInInjectionContext(this.injector, () => {
      const usersRef = collection(this.firestore, 'users');
      onSnapshot(usersRef, (snapshot) => {
        this.usersList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        this.filterUsers();
      });
    });
  }

  // دالة الفلترة للبحث برقم الهاتف أو الاسم
  filterUsers() {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      this.filteredUsers = [...this.usersList];
    } else {
      this.filteredUsers = this.usersList.filter(user => 
        (user.phone && user.phone.toString().includes(query)) || 
        (user.fullName && user.fullName.toLowerCase().includes(query))
      );
    }
  }

  async openArabicList(user: any) {
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'إدارة: ' + (user.fullName || user.phone),
      cssClass: 'mota7-action-sheet',
      buttons: [
        { text: 'تعديل البيانات', icon: 'create-outline', handler: () => this.openEditModal(user) },
        { 
          text: user.isActive ? 'تعطيل الحساب' : 'تنشيط الحساب', 
          icon: user.isActive ? 'ban-outline' : 'checkmark-circle-outline',
          handler: () => this.toggleStatus(user) 
        },
        { text: 'توثيق أزرق', icon: 'ribbon-outline', handler: () => this.updateVerification(user, 'blue') },
        { text: 'توثيق ذهبي', icon: 'star-outline', handler: () => this.updateVerification(user, 'gold') },
        { text: 'إلغاء التوثيق', icon: 'close-circle-outline', handler: () => this.updateVerification(user, null) },
        {
          text: 'حذف نهائياً',
          role: 'destructive',
          icon: 'trash-outline',
          handler: () => {
            void this.confirmDeleteUser(user);
          },
        },
        { text: 'إلغاء', role: 'cancel', icon: 'close-outline' }
      ]
    });
    await actionSheet.present();
  }

  async updateVerification(user: any, type: string | null) {
    try {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'users', user.id), {
          verifiedStatus: type,
          verification_level: type ?? 'none',
        })
      );
      this.showToast(type ? 'تم تحديث التوثيق' : 'تم إزالة التوثيق');
    } catch {
      this.showToast('خطأ في الصلاحيات: تأكد من الـ Rules');
    }
  }

  async toggleStatus(user: any) {
    const willDeactivate = user.isActive === true;
    try {
      await runInInjectionContext(this.injector, async () => {
        if (willDeactivate) {
          await this.rejectAllAdsForDeactivatedUser(user);
        }
        await updateDoc(doc(this.firestore, 'users', user.id), { isActive: !user.isActive });
      });
      this.showToast(
        willDeactivate
          ? 'تم تعطيل الحساب ورفض الإعلانات المرتبطة'
          : 'تم تنشيط الحساب'
      );
    } catch (e) {
      this.showToast('فشل التعديل: راجع قواعد الحماية');
    }
  }

  /** عند تعطيل الحساب: جعل كل إعلانات المستخدم مرفوضة مع سبب إداري موحّد. */
  private async rejectAllAdsForDeactivatedUser(user: any): Promise<void> {
    const reason = UsersPage.DEACTIVATE_ACCOUNT_REJECTION_REASON;
    const adsRef = collection(this.firestore, 'ads');
    const adIds = new Set<string>();

    const snapByUserId = await getDocs(
      query(adsRef, where('userId', '==', user.id))
    );
    snapByUserId.docs.forEach((d) => adIds.add(d.id));

    const phoneKeys = new Set<string>();
    if (user.phone != null && String(user.phone).trim()) {
      phoneKeys.add(String(user.phone).trim());
    }
    if (user.id != null && String(user.id).trim()) {
      phoneKeys.add(String(user.id).trim());
    }
    for (const p of phoneKeys) {
      const byOwner = await getDocs(query(adsRef, where('owner_phone', '==', p)));
      byOwner.docs.forEach((d) => adIds.add(d.id));
      const byPhone = await getDocs(query(adsRef, where('phone', '==', p)));
      byPhone.docs.forEach((d) => adIds.add(d.id));
    }

    const ids = [...adIds];
    if (!ids.length) return;

    const chunkSize = 400;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const batch = writeBatch(this.firestore);
      for (const adId of ids.slice(i, i + chunkSize)) {
        batch.update(doc(this.firestore, 'ads', adId), {
          status: 'rejected',
          admin_reason: reason,
          reject_reason: reason,
          updated_at: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  }

  async confirmDeleteUser(user: any) {
    const label = user.fullName || user.phone || user.id;
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف',
      message: `هل تريد حذف المستخدم «${label}» نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`,
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف نهائياً',
          role: 'destructive',
          handler: () => {
            void this.deleteUser(user);
          },
        },
      ],
    });
    await alert.present();
  }

  async deleteUser(user: any) {
    try {
      await runInInjectionContext(this.injector, () =>
        deleteDoc(doc(this.firestore, 'users', user.id))
      );
      this.showToast('تم حذف المستند بنجاح');
    } catch {
      this.showToast('خطأ في الحذف');
    }
  }

  async openEditModal(user: any) {
    const modal = await this.modalCtrl.create({
      component: EditUserModalComponent,
      componentProps: { userData: { ...user } }
    });
    
    await modal.present();
    const { data } = await modal.onWillDismiss();
    
    if (data) {
      try {
        await runInInjectionContext(this.injector, () =>
          updateDoc(doc(this.firestore, 'users', user.id), {
            fullName: data.fullName,
            phone: data.phone,
          })
        );
        this.showToast('تم تحديث البيانات بنجاح');
      } catch (e) {
        this.showToast('خطأ في التحديث: راجع الـ Rules');
      }
    }
  }

  goBack() { this.navCtrl.back(); }
  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({ message: msg, duration: 2000, position: 'bottom' });
    toast.present();
  }
}

@Component({
  selector: 'app-edit-user-modal',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>تعديل: {{ userData.fullName }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-item lines="full">
        <ion-label position="stacked">الاسم الكامل</ion-label>
        <ion-input [(ngModel)]="userData.fullName" type="text" placeholder="اكتب الاسم"></ion-input>
      </ion-item>
      <ion-item lines="full">
        <ion-label position="stacked">رقم الهاتف</ion-label>
        <ion-input [(ngModel)]="userData.phone" type="tel" placeholder="اكتب الرقم"></ion-input>
      </ion-item>
      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <ion-button expand="block" (click)="save()" style="flex: 1;">حفظ</ion-button>
        <ion-button expand="block" color="light" (click)="close()" style="flex: 1;">إلغاء</ion-button>
      </div>
    </ion-content>
  `,
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule]
})
export class EditUserModalComponent {
  userData: any;
  private modalCtrl = inject(ModalController);
  save() { this.modalCtrl.dismiss(this.userData); }
  close() { this.modalCtrl.dismiss(); }
}