# CiteLocal Desktop Release Checklist

## Same-day local builds

- Fresh machine setup: `npm install` then `npm run bootstrap`
- Windows dev run: `npm run desktop`
- Windows double-click-style launcher: `launch-citelocal-desktop.ps1`
- Full local readiness check: `npm run verify`
- Release environment check only: `npm run doctor`
- Desktop launch smoke test: `npm run desktop:smoke`
- Windows unpacked smoke build: `npm run pack`
- Windows installer/portable build: `npm run dist:win`
- macOS dev run: `npm run desktop`
- macOS double-click-style launcher: `launch-citelocal-desktop.command`
- macOS dmg/zip build: `npm run dist:mac`

## Current status

- Electron shell starts the local CiteLocal server on a private port.
- Desktop data is written to the OS app-data folder via `CITELOCAL_DATA_DIR`.
- Windows unpacked build has been produced at `dist/win-unpacked/CiteLocal.exe`.
- Windows launch smoke test passed.
- Release doctor checks Node, Electron, Electron Builder, CSL styles, icons, and build scripts.
- Source-control ignore rules are in place for generated `dist/` and `node_modules/`.
- macOS packaging has a vector icon source at `build/icon.svg`.
- First-run desktop launchers are present for Windows and macOS.

## Before public distribution

- Windows: add Authenticode code signing to avoid SmartScreen friction.
- macOS: build on a Mac, then add Developer ID signing and notarization.
- Confirm macOS icon conversion on a Mac during `npm run dist:mac`.
- Decide whether releases ship as installer-only, portable-only, or both.
