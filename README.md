# Study Toolbelt

A local study workspace for capturing sources, formatting citations, notes, and assignment utilities.
No accounts, no ads, no 7-day expiry, no subscription. Runs on your machine.

## What it does

- **Local library app layout**: project rail, source list, citation workspace,
  export controls, and a notepad per bibliography.
- **Auto-cite** by pasting a URL, DOI, or ISBN — or type a title to search (CrossRef).
- **Manual entry** for 15 source types (website, journal, book, chapter, thesis,
  film, software, …); an "Other/generic" type exposes every common field.
- **10,852 citation styles** from the official CSL style repository:
  APA, MLA, Chicago, Harvard, Vancouver, IEEE, AMA, and thousands more. The
  style picker lets you choose from the bundled CSL styles.
- **Live bibliography**: formatted reference + in-text citation per source,
  auto-restyled when you switch styles. Edit / delete / copy each entry.
- **Multiple named bibliographies** (projects), saved locally.
- **Notepad** per bibliography for assignment notes, source checks, page
  reminders, and rough quotes.
- **Export**: Copy All (pastes into Word/Docs with italics + hanging indents),
  download .html, BibTeX, or CSL-JSON. Import CSL-JSON or BibTeX.

Data is saved to `data/citelocal-library.json` as CSL-JSON plus local notes, with
browser localStorage as a fallback. The CSL-JSON export is your portable backup /
sync file.

## Setup (once)

```
npm install
npm run bootstrap      # fetches CSL styles if needed and builds styles-index.json
npm run verify         # runs tests, release doctor, and desktop smoke test
```

## Run

```
npm start              # http://localhost:4747
```

Open http://localhost:4747 in any browser.

## Run as a desktop app on Windows or Mac

```
npm run desktop
```

The desktop shell opens Study Toolbelt in its own local app window. In desktop mode,
the library is stored in your operating system's app-data folder instead of the
project folder, so it is safe for normal local use on both Windows and macOS.

First-run launch helpers are included for people who do not want to type npm
commands each time:

- Windows: right-click `launch-citelocal-desktop.ps1` and run with PowerShell.
- macOS: run `chmod +x launch-citelocal-desktop.command` once, then open it.

Both launchers install dependencies if needed, run the local CSL bootstrap, and
then open the Study Toolbelt desktop window.

## Package desktop builds

```
npm run dist:win       # build Windows installer + portable app on Windows
npm run dist:mac       # build macOS dmg + zip on macOS
npm run pack           # unpacked app folder for quick local smoke tests
```

Windows builds should be produced on Windows. macOS builds should be produced on
a Mac, especially when signing/notarization is added later.

After a Windows build, the portable app is written to `dist/Study Toolbelt 1.0.0.exe`
and the unpacked app is available at `dist/win-unpacked/Study Toolbelt.exe`.

## Publish to GitHub

The repository is ready to publish as a public open-source project. Sign in to
GitHub CLI once, then run the helper:

```
gh auth login
powershell -ExecutionPolicy Bypass -File scripts/publish-github.ps1
```

By default this creates a public `cite-local` repository under the GitHub account
you authenticated with and pushes the `main` branch.

## License

MIT. Study Toolbelt is set up as a free public project that people can use, fork,
modify, and share.

## Test

```
node test.js           # offline self-check of extraction + formatting
```

## How it works

- `server.js` — Express. Serves the UI and does citation formatting, DOI/ISBN/
  title lookups, URL metadata scraping, and BibTeX import/export via
  [citation-js](https://citation.js.org) (which wraps citeproc-js, the same CSL
  engine Zotero uses). No API keys — DOI (doi.org), ISBN (OpenLibrary), and title
  search (CrossRef) are all free and keyless.
- `static/` — one HTML page + vanilla JS. No framework, no build step.

## Accuracy — will it match my curriculum's standard?

The formatting is done by **citeproc-js with the official CSL style files** — the
same engine and the same style definitions used by major reference managers
use. So for a given style the output follows that style's real spec. Two things
are on you, not the engine:

1. **Select the exact style your course requires.** "APA" in the repo is APA
   7th edition; "MLA" is 9th; Chicago has author-date *and* notes variants;
   "Harvard" is not one standard — there are dozens of school-specific Harvard
   styles. Use the style picker to choose the precise one (e.g. your
   university's name). Wrong-variant selection is the #1 cause of "wrong"
   citations.
2. **Sanity-check auto-imported data.** DOI/CrossRef lookups are excellent;
   ISBN is good; URL scraping is best-effort (a page with poor metadata yields a
   rough guess). Always glance at an auto-filled source and fix it in **Edit** —
   garbage in, garbage out applies to every citation tool, including the paid ones.

What the engine handles correctly (verified): reference-list ordering,
same-author-same-year disambiguation (2013a / 2013b) in both the reference and
the in-text citation, and distinct numbering for numbered styles (IEEE [1]/[2],
Vancouver). What it does not do: insert page-number locators into the in-text
preview (`(Smith, 2013, p. 42)` — you add the locator when writing), and Chicago
*notes* / ibid. sequencing that depends on order within your actual document.

## Not included (on purpose)

- **Grammar / plagiarism checker** — there is no local Similarity Checker in
  this app.
- **Word/Docs live plugin** — the "Copy All" HTML export covers pasting into a
  document. If you write in Word a lot, Zotero's plugin is better; see
  `ZOTERO-QUICKSTART.md`.
- **JS-rendered page scraping** — the URL scraper reads static HTML meta tags
  (covers most sites). For a page it can't read, the manual form is pre-filled
  with whatever it found; you fix the rest.
