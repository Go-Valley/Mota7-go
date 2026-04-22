import { Firestore, collection, getDocs, query, where } from '@angular/fire/firestore';
import { AlertController } from '@ionic/angular';

/**
 * أنواع الإعلانات التي نطبّق عليها فحص التكرار:
 * - delivery: نقل وتوصيل (نوع المركبة = category_id)
 * - education: تعليمية (المرحلة + المادة)
 * - other: خدمات أخرى (نوع الخدمة/الحرفة = category_id)
 * - store: متجر (نوع النشاط التجاري = category_id)
 */
export type DuplicateAdKind = 'delivery' | 'education' | 'other' | 'store';

export interface DuplicateCheckInput {
  firestore: Firestore;
  phone: string;
  adType: DuplicateAdKind;
  categoryId: string;
  /** إلزامي فقط للتعليمي — يجب تطابق المادة مع المرحلة */
  subject?: string;
}

export interface DuplicateAdHit {
  id: string;
  status: string;
  adType: DuplicateAdKind;
  categoryId: string;
  subject?: string;
}

/**
 * توحيد قيمة ad_type لمقارنتها بالقيم الحديثة (other, store)
 * حتى تُكتشف التكرارات حتى لو كانت السجلات القديمة بصيغة other_services/stores/shop.
 * يُصدَّر لاستخدامه في mota7-admin (إدارة الإعلانات) ليبقى نفس منطق Mota7.
 */
export function normalizeAdTypeValue(raw: unknown): string {
  const s = String(raw ?? '').toLowerCase().trim();
  if (!s) return s;
  if (s === 'other_services') return 'other';
  if (s === 'stores' || s === 'shop') return 'store';
  return s;
}

/**
 * يبحث عن أي إعلان سابق لنفس المستخدم بنفس النشاط/النوع —
 * يشمل جميع الحالات (pending, active, rejected, expired) بلا استثناء.
 * للتعليمي: يشترط تطابق المرحلة (category_id) + المادة (details.subject) معاً.
 */
export async function findDuplicateAd(input: DuplicateCheckInput): Promise<DuplicateAdHit | null> {
  const { firestore, phone, adType, categoryId, subject } = input;
  const cleanPhone = String(phone ?? '').trim();
  const cleanCategory = String(categoryId ?? '').trim();
  if (!cleanPhone || !cleanCategory) return null;

  const adsRef = collection(firestore, 'ads');
  const q = query(adsRef, where('owner_phone', '==', cleanPhone));
  const snap = await getDocs(q);

  const subjectNeedle = String(subject ?? '').trim();

  for (const d of snap.docs) {
    const data = d.data() as Record<string, any>;
    if (normalizeAdTypeValue(data['ad_type']) !== adType) continue;
    if (String(data['category_id'] ?? '') !== cleanCategory) continue;

    if (adType === 'education') {
      const storedSubject = String(data['details']?.subject ?? '').trim();
      if (!storedSubject || !subjectNeedle || storedSubject !== subjectNeedle) continue;
    }

    return {
      id: d.id,
      status: String(data['status'] ?? 'pending'),
      adType,
      categoryId: cleanCategory,
      subject: adType === 'education' ? subjectNeedle : undefined,
    };
  }
  return null;
}

export interface PresentDuplicateAlertInput {
  alertCtrl: AlertController;
  adType: DuplicateAdKind;
  /** اسم النشاط/نوع المركبة/المرحلة بالعربية لعرضه في الرسالة */
  activityNameAr: string;
  /** المادة التعليمية (للتعليمي فقط) */
  subjectName?: string;
  /** حالة الإعلان المكرر: pending | active | rejected | expired */
  existingStatus?: string;
}

function statusLabelAr(status: string | undefined): string {
  switch (status) {
    case 'active': return 'مفعّل';
    case 'pending': return 'قيد المراجعة';
    case 'rejected': return 'مرفوض';
    case 'expired': return 'منتهي';
    default: return 'موجود مسبقاً';
  }
}

function adTypeMeta(adType: DuplicateAdKind): { sectionLabel: string; fieldLabel: string } {
  switch (adType) {
    case 'delivery': return { sectionLabel: 'نقل وتوصيل', fieldLabel: 'نوع المركبة' };
    case 'education': return { sectionLabel: 'تعليمي', fieldLabel: 'المرحلة التعليمية' };
    case 'other': return { sectionLabel: 'خدمات أخرى', fieldLabel: 'نوع الخدمة' };
    case 'store': return { sectionLabel: 'متجر', fieldLabel: 'نوع النشاط التجاري' };
  }
}

/**
 * يبني نص التنبيه (نقل وتوصيل / تعليمي / خدمات أخرى / متجر).
 * ion-alert لا يُفسّر HTML في message — نص متعدد الأسطر + white-space: pre-line في global.scss.
 */
function buildDuplicatePlainMessage(input: PresentDuplicateAlertInput): string {
  const { adType, activityNameAr, subjectName, existingStatus } = input;
  const meta = adTypeMeta(adType);
  const statusText = statusLabelAr(existingStatus);
  const activity = sanitizeOneLine(activityNameAr || '—');
  const lines: string[] = [
    'لا يمكن إضافة إعلان جديد بنفس النشاط — يوجد إعلان مماثل مسجّل على حسابك مسبقاً.',
    '',
    `• قسم الإعلان: ${meta.sectionLabel}`,
    `• ${meta.fieldLabel}: ${activity}`,
  ];
  if (adType === 'education' && subjectName?.trim()) {
    lines.push(`• المادة التعليمية: ${sanitizeOneLine(subjectName.trim())}`);
  }
  lines.push(`• حالة الإعلان الحالي: ${statusText}`);
  lines.push('');
  lines.push('بإمكانك تعديل الإعلان الحالي من صفحة «إعلاناتي» بدلاً من إنشاء إعلان جديد.');
  return lines.join('\n');
}

/** يمنع كسر التنسيق أو حقن أسطر مزيفة من مدخلات المستخدم */
function sanitizeOneLine(s: string): string {
  return String(s).replace(/\s+/g, ' ').trim();
}

/** عرض تنبيه تكرار النشاط — يُستدعى من نماذج التوصيل والتعليم والأخرى والمتجر. */
export async function presentDuplicateAdAlert(input: PresentDuplicateAlertInput): Promise<void> {
  const { alertCtrl } = input;
  const message = buildDuplicatePlainMessage(input);

  const alert = await alertCtrl.create({
    header: 'تعذَّر إضافة الإعلان',
    message,
    mode: 'ios',
    cssClass: 'mota7-duplicate-ad-alert',
    backdropDismiss: true,
    buttons: [
      {
        text: 'حسناً، فهمت',
        role: 'cancel',
        cssClass: 'dup-btn-ok',
      },
    ],
  });
  await alert.present();
}
