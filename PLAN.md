# PLAN.md — "CiteLocal": local citation workflow app

**Audience:** the implementing agent. Build exactly this, in order. No accounts, no ads, no limits, fully offline after first setup.

## 0. Product Shape And Reference Workflow

Feature inventory from citethisforme.com:
- **Auto-cite lookup** by URL, DOI, ISBN, or title/author search; results list → pick one → citation.
- **Manual entry forms** per source type (~30-50 types: book, ebook, book chapter, journal, magazine, newspaper, website, blog, online image/video, podcast, broadcast, DVD, music, dissertation, conference proceedings, court case, patent, religious text, software, government publication...).
- **Styles:** APA, MLA, Chicago, Harvard, Vancouver, IEEE, AMA, ASA + "7,000 more" (this is just the CSL repo).
- **Output:** in-text citation + full reference, per source; assembled alphabetized bibliography.
- **Bibliography management:** multiple named projects, saved sources, edit/delete/reorder.
- **Export:** copy to clipboard (Word-pasteable), download.
- **Their paywall/limits (the things we're eliminating):** free = Harvard only, citations vanish after 7 days, ads everywhere. Premium £6.99/mo.

We implement the core citation workflow. We do NOT implement grammar checking or plagiarism detection (separate products, out of scope — note this in the README).

## 1. Architecture (the lazy one — do not add layers)

Single small Node app. One process, one folder.

```
cite-local/
  server.js        # Express (or plain node:http): serves static/ + 3 API routes
  static/index.html  # the entire UI — one page, vanilla JS, no framework
  static/app.js
  static/style.css
  styles/          # git-cloned CSL styles repo (~10k .csl files)
  locales/         # git-cloned CSL locales repo
  package.json     # deps: express, @citation-js/core + plugins (see below)
  test.js          # one assert-based self-check
```

- **Why a server at all:** URL scraping and some metadata APIs are blocked by CORS from a raw `file://` page. A ~100-line Express server is the minimum. Everything else runs client-side.
- **No database.** Bibliographies persist as JSON in `localStorage` (mirrored to a `data/bibliographies.json` file via one save endpoint if you want cross-browser persistence — optional, do localStorage first).
- **No build step.** No React, no bundler. `<script src>` tags.

## 2. The engine: citation-js (this is 80% of the product)

`npm i @citation-js/core @citation-js/plugin-csl @citation-js/plugin-doi @citation-js/plugin-isbn @citation-js/plugin-bibtex`

- `@citation-js/plugin-csl` wraps **citeproc-js**, the reference CSL processor — the same rendering engine class Zotero/Mendeley use. It takes CSL-JSON + a `.csl` style file + locale and emits formatted bibliography entries AND in-text citations. Do not hand-write any style logic. Ever. Not even "just APA".
- `@citation-js/plugin-doi` resolves DOIs via doi.org content negotiation → CSL-JSON directly.
- `@citation-js/plugin-isbn` resolves ISBNs (Google Books / OpenLibrary under the hood).
- `@citation-js/plugin-bibtex` gives free BibTeX import/export.

Clone once at setup:
- `git clone --depth 1 https://github.com/citation-style-language/styles` -> 10,000+ styles.
- `git clone --depth 1 https://github.com/citation-style-language/locales`

Build a `styles-index.json` at startup (or setup script): `[{id, title}]` parsed from each `.csl` file's `<title>`/filename. The UI style picker is a `<datalist>`/filtered search over this index. Ship APA/MLA/Chicago/Harvard/Vancouver/IEEE/AMA as pinned favorites.

## 3. Server API (3 routes + static)

1. `GET /api/styles?q=` → search styles-index.json, return top 50.
2. `GET /api/style/:id` → returns raw `.csl` XML (client feeds it to citation-js).
3. `GET /api/scrape?url=` → **the URL auto-cite.** Fetch the page server-side, extract metadata in this priority order, return CSL-JSON:
   1. citation_* meta tags (Google Scholar tags: `citation_title`, `citation_author`, `citation_publication_date`, `citation_journal_title`, `citation_doi` — if DOI found, just resolve the DOI instead, it's better data)
   2. JSON-LD `application/ld+json` (Article/Book/WebPage schema)
   3. OpenGraph (`og:title`, `og:site_name`, `article:published_time`, `article:author`)
   4. Fallback: `<title>`, `<meta name=author>`, domain as container-title, today as accessed date.
   Use `cheerio` for parsing (fine to add — it's the standard, and regex-parsing HTML is the bug farm).

DOI/ISBN/title lookups run **client-side**:
- DOI → citation-js plugin (doi.org, CORS-friendly).
- ISBN → citation-js plugin / OpenLibrary `https://openlibrary.org/isbn/{isbn}.json` (CORS-friendly).
- Title/author search → CrossRef `https://api.crossref.org/works?query.bibliographic=...&rows=10` (CORS-friendly, no key; set a `mailto` param per their etiquette). Show top 10 results, user picks one, its `message.items[n]` is already CSL-JSON-shaped (map `title[0]`→`title`).

No API keys anywhere. All three services are free and unlimited-for-polite-use.

## 4. UI (one page, three panels)

Use the familiar citation workflow, not another product's pixels:

1. **Top bar:** bibliography selector (named projects, + new, rename, delete), style search box (datalist over /api/styles, remembers last-used per project).
2. **Add-source panel:**
   - One omnibox: paste URL / DOI / ISBN / or type a title. Detect which with 4 regexes (`^https?://`, `^10\.\d{4,}/`, ISBN-10/13 digits, else title-search). Route accordingly, show result(s) as cards, "Add" button per card.
   - "Cite manually" → source-type dropdown → form. **Do not build 50 bespoke forms.** Build ONE form generated from a `SOURCE_TYPES` map: `{webpage: {cslType:'webpage', fields:[title, author+, container-title, URL, issued, accessed]}, book: {...}, article-journal: {...}, ...}`. Cover the ~15 types that matter (book, chapter, journal article, magazine, newspaper, website, blog post, online video, podcast, film, thesis, conference paper, report, software, interview); everything else falls to a "generic" type exposing all common CSL fields. That IS full coverage — CSL types are the real taxonomy, their "50 source types" is marketing for the same ~20 CSL types.
   - Author fields: family/given pairs, "+ add author", plus a "corporate author" literal toggle.
3. **Bibliography panel:** live-rendered formatted list (citation-js `format('bibliography')`), auto-sorted per style. Each entry: in-text citation shown alongside (`format('citation')`), edit (reopens the manual form pre-filled with its CSL-JSON), delete, copy-single.
4. **Export bar:** Copy All (write `text/html` + `text/plain` to clipboard via `navigator.clipboard.write` — HTML flavor makes Word/Docs paste keep hanging indents and italics), Download .html, Download .rtf (citeproc HTML→RTF is a small mapping; or use citation-js RTF output if available), Export BibTeX, Export CSL-JSON (the real backup format), Import CSL-JSON/BibTeX.

Persistence: every mutation → `localStorage.setItem('citelocal', JSON.stringify(projects))`. Projects = `{name, styleId, sources: CSL-JSON[]}[]`. That's the entire data model. **Store CSL-JSON as the source of truth, never formatted strings** — restyle = re-render.

## 5. Build order (each step ends runnable)

1. Skeleton: server serving index.html; citation-js rendering one hardcoded book in APA. *Proves the engine.*
2. Styles: clone repos, index, style search + switch. *Proves the 10k-styles claim.*
3. Manual entry (the SOURCE_TYPES-driven form) + localStorage + bibliography panel with edit/delete. *App is already usable.*
4. Auto-cite: DOI, ISBN, CrossRef title search (client-side), then the /api/scrape URL route. *Feature parity on lookup.*
5. Projects (multiple bibliographies) + exports (clipboard HTML, BibTeX, CSL-JSON, .html/.rtf download).
6. `test.js`: assert DOI `10.1038/nature12373` renders non-empty APA + MLA strings, assert scrape of a fixture HTML file extracts title/author, assert a manual book round-trips through save/load/render. One file, `node test.js`, exits nonzero on failure.

## 6. Explicitly skipped (say so in README)

- Grammar/plagiarism checker — different product, use LanguageTool locally if ever wanted.
- Accounts/sync — it's local; the CSL-JSON export is the sync.
- Word plugin / browser extension — the clipboard HTML export covers the paste-into-Word case. A bookmarklet that POSTs `location.href` to /api/scrape is a 5-line follow-up if wanted.
- Perfect scraping of paywalled/JS-rendered pages - meta-tag extraction covers the realistic majority, and users can edit the pre-filled form for the rest.

## 7. Ceilings to mark in code

- `// ponytail: URL scraper is static-HTML only; add playwright fetch if JS-rendered pages matter`
- `// ponytail: localStorage cap ~5MB ≈ thousands of sources; move to data/*.json files if hit`
- `// ponytail: styles index built by filename+title only; add field-based search if 50-result search feels bad`
