/** رابط واتساب بصيغة wa.me لأرقام مصر */
export function whatsappHrefFromEgyptPhone(raw: string): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '#';
  if (d.startsWith('0')) d = '20' + d.slice(1);
  else if (!d.startsWith('20')) d = '20' + d;
  return `https://wa.me/${d}`;
}

export function telHrefFromEgyptPhone(raw: string): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '#';
  if (d.startsWith('0')) d = d.slice(1);
  else if (d.startsWith('20')) d = d.slice(2);
  return `tel:+20${d}`;
}
