// Set NEXT_PUBLIC_BASE_PATH (e.g. "/tofu-maker-2") at build time when serving
// the app under a sub-path. Next prefixes <Link> and routes automatically, but
// not fetch() URLs or plain <img> / public-file paths, so those use this.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const withBasePath = (path: string) =>
  path.startsWith("/") && !path.startsWith("//") ? `${BASE_PATH}${path}` : path;
