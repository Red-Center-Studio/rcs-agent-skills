# GEO rules for this project

Paste this section into the project's `CLAUDE.md`, `AGENTS.md` or `.cursor/rules/geo.mdc` so every future change keeps the site readable by AI assistants and search engines.

## Head tags

- Every page has exactly one `<link rel="canonical">` with its full https URL.
- One URL form only: the canonical, `og:url`, the sitemap entry and internal links all use the same host and the same trailing-slash style.
- Every page has a unique `<title>` (60 characters or fewer), a unique meta description (about 155), `og:title`, `og:description`, `og:url`, `og:image` (absolute URL), `og:type` and `twitter:card`.
- Head tags are generated in one place (the layout or page helper). Do not hand-write them per page.

## Structured data

- JSON-LD is generated from the same data the page renders. Never keep a second, hand-typed copy of a price, name or FAQ.
- Everything in the schema is visible on the same page. No rating, review, price, award or FAQ question that a visitor cannot see.
- Never invent a value. If it is unknown, leave the property out.
- `Organization` and `WebSite` go on every page with stable `@id` values. Page-specific types (`SoftwareApplication`, `FAQPage`, `Article`, `LocalBusiness`) go only on pages they describe.
- Offer prices are digits only with a separate `priceCurrency`.

## Content

- The main content of a page is in the HTML the server sends. Do not rely on client-side JavaScript to render text that should be found.
- One H1 per page. Headings go in order and describe the content under them.
- The main content sits inside `<main>`. `<html>` has a `lang` attribute.

## Crawlers and discovery

- `robots.txt` names each AI crawler with an explicit Allow or Disallow. Do not block the search and answer crawlers (`OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Perplexity-User`, `Claude-SearchBot`, `Claude-User`) unless the owner asks.
- New pages are added to the sitemap by the build, never by hand. Pages that are noindex or redirected stay out of it.
- When a page is added, moved or removed, update `llms.txt` if the site has one.

## Before finishing any change that touches pages, head tags, robots.txt or the sitemap

Run the check on the built site and fix every failure:

```
node .claude/skills/geo-audit/scripts/verify-geo.mjs --dir <build-folder>
```

Adjust the path if the skill is installed somewhere else.
