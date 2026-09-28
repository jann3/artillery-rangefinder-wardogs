# rangefinder-wardogs

Static site (no build step), published by Netlify from the repo root as-is. Hosted at https://janne.dev/rangefinder/. The parent site janne.dev owns the sitemap.xml that includes this tool, so this repo does not need its own.

## SEO/AEO/GEO maintenance

`index.html` carries structured data (JSON-LD `SoftwareApplication` + `FAQPage`) and lastmod-style meta tags. Whenever you make a content or functional change to `index.html` (copy, formulas, weapon ranges, features), update these in the same change:

- `<meta property="og:updated_time" content="...">` and `<meta name="last-modified" content="...">` — bump to today's date
- `"dateModified": "..."` inside the JSON-LD `SoftwareApplication` block — bump to today's date
- If the change affects facts stated in the `FAQPage` JSON-LD (e.g. the range formulas, weapon envelope numbers, spotter conversion), update the corresponding `Question`/`Answer` text so it stays in sync with the visible page content — these should never drift out of sync with what's shown in the "How this is worked out" / "Weapon envelopes" details sections.
