/** Parse spoken kirana lines like "Maggi 20", "चीनी पचास रुपये", "dal dedh sau". */

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  ek: 1,
  one: 1,
  do: 2,
  two: 2,
  teen: 3,
  three: 3,
  char: 4,
  four: 4,
  paanch: 5,
  panch: 5,
  five: 5,
  chhe: 6,
  six: 6,
  saat: 7,
  seven: 7,
  aath: 8,
  eight: 8,
  nau: 9,
  nine: 9,
  das: 10,
  ten: 10,
  gyaarah: 11,
  barah: 12,
  terah: 13,
  chaudah: 14,
  pandrah: 15,
  solah: 16,
  satrah: 17,
  atharah: 18,
  unnees: 19,
  bees: 20,
  twenty: 20,
  tees: 30,
  thirty: 30,
  chalees: 40,
  chalis: 40,
  forty: 40,
  pachaas: 50,
  pachas: 50,
  fifty: 50,
  saath: 60,
  sixty: 60,
  sattar: 70,
  seventy: 70,
  assi: 80,
  eighty: 80,
  nabbe: 90,
  ninety: 90,
  sau: 100,
  hundred: 100,
  dedh: 1.5,
  dhai: 2.5,
};

const RUPEE_WORDS =
  /\b(rupees?|rupaye|rupaya|rs\.?|inr|₹)\b/gi;

export function parseSpokenProduct(raw: string): {
  name: string;
  price: number | null;
} {
  let text = raw.trim().replace(RUPEE_WORDS, " ").replace(/\s+/g, " ");
  if (!text) return { name: "", price: null };

  // "name 20" / "name 20.50"
  const digitTail = text.match(/^(.*?)[\s,:-]+(\d+(?:[.,]\d+)?)$/);
  if (digitTail) {
    const name = digitTail[1].trim();
    const price = Number(digitTail[2].replace(",", "."));
    if (name && Number.isFinite(price)) return { name, price };
  }

  // "20 name"
  const digitHead = text.match(/^(\d+(?:[.,]\d+)?)[\s,:-]+(.+)$/);
  if (digitHead) {
    const price = Number(digitHead[1].replace(",", "."));
    const name = digitHead[2].trim();
    if (name && Number.isFinite(price)) return { name, price };
  }

  // word numbers at end: "maggi bees"
  const parts = text.toLowerCase().split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]!;
    const secondLast = parts[parts.length - 2]!;

    // "dedh sau" = 150, "dhai sau" = 250
    if (
      (secondLast === "dedh" || secondLast === "dhai") &&
      (last === "sau" || last === "hundred")
    ) {
      const base = secondLast === "dedh" ? 150 : 250;
      const name = parts.slice(0, -2).join(" ").trim();
      if (name) return { name: restoreCase(raw, name), price: base };
    }

    if (last in WORD_NUMBERS) {
      let price = WORD_NUMBERS[last]!;
      let nameParts = parts.slice(0, -1);
      // "bees sau" unlikely; "teen sau" = 300
      if (
        nameParts.length >= 1 &&
        nameParts[nameParts.length - 1]! in WORD_NUMBERS &&
        (last === "sau" || last === "hundred")
      ) {
        const tens = WORD_NUMBERS[nameParts[nameParts.length - 1]!]!;
        if (tens > 0 && tens < 10) {
          price = tens * 100;
          nameParts = nameParts.slice(0, -1);
        }
      }
      const name = nameParts.join(" ").trim();
      if (name && price > 0) {
        return { name: restoreCase(raw, name), price };
      }
    }
  }

  return { name: text, price: null };
}

function restoreCase(original: string, lowerName: string): string {
  const idx = original.toLowerCase().indexOf(lowerName);
  if (idx >= 0) return original.slice(idx, idx + lowerName.length).trim();
  return lowerName;
}

/** Hindi/English spoken number → digit string for price pad */
export function parseSpokenPrice(raw: string): number | null {
  const cleaned = raw.trim().replace(RUPEE_WORDS, " ").replace(/\s+/g, " ");
  const asDigit = cleaned.match(/(\d+(?:[.,]\d+)?)/);
  if (asDigit) {
    const n = Number(asDigit[1].replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const parsed = parseSpokenProduct(`x ${cleaned}`);
  return parsed.price;
}
