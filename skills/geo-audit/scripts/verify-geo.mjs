#!/usr/bin/env node
// verify-geo.mjs: checks a website for the basics AI assistants and search engines rely on.
// No dependencies. Needs Node 18 or newer.
//
//   node verify-geo.mjs --url https://example.com/
//   node verify-geo.mjs --dir ./public
//   node verify-geo.mjs --dir ./public --page pricing/index.html
//
// Options:
//   --url <url>     Check a live page. robots.txt, llms.txt and sitemap.xml are read from the same origin.
//   --dir <path>    Check a built site on disk. robots.txt, llms.txt and sitemap.xml are read from the top of <path>.
//   --page <file>   With --dir: the HTML file to check, relative to <path>. Default: index.html.
//   --strict        Treat warnings as failures.
//   --json          Print the results as JSON instead of text.
//
// Exit code 0 when nothing failed, 1 when at least one check failed, 2 when the arguments are wrong.
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Crawlers that fetch pages to answer a person's question. Blocking these removes the site from AI answers.
export const SEARCH_BOTS = ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "Claude-SearchBot", "Claude-User"];
// Crawlers that collect training data. Allowing or blocking these is the owner's choice; the choice should be written down.
export const TRAINING_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot"];

// Leftover template text. The marks are case-sensitive so a real "todo list app" description is not flagged.
const PLACEHOLDER_WORDS = /\b(lorem ipsum|your company|your business name|company name here|example\.(com|org|net)|000-?000-?0000|123 main st)/i;
const PLACEHOLDER_MARKS = /\b(TODO|TBD|FIXME|PLACEHOLDER)\b|\{\{[^}]*\}\}/;
const PLACEHOLDER = { test: (s) => PLACEHOLDER_WORDS.test(s) || PLACEHOLDER_MARKS.test(s) };
const REQUIRED_OG = ["og:title", "og:description", "og:url", "og:image"];

// ---------- small HTML helpers (regex based, good enough for well-formed pages) ----------

export function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  return out;
}

const decode = (s) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

export function visibleText(html) {
  return decode(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

// ---------- robots.txt ----------

/** Groups of user-agents with their rules, in file order. */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if ((key === "allow" || key === "disallow") && current) current.rules.push({ type: key, path: value });
    }
  }
  return groups;
}

/** "named" when the bot has its own group, "wildcard" when only * applies, "none" when no group applies. */
export function robotsFor(groups, bot) {
  const own = groups.filter((g) => g.agents.includes(bot.toLowerCase()));
  const star = groups.filter((g) => g.agents.includes("*"));
  const used = own.length ? own : star;
  const rules = used.flatMap((g) => g.rules);
  // The site root is blocked when the longest matching rule for "/" is a Disallow.
  const matching = rules.filter((r) => r.path === "/" || r.path === "/*" || (r.type === "allow" && r.path === ""));
  const blocked = matching.some((r) => r.type === "disallow") && !matching.some((r) => r.type === "allow");
  return { scope: own.length ? "named" : star.length ? "wildcard" : "none", blocked };
}

// ---------- the checks ----------

export function checkRobots(text) {
  const out = [];
  if (text == null) {
    out.push({ level: "fail", area: "robots.txt", message: "robots.txt was not found.", fix: "Add /robots.txt. Start from templates/robots.ai.txt." });
    return out;
  }
  const groups = parseRobots(text);
  for (const bot of SEARCH_BOTS) {
    const r = robotsFor(groups, bot);
    if (r.blocked) out.push({ level: "fail", area: "robots.txt", message: `${bot} is blocked from the whole site (${r.scope === "named" ? "its own rule" : "the * rule"}).`, fix: `Add "User-agent: ${bot}" with "Allow: /" so AI assistants can read the site when someone asks about it.` });
  }
  if (!out.length) out.push({ level: "pass", area: "robots.txt", message: "AI search crawlers can reach the site." });
  const unnamed = [...SEARCH_BOTS, ...TRAINING_BOTS].filter((b) => robotsFor(groups, b).scope !== "named");
  if (unnamed.length) out.push({ level: "warn", area: "robots.txt", message: `No explicit rule for: ${unnamed.join(", ")}.`, fix: "Name each crawler with Allow or Disallow so the choice is deliberate. See templates/robots.ai.txt." });
  else out.push({ level: "pass", area: "robots.txt", message: "Every AI crawler has an explicit rule." });
  if (!/^\s*sitemap\s*:/im.test(text)) out.push({ level: "warn", area: "robots.txt", message: "No Sitemap line.", fix: 'Add "Sitemap: https://your-domain/sitemap.xml".' });
  return out;
}

