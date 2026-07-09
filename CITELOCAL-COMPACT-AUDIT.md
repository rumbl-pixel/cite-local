# CiteLocal Compact Audit

Date: 2026-07-09
Surface: local CiteLocal app at http://localhost:4747/

## Product Intent

CiteLocal is a local-first study toolbox: bibliography capture and citation generation remain the primary workspace, with supporting tools available from the left rail. The app should feel like a personal research cockpit, not a marketing page or generic AI dashboard.

## Current State

- Bibliography workflow: local projects/bibliographies, editable assignment/unit/folder metadata, source capture, manual entry, citation style dropdown, reference/in-text copy, exports, notes linked to saved sources.
- Tools workflow: Word Count and PDF Tools live under the left Tools section. Tool modes hide the Current Assignment header so the workspace does not carry irrelevant bibliography context.
- Layout direction: dark Reshaped-inspired slate system, dotted canvas background, compact tool buttons, tile/card surfaces, tokenized spacing, responsive grids, and modest side drawers.
- Source list: now uses wrapped responsive cards so source title/meta/status can sit side by side on wider screens and wrap cleanly on narrow screens.
- PDF Tools: PDF actions belong only to PDF Tools. They must not appear in Citation Workspace or Word Count.
- Tool persistence: Word Count draft text persists locally. PDF selected file remains available while switching tools during the session; after reload, only filename/status can be restored because browsers do not allow silent file persistence.

## Latest Decisions

- No PDF Actions button in Citation Workspace.
- Keep PDF action buttons in a muted Planned section until actual local PDF processing exists.
- Keep all UI dark mode.
- New Folder is an icon button using the existing inline SVG approach.
- Word Count and PDF Tools buttons stay compact in the left rail.
- Do not split `static/app.js` yet; current size is acceptable while the product shape is still moving.
- Do not introduce a framework or light theme for this pass.

## Reshaped Design Rules Applied

- View-style spacing: use token-sized gaps and padding, avoid cramped clusters.
- Grid-style layout: use `minmax(0, 1fr)`, `auto-fit`, and bounded side columns instead of fixed cramped rows.
- Resizable/ratio behavior: side panels should change grid ratios rather than overlaying the main workspace on desktop.
- Overlay behavior: notes can use a drawer/overlay pattern, but PDF actions should remain scoped to PDF Tools only.
- Icon behavior: action icons should inherit `currentColor`, be wrapped in buttons, and have accessible labels.

## UX Risks To Keep Watching

- The PDF feature is still honest-but-planned; users may expect real processing from the visible action list.
- Mobile needs periodic visual QA because side drawers and dense source cards can reflow sharply under 760px.
- Notes and Word Count now preserve work across tool switching, but selected PDF file contents cannot persist across browser reload without a user file picker or future File System Access API work.
- Export controls are intentionally demoted, but still need a final pass once real user document workflows are clearer.

## QA Checklist

- App loads at http://localhost:4747/ with no framework overlay or console errors.
- Citation Workspace shows Notes only; no PDF actions or PDF action trigger exists there.
- Left rail Tools opens Word Count and PDF Tools without deleting drafts from the other tool.
- PDF Tools drawer expands/shrinks within PDF Tools and does not cover Citation Workspace.
- Source cards wrap without clipping at desktop, mid-width, and mobile widths.
- Assignment header is visible for bibliography work and hidden for Word Count/PDF Tools.
- `npm test` and `npm run verify` pass before push.

## Files Most Relevant To Review

- `static/index.html`: app structure, tool panels, PDF drawer, notes drawer.
- `static/app.js`: tool mode state, drawer state, local draft persistence, library behavior.
- `static/theme-workshop.css`: Reshaped-inspired visual system, responsive grids, drawer ratios.
- `test.js`: regression checks for app shell, tool placement, word count, citation styles, exports, and layout guardrails.

## Recommendation

Next pass should be a focused functional QA pass, not another visual redesign. Confirm the core daily loop: create bibliography, add source, edit metadata, copy citation, add linked note, use Word Count, switch to PDF Tools, switch back, export, reload, and confirm local state is intact.
