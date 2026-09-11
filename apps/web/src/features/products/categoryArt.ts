/**
 * Clean category art when no packshot — Blinkit-like consistent look, no user upload needed.
 */

export type CategoryArt = {
  key: string;
  label: string;
  /** soft background */
  bg: string;
  /** accent blob */
  accent: string;
  emoji: string;
};

const ARTS: Array<{ match: RegExp; art: CategoryArt }> = [
  {
    match: /\b(screw|nail|bolt|nut|washer|hinge|lock)\b/i,
    art: {
      key: "fastener",
      label: "Fastener",
      bg: "#ECEFF1",
      accent: "#90A4AE",
      emoji: "🔩",
    },
  },
  {
    match: /\b(hammer|screwdriver|spanner|plier|tool)\b/i,
    art: {
      key: "tool",
      label: "Tool",
      bg: "#FFF3E0",
      accent: "#FFB74D",
      emoji: "🔨",
    },
  },
  {
    match: /\b(pipe|pvc|elbow|tap|valve)\b/i,
    art: {
      key: "plumbing",
      label: "Plumbing",
      bg: "#E3F2FD",
      accent: "#64B5F6",
      emoji: "🔧",
    },
  },
  {
    match: /\b(paint|brush|fevicol|sandpaper|adhesive)\b/i,
    art: {
      key: "finish",
      label: "Finish",
      bg: "#F3E5F5",
      accent: "#BA68C8",
      emoji: "🎨",
    },
  },
  {
    match: /\b(wire|switch|socket|bulb|led|mcb|holder)\b/i,
    art: {
      key: "electrical",
      label: "Electrical",
      bg: "#FFFDE7",
      accent: "#FDD835",
      emoji: "💡",
    },
  },
  {
    match: /\b(parle|biscuit|cookie|good day|marie|tooffee|toffee|chocolate|snack)\b/i,
    art: {
      key: "biscuit",
      label: "Biscuit",
      bg: "#FFF4E0",
      accent: "#F2B705",
      emoji: "🍪",
    },
  },
  {
    match: /\b(maggi|noodles|pasta)\b/i,
    art: {
      key: "noodles",
      label: "Noodles",
      bg: "#FFE8DC",
      accent: "#E67E22",
      emoji: "🍜",
    },
  },
  {
    match: /\b(milk|doodh|amul)\b/i,
    art: {
      key: "milk",
      label: "Dairy",
      bg: "#E8F4FF",
      accent: "#5B9BD5",
      emoji: "🥛",
    },
  },
  {
    match: /\b(bread|pav)\b/i,
    art: {
      key: "bread",
      label: "Bread",
      bg: "#F5E6D3",
      accent: "#C4A574",
      emoji: "🍞",
    },
  },
  {
    match: /\b(egg)\b/i,
    art: {
      key: "egg",
      label: "Eggs",
      bg: "#FFF9E6",
      accent: "#F7D774",
      emoji: "🥚",
    },
  },
  {
    match: /\b(tea|chai|red label|tata tea)\b/i,
    art: {
      key: "tea",
      label: "Tea",
      bg: "#E8F6EE",
      accent: "#2F8F6B",
      emoji: "🍵",
    },
  },
  {
    match: /\b(sugar|chini)\b/i,
    art: {
      key: "sugar",
      label: "Sugar",
      bg: "#F7F4EF",
      accent: "#DDD4C6",
      emoji: "🧂",
    },
  },
  {
    match: /\b(rice|chawal|basmati)\b/i,
    art: {
      key: "rice",
      label: "Rice",
      bg: "#FFF8E7",
      accent: "#E8D5A3",
      emoji: "🍚",
    },
  },
  {
    match: /\b(dal|daal|toor|moong|masoor|chana)\b/i,
    art: {
      key: "dal",
      label: "Dal",
      bg: "#FDEBD0",
      accent: "#E59866",
      emoji: "🫘",
    },
  },
  {
    match: /\b(atta|flour|wheat|gehu)\b/i,
    art: {
      key: "atta",
      label: "Atta",
      bg: "#F5EBD8",
      accent: "#D4B896",
      emoji: "🌾",
    },
  },
  {
    match: /\b(oil|tel|fortune|sunflower|mustard)\b/i,
    art: {
      key: "oil",
      label: "Oil",
      bg: "#FFF3CD",
      accent: "#F0C14E",
      emoji: "🫙",
    },
  },
  {
    match: /\b(salt|namak)\b/i,
    art: {
      key: "salt",
      label: "Salt",
      bg: "#EEF2F7",
      accent: "#B0BEC5",
      emoji: "🧂",
    },
  },
  {
    match: /\b(onion|pyaz|pyaaz)\b/i,
    art: {
      key: "onion",
      label: "Onion",
      bg: "#F5E6FF",
      accent: "#B39DDB",
      emoji: "🧅",
    },
  },
  {
    match: /\b(tomato|tamatar)\b/i,
    art: {
      key: "tomato",
      label: "Tomato",
      bg: "#FDECEA",
      accent: "#E57373",
      emoji: "🍅",
    },
  },
  {
    match: /\b(potato|aloo)\b/i,
    art: {
      key: "potato",
      label: "Potato",
      bg: "#F5EFE0",
      accent: "#C9B896",
      emoji: "🥔",
    },
  },
  {
    match: /\b(soap|lifebuoy|dove)\b/i,
    art: {
      key: "soap",
      label: "Soap",
      bg: "#E3F2FD",
      accent: "#64B5F6",
      emoji: "🧼",
    },
  },
  {
    match: /\b(detergent|surf|rin|ariel)\b/i,
    art: {
      key: "detergent",
      label: "Wash",
      bg: "#E8EAF6",
      accent: "#7986CB",
      emoji: "🧺",
    },
  },
  {
    match: /\b(shampoo|clinic|dove hair)\b/i,
    art: {
      key: "shampoo",
      label: "Shampoo",
      bg: "#F3E5F5",
      accent: "#BA68C8",
      emoji: "🧴",
    },
  },
  {
    match: /\b(namkeen|chips|wafers|lays|balaji|kurkure)\b/i,
    art: {
      key: "namkeen",
      label: "Snacks",
      bg: "#FFF3E0",
      accent: "#FFB74D",
      emoji: "🥨",
    },
  },
  {
    match: /\b(cold drink|coke|pepsi|sprite|fanta|limca|maaza)\b/i,
    art: {
      key: "drink",
      label: "Drink",
      bg: "#E0F7FA",
      accent: "#4DD0E1",
      emoji: "🥤",
    },
  },
  {
    match: /\b(colgate|toothpaste|brush)\b/i,
    art: {
      key: "oral",
      label: "Oral",
      bg: "#E8F5E9",
      accent: "#81C784",
      emoji: "🪥",
    },
  },
];

const DEFAULT_ART: CategoryArt = {
  key: "default",
  label: "Item",
  bg: "#E8F6EE",
  accent: "#2F8F6B",
  emoji: "🛒",
};

export function categoryArtFor(name: string, unit?: string): CategoryArt {
  for (const row of ARTS) {
    if (row.match.test(name)) return row.art;
  }
  if (unit === "kg" || unit === "g") {
    return {
      key: "loose",
      label: "Loose",
      bg: "#F7F4EF",
      accent: "#C4B5A0",
      emoji: "⚖️",
    };
  }
  if (unit === "L" || unit === "ml" || unit === "l") {
    return {
      key: "liquid",
      label: "Liquid",
      bg: "#E3F2FD",
      accent: "#64B5F6",
      emoji: "💧",
    };
  }
  return DEFAULT_ART;
}