export function checkLlms(text) {
  const out = [];
  const fail = (line, message, fix) => out.push({ level: "fail", area: "llms.txt", line, message, fix });
  if (text == null) {
    out.push({ level: "warn", area: "llms.txt", message: "llms.txt was not found.", fix: "Optional. If you add one, start from templates/llms.template.txt." });
    return out;
  }
  if (/^\s*<(!doctype|html)/i.test(text)) {
    fail(1, "llms.txt returns an HTML page, not Markdown.", "Serve a plain Markdown file at /llms.txt (the request is probably falling through to a 404 or app page).");
    return out;
  }
  const lines = text.split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first < 0 || !/^# \S/.test(lines[first])) fail(first + 1 || 1, 'The first line is not a "# Title" heading.', "Start the file with one H1: the site or project name.");
  const h1s = lines.map((l, i) => (/^# \S/.test(l) ? i + 1 : 0)).filter(Boolean);
  if (h1s.length > 1) fail(h1s[1], "More than one H1 heading.", "Keep one H1. Use ## for sections.");
  const quote = lines.findIndex((l) => /^> \S/.test(l));
  const firstH2 = lines.findIndex((l) => /^## \S/.test(l));
  if (quote < 0) fail(first + 2, 'No "> summary" blockquote.', "Add a one or two sentence summary as a blockquote straight after the title.");
  else if (firstH2 >= 0 && quote > firstH2) fail(quote + 1, "The summary blockquote comes after the first section.", "Move the summary to just under the title.");
  if (firstH2 < 0) fail(lines.length, 'No "## Section" headings.', "Group links under H2 sections such as ## Docs or ## Products.");
  let links = 0;
  lines.forEach((l, i) => {
    const m = /^\s*[-*]\s*\[([^\]]*)\]\(([^)]*)\)/.exec(l);
    if (!m) return;
    links++;
    if (!m[1].trim()) fail(i + 1, "A link has no name.", "Write links as - [Name](https://...): short description.");
    if (!/^https?:\/\//.test(m[2])) fail(i + 1, `Link is not an absolute URL: ${m[2] || "(empty)"}`, "Use full https:// URLs so the file works wherever it is read.");
    else if (PLACEHOLDER.test(m[2])) fail(i + 1, `Link looks like a placeholder: ${m[2]}`, "Replace it with a real page.");
  });
  if (firstH2 >= 0 && links === 0) fail(firstH2 + 1, "No links in list form.", "Under each section list pages as - [Name](https://...): short description.");
  if (!out.length) out.push({ level: "pass", area: "llms.txt", message: `Structure is valid (${links} links).` });
  return out;
}

/** Every JSON-LD node on the page, flattened out of @graph and arrays. */
export function jsonLdNodes(html) {
  const blocks = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if ((attrs(m[1]).type || "").toLowerCase() !== "application/ld+json") continue;
    const line = lineOf(html, m.index);
    try {
      blocks.push({ line, data: JSON.parse(m[2]) });
    } catch (err) {
      blocks.push({ line, error: String(err.message || err) });
    }
  }
  return blocks;
}

const flatten = (data) => {
  const nodes = [];
  const visit = (v) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      nodes.push(v);
      if (Array.isArray(v["@graph"])) v["@graph"].forEach(visit);
    }
  };
  visit(data);
  return nodes;
};

const typesOf = (node) => [].concat(node["@type"] ?? []).map(String);

function strings(value, path = "", out = []) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out);
  return out;
}

