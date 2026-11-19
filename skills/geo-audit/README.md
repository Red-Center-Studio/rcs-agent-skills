# GEO Skill Kit

Version 1.0.0. Free, MIT licence. By Red Center Studio, https://redcenterstudio.com/

An Agent Skill that audits a website for AI search readiness, fixes what it finds, and proves the result with a script. It works in any agent that reads the open `SKILL.md` format, including Claude Code, Cursor and Antigravity.

It is different from a prompt in one way that matters: the agent is not finished until `verify-geo.mjs` exits with code 0. The script has no dependencies, so you can also run it yourself or in CI.

## What is in the kit

```
geo-audit/
  SKILL.md                         The skill: five phases, from audit to verified fix
  README.md                        This file
  LICENSE
  scripts/
    verify-geo.mjs                 The check. Node 18 or newer, no dependencies
  templates/
    robots.ai.txt                  robots.txt with a rule for each AI crawler
    llms.template.txt              llms.txt in the llmstxt.org format
    schema-organization.jsonld
    schema-website.jsonld
    schema-software-app.jsonld     SoftwareApplication with an Offer
    schema-faq.jsonld
    project-rules.md               Rules to paste into CLAUDE.md, AGENTS.md or Cursor rules
```

## Install

Unzip, then copy the `geo-audit` folder to where your agent looks for skills.

**Claude Code** (one project):

```
mkdir -p .claude/skills
cp -r geo-audit .claude/skills/
```

For every project on your machine, use `~/.claude/skills/` instead.

**Cursor:**

```
mkdir -p .cursor/skills
cp -r geo-audit .cursor/skills/
```

If your Cursor version does not load skills, copy `templates/project-rules.md` to `.cursor/rules/geo.mdc` and ask the agent to follow `geo-audit/SKILL.md`.

**Antigravity:**

```
mkdir -p .agent/skills
cp -r geo-audit .agent/skills/
```

**Any other agent:** keep the folder anywhere in the project and say "follow geo-audit/SKILL.md".

Skill folder locations change between agent versions. If the skill does not show up, check your agent's documentation for the current folder.

## Use

Ask your agent in plain words:

- "Run a GEO audit on this project and fix what fails."
- "Check https://my-site.com for AI search readiness."
- "Add structured data and an llms.txt to this site."

To keep the site in shape afterwards, paste `templates/project-rules.md` into your project's `CLAUDE.md` or `AGENTS.md`.

## Run the check yourself

```
node geo-audit/scripts/verify-geo.mjs --url https://my-site.com/
node geo-audit/scripts/verify-geo.mjs --dir ./dist
node geo-audit/scripts/verify-geo.mjs --dir ./dist --page pricing/index.html
```

| Option | What it does |
|---|---|
| `--url <url>` | Check a live page. robots.txt, llms.txt and sitemap.xml are read from the same site |
| `--dir <path>` | Check a built site on disk |
| `--page <file>` | With `--dir`, the HTML file to check. Default `index.html` |
| `--strict` | Warnings count as failures |
| `--json` | Print results as JSON |

Exit code 0 means pass, 1 means at least one check failed. In CI:

```
node geo-audit/scripts/verify-geo.mjs --dir ./dist --strict
```

## What it checks

- **robots.txt:** AI search crawlers are not blocked, and each AI crawler has an explicit rule.
- **llms.txt:** if present, it follows the format (`# Title`, `> summary`, `## Sections`, full-URL links).
- **JSON-LD:** every block parses, has `@context` and `@type`, has no leftover template text, and every FAQ question and rating in the schema is visible on the page.
- **Canonical and Open Graph:** one absolute https canonical, matching `og:url`, and the four core Open Graph tags.
- **Page basics:** title, meta description, one H1, `lang`, a `<main>` landmark, not noindex.
- **Sitemap:** present and valid.

## What it does not do

- It does not measure whether AI assistants cite you. It checks the technical basics that make citing possible.
- It does not run JavaScript. If your content only appears after scripts run, the check sees what most AI crawlers see: an empty page.
- It cannot see firewall or bot protection rules. A host can block AI crawlers even when robots.txt allows them.
- llms.txt is cheap and harmless, but independent studies show most AI crawlers do not request it yet. Crawler access and structured data matter more.

## Want it done for you

Red Center Studio sets all of this up on your site for a fixed price, with a before and after audit: https://redcenterstudio.com/services/geo-foundation/

A free online version of the audit, no install needed: https://redcenterstudio.com/geo-audit/
