/** تطبيع نص البحث العربي/الإنجليزي */
export function normalizeHomeSearchText(input: unknown): string {
  return (input ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildHomeSearchTokens(text: string): { raw: string; tokens: string[] } {
  const raw = normalizeHomeSearchText(text);
  if (!raw) {
    return { raw: '', tokens: [] };
  }
  const parts = raw.split(' ').filter(Boolean);
  const tokens = parts.length > 0 ? parts : [raw];
  return { raw, tokens: Array.from(new Set(tokens)) };
}

function editDistance(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > maxDistance) return maxDistance + 1;
  if (!al) return bl;
  if (!bl) return al;

  const prev = new Array<number>(bl + 1);
  const curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= bl; j++) prev[j] = curr[j];
  }
  return prev[bl];
}

function expandSynonyms(
  token: string,
  groups: string[][]
): string[] {
  const tk = normalizeHomeSearchText(token);
  if (!tk) return [];
  const expanded = new Set<string>([tk]);
  if (tk.length < 3) {
    return [tk];
  }
  for (const group of groups) {
    const inGroup = group.some((g) => g === tk);
    const prefixMatch =
      tk.length >= 4 && group.some((g) => g.startsWith(tk) || tk.startsWith(g));
    if (inGroup || prefixMatch) {
      group.forEach((g) => expanded.add(g));
    }
  }
  if (tk.startsWith('ال') && tk.length > 3) expanded.add(tk.slice(2));
  if (!tk.startsWith('ال') && tk.length > 2) expanded.add(`ال${tk}`);
  return Array.from(expanded);
}

function tokenMatchScore(
  token: string,
  haystack: string,
  haystackWords: string[],
  synonymGroups: string[][]
): number {
  if (!token || !haystack) return 0;

  if (haystack.includes(token)) {
    let score = 100 + Math.min(token.length * 6, 36);
    if (haystack.startsWith(token) || haystack.includes(` ${token}`)) {
      score += 28;
    }
    return score;
  }

  if (token.length === 1) {
    for (const word of haystackWords) {
      if (word.startsWith(token)) return 82;
    }
    return 0;
  }

  if (token.length === 2) {
    for (const word of haystackWords) {
      if (word === token || word.startsWith(token)) return 88;
    }
    return haystack.includes(token) ? 75 : 0;
  }

  const alternatives =
    token.length >= 3 ? expandSynonyms(token, synonymGroups) : [token];
  let best = 0;

  for (const alt of alternatives) {
    if (!alt) continue;
    if (haystack.includes(alt)) {
      best = Math.max(best, 96);
    }
    for (const word of haystackWords) {
      if (!word) continue;
      if (word === alt) {
        best = Math.max(best, 120);
        continue;
      }
      if (word.startsWith(alt)) {
        best = Math.max(best, 105);
        continue;
      }
      if (alt.length >= 3 && word.includes(alt) && alt.length >= Math.ceil(word.length * 0.45)) {
        best = Math.max(best, 72);
        continue;
      }
      if (alt.length >= 4 && word.length >= 4) {
        const distance = editDistance(alt, word, 1);
        if (distance === 1) best = Math.max(best, 52);
      }
    }
  }

  return best;
}

/** درجة مطابقة إعلان لاستعلام البحث — 0 = لا مطابقة */
export function scoreHomeAdSearchMatch(
  haystack: string,
  haystackWords: string[],
  rawQuery: string,
  tokens: string[],
  synonymGroups: string[][]
): number {
  if (!rawQuery || !haystack) return 0;

  let score = 0;
  if (haystack.includes(rawQuery)) {
    score += 90 + Math.min(rawQuery.length * 5, 50);
    if (haystack.startsWith(rawQuery) || haystack.includes(` ${rawQuery}`)) {
      score += 35;
    }
  }

  if (!tokens.length) {
    return score > 0 ? score : 0;
  }

  let tokenSum = 0;
  for (const token of tokens) {
    const ts = tokenMatchScore(token, haystack, haystackWords, synonymGroups);
    if (ts <= 0) {
      return tokens.length === 1 && score > 0 ? score : 0;
    }
    tokenSum += ts;
  }

  const combined = score + tokenSum;
  if (tokens.length > 1) {
    return combined;
  }
  return Math.max(score, tokenSum);
}
