# Tofu Maker

Reference-based generator for top-of-funnel static ads.

## Running

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Image providers

Generation goes through the `AdGenerator` interface in `lib/generation/`. Pick a provider with `IMAGE_PROVIDER` in `.env.local`:

| `IMAGE_PROVIDER` | Behavior |
| --- | --- |
| `mock` (default) | Crops the reference to the target ratio and overlays the brief. No API key needed. |
| `openai` | Calls the OpenAI image edits API with the reference (and product image, if given). Requires `OPENAI_API_KEY`; `OPENAI_IMAGE_MODEL` defaults to `gpt-image-1`. |

To add a provider, implement `AdGenerator` and register it in `lib/generation/index.ts`.

## Reference library

"Choose from library" in the References step pulls static ads from other brands out of the Meta Ad Library, using the [`automation-lab/facebook-ads-library`](https://apify.com/automation-lab/facebook-ads-library) Apify actor. Set `APIFY_TOKEN` in `.env.local`; without it (or with `LIBRARY_PROVIDER=sample`) the library serves built-in sample data.

Each new keyword, brand, or "Still running" toggle costs one scrape, about $0.03 for 50 ads. Sorting, platform, and run-time filters reuse that scrape for free. Raw results are saved in `.cache/apify/` for 24 hours, so repeated searches stay free across server restarts; delete the folder to force a fresh scrape.

## Layout

- `lib/types.ts`: brief, reference, and generated ad types (the contract between steps)
- `lib/references/score.ts`: "winning" score computed from public reference metrics
- `lib/references/`: library types, Apify client, sample fallback, and `queryLibrary` in `source.ts`
- `lib/generation/`: prompt builder and image providers
- `app/api/generate/route.ts`: accepts the brief plus images as multipart form data and returns the generated ads
- `app/api/library/`: library search, brand lookup, and an image proxy, which keep the Apify token on the server
- `app/components/`: the input, review, and results UI
