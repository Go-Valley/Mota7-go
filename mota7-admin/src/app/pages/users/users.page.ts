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
  closeCircleOutline, searchOutline, // إضافة أيقونة البحث
  funnelOutline,
  chevronDownCircleOutline,
  chevronDownOutline,
  calendarOutline
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
  sortBy: string = 'createdAt'; // خيار الفرز الافتراضي

  // --- متغيرات التحديد المتعدد ---
  selectionMode = false;
  selectedUserIds = new Set<string>();
  private longPressTimer: any;
  private readonly longPressDuration = 600;

  constructor() {
    addIcons({ 
      personOutline, ellipsisVerticalOutline, trashOutline, createOutline, 
      banOutline, ribbonOutline, starOutline, closeOutline, checkmarkCircleOutline,
      closeCircleOutline, searchOutline,
      funnelOutline, // إضافة أيقونة الفلتر/الفرز
      'chevron-down-circle-outline': chevronDownCircleOutline,
      'chevron-down-outline': chevronDownOutline,
      'calendar-outline': calendarOutline
    });
  }

  // --- منطق التحديد والضغط المطول ---
  onPointerDown(user: any) {
    if (this.selectionMode) return;
    this.longPressTimer = setTimeout(() => {
      this.enterSelectionMode(user);
    }, this.longPressDuration);
  }

  onPointerUp() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
  }

  private enterSelectionMode(user: any) {
    this.selectionMode = true;
    this.toggleUserSelection(user);
  }

  toggleUserSelection(user: any) {
    if (this.selectedUserIds.has(user.id)) {
      this.selectedUserIds.delete(user.id);
      if (this.selectedUserIds.size === 0) {
        this.exitSelectionMode();
      }
    } else {
      this.selectedUserIds.add(user.id);
    }
  }

  exitSelectionMode() {
    this.selectionMode = false;
    this.selectedUserIds.clear();
  }

  async confirmBulkDelete() {
    const count = this.selectedUserIds.size;
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف الجماعي',
      message: `هل أنت متأكد من حذف ${count} مستخدم نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`,
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف الكل',
          role: 'destructive',
          handler: () => this.executeBulkDelete()
        }
      ]
    });
    await alert.present();
  }

  private async executeBulkDelete() {
    const idsToDelete = Array.from(this.selectedUserIds);
    try {
      await runInInjectionContext(this.injector, async () => {
        const batch = writeBatch(this.firestore);
        idsToDelete.forEach(id => {
          batch.delete(doc(this.firestore, 'users', id));
        });
        return batch.commit();
      });
      this.showToast(`تم حذف ${idsToDelete.length} مستخدم بنجاح`);
      this.exitSelectionMode();
    } catch (e) {
      this.showToast('حدث خطأ أثناء الحذف الجماعي');
    }
  }

  onUserClick(user: any) {
    if (this.selectionMode) {
      this.toggleUserSelection(user);
    }
  }

  ngOnInit() {
    this.fetchUsers();
  }

  doRefresh(event: any) {
    this.fetchUsers();
    setTimeout(() => {
      event.target.complete();
    }, 1000);
  }

  fetchUsers() {
    runInInjectionContext(this.injector, () => {
      const usersRef = collection(this.firestore, 'users');
      onSnapshot(usersRef, (snapshot) => {
        this.usersList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        this.filterAndSortUsers();
      });
    });
  }

  // دالة الفلترة والفرز
  filterAndSortUsers() {
    let list = [...this.usersList];

    // 1. الفلترة حسب البحث
    const queryStr = this.searchQuery.trim().toLowerCase();
    if (queryStr) {
      list = list.filter(user => 
        (user.phone && user.phone.toString().includes(queryStr)) || 
        (user.fullName && user.fullName.toLowerCase().includes(queryStr))
      );
    }

    // 2. الفرز حسب الخيار المختار
    list.sort((a, b) => {
      switch (this.sortBy) {
        case 'phone': {
          const strA = String(a.phone || '').replace(/\D/g, '');
          const strB = String(b.phone || '').replace(/\D/g, '');
          return strA.localeCompare(strB); // ترتيب تصاعدي للأرقام
        }
        case 'createdAt': {
          const getTime = (val: any, fallbackVal: any) => {
            const v = val || fallbackVal;
            if (!v) return 0;
            if (typeof v.toDate === 'function') return v.toDate().getTime(); // Firestore Timestamp
            const d = new Date(v);
            return isNaN(d.getTime()) ? 0 : d.getTime(); // ISO String or Date
          };
          const timeA = getTime(a.createdAt, a.created_at);
          const timeB = getTime(b.createdAt, b.created_at);
          return timeB - timeA; // الأحدث أولاً (تنازلي)
        }
        case 'isActive': {
          if (a.isActive === b.isActive) return 0;
          return a.isActive ? -1 : 1; // النشط أولاً
        }
        case 'fullName': {
          const nameA = (a.fullName || '').trim().toLowerCase();
          const nameB = (b.fullName || '').trim().toLowerCase();
          return nameA.localeCompare(nameB, 'ar');
        }
        case 'city': {
          const cityA = (a.city || '').trim().toLowerCase();
          const cityB = (b.city || '').trim().toLowerCase();
          return cityA.localeCompare(cityB, 'ar');
        }
        default:
          return 0;
      }
    });

    this.filteredUsers = list;
  }

  // دالة تغيير نوع الفرز
  onSortChange(event: any) {
    this.sortBy = event.detail.value;
    this.filterAndSortUsers();
  }

  // دالة الفلترة للبحث برقم الهاتف أو الاسم
  filterUsers() {
    this.filterAndSortUsers();
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
      if (willDeactivate) {
        await this.rejectAllAdsForDeactivatedUser(user);
      }
      await runInInjectionContext(this.injector, () => 
        updateDoc(doc(this.firestore, 'users', user.id), { isActive: !user.isActive })
      );
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
    const adIds = new Set<string>();

    const snapByUserId = await runInInjectionContext(this.injector, () => 
      getDocs(query(collection(this.firestore, 'ads'), where('userId', '==', user.id)))
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
      const byOwner = await runInInjectionContext(this.injector, () => 
        getDocs(query(collection(this.firestore, 'ads'), where('owner_phone', '==', p)))
      );
      byOwner.docs.forEach((d) => adIds.add(d.id));
      const byPhone = await runInInjectionContext(this.injector, () => 
        getDocs(query(collection(this.firestore, 'ads'), where('phone', '==', p)))
      );
      byPhone.docs.forEach((d) => adIds.add(d.id));
    }

    const ids = [...adIds];
    if (!ids.length) return;

    const chunkSize = 400;
    for (let i = 0; i < ids.length; i += chunkSize) {
      await runInInjectionContext(this.injector, () => {
        const batch = writeBatch(this.firestore);
        for (const adId of ids.slice(i, i + chunkSize)) {
          batch.update(doc(this.firestore, 'ads', adId), {
            status: 'rejected',
            admin_reason: reason,
            reject_reason: reason,
            updated_at: serverTimestamp(),
          });
        }
        return batch.commit();
      });
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
            city: data.city,
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
      <ion-item lines="full">
        <ion-label position="stacked">المدينة</ion-label>
        <ion-input [(ngModel)]="userData.city" type="text" placeholder="اكتب المدينة"></ion-input>
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