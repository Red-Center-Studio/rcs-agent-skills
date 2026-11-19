# Agent Skills from Red Center Studio

Free Agent Skills you can drop into Claude Code, Cursor, Antigravity or any agent that reads the open `SKILL.md` format. MIT licensed. Built by [Red Center Studio](https://redcenterstudio.com/).

## Skills

| Skill | What it does |
| --- | --- |
| [`geo-audit`](skills/geo-audit/) | Audits a website for AI search readiness: robots.txt rules for AI crawlers, sitemap, llms.txt, JSON-LD structured data, canonical and Open Graph tags. Fixes what fails, then proves the result with `verify-geo.mjs`, a script with no dependencies that exits 0 only when the checks pass. |

The point of the skill is the last step. The agent is not finished until the script passes, so the result does not depend on how confident a prompt sounds. You can also run the script yourself or in CI.

## Install in Claude Code

Add this repository as a plugin marketplace, then install the plugin:

```
/plugin marketplace add Red-Center-Studio/rcs-agent-skills
/plugin install geo-skill-kit@red-center-studio-skills
```

The skill then runs as `/geo-skill-kit:geo-audit`, or Claude uses it when you ask for a GEO audit, AI search readiness or llms.txt.

Or copy the folder by hand. For one project:

```
mkdir -p .claude/skills
cp -r skills/geo-audit .claude/skills/
```

For every project on your machine, copy it to `~/.claude/skills/` instead.

## Install in Cursor

```
mkdir -p .cursor/skills
cp -r skills/geo-audit .cursor/skills/
```

If your Cursor version does not load skills, copy `skills/geo-audit/templates/project-rules.md` to `.cursor/rules/geo.mdc` and ask the agent to follow `geo-audit/SKILL.md`.

## Install in Antigravity

```
mkdir -p .agent/skills
cp -r skills/geo-audit .agent/skills/
```

Skill folder locations change between agent versions. If the skill does not show up, check your agent's documentation for the current folder.

## Use

Ask in plain words:

- "Run a GEO audit on this project and fix what fails."
- "Check https://my-site.com for AI search readiness."
- "Add structured data and an llms.txt to this site."

Run the check without an agent (Node 18 or newer):

```
node skills/geo-audit/scripts/verify-geo.mjs --url https://my-site.com/
node skills/geo-audit/scripts/verify-geo.mjs --dir ./dist --strict
```

## What it does not do

It does not measure whether AI assistants cite you. It checks the technical basics that make citing possible. It does not run JavaScript, and it cannot see firewall rules that block crawlers even when robots.txt allows them. See `skills/geo-audit/README.md` for the full list.

## Links

- Free online audit, no install: https://redcenterstudio.com/geo-audit/
- More skill kits (MCP servers, Stripe on Workers, Workers launch checks): https://redcenterstudio.com/products/skill-kits/
- Done for you: https://redcenterstudio.com/services/geo-foundation/
- Contact: hello@redcenterstudio.com

## Keeping this repository in sync

`skills/geo-audit` is a copy of the kit published on redcenterstudio.com. To update it from the site repository:

```
node scripts/sync-from-site.mjs /path/to/site-repo
node scripts/sync-from-site.mjs /path/to/site-repo --check
```

The second form changes nothing and exits 1 if the copies differ.

## Licence

MIT. See [LICENSE](LICENSE).
