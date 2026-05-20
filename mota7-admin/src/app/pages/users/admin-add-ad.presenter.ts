import type { EnvironmentInjector } from '@angular/core';
import {
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { Firestore } from '@angular/fire/firestore';
import type { AdminAdOwnerContext } from '@mota7-app/core/utils/admin-ad-owner-context.util';
import { loadAdFormOwnerUserDoc } from '@mota7-app/core/utils/admin-ad-owner-context.util';
import { AdminAddAdTypeModalComponent } from './admin-add-ad-type-modal.component';

async function presentShortToast(
  toastCtrl: ToastController,
  message: string,
  color: 'warning' | 'danger' = 'warning'
): Promise<void> {
  const t = await toastCtrl.create({
    message,
    duration: 3200,
    position: 'bottom',
    color,
    mode: 'ios',
  });
  await t.present();
}

/**
 * فتح مسار «إضافة إعلان» (نفس نماذج تطبيق Mota7) نيابةً عن مستخدم من لوحة الأدمن.
 */
export async function openAdminAddAdForUser(
  modalCtrl: ModalController,
  alertCtrl: AlertController,
  toastCtrl: ToastController,
  firestore: Firestore,
  injector: EnvironmentInjector,
  user: { id: string; phone?: string; uid?: string; fullName?: string; name?: string }
): Promise<void> {
  const phone = String(user.phone ?? user.id ?? '').trim();
  let uid = String(user.uid ?? '').trim();
  const fullName =
    String(user.fullName ?? user.name ?? '').trim() || 'مستخدم مُتاح';

  if (!phone) {
    await presentShortToast(toastCtrl, 'رقم هاتف المستخدم غير متوفر');
    return;
  }

  if (!uid) {
    const data = await loadAdFormOwnerUserDoc(firestore, injector, phone);
    uid = String(data?.['uid'] ?? '').trim();
  }

  if (!uid) {
    const alert = await alertCtrl.create({
      header: 'تعذّر إضافة إعلان',
      message:
        'لا يوجد معرّف Firebase (uid) لهذا المستخدم. يجب أن يسجّل دخولاً مرة واحدة على تطبيق مُتاح أولاً، ثم أعد المحاولة.',
      mode: 'ios',
      buttons: [{ text: 'حسناً', role: 'cancel' }],
    });
    await alert.present();
    return;
  }

  const adminOwnerContext: AdminAdOwnerContext = {
    ownerPhone: phone,
    ownerUid: uid,
    ownerFullName: fullName,
  };

  const modal = await modalCtrl.create({
    component: AdminAddAdTypeModalComponent,
    componentProps: { adminOwnerContext },
    cssClass: 'mota7-admin-add-ad-type-modal',
    mode: 'ios',
    breakpoints: [0, 0.94],
    initialBreakpoint: 0.94,
    handle: true,
  });
  await modal.present();
}
