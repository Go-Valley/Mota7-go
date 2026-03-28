import type { Firestore } from '@angular/fire/firestore';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import type { Auth } from '@angular/fire/auth';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection as fbCollection, getDocs as fbGetDocs, query as fbQuery, where as fbWhere } from 'firebase/firestore';
import { DELIVERY_CATEGORY } from '../constants/delivery-data';
import { OTHER_SERVICES_DATA } from '../constants/other-services-data';
import {
  getLegacyFirestore,
  legacyPhoneNumberToOrderPhone,
} from './legacy-firebase-migration.util';
import { getLegacyFirebaseAuth, toLegacyLoginEmail } from './legacy-firebase-login.util';
import { isOrderPhoneValid, orderPhoneToEnglishDigits } from './egyptian-phone-order.util';

/** يُضبط مرة واحدة بعد أول محاولة استيراد (نجحت أم لا) لتجنب تكرار مصادقة المشروع القديم */
export const LEGACY_SERVICES_IMPORT_V1_FLAG = 'legacyServicesImportV1Done';

export type PrefetchedLegacyServiceRow = { id: string; data: Record<string, unknown> };

const DELIVERY_IDS = new Set(DELIVERY_CATEGORY.items.map((i) => i.id));
const OTHER_IDS = new Set(OTHER_SERVICES_DATA.items.map((i) => i.id));

/** أخطاء شائعة في بيانات القديم حيث كان id الفرعي نصاً عربياً */
const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  'ميكانيكي موتوسيكلات': 'motorcycle-mechanic',
};

const LEGACY_CITY_SLUG_TO_AR: Record<string, string> = {
  'al-kharga': 'الخارجة',
  'al-dakhla': 'الداخلة',
  الخارجة: 'الخارجة',
  الداخلة: 'الداخلة',
};

function mapLegacyCityToAppCity(raw: string, fallback: string): string {
  const k = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (LEGACY_CITY_SLUG_TO_AR[k]) {
    return LEGACY_CITY_SLUG_TO_AR[k];
  }
  if (LEGACY_CITY_SLUG_TO_AR[String(raw ?? '').trim()]) {
    return LEGACY_CITY_SLUG_TO_AR[String(raw ?? '').trim()];
  }
  const t = String(raw ?? '').trim();
  if (t.length > 0) {
    return t;
  }
  return fallback;
}

function resolveServiceCategoryId(serviceType: string, rawCategory: string): string | null {
  const c0 = String(rawCategory ?? '').trim();
  const c = LEGACY_CATEGORY_ALIASES[c0] ?? c0;
  if (serviceType === 'transportation-delivery' && DELIVERY_IDS.has(c)) {
    return c;
  }
  if (serviceType === 'craft-services' && OTHER_IDS.has(c)) {
    return c;
  }
  return null;
}

function deliveryCategoryNameAr(categoryId: string): string {
  const it = DELIVERY_CATEGORY.items.find((x) => x.id === categoryId);
  return it?.nameAr ?? categoryId;
}

function otherCategoryNameAr(categoryId: string): string {
  const it = OTHER_SERVICES_DATA.items.find((x) => x.id === categoryId);
  return it?.nameAr ?? categoryId;
}

function whatsappForAd(raw: string | undefined, show: boolean): string | null {
  if (!show) {
    return null;
  }
  const s = String(raw ?? '').trim();
  if (!s) {
    return null;
  }
  let v = legacyPhoneNumberToOrderPhone(s);
  if (v && isOrderPhoneValid(v)) {
    return v;
  }
  const d = orderPhoneToEnglishDigits(s).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('01')) {
    return d;
  }
  if (d.length === 10 && d.startsWith('1')) {
    const with0 = `0${d}`;
    return isOrderPhoneValid(with0) ? with0 : null;
  }
  v = legacyPhoneNumberToOrderPhone(d.startsWith('20') ? `+${d}` : `+20${d}`);
  if (v && isOrderPhoneValid(v)) {
    return v;
  }
  return null;
}

function userVerificationForAds(userData: Record<string, unknown> | undefined): string {
  const fromAdmin = userData?.['verifiedStatus'];
  const legacy = userData?.['verification_level'];
  const raw = fromAdmin !== undefined && fromAdmin !== null ? fromAdmin : legacy;
  return raw === 'blue' || raw === 'gold' ? raw : 'none';
}

function legacyServiceIsActive(data: Record<string, unknown>): boolean {
  const s = data['status'];
  if (s === undefined || s === null) {
    return true;
  }
  return Number(s) === 1;
}

/**
 * بعد تسجيل الدخول على المشروع الجديد: استيراد إعلانات الخدمات (نقل/توصيل + حرفي) من Firestore القديم.
 * يعمل بالكامل من العميل (مناسب لخطة Spark). لا يستخدم Cloud Functions.
 */