export function checkJsonLd(html) {
  const out = [];
  const blocks = jsonLdNodes(html);
  const fail = (line, message, fix) => out.push({ level: "fail", area: "JSON-LD", line, message, fix });
  if (!blocks.length) {
    fail(undefined, "No JSON-LD structured data on the page.", "Add at least an Organization or WebSite block. See templates/.");
    return out;
  }
  const text = norm(visibleText(html));
  let nodeCount = 0;
  for (const b of blocks) {
    if (b.error) {
      fail(b.line, `JSON-LD does not parse: ${b.error}`, "Fix the JSON. A trailing comma or an unescaped quote is the usual cause.");
      continue;
    }
    const top = [].concat(b.data);
    for (const t of top) {
      const ctx = [].concat(t?.["@context"] ?? []).map((c) => (typeof c === "string" ? c : c?.["@vocab"] || ""));
      if (!ctx.some((c) => /^https?:\/\/schema\.org\/?$/.test(c))) fail(b.line, 'Missing "@context": "https://schema.org".', 'Add "@context": "https://schema.org" at the top of the block.');
    }
    for (const node of flatten(b.data)) {
      const isTop = top.includes(node);
      const inGraph = top.some((t) => Array.isArray(t?.["@graph"]) && t["@graph"].includes(node));
      if ((isTop && !node["@graph"]) || inGraph) {
        nodeCount++;
        if (!typesOf(node).length) fail(b.line, 'A node has no "@type".', "Give every top-level node a schema.org @type.");
      }
      const types = typesOf(node);
      if (types.includes("FAQPage")) {
        for (const q of [].concat(node.mainEntity ?? [])) {
          const name = q?.name;
          if (typeof name !== "string" || !name.trim()) fail(b.line, "An FAQ question has no name.", "Every Question needs name and acceptedAnswer.text.");
          else if (!text.includes(norm(name))) fail(b.line, `FAQ question is in the schema but not on the page: "${name}"`, "Show the question and its answer on the page, or remove it from the schema.");
          if (typeof q?.acceptedAnswer?.text !== "string" || !q.acceptedAnswer.text.trim()) fail(b.line, `FAQ question has no answer text: "${name ?? ""}"`, "Add acceptedAnswer.text.");
        }
      }
      if (node.aggregateRating || types.includes("AggregateRating")) {
        const r = node.aggregateRating || node;
        const value = String(r.ratingValue ?? "");
        if (!value || !text.includes(norm(value))) fail(b.line, "aggregateRating is in the schema but the rating is not shown on the page.", "Only publish ratings that come from real reviews shown on the same page. Otherwise remove aggregateRating.");
      }
      if (types.includes("Offer") && node.price != null && !/^\d+(\.\d{1,2})?$/.test(String(node.price))) fail(b.line, `Offer price is not a plain number: ${node.price}`, 'Use digits only, for example "29.00", and put the currency in priceCurrency.');
      if (types.includes("Offer") && node.price != null && !node.priceCurrency) fail(b.line, "Offer has a price but no priceCurrency.", 'Add priceCurrency, for example "USD".');
    }
    for (const [path, value] of strings(b.data)) {
      if (PLACEHOLDER.test(value)) fail(b.line, `Placeholder value at ${path}: "${value.slice(0, 60)}"`, "Replace it with the real value or remove the property.");
    }
  }
  if (!out.length) out.push({ level: "pass", area: "JSON-LD", message: `${blocks.length} block${blocks.length === 1 ? "" : "s"}, ${nodeCount} node${nodeCount === 1 ? "" : "s"}, all valid and matching the page.` });
  return out;
}

