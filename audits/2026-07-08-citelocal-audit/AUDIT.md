# CiteLocal Product Audit

Date: 2026-07-08
Surface: local CiteLocal app at http://localhost:4747/
Mode: combined UX, visual design, and accessibility risk audit
Destination: local folder

## Evidence Captured

Screenshot evidence was captured locally during the audit and intentionally left out of source control because `*.png` files are ignored. The public audit keeps the findings and flow notes without linking to local-only image files.

## Flow Steps

1. Workspace loaded with collapsed PDF rail.
   Health: good. The PDF rail remains visible at the far right and the citation workspace stays available. At this narrow viewport, the expanded left brand text was clipped before the PDF drawer was opened, so narrow layouts need careful rail treatment.

2. PDF tools opened from the right rail.
   Health before fix: mixed. The drawer opened in the correct place, but the main workspace became too cramped and the assignment title clipped. This confirmed the user's core ratio concern.

3. PDF tools opened after the layout fix.
   Health: good. The app now compacts the left bibliography rail to 68px on medium screens, keeps the main workspace at 480px in the tested viewport, and keeps the PDF drawer modest at 270px.

4. Folder creation from the bibliography sidebar.
   Health: good. The inline folder form opens, saves a new unit folder, hides again, and updates the folder count.

## Strengths

- The app now has a clear local-first structure: bibliography rail, main workspace, citation detail workspace, notes drawer, PDF tool rail, and tools section.
- The right PDF drawer is discoverable even when collapsed because the vertical PDF tab is always visible.
- Bibliography naming is assignment-friendly: assignment name, unit code, and folder are editable.
- Local export and desktop launch paths are present and verified by automated checks.

## UX Risks

- Medium-width layouts are still doing a lot. The new PDF drawer fix protects the main workspace, but the rail compacting behavior should eventually become an explicit responsive pattern across notes, tools, folders, and detail editing.
- The compact rail uses letter buttons (`L`, `F`, `T`). It works, but icons would scan faster and feel more polished.
- PDF tools are currently UI hooks rather than full processing actions. The interface should make future local processing state very clear: queued, running, complete, failed, and output folder.

## Accessibility Risks

- Screenshots cannot prove full keyboard flow or screen-reader order. The visible controls generally have labels, but the compact letter buttons should use clearer iconography plus accessible names.
- The dark theme appears readable, but contrast should be checked programmatically before release branding is finalized.
- The PDF drawer state should continue to expose `aria-expanded` accurately as the implementation grows.

## Two-Hour Launch Plan

1. Finish current release hardening: keep the right PDF drawer fix, add the audit evidence, and keep `npm run verify` passing.
2. Commit the initial open-source snapshot.
3. Publish to GitHub once account authentication is available.
4. Add a short "first-run" README path: install, run local server, launch desktop helper, open local data folder.
5. Next product pass: replace compact rail letters with icons, tighten medium-width typography, and wire the PDF tool buttons to local processing modules.

## Verification

- `npm run verify` passed after the drawer ratio fix.
- Browser smoke confirmed the PDF drawer stays visible collapsed and expands into the right column without covering the citation workspace.
- Folder creation was smoke-tested in the live browser.
