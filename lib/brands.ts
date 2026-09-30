export type Product = {
  id: string;
  sku: string;
  name: string;
  category?: string;
  /** Optional default photo, as a path under `public/` (e.g. "/products/pacagen/cans.png"). */
  image?: string;
};

export type Brand = {
  id: string;
  name: string;
  /** Button and highlight color for this brand's tab. */
  color: string;
  /** Public site, used as the landing-page link placeholder. */
  website: string;
  products: Product[];
};

export const BRANDS: Brand[] = [
  {
    id: "pacagen",
    name: "Pacagen",
    color: "#044eb8",
    website: "https://pacagen.com",
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
    products: [
      {
        id: "hair-revival-serum",
        sku: "HAIR",
        name: "Dual-Path Hair Revival Serum",
      },
      {
        id: "brow-serum",
        sku: "BROW",
        name: "Dual-Path Brow Serum",
      },
    ],
  },
];
