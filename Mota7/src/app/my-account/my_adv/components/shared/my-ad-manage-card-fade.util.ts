/**
 * بهتان كارت «إدارة إعلاناتي» عند «غير متاح».
 * حالة مرفوض/منتهي: لا بهتان هنا (يُدار عبر my-ad-no-fade-inactive).
 */
export function computeMyAdManageCardFaded(
  status: unknown,
  availability: unknown,
  whenUndefinedUnavailable: boolean
): boolean {
  if (status === 'rejected' || status === 'expired') {
    return false;
  }
  const v = availability;
  if (v === undefined || v === null) {
    return whenUndefinedUnavailable;
  }
  if (v === false || v === 'false' || v === 0 || v === '0') {
    return true;
  }
  return !(v === true || v === 'true');
}
