# Changelog

## [0.5.0] - 2026-03-22

### Changed
- Changelog page now renders from CHANGELOG.md at runtime — single source of truth, no more hardcoded HTML

## [0.4.2] - 2026-03-22

### Fixed
- Friendly fire reports were wrong when multiple bots shared a name — Bot B attacking Bot A showed as "FRIENDLY FIRE" because the shot log looked up shooters by name instead of ID

## [0.4.1] - 2026-03-22

### Fixed
- Render deployment broken since v0.3.0 — Vite config used a relative path for package.json that resolved outside the repo during build

## [0.4.0] - 2026-03-22

### Changed
- **Unified single grid** — your ships and all shot results on one interactive ocean instead of two separate grids
- You can now see your own ships while selecting targets, making friendly fire risk visible and deliberate
- Simplified cell colors: red = enemy hit, orange = self-hit (friendly fire), dark red = enemy hit your ship
- Removed fleet/target tab toggle on mobile (no longer needed)

## [0.3.0] - 2026-03-22

### Added
- Changelog page accessible from the lobby footer
- Version number moved from subtitle to footer with changelog link

## [0.2.1] - 2026-03-22

### Fixed
- Enemy hits on your ships no longer show as "friendly fire" in the shot log — only self-inflicted hits use the orange FF label

## [0.2.0] - 2026-03-22

### Added
- Game-over stats with per-player table: shots fired, hits landed, accuracy %, ships sunk, friendly fire count
- Auto-generated highlights: Sharpshooter (highest accuracy), Most Destructive (most ships sunk), Friendly Fire Champion, First Blood

## [0.1.0] - 2026-03-21

### Added
- Initial playable beta
- 2-4 player shared-ocean Battleship with private join codes
- AI opponents with 4 difficulty tiers (Easy, Medium, Hard, Impossible)
- Ship placement: click-to-place, rotate, randomize button
- Turn timer (30s/60s/off, host-configurable)
- Text chat for all players
- 60-second reconnection with event buffering
- Rematch with consent (bots auto-accept, declined players go to new lobby)
- Light/dark mode toggle with localStorage persistence
- Mobile responsive layout
- Deployed on Render.com