export async function migrateLegacyServiceAdsOnce(params: {
  firestore: Firestore;
  auth: Auth;
  orderPhone: string;
  password: string;
  /** إن وُجدت (مثلاً بعد جلسة ترحيل مستخدم)، نتخطى تسجيل الدخول للقديم ونستخدمها مباشرة */
  prefetchedLegacyServices?: PrefetchedLegacyServiceRow[] | null;
}): Promise<void> {
  const { firestore, auth, orderPhone, password, prefetchedLegacyServices } = params;
  const user = auth.currentUser;
  if (!user) {
    return;
  }

  const userSnap = await getDoc(doc(firestore, 'users', orderPhone));
  if (userSnap.exists() && userSnap.data()[LEGACY_SERVICES_IMPORT_V1_FLAG] === true) {
    return;
  }

  const userData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : undefined;
  const verificationLevel = userVerificationForAds(userData);
  const profileCityFallback = String(userData?.['city'] ?? '').trim();

  let rows: PrefetchedLegacyServiceRow[] | null = prefetchedLegacyServices ?? null;

  if (!rows) {
    const legacyAuth = getLegacyFirebaseAuth();
    const legacyDb = getLegacyFirestore();
    if (!legacyAuth || !legacyDb) {
      await markImportDoneIfPossible(firestore, orderPhone, userSnap.exists());
      return;
    }

    try {
      const cred = await signInWithEmailAndPassword(
        legacyAuth,
        toLegacyLoginEmail(orderPhone),
        password
      );
      const legacyUid = cred.user.uid;
      const q = fbQuery(
        fbCollection(legacyDb, 'services'),
        fbWhere('userId', '==', legacyUid)
      );
      const snap = await fbGetDocs(q);
      rows = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
      await signOut(legacyAuth);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials'
      ) {
        await markImportDoneIfPossible(firestore, orderPhone, userSnap.exists());
        return;
      }
      console.warn('Legacy services import: legacy auth or read failed', e);
      return;
    }
  }

  if (!rows || rows.length === 0) {
    await markImportDoneIfPossible(firestore, orderPhone, userSnap.exists());
    return;
  }

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);

  for (const row of rows) {
    const data = row.data;
    const serviceType = String(data['serviceType'] ?? '').trim();
    if (serviceType !== 'transportation-delivery' && serviceType !== 'craft-services') {
      continue;
    }
    if (!legacyServiceIsActive(data)) {
      continue;
    }

    const categoryId = resolveServiceCategoryId(serviceType, String(data['serviceCategory'] ?? ''));
    if (!categoryId) {
      console.warn('Legacy services import: skip unknown category', data['serviceCategory'], serviceType);
      continue;
    }

    const ownerPhone =
      legacyPhoneNumberToOrderPhone(String(data['userPhone'] ?? '')) ?? orderPhone;
    const displayName = String(data['userName'] ?? userData?.['fullName'] ?? 'مستخدم').trim() || 'مستخدم';
    const city = mapLegacyCityToAppCity(String(data['city'] ?? ''), profileCityFallback);

    const showWa = data['showWhatsApp'] !== false;
    const waForAd =
      whatsappForAd(String(data['whatsappNumber'] ?? ''), showWa) ?? (showWa ? ownerPhone : null);

    const availableNow = data['availableNow'] !== false;
    const outside = data['availableOutsideCity'] === true;

    const adDocId = `mig_legacy_${row.id}`;

    if (serviceType === 'transportation-delivery') {
      const dup = query(
        collection(firestore, 'ads'),
        where('owner_phone', '==', ownerPhone),
        where('category_id', '==', categoryId),
        where('ad_type', '==', 'delivery')
      );
      const dupSnap = await getDocs(dup);
      if (!dupSnap.empty) {
        continue;
      }

      const delivery_match_key = `${deliveryCategoryNameAr(categoryId)}_${city}`;
      await setDoc(doc(firestore, 'ads', adDocId), {
        ad_id: adDocId,
        userId: user.uid,
        owner_name: displayName,
        owner_phone: ownerPhone,
        category_id: categoryId,
        ad_type: 'delivery',
        delivery_match_key,
        verification_level: verificationLevel,
        sort_order: 999,
        details: {
          driver_name: displayName,
          can_travel: outside,
          for_rent: false,
          whatsapp_phone: waForAd,
          is_available: availableNow,
        },
        location: { lat: 0, lng: 0 },
        city,
        is_available: availableNow,
        updated_at: serverTimestamp(),
        status: 'pending',
        created_at: serverTimestamp(),
        reject_reason: '',
        expiry_date: expiry,
      });
    } else {
      const dup = query(
        collection(firestore, 'ads'),
        where('owner_phone', '==', ownerPhone),
        where('category_id', '==', categoryId),
        where('ad_type', '==', 'other')
      );
      const dupSnap = await getDocs(dup);
      if (!dupSnap.empty) {
        continue;
      }

      const other_match_key = `${otherCategoryNameAr(categoryId)}_${city}`;
      await setDoc(doc(firestore, 'ads', adDocId), {
        ad_id: adDocId,
        userId: user.uid,
        owner_phone: ownerPhone,
        owner_name: displayName,
        ad_type: 'other',
        category_id: categoryId,
        other_match_key,
        verification_level: verificationLevel,
        sort_order: 999,
        details: {
          provider_name: displayName,
          whatsapp_phone: waForAd,
          is_available: availableNow,
        },
        location: { lat: 0, lng: 0 },
        city,
        is_available: availableNow,
        updated_at: serverTimestamp(),
        status: 'pending',
        created_at: serverTimestamp(),
        reject_reason: '',
        expiry_date: expiry,
      });
    }
  }

  await updateDoc(doc(firestore, 'users', orderPhone), {
    [LEGACY_SERVICES_IMPORT_V1_FLAG]: true,
    legacyServicesImportV1At: serverTimestamp(),
  });
}

async function markImportDoneIfPossible(
  firestore: Firestore,
  orderPhone: string,
  userDocExists: boolean
): Promise<void> {
  if (!userDocExists) {
    return;
  }
  try {
    await updateDoc(doc(firestore, 'users', orderPhone), {
      [LEGACY_SERVICES_IMPORT_V1_FLAG]: true,
      legacyServicesImportV1At: serverTimestamp(),
    });
  } catch (e) {
    console.warn('Legacy services import: could not mark user import flag', e);
  }
}
