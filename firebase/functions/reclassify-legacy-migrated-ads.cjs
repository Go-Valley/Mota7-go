#!/usr/bin/env node
/**
 * إعادة تصنيف إعلانات mig_legacy_* في Firestore (category_id + مفاتيح المطابقة).
 *
 * يُزامَن منطق الاستنتاج مع:
 *   Mota7/src/app/core/utils/legacy-service-category-resolve.util.ts
 *   Mota7/src/app/core/utils/legacy-migrated-ads-reclassify.util.ts
 *
 * التشغيل (من مجلد firebase/functions):
 *   set GOOGLE_APPLICATION_CREDENTIALS=مسار\serviceAccount.json   (Windows)
 *   export GOOGLE_APPLICATION_CREDENTIALS=...                       (Unix)
 *   node reclassify-legacy-migrated-ads.cjs           # محاكاة
 *   node reclassify-legacy-migrated-ads.cjs --apply   # كتابة فعلية
 */

const admin = require('./require-firebase-admin.cjs');

const PREFIX = 'mig_legacy_';
const LEGACY_FALLBACK_OTHER_CATEGORY_ID = 'contracting-supplies';

const DELIVERY_ITEMS = [
  { id: 'private-car', nameAr: 'ملاكي' },
  { id: 'taxi', nameAr: 'تاكسي' },
  { id: 'delivery', nameAr: 'دليڤري' },
  { id: 'tricycle', nameAr: 'تروسيكل' },
  { id: 'motorcycle', nameAr: 'موتوسيكل' },
  { id: 'quarter-transport', nameAr: 'ربع نقل' },
  { id: 'half-transport', nameAr: 'نص نقل' },
  { id: 'microbus', nameAr: 'ميكروباص' },
  { id: 'loader', nameAr: 'لودر' },
  { id: 'agricultural-tractor', nameAr: 'جرار زراعي' },
];

const OTHER_ITEMS = [
  { id: 'ac-maintenance', nameAr: 'صيانة تكييفات', nameEn: 'AC Maintenance' },
  { id: 'appliance-maintenance', nameAr: 'صيانة غسالات وثلاجات', nameEn: 'Washing Machine and Refrigerator Maintenance' },
  { id: 'cameras-electronics', nameAr: 'كاميرات واليكترونيات', nameEn: 'Cameras and Electronics' },
  { id: 'satellite-installation', nameAr: 'صيانة دش ورسيفر', nameEn: 'Satellite and Receiver Maintenance' },
  { id: 'electrician', nameAr: 'كهربائي', nameEn: 'Electrician' },
  { id: 'plumbing', nameAr: 'سباكة', nameEn: 'Plumbing' },
  { id: 'carpentry', nameAr: 'نجارة', nameEn: 'Carpentry' },
  { id: 'painting', nameAr: 'نقاشة', nameEn: 'Painting' },
  { id: 'plastering', nameAr: 'محارة', nameEn: 'Plastering' },
  { id: 'metalworks', nameAr: 'حدادة', nameEn: 'metalworks' },
  { id: 'construction', nameAr: 'اعمال بناء', nameEn: 'Construction Work' },
  { id: 'ceramic-flooring', nameAr: 'تركيب سيراميك وارضيات', nameEn: 'Ceramic and Flooring Installation' },
  { id: 'marble-installation', nameAr: 'تركيب رخام', nameEn: 'Marble Installation' },
  { id: 'advertising-design', nameAr: 'تصميم الاعلانات والبنرات', nameEn: 'Advertising and Banner Design' },
  { id: 'screen-maintenance', nameAr: 'صيانة شاشات', nameEn: 'Screen Maintenance' },
  { id: 'financing', nameAr: 'تمويل و قروض', nameEn: 'Financing' },
  { id: 'aluminum-works', nameAr: 'أعمال المونتال', nameEn: 'Aluminum Works' },
  { id: 'gas-stove-maintenance', nameAr: 'صيانة بوتاجازات', nameEn: 'Gas Stove Maintenance' },
  { id: 'contracting-supplies', nameAr: 'مقاولات وتوريدات', nameEn: 'Contracting & Supplies' },
  { id: 'car-towing', nameAr: 'ونش رفع سيارات', nameEn: 'Car Towing' },
  { id: 'car-mechanic', nameAr: 'ميكانيكي سيارات', nameEn: 'Car Mechanic' },
  { id: 'motorcycle-mechanic', nameAr: 'ميكانيكي موتوسيكلات', nameEn: 'Motorcycle Mechanic' },
  { id: 'vespa-mechanic', nameAr: 'ميكانيكي فيسبا', nameEn: 'Vespa Mechanic' },
  { id: 'shipping-companies', nameAr: 'شركات الشحن', nameEn: 'Shipping Companies' },
];

const DELIVERY_IDS = new Set(DELIVERY_ITEMS.map((i) => i.id));
const OTHER_IDS = new Set(OTHER_ITEMS.map((i) => i.id));

const DELIVERY_NAME_AR = Object.fromEntries(DELIVERY_ITEMS.map((i) => [i.id, i.nameAr]));
const OTHER_NAME_AR = Object.fromEntries(OTHER_ITEMS.map((i) => [i.id, i.nameAr]));

const LEGACY_CATEGORY_ALIASES = {
  'ميكانيكي موتوسيكلات': 'motorcycle-mechanic',
  حداده: 'metalworks',
  حدادة: 'metalworks',
  كهربائي: 'electrician',
  سباك: 'plumbing',
  سباكة: 'plumbing',
  نقاش: 'painting',
  نقاشة: 'painting',
  نجار: 'carpentry',
  نجارة: 'carpentry',
};

function normalizeArCategoryKey(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ٱﻵ]/g, 'ا')
    .replace(/[^a-z0-9\u0600-\u06FF]/gi, '');
}

