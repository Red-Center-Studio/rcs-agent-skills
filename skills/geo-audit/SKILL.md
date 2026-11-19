---
name: geo-audit
description: Audit and fix a website so AI assistants and search engines can read, understand and cite it. Checks robots.txt rules for AI crawlers, sitemap, llms.txt, JSON-LD structured data, canonical and Open Graph tags, then fixes what failed and proves it with the bundled verify-geo.mjs script. Use when asked for a GEO audit, AI search readiness, AI crawler access, llms.txt, or schema markup on a site or codebase.
license: MIT
metadata:
  version: "1.0.0"
  author: Red Center Studio
---

# GEO audit and fix

You are making a website readable and citable by AI assistants (ChatGPT, Claude, Perplexity, Google AI Overviews) and search engines. Work in the five phases below, in order. Do not skip Phase 5: the job is done when the script passes, not when the files exist.

Paths in this file are relative to this skill's folder. The script needs Node 18 or newer and has no dependencies.

## Ground rules

1. **Never invent facts.** No made-up ratings, review counts, awards, prices, addresses, phone numbers, founding dates or social profiles. If a value is not on the site or given by the user, leave the property out or ask.
2. **Schema must match the page.** Every claim in JSON-LD (price, FAQ question, rating, name) must be visible to a person on the same page. If it is not on the page, it does not go in the schema.
3. **No leftover template text.** Nothing containing `{{`, TODO, "Your Company" or example.com may ship. The script fails on these.
4. **Change the source, not the output.** Find where the site generates its head tags, robots.txt and sitemap (a layout component, a build script, a CMS setting) and change it there. Do not edit files in a build output folder.
5. **Ask before a business decision.** Whether to allow AI training crawlers is the owner's call. Ask once, then write the answer down in robots.txt.

## Phase 1: Audit

1. Work out what you are checking: a live URL, a built folder (`dist`, `build`, `public`, `out`, `.next`), or both. If the project has a build command, run it first so you check real output.
2. Run the script and keep the output:

   ```
   node scripts/verify-geo.mjs --url https://the-site/
   node scripts/verify-geo.mjs --dir ./dist
   ```

   Add `--page path/to/page.html` with `--dir` to check a page other than the home page. Add `--json` if you want to parse the results.
3. Check at least the home page and one page of each main type (product or service page, article, contact). Problems are usually per template, not per page.
4. Read the page source yourself for what the script cannot judge:
   - Does the first screen of text say plainly what the business does, for whom and where?
   - Is the main content in the HTML, or does it only appear after JavaScript runs? AI crawlers mostly do not run JavaScript. If the HTML is an empty shell, say so: it matters more than everything else here.
   - Are headings in order (one H1, then H2, H3) and do they describe the content?
5. Report to the user before changing anything: what failed, what you will change, and any question from Ground rule 5.

## Phase 2: robots.txt and AI crawlers

There are two kinds of AI crawler, and they should be handled separately:

| Kind | User agents | Default |
|---|---|---|
| Search and answer: fetch a page when a person asks about it | `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Perplexity-User`, `Claude-SearchBot`, `Claude-User` | Allow |
| Training: collect text to train models | `GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot` | Ask the owner |

1. Start from `templates/robots.ai.txt`. Keep the site's existing Disallow rules for private paths.
2. Give every crawler in the table its own `User-agent` group with `Allow: /` or `Disallow: /`. An explicit rule shows the choice was deliberate.
3. Blocking a training crawler does not block the search crawlers, so a site can opt out of training and still be cited.
4. Add `Sitemap: https://the-domain/sitemap.xml`.
5. Check the host as well as the file. A firewall or bot protection rule (Cloudflare, Vercel, a WAF) can block AI crawlers even when robots.txt allows them. If you can see that configuration, check it. If you cannot, tell the user to check it.

## Phase 3: Structured data (JSON-LD)