export function checkHead(html, pageUrl) {
  const out = [];
  const head = (/<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html) || [, html])[1];
  const tags = (name) => [...head.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "gi"))].map((m) => ({ a: attrs(m[1]), line: lineOf(html, html.indexOf(m[0])) }));
  const metas = tags("meta");
  const meta = (key) => metas.find((t) => (t.a.property || t.a.name || "").toLowerCase() === key)?.a.content?.trim();

  // Canonical
  const canon = tags("link").filter((t) => (t.a.rel || "").toLowerCase().split(/\s+/).includes("canonical"));
  if (!canon.length) out.push({ level: "fail", area: "canonical", message: 'No <link rel="canonical">.', fix: "Add one canonical link with the page's full https URL." });
  else if (canon.length > 1) out.push({ level: "fail", area: "canonical", line: canon[1].line, message: "More than one canonical link.", fix: "Keep exactly one." });
  else {
    const href = canon[0].a.href || "";
    if (!/^https:\/\//.test(href)) out.push({ level: "fail", area: "canonical", line: canon[0].line, message: `Canonical is not an absolute https URL: ${href || "(empty)"}`, fix: "Use the full address, for example https://your-domain/page/." });
    else if (pageUrl && stripSlash(href) !== stripSlash(pageUrl)) out.push({ level: "warn", area: "canonical", line: canon[0].line, message: `Canonical (${href}) differs from the page address (${pageUrl}).`, fix: "Fine if this page is a deliberate duplicate. Otherwise point the canonical at this page." });
    else out.push({ level: "pass", area: "canonical", message: href });
    const ogUrl = meta("og:url");
    if (ogUrl && /^https:\/\//.test(href) && stripSlash(ogUrl) !== stripSlash(href)) out.push({ level: "fail", area: "Open Graph", message: `og:url (${ogUrl}) does not match the canonical (${href}).`, fix: "Set og:url to the canonical URL." });
  }

  // Open Graph
  const missing = REQUIRED_OG.filter((k) => !meta(k));
  if (missing.length) out.push({ level: "fail", area: "Open Graph", message: `Missing: ${missing.join(", ")}.`, fix: "Add the missing tags. og:image must be an absolute URL." });
  else if (!/^https?:\/\//.test(meta("og:image"))) out.push({ level: "fail", area: "Open Graph", message: `og:image is not an absolute URL: ${meta("og:image")}`, fix: "Use the full https:// address of the image." });
  else out.push({ level: "pass", area: "Open Graph", message: "title, description, url and image are set." });
  if (!meta("og:type")) out.push({ level: "warn", area: "Open Graph", message: "No og:type.", fix: 'Add og:type, usually "website" or "article".' });
  if (!meta("twitter:card")) out.push({ level: "warn", area: "Open Graph", message: "No twitter:card.", fix: 'Add <meta name="twitter:card" content="summary_large_image">.' });

  // Page basics
  const robots = (meta("robots") || "").toLowerCase();
  if (/\bnoindex\b/.test(robots)) out.push({ level: "fail", area: "page", message: "The page is set to noindex.", fix: "Remove noindex if this page should be found." });
  const title = decode((/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head) || [, ""])[1]).trim();
  if (!title) out.push({ level: "fail", area: "page", message: "No <title>.", fix: "Add a title that says what the page is and who it is for." });
  else if (title.length > 60) out.push({ level: "warn", area: "page", message: `Title is ${title.length} characters.`, fix: "Keep it to 60 or fewer so it is not cut off." });
  const desc = meta("description");
  if (!desc) out.push({ level: "fail", area: "page", message: "No meta description.", fix: "Add one or two plain sentences, up to about 155 characters." });
  else if (desc.length > 160) out.push({ level: "warn", area: "page", message: `Meta description is ${desc.length} characters.`, fix: "Keep it to about 155." });
  if (!/<html\b[^>]*\blang\s*=/i.test(html)) out.push({ level: "warn", area: "page", message: "No lang attribute on <html>.", fix: 'Add lang, for example <html lang="en">.' });
  const h1 = (html.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, "").match(/<h1\b/gi) || []).length;
  if (h1 !== 1) out.push({ level: h1 === 0 ? "fail" : "warn", area: "page", message: `The page has ${h1} H1 headings.`, fix: "Use exactly one H1 that states the page's subject." });
  if (!/<main\b|role\s*=\s*["']?main/i.test(html)) out.push({ level: "warn", area: "page", message: "No <main> landmark.", fix: "Wrap the page's main content in <main>." });
  if (!out.some((r) => r.area === "page")) out.push({ level: "pass", area: "page", message: "Title, description, language, one H1 and a main landmark." });
  return out;
}

const stripSlash = (u) => u.replace(/[#?].*$/, "").replace(/\/+$/, "");

export function checkSitemap(text) {
  if (text == null) return [{ level: "warn", area: "sitemap", message: "sitemap.xml was not found.", fix: "Add /sitemap.xml listing every page that should be found, and name it in robots.txt." }];
  if (!/<(urlset|sitemapindex)\b/i.test(text)) return [{ level: "fail", area: "sitemap", message: "sitemap.xml is not a sitemap (no <urlset> or <sitemapindex>).", fix: "Serve a valid XML sitemap at /sitemap.xml." }];
  const n = (text.match(/<loc>/gi) || []).length;
  return [{ level: "pass", area: "sitemap", message: `${n} address${n === 1 ? "" : "es"} listed.` }];
}

export function verify({ html, robots, llms, sitemap, pageUrl }) {
  return [...checkRobots(robots), ...checkLlms(llms), ...checkJsonLd(html), ...checkHead(html, pageUrl), ...checkSitemap(sitemap)];
}

// ---------- loading ----------

async function fetchText(url) {
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "verify-geo/1.0 (+site check)", accept: "text/html,text/plain,*/*" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function readOrNull(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export function parseArgs(argv) {
  const o = { strict: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--strict") o.strict = true;
    else if (a === "--json") o.json = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (["--url", "--dir", "--page"].includes(a)) {
      if (argv[i + 1] == null || argv[i + 1].startsWith("--")) return { error: `${a} needs a value.` };
      o[a.slice(2)] = argv[++i];
    } else return { error: `Unknown option: ${a}` };
  }
  if (o.help) return o;
  if (!o.url === !o.dir) return { error: "Give exactly one of --url or --dir." };
  if (o.page && !o.dir) return { error: "--page only works with --dir." };
  return o;
}

const USAGE = `Usage:
  node verify-geo.mjs --url https://example.com/
  node verify-geo.mjs --dir ./public [--page pricing/index.html]
Options: --strict (warnings fail), --json`;

export async function main(argv) {
  const o = parseArgs(argv);
  if (o.help) return console.log(USAGE), 0;
  if (o.error) return console.error(`${o.error}\n${USAGE}`), 2;

  let input;
  let target;
  if (o.url) {
    let u;
    try {
      u = new URL(/^https?:\/\//.test(o.url) ? o.url : `https://${o.url}`);
    } catch {
      return console.error(`Not a valid URL: ${o.url}`), 2;
    }
    target = u.href;
    const [html, robots, llms, sitemap] = await Promise.all([fetchText(u.href), fetchText(`${u.origin}/robots.txt`), fetchText(`${u.origin}/llms.txt`), fetchText(`${u.origin}/sitemap.xml`)]);
    if (html == null) return console.error(`Could not load ${u.href}`), 1;
    input = { html, robots, llms, sitemap, pageUrl: u.href };
  } else {
    const dir = resolve(o.dir);
    const page = o.page || "index.html";
    target = join(dir, page);
    const [html, robots, llms, sitemap] = await Promise.all([readOrNull(join(dir, page)), readOrNull(join(dir, "robots.txt")), readOrNull(join(dir, "llms.txt")), readOrNull(join(dir, "sitemap.xml"))]);
    if (html == null) return console.error(`Could not read ${target}`), 1;
    input = { html, robots, llms, sitemap };
  }

  const results = verify(input);
  const count = (level) => results.filter((r) => r.level === level).length;
  const failed = count("fail") + (o.strict ? count("warn") : 0);
  if (o.json) {
    console.log(JSON.stringify({ target, ok: failed === 0, fail: count("fail"), warn: count("warn"), pass: count("pass"), results }, null, 2));
  } else {
    console.log(`GEO check: ${target}\n`);
    for (const r of results) {
      const where = r.line ? `${r.area}:${r.line}` : r.area;
      console.log(`${r.level.toUpperCase().padEnd(4)}  ${where.padEnd(14)}  ${r.message}`);
      if (r.fix && r.level !== "pass") console.log(`${" ".repeat(22)}Fix: ${r.fix}`);
    }
    console.log(`\n${count("pass")} passed, ${count("warn")} warning${count("warn") === 1 ? "" : "s"}, ${count("fail")} failed.${o.strict && count("warn") ? " (--strict: warnings count as failures)" : ""}`);
    console.log(failed === 0 ? "PASS" : "FAIL");
  }
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