const LEGACY_AR_NAME_TO_OTHER_ID = (() => {
  const m = {};
  for (const it of OTHER_ITEMS) {
    m[normalizeArCategoryKey(it.nameAr)] = it.id;
    m[normalizeArCategoryKey(it.nameEn)] = it.id;
  }
  return m;
})();

function resolveLegacyServiceCategoryId(serviceType, rawCategory) {
  const st = String(serviceType ?? '').trim();
  const rawCat = String(rawCategory ?? '').trim();
  const cat = LEGACY_CATEGORY_ALIASES[rawCat] ?? rawCat;
  const typeResolved = LEGACY_CATEGORY_ALIASES[st] ?? st;

  if (DELIVERY_IDS.has(typeResolved)) return typeResolved;
  if (DELIVERY_IDS.has(cat)) return cat;

  if (st === 'transportation-delivery') {
    if (DELIVERY_IDS.has(cat)) return cat;
    if (DELIVERY_IDS.has(typeResolved)) return typeResolved;
    return null;
  }

  const craftLikeParent =
    st === 'craft-services' || st === 'services' || st === 'other_services' || st === 'service';

  if (OTHER_IDS.has(cat) && !DELIVERY_IDS.has(cat)) return cat;
  if (OTHER_IDS.has(typeResolved) && !DELIVERY_IDS.has(typeResolved)) return typeResolved;

  const fromArCat = LEGACY_AR_NAME_TO_OTHER_ID[normalizeArCategoryKey(rawCat)];
  if (fromArCat) return fromArCat;
  const fromArSt = LEGACY_AR_NAME_TO_OTHER_ID[normalizeArCategoryKey(st)];
  if (fromArSt) return fromArSt;

  if (craftLikeParent) return LEGACY_FALLBACK_OTHER_CATEGORY_ID;
  return null;
}

function deliveryCategoryNameAr(categoryId) {
  return DELIVERY_NAME_AR[categoryId] ?? categoryId;
}

function otherCategoryNameAr(categoryId) {
  return OTHER_NAME_AR[categoryId] ?? categoryId;
}

function extractLegacyHints(ad) {
  const src = ad.legacy_source && typeof ad.legacy_source === 'object' ? ad.legacy_source : {};
  const st = String(src.serviceType ?? ad.legacy_service_type ?? '').trim();
  const cat = String(src.serviceCategory ?? ad.legacy_service_category ?? '').trim();
  return { serviceType: st, serviceCategory: cat };
}

function planReclassify(ad) {
  const adId = String(ad.ad_id ?? '');
  if (!adId.startsWith(PREFIX)) return { status: 'skip_not_migrated' };

  const hints = extractLegacyHints(ad);
  let categoryId = resolveLegacyServiceCategoryId(hints.serviceType, hints.serviceCategory);
  if (
    !categoryId &&
    !hints.serviceType &&
    !hints.serviceCategory &&
    String(ad.ad_type ?? '') === 'other' &&
    String(ad.category_id ?? '') === 'metalworks'
  ) {
    categoryId = LEGACY_FALLBACK_OTHER_CATEGORY_ID;
  }
  if (!categoryId) return { status: 'skip_unresolved' };

  const isDelivery = DELIVERY_IDS.has(categoryId);
  if (!isDelivery && !OTHER_IDS.has(categoryId)) return { status: 'skip_unresolved' };

  const city = String(ad.city ?? '').trim();
  const adType = isDelivery ? 'delivery' : 'other';
  const matchKeyValue = isDelivery
    ? `${deliveryCategoryNameAr(categoryId)}_${city}`
    : `${otherCategoryNameAr(categoryId)}_${city}`;

  const currentCat = String(ad.category_id ?? '');
  const currentType = String(ad.ad_type ?? '');
  const currentOther = String(ad.other_match_key ?? '');
  const currentDelivery = String(ad.delivery_match_key ?? '');

  const matches =
    currentCat === categoryId &&
    currentType === adType &&
    (isDelivery ? currentDelivery === matchKeyValue : currentOther === matchKeyValue);

  if (matches) return { status: 'unchanged' };

  return {
    status: 'update',
    category_id: categoryId,
    ad_type: adType,
    matchKeyValue,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();
  const high = `${PREFIX}\uf8ff`;
  const snap = await db.collection('ads').where('ad_id', '>=', PREFIX).where('ad_id', '<=', high).get();

  const summary = {
    scanned: 0,
    updated: 0,
    unchanged: 0,
    skipUnresolved: 0,
    skipNotMigrated: 0,
  };

  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    summary.scanned++;
    const ad = doc.data();
    const plan = planReclassify(ad);

    if (plan.status === 'skip_not_migrated') {
      summary.skipNotMigrated++;
      continue;
    }
    if (plan.status === 'skip_unresolved') {
      summary.skipUnresolved++;
      continue;
    }
    if (plan.status === 'unchanged') {
      summary.unchanged++;
      continue;
    }

    summary.updated++;
    if (!apply) continue;

    const ref = doc.ref;
    const { FieldValue } = admin.firestore;
    const base = {
      category_id: plan.category_id,
      ad_type: plan.ad_type,
      updated_at: FieldValue.serverTimestamp(),
    };
    if (plan.ad_type === 'delivery') {
      batch.update(ref, {
        ...base,
        delivery_match_key: plan.matchKeyValue,
        other_match_key: FieldValue.delete(),
      });
    } else {
      batch.update(ref, {
        ...base,
        other_match_key: plan.matchKeyValue,
        delivery_match_key: FieldValue.delete(),
      });
    }
    ops++;
    if (ops >= 500) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (apply && ops > 0) {
    await batch.commit();
  }

  console.log(JSON.stringify({ apply, ...summary }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