1. Add one `<script type="application/ld+json">` block per page, built where the site builds its `<head>`.
2. Site-wide, on every page: `Organization` and `WebSite` (`templates/schema-organization.jsonld`, `templates/schema-website.jsonld`). Give them stable `@id` values and refer to them from other nodes.
3. Per page type, only where it is true:
   - A software product or app: `SoftwareApplication` with an `Offer` (`templates/schema-software-app.jsonld`). `price` is digits only, `priceCurrency` is a three-letter code, and the same price is visible on the page.
   - A page with questions and answers shown on it: `FAQPage` (`templates/schema-faq.jsonld`). Copy each question exactly as it appears on the page.
   - Articles: `Article` or `BlogPosting` with `headline`, `datePublished`, `dateModified`, `author`.
   - A local business: `LocalBusiness` with the real address and opening hours.
4. Generate the schema from the same data the page renders from (the product record, the FAQ array). Two hand-typed copies will drift apart.
5. Do not add `aggregateRating` or `review` unless real reviews are displayed on that page.
6. Delete any property you cannot fill with a real value. A shorter, true block beats a complete, guessed one.

## Phase 4: Canonical, Open Graph and llms.txt

1. Every page gets exactly one `<link rel="canonical">` with its full https URL. Pick one form (with or without the trailing slash, with or without www) and use it in the canonical, `og:url`, the sitemap and internal links.
2. Every page gets `og:title`, `og:description`, `og:url`, `og:image` (absolute URL), `og:type` and `twitter:card`.
3. Every page gets a unique `<title>` (60 characters or fewer) and meta description (about 155), one H1, a `lang` attribute and a `<main>` landmark.
4. The sitemap lists every page that should be found, and nothing that is noindex or redirected.
5. llms.txt: write `/llms.txt` from `templates/llms.template.txt`, following the format at llmstxt.org: one `# Title`, a `> summary` blockquote, then `## Sections` of `- [Name](https://full-url): description` links. Link the pages that best answer the questions a customer would ask. Generate it from the site's own page list if there is one.
6. Be straight with the user about llms.txt: it is cheap to add and harmless, but independent log studies show most AI crawlers do not request it today. Phases 2 and 3 matter more. `llms-full.txt` (the full text of the key pages in one file) is optional; add it only if the user wants it.

## Phase 5: Verify and finish

1. Rebuild the site if it has a build step.
2. Run the script again on the same pages as in Phase 1:

   ```
   node scripts/verify-geo.mjs --dir ./dist
   node scripts/verify-geo.mjs --dir ./dist --page pricing/index.html
   ```

3. Fix every FAIL line and run it again. Repeat until the last line is `PASS`. Each failure prints the file, the line where it can tell, and the fix.
4. Go through the warnings. Fix them or tell the user why one is left (for example, the owner chose not to add llms.txt).
5. Finish with a short report: what you changed and where, the before and after script results, what the user still has to decide or do (firewall rules, a deploy), and anything you could not verify.

Do not report the work as done while the script prints `FAIL`.

## What the script checks

| Area | Fails when | Warns when |
|---|---|---|
| robots.txt | The file is missing, or a search and answer crawler is blocked from the whole site | A crawler has no explicit rule, or there is no Sitemap line |
| llms.txt | The file exists but has no `# Title`, no `> summary`, no `## Section`, or a link that is not a full URL | The file is missing |
| JSON-LD | No block, invalid JSON, missing `@context` or `@type`, leftover template text, an FAQ question or rating that is not on the page, a price that is not a plain number | |
| Canonical | Missing, duplicated, or not an absolute https URL; `og:url` differs from it | It differs from the address being checked |
| Open Graph | `og:title`, `og:description`, `og:url` or `og:image` missing | `og:type` or `twitter:card` missing |
| Page | noindex, no title, no meta description, no H1 | Long title or description, several H1s, no `lang`, no `<main>` |
| Sitemap | The file is not a sitemap | The file is missing |

`--strict` turns warnings into failures. Exit code 0 means pass, 1 means at least one failure.
