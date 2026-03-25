// ============================================================
// AI Opponent — Doctrine + Gunnery Architecture
//
// Two-layer system for naval combat AI:
//   Layer 1 — Commander: picks doctrine (hunt/kill/trade-up/protect-lead/desperation/cleanup)
//   Layer 2 — Gunnery: scores cells and selects optimal salvo
//
// DIFFICULTY TIERS:
//   Easy       — random targeting, pure chaos
//   Medium     — hunt/kill/desperation, soft self-avoidance
//   Hard       — all 6 doctrines, probability density map, tactical trades
//   Impossible — omniscient, greedy salvo optimization, net-swing calculation
//
// Multi-hit aware: different players' ships can share hexes.
// Kill-confirmed teammate guard: only damages teammates to sink enemies.
// ============================================================

export { chooseSalvo, getBotDelay } from './gunnery.js';
export { generatePlacement } from './placement.js';
export { createRNG } from './helpers.js';
