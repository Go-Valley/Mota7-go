import type { Injector } from '@angular/core';
import { runInInjectionContext } from '@angular/core';
import type { Auth } from '@angular/fire/auth';
import type { Firestore } from '@angular/fire/firestore';
import { doc, getDoc } from '@angular/fire/firestore';
import type { NavController } from '@ionic/angular';

/** سياق إنشاء إعلان من لوحة الأدمن نيابةً عن مستخدم */
export interface AdminAdOwnerContext {
  ownerPhone: string;
  ownerUid: string;
  ownerFullName: string;
}

export function isAdminOnBehalfAdCreate(
  adminCtx?: AdminAdOwnerContext | null
): boolean {
  return !!String(adminCtx?.ownerUid ?? '').trim();
}

export function adFormOwnerUserDocId(
  auth: Auth,
  adminCtx?: AdminAdOwnerContext | null
): string | null {
  const fromAdmin = String(adminCtx?.ownerPhone ?? '').trim();
  if (fromAdmin) {
    return fromAdmin;
  }
  const email = auth.currentUser?.email;
  if (email) {
    return email.split('@')[0];
  }
  return null;
}

export function resolveAdFormSubmitOwner(
  auth: Auth,
  adminCtx?: AdminAdOwnerContext | null
): { uid: string; canSubmit: boolean } {
  const adminUid = String(adminCtx?.ownerUid ?? '').trim();
  if (adminCtx && adminUid) {
    return { uid: adminUid, canSubmit: true };
  }
  const user = auth.currentUser;
  if (user?.uid) {
    return { uid: user.uid, canSubmit: true };
  }
  return { uid: '', canSubmit: false };
}

export async function loadAdFormOwnerUserDoc(
  firestore: Firestore,
  injector: Injector,
  ownerUserDocId: string
): Promise<Record<string, unknown> | null> {
  const id = String(ownerUserDocId ?? '').trim();
  if (!id) {
    return null;
  }
  const snap = await runInInjectionContext(injector, () =>
    getDoc(doc(firestore, 'users', id))
  );
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}

export function adFormSuccessNavigateAfterSave(
  navCtrl: NavController,
  adminCtx?: AdminAdOwnerContext | null
): void {
  if (isAdminOnBehalfAdCreate(adminCtx)) {
    return;
  }
  void navCtrl.navigateRoot('/my-ads');
}

export function adFormPendingSuccessMessage(
  isEditMode: boolean,
  adminCtx?: AdminAdOwnerContext | null
): string {
  if (isEditMode) {
    return 'تم تحديث البيانات بنجاح';
  }
  if (isAdminOnBehalfAdCreate(adminCtx)) {
    return 'تم إرسال الإعلان للمراجعة باسم المستخدم';
  }
  return 'تم إرسال إعلانك للمراجعة بنجاح';
}
