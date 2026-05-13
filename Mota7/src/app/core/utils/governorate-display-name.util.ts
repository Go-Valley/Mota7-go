/** عرض الاسم بدون بادئة «محافظة» لتبدو القائمة أنظف */
export function governorateDisplayShort(nameAr: string | null | undefined): string {
  const s = (nameAr ?? '').trim().replace(/^محافظة\s+/u, '').trim();
  return s || (nameAr ?? '').trim();
}
