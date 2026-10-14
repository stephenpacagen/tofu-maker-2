export type SkuColors = {
  dark: string;
  medium: string;
  light: string;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  category?: string;
  /** Optional default photo, as a path under `public/` (e.g. "/products/pacagen/cans.png"). */
  image?: string;
  /** What the product is for, in approved language. */
  positioning?: string;
  ingredients?: string;
  /** Study findings the ad may cite as results versus placebo, never as a guarantee. */
  results?: string;
  /** Palette for the ad around the product. The product photo keeps its own colors. */
  colors?: SkuColors;
};

/** Wording rules for on-image copy and the idea the ad is built on. */
export type ClaimsGuidelines = {
  use: string[];
  leadWith: string[];
  avoid: string[];
};

export type Brand = {
  id: string;
  name: string;
  /** Button and highlight color for this brand's tab. */
  color: string;
  /** Public site, used as the landing-page link placeholder. */
  website: string;
  /** Typefaces for on-image text. Headlines use `title`; every other line uses `text`. */
  fonts?: { title: string; text: string };
  claims?: ClaimsGuidelines;
  products: Product[];
};

export const BRANDS: Brand[] = [
  {
    id: "pacagen",
    name: "Pacagen",
    color: "#044eb8",
    website: "https://pacagen.com",
    fonts: { title: "Domine", text: "Work Sans" },
    products: [
      {
        id: "cans",
        sku: "CANS",
        name: "Cat Allergen Neutralizing Spray",
        category: "For Cat Allergies",
        image: "/images/cat_allergen_neutralizing_spray.png",
      },
      {
        id: "chs",
        sku: "CHS",
        name: "Cat Allergen Reducing Supplement",
        category: "For Cat Allergies",
        image: "/images/cat_allergen_reducing_supplement.png",
      },
      {
        id: "duans",
        sku: "DUANS",
        name: "Dust Allergen Neutralizing Spray",
        category: "For Dust Allergies",
        image: "/images/dust_allergen_neutralizing_spray.png",
      },
      {
        id: "eefm",
        sku: "EEFM",
        name: "EnviroBlock™ Everyday Face Mist",
        category: "For Dust Allergies",
        image: "/images/enviroblock_everyday_face_mist.png",
      },
      {
        id: "dans",
        sku: "DANS",
        name: "Dog Allergen Neutralizing Spray",
        category: "For Dog Allergies",
        image: "/images/dog_allergen_neutralizing_spray.png",
      },
    ],
  },
  {
    id: "reyou",
    name: "RE:YOU",
    color: "#5d2a2c",
    website: "https://getreyou.com",
    fonts: { title: "Canela", text: "TestDieGrotesk" },
    products: [
      {
        id: "hair-revival-serum",
        sku: "HAIR",
        name: "Dual-Path Hair Revival Serum",
        image: "/images/reyou-hair-serum.png",
      },
      {
        id: "brow-serum",
        sku: "BROW",
        name: "Dual-Path Brow Serum",
      },
    ],
  },
  {
    id: "wildtype",
    name: "Wildtype",
    color: "#13355F",
    website: "https://drinkwildtype.com",
    claims: {
      use: ["supports", "designed to", "fuels", "made for", "may help", "clinically studied to"],
      leadWith: [
        "developed by Harvard & Princeton PhD scientists",
        "recommended by ~800 physicians",
        "ingredients backed by clinical trials",
        "3rd-party tested by ISO-certified labs",
        "cGMP-certified facility",
        "FDA-registered facility",
        "made in the USA",
        "non-GMO",
        "vegan",
        "gluten free",
        "0 sugar",
        "0 artificial color, sweetener, or flavor",
      ],
      avoid: [
        "Do not claim the product treats, prevents, or cures any medical condition.",
        "Do not use: heals, corrects, stops, prevents, treats, fixes.",
        "Do not suggest Wildtype replaces a prescription drug.",
        "Do not mention Ozempic, Zepbound, or any prescription drug by name.",
        "Do not make guaranteed or rapid-effect claims.",
      ],
    },
    products: [
      {
        id: "glp1-support",
        sku: "GLP",
        name: "GLP-1 Support — Lemon ginger green tea",
        image: "/images/glp1-support.png",
        positioning:
          "Supports the body's natural GLP-1 pathway for appetite control, fullness, and weight management. No drugs, no needles.",
        ingredients:
          "6 clinically studied ingredients: lemon verbena and hibiscus extracts, inulin, ginger root, L-carnitine, green tea polyphenols.",
        results:
          "In a 90-day human study versus placebo: 61% more natural GLP-1 activity, 44% less hunger overall, 75% less hunger in women, about 7 lbs average weight loss.",
        colors: { dark: "#2B5702", medium: "#397B06", light: "#EDF4DC" },
      },
      {
        id: "triple-power-build",
        sku: "TPB",
        name: "Triple Power Build — Berry hibiscus tea",
        image: "/images/triple-power-build.png",
        positioning:
          "Designed for lean muscle, strength, recovery, and mental clarity without bulking. May help reduce bloat compared with single-form creatine.",
        ingredients: "Dual creatine (monohydrate and HCl), L-glutamine, electrolytes.",
        results:
          "In a study versus placebo: 83% more lean muscle gained, 73% greater lower-body strength, 28% greater upper-body strength, 41% less muscle soreness.",
        colors: { dark: "#C9373A", medium: "#E0514E", light: "#F7E9E9" },
      },
      {
        id: "deep-restore",
        sku: "DR",
        name: "Deep Restore — Apple chamomile tea",
        image: "/images/deep-restore.png",
        positioning:
          "Made for relaxation and sleep quality. No melatonin and no next-day grogginess. 5 calories per serving.",
        ingredients:
          "3 bioavailable forms of magnesium, L-theanine, ashwagandha, chamomile, lemon balm.",
        results:
          "In a study versus placebo: 36% more participants reported improved sleep quality, and 213% more felt more rested upon waking.",
        colors: { dark: "#732C8B", medium: "#A354AB", light: "#F1E6F6" },
      },
    ],
  },
];
