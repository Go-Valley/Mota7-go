import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { IonicModule, AlertController, ToastController, LoadingController, NavController } from '@ionic/angular'; // أضفنا NavController
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData, doc, setDoc, deleteDoc, query, orderBy, Timestamp } from '@angular/fire/firestore';
import { addIcons } from 'ionicons';
import { personRemoveOutline, addOutline, trashOutline, callOutline, timeOutline, documentTextOutline, chevronForwardOutline, shieldHalfOutline } from 'ionicons/icons';
import { Observable } from 'rxjs';
// استيراد الهيدر الخاص بمتاح
import { Mota7HeaderComponent } from '../../mota7-header/header';
@Component({
  selector: 'app-blocked-users',
  templateUrl: './blocked_users.page.html',
  styleUrls: ['./blocked_users.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, Mota7HeaderComponent] // إضافة المكون هنا
})
export class BlockedUsersPage implements OnInit {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private loadingCtrl = inject(LoadingController);
  private navCtrl = inject(NavController); // للتحكم في الرجوع الخلفي

  blockedUsers$: Observable<any[]> | undefined;

  constructor() {
    addIcons({ personRemoveOutline, addOutline, trashOutline, callOutline, timeOutline, documentTextOutline, chevronForwardOutline, shieldHalfOutline });
  }

  ngOnInit() {
    this.loadBlockedUsers();
  }

  doRefresh(event: any) {
    this.loadBlockedUsers();
    setTimeout(() => {
      event.target.complete();
    }, 1000);
  }

  loadBlockedUsers() {
    runInInjectionContext(this.injector, () => {
      const blockedRef = collection(this.firestore, 'blocked_users');
      const q = query(blockedRef, orderBy('blockedAt', 'desc'));
      this.blockedUsers$ = collectionData(q, { idField: 'phone' });
    });
  }

  // دالة الرجوع للخلف المرتبطة بالهيدر
  goBack() {
    this.navCtrl.back();
  }

  async openAddBlockModal() {
    const alert = await this.alertCtrl.create({
      header: 'حظر مستخدم جديد',
      mode: 'ios',
      inputs: [
        { name: 'phone', type: 'tel', placeholder: 'رقم الهاتف' },
        { name: 'reason', type: 'text', placeholder: 'سبب الحظر (اختياري)' }
      ],
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'تأكيد الحظر',
          handler: (data) => {
            if (!data.phone) {
              this.showToast('يرجى إدخال رقم الهاتف');
              return false;
            }
            this.blockUser(data.phone, data.reason);
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  async blockUser(phone: string, reason: string) {
    const loader = await this.loadingCtrl.create({ message: 'جاري الحظر...', mode: 'ios' });
    await loader.present();
    try {
      const docRef = doc(this.firestore, 'blocked_users', phone);
      await setDoc(docRef, {
        reason: reason || 'لا يوجد سبب محدد',
        blockedAt: Timestamp.now()
      });
      this.showToast('تم إضافة الرقم للقائمة السوداء');
    } catch (e) {
      this.showToast('حدث خطأ');
    } finally {
      loader.dismiss();
    }
  }

  async unblockUser(phone: string) {
    const alert = await this.alertCtrl.create({
      header: 'فك الحظر',
      message: `هل أنت متأكد من فك الحظر عن الرقم ${phone}؟`,
      mode: 'ios',
      buttons: [
        { text: 'تراجع', role: 'cancel' },
        {
          text: 'نعم، فك الحظر',
          handler: async () => {
            await deleteDoc(doc(this.firestore, 'blocked_users', phone));
            this.showToast('تم فك الحظر');
          }
        }
      ]
    });
    await alert.present();
  }

  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({ message: msg, duration: 2000, mode: 'ios' });
    await toast.present();
  }
}