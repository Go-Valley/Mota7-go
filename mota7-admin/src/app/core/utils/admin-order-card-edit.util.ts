import { AlertController, ToastController } from '@ionic/angular';
import { Firestore, deleteDoc, doc, getDoc, setDoc, updateDoc } from '@angular/fire/firestore';

function trimStr(v: unknown): string {
  return String(v ?? '').trim();
}

function orderPayloadWithoutId(order: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, ...rest } = order as Record<string, unknown> & { id?: string };
  return { ...rest };
}

/**
 * يبني patch ومعرف المستند الجديد متوافقًا مع تطبيق العميل (Mota7).
 */
export function buildOrderPatchAndDocId(order: any, raw: Record<string, string | undefined>): {
  patch: Record<string, unknown>;
  newDocId: string;
} {
  const oldId = String(order?.id ?? '');
  const serviceType = order?.serviceType;

  if (serviceType === 'education') {
    const customerPhone = trimStr(raw['customerPhone'] ?? order.customerPhone);
    const stageName = trimStr(raw['stageName'] ?? order.stageName);
    const subjectName = trimStr(raw['subjectName'] ?? order.subjectName);
    const city = trimStr(raw['city'] ?? order.city);
    const customerName = trimStr(raw['customerName'] ?? order.customerName);
    const shortNote = trimStr(raw['shortNote'] ?? order.shortNote);
    const education_match_key = `${stageName}+${subjectName}+${city}`;
    const newDocId = `${customerPhone}_${education_match_key}`;
    const patch: Record<string, unknown> = {
      customerName,
      customerPhone,
      stageName,
      subjectName,
      city,
      shortNote,
      education_match_key,
    };
    return { patch, newDocId };
  }

  if (serviceType === 'delivery') {
    const customerPhone = trimStr(raw['customerPhone'] ?? order.customerPhone);
    const customerName = trimStr(raw['customerName'] ?? order.customerName);
    const city = trimStr(raw['city'] ?? order.city);
    const subService = trimStr(raw['subService'] ?? order.subService);
    const shortNote = trimStr(raw['shortNote'] ?? order.shortNote);
    const fromLocation = trimStr(raw['fromLocation'] ?? order.fromLocation);
    const toLocation = trimStr(raw['toLocation'] ?? order.toLocation);
    const priceRaw = trimStr(raw['price'] ?? order.price);
    const price = priceRaw === '' ? order.price : priceRaw;
    const delivery_match_key = `${subService}_${city}`;
    const newDocId = `${customerPhone}_${delivery_match_key}`;
    const patch: Record<string, unknown> = {
      customerName,
      customerPhone,
      city,
      subService,
      shortNote,
      fromLocation,
      toLocation,
      price,
      delivery_match_key,
    };
    return { patch, newDocId };
  }

  if (serviceType === 'other') {
    const customerPhone = trimStr(raw['customerPhone'] ?? order.customerPhone);
    const customerName = trimStr(raw['customerName'] ?? order.customerName);
    const city = trimStr(raw['city'] ?? order.city);
    const subService = trimStr(raw['subService'] ?? order.subService);
    const shortNote = trimStr(raw['shortNote'] ?? order.shortNote);
    const other_match_key = `${subService}_${city}`;
    const newDocId = `${customerPhone}_${other_match_key}`;
    const patch: Record<string, unknown> = {
      customerName,
      customerPhone,
      city,
      subService,
      shortNote,
      other_match_key,
    };
    return { patch, newDocId };
  }

  const customerPhone = trimStr(raw['customerPhone'] ?? order.customerPhone);
  const customerName = trimStr(raw['customerName'] ?? order.customerName);
  const shortNote = trimStr(raw['shortNote'] ?? order.shortNote);
  return {
    patch: { customerName, customerPhone, shortNote },
    newDocId: oldId,
  };
}

export async function commitOrderCardPatch(
  firestore: Firestore,
  order: any,
  patch: Record<string, unknown>,
  newDocId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const oldId = order?.id;
  if (!oldId || typeof oldId !== 'string') {
    return { ok: false, message: 'معرف الطلب غير صالح' };
  }

  if (newDocId === oldId) {
    await updateDoc(doc(firestore, 'orders', oldId), patch);
    Object.assign(order, patch);
    return { ok: true };
  }

  const clash = await getDoc(doc(firestore, 'orders', newDocId));
  if (clash.exists()) {
    return {
      ok: false,
      message:
        'تعذر الحفظ: يوجد طلب آخر بنفس رقم الهاتف ونفس بيانات الخدمة. عدّل البيانات أو احذف الطلب المكرر.',
    };
  }

  const merged = { ...orderPayloadWithoutId(order), ...patch };
  await setDoc(doc(firestore, 'orders', newDocId), merged);
  await deleteDoc(doc(firestore, 'orders', oldId));
  Object.assign(order, merged, { id: newDocId });
  return { ok: true };
}

