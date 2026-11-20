const units = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const tens = 'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
const scales = { thousand: 1000, million: 1_000_000, billion: 1_000_000_000 };
const currencyMarkers = {
  ZAR: /^(?:zar\b|r(?=\s*\d)|rand\b)|\b(?:rand|zar)$/i,
  USD: /^(?:usd\b|us\$|us dollars?\b)|\b(?:usd|us dollars?)$/i,
  GBP: /^(?:gbp\b|£|pounds? sterling\b)|\b(?:gbp|pounds? sterling)$/i,
  EUR: /^(?:eur\b|€|euros?\b)|\b(?:eur|euros?)$/i,
};

export function currencyOf(source) {
  const currencies = Object.keys(currencyMarkers).filter((code) => currencyMarkers[code].test(source));
  return currencies.length === 1 ? currencies[0] : '';
}

function underThousand(words) {
  const [first, ...rest] = words.split(/[ -]+/);
  const digit = first === 'a' ? 1 : units.indexOf(first);
  if (rest[0] === 'hundred' && digit >= 1 && digit <= 9) {
    const remainder = rest.slice(rest[1] === 'and' ? 2 : 1).join(' ');
    return digit * 100 + (rest.length === 1 ? 0 : underHundred(remainder));
  }
  if (words === 'a') return 1;
  return underHundred(words);
}

function underHundred(words) {
  const direct = units.indexOf(words);
  if (direct >= 0) return direct;
  const [ten, unit, ...rest] = words.split(/[ -]+/);
  const tensIndex = tens.indexOf(ten);
  const unitIndex = unit === undefined ? 0 : units.indexOf(unit);
  if (rest.length || tensIndex < 0 || unitIndex < 0 || unitIndex > 9 || unit === 'zero') return NaN;
  return (tensIndex + 2) * 10 + unitIndex;
}

function spokenInteger(words) {
  if (!words) return NaN;
  let total = 0;
  let previousScale = Infinity;
  let start = 0;
  for (const match of words.matchAll(/\b(thousand|million|billion)\b/g)) {
    const scale = scales[match[1]];
    const group = words.slice(start, match.index).trim();
    const value = underThousand(start ? group.replace(/^and /, '') : group);
    if (!(value > 0) || scale >= previousScale) return NaN;
    total += value * scale;
    previousScale = scale;
    start = match.index + match[0].length;
  }
  if (start === words.length) return total;
  const remaining = words.slice(start).trim();
  return total + underThousand(start ? remaining.replace(/^and /, '') : remaining);
}

function scaleDecimal(plain, scale) {
  const [whole, decimal = ''] = plain.split('.');
  const product = BigInt(whole + decimal) * BigInt(scale);
  if (!decimal) return String(product);
  const places = decimal.length;
  const padded = String(product).padStart(places + 1, '0');
  const fractional = padded.slice(-places).replace(/0+$/, '');
  return padded.slice(0, -places) + (fractional ? `.${fractional}` : '');
}

export function normalizedNumber(quote, isFee = false) {
  const value = quote.toLowerCase().trim().replace(/\s+/g, ' ')
    .replace(/^(?:about|approximately|around|roughly)\s+/, '');
  const clean = (isFee
    ? value.replace(/\s*(?:percent|per cent|%)$/, '')
    : value
      .replace(/^(?:(?:zar|usd|gbp|eur|rand|us dollars?|euros?|pounds? sterling)\b|us\$|r(?=\s*\d)|\$|£|€)\s*/, '')
      .replace(/\s*\b(?:rand|(?:us )?dollars?|pounds?(?: sterling)?|euros?|zar|usd|gbp|eur)$/, '')
  ).trim();
  const digits = clean.match(/^(\d{1,3}(?:[, ]\d{3})+|\d+)(\.\d+)?\s*(k|m|bn|thousand|million|billion)?$/);
  if (digits) {
    const [, whole, decimal = '', suffix] = digits;
    const plain = whole.replace(/[ ,]/g, '').replace(/^0+(?=\d)/, '') + decimal;
    if (!suffix) return plain;
    if (isFee) return '';
    return scaleDecimal(plain, { ...scales, k: 1000, m: 1_000_000, bn: 1_000_000_000 }[suffix]);
  }
  if (clean === 'a' || (isFee && /\b(?:thousand|million|billion)\b/.test(clean))) return '';
  const half = clean.match(/^(.+?) and a half (thousand|million|billion)$/);
  if (half && !isFee) {
    const whole = underThousand(half[1]);
    return Number.isFinite(whole) ? scaleDecimal(`${whole}.5`, scales[half[2]]) : '';
  }
  const parts = clean.split(' point ');
  const whole = spokenInteger(parts[0]);
  if (!Number.isSafeInteger(whole)) return '';
  if (parts.length === 1) return String(whole);
  if (parts.length !== 2) return '';
  const [, fraction, scale] = parts[1].match(/^(.+?)(?: (thousand|million|billion))?$/) ?? [];
  if (!fraction) return '';
  const decimal = fraction.split(' ').map((word) => units.indexOf(word));
  if (!decimal.every((digit) => digit >= 0 && digit < 10)) return '';
  const plain = `${whole}.${decimal.join('')}`;
  return scale ? scaleDecimal(plain, scales[scale]) : plain;
}
