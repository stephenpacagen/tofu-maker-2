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
  products: Product[];
};

export const BRANDS: Brand[] = [
  {
    id: "pacagen",
    name: "Pacagen",
    color: "#044eb8",
    products: [
      { id: "cans", sku: "CANS", name: "Cat Allergen Neutralizing Spray", category: "For Cat Allergies" },
      { id: "chs", sku: "CHS", name: "Cat Allergen Reducing Supplement", category: "For Cat Allergies" },
      { id: "duans", sku: "DUANS", name: "Dust Allergen Neutralizing Spray", category: "For Dust Allergies" },
      { id: "eefm", sku: "EEFM", name: "EnviroBlock™ Everyday Face Mist", category: "For Dust Allergies" },
    ],
  },
  {
    id: "reyou",
    name: "RE:YOU",
    color: "#5d2a2c",
    products: [
      { id: "sample-a", sku: "SAMPLE-A", name: "Sample Product A" },
      { id: "sample-b", sku: "SAMPLE-B", name: "Sample Product B" },
    ],
  },
];