function educationEditInputs(order: any) {
  return [
    { name: 'customerName', type: 'text' as const, placeholder: 'اسم العميل', value: order.customerName || '' },
    { name: 'customerPhone', type: 'tel' as const, placeholder: 'رقم الهاتف', value: order.customerPhone || '' },
    { name: 'stageName', type: 'text' as const, placeholder: 'المرحلة التعليمية', value: order.stageName || '' },
    { name: 'subjectName', type: 'text' as const, placeholder: 'المادة', value: order.subjectName || '' },
    { name: 'city', type: 'text' as const, placeholder: 'المدينة', value: order.city || '' },
    { name: 'shortNote', type: 'textarea' as const, placeholder: 'ملاحظات إضافية', value: order.shortNote || '' },
  ];
}

function deliveryEditInputs(order: any) {
  return [
    { name: 'customerName', type: 'text' as const, placeholder: 'اسم العميل', value: order.customerName || '' },
    { name: 'customerPhone', type: 'tel' as const, placeholder: 'رقم الهاتف', value: order.customerPhone || '' },
    { name: 'subService', type: 'text' as const, placeholder: 'نوع التوصيل', value: order.subService || '' },
    { name: 'city', type: 'text' as const, placeholder: 'المدينة', value: order.city || '' },
    { name: 'fromLocation', type: 'text' as const, placeholder: 'من', value: order.fromLocation || '' },
    { name: 'toLocation', type: 'text' as const, placeholder: 'إلى', value: order.toLocation || '' },
    { name: 'price', type: 'text' as const, placeholder: 'السعر', value: order.price != null ? String(order.price) : '' },
    { name: 'shortNote', type: 'textarea' as const, placeholder: 'ملاحظات', value: order.shortNote || '' },
  ];
}

function otherEditInputs(order: any) {
  return [
    { name: 'customerName', type: 'text' as const, placeholder: 'اسم العميل', value: order.customerName || '' },
    { name: 'customerPhone', type: 'tel' as const, placeholder: 'رقم الهاتف', value: order.customerPhone || '' },
    { name: 'subService', type: 'text' as const, placeholder: 'الخدمة', value: order.subService || '' },
    { name: 'city', type: 'text' as const, placeholder: 'المدينة', value: order.city || '' },
    { name: 'shortNote', type: 'textarea' as const, placeholder: 'ملاحظات', value: order.shortNote || '' },
  ];
}

export async function presentAdminOrderCardEdit(
  firestore: Firestore,
  alertCtrl: AlertController,
  toastCtrl: ToastController,
  order: any
): Promise<void> {
  const st = order?.serviceType;
  const header =
    st === 'education'
      ? 'تعديل طلب تعليمي'
      : st === 'delivery'
        ? 'تعديل طلب توصيل'
        : st === 'other'
          ? 'تعديل طلب خدمة'
          : 'تعديل الطلب';

  const inputs =
    st === 'education'
      ? educationEditInputs(order)
      : st === 'delivery'
        ? deliveryEditInputs(order)
        : st === 'other'
          ? otherEditInputs(order)
          : [
              { name: 'customerName', type: 'text' as const, placeholder: 'اسم العميل', value: order.customerName || '' },
              { name: 'customerPhone', type: 'tel' as const, placeholder: 'رقم الهاتف', value: order.customerPhone || '' },
              { name: 'shortNote', type: 'textarea' as const, placeholder: 'ملاحظات', value: order.shortNote || '' },
            ];

  const alert = await alertCtrl.create({
    header,
    mode: 'ios',
    inputs,
    buttons: [
      { text: 'إلغاء', role: 'cancel' },
      {
        text: 'حفظ',
        handler: (data) => {
          const raw = (data || {}) as Record<string, string | undefined>;
          const { patch, newDocId } = buildOrderPatchAndDocId(order, raw);

          if (order.serviceType === 'education') {
            if (!trimStr(patch['customerName'])) return false;
            if (!trimStr(patch['customerPhone'])) return false;
            if (!trimStr(patch['stageName'])) return false;
            if (!trimStr(patch['subjectName'])) return false;
            if (!trimStr(patch['city'])) return false;
          } else if (order.serviceType === 'delivery') {
            if (!trimStr(patch['customerName'])) return false;
            if (!trimStr(patch['customerPhone'])) return false;
            if (!trimStr(patch['subService'])) return false;
            if (!trimStr(patch['city'])) return false;
          } else if (order.serviceType === 'other') {
            if (!trimStr(patch['customerName'])) return false;
            if (!trimStr(patch['customerPhone'])) return false;
            if (!trimStr(patch['subService'])) return false;
            if (!trimStr(patch['city'])) return false;
          } else {
            if (!trimStr(patch['customerName'])) return false;
            if (!trimStr(patch['customerPhone'])) return false;
          }

          void (async () => {
            try {
              const result = await commitOrderCardPatch(firestore, order, patch, newDocId);
              if (!result.ok) {
                const t = await toastCtrl.create({
                  message: result.message,
                  duration: 3200,
                  color: 'danger',
                  mode: 'ios',
                });
                await t.present();
                return;
              }
              const okToast = await toastCtrl.create({
                message: 'تم حفظ التعديلات',
                duration: 2000,
                color: 'success',
                mode: 'ios',
              });
              await okToast.present();
            } catch (e) {
              console.error('presentAdminOrderCardEdit save', e);
              const t = await toastCtrl.create({
                message: 'تعذر حفظ التعديلات',
                duration: 2500,
                color: 'danger',
                mode: 'ios',
              });
              await t.present();
            }
          })();

          return true;
        },
      },
    ],
  });
  await alert.present();
}
