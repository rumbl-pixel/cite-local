# CiteLocal Workshop Theme Design

Date: 2026-07-08

## Brief

Revamp CiteLocal aesthetically so it feels like Jeremy's local academic toolbox, not a generic AI or SaaS dashboard. This pass is aesthetic-only: no feature changes, no workflow changes, no storage changes, and no React migration.

## Design Reference

Use Reshaped as the design-system reference for token discipline, accessible controls, semantic surfaces, restrained density, and product-grade component proportions. Because CiteLocal is currently vanilla HTML/CSS/JS, this pass applies a Reshaped-inspired token layer instead of importing React components.

## Selected Direction

**Workshop Desk**

Dark, tactile, and focused. The UI should feel like a personal citation workbench:

- Deep graphite page and rail surfaces.
- Slightly raised work panels with subtle inset highlights.
- Blue primary actions for capture and creation.
- Brass/gold utility accents for active work areas and citation actions.
- Compact, predictable controls that support repeated academic work.
- No decorative hero layout, no card-heavy marketing composition, no AI-gloss gradients.

## Scope

In scope:

- Add a scoped `theme-workshop.css` layer.
- Add semantic theme tokens using a Reshaped-style `--rs-*` naming layer.
- Apply the theme through a body class.
- Tighten visual hierarchy, focus states, active states, and drawer surfaces.
- Keep existing app behavior intact.

Out of scope:

- React migration.
- Adding Reshaped runtime dependencies.
- Reworking app logic or data shape.
- New features.
- Light theme.

## Verification

- `npm run verify` must pass.
- Browser QA should confirm the theme loads, desktop layout does not horizontally overflow, notes/PDF drawers still resize rather than overlay, mobile layout stays readable, and console warnings/errors are absent.
