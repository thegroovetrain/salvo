// Pre-audited: max adjective (9) + space (1) + max noun (9) = 19 <= 20
const ADJECTIVES = [
  'Swift', 'Bold', 'Silent', 'Iron', 'Crimson',
  'Brave', 'Shadow', 'Storm', 'Rusty', 'Golden',
  'Rogue', 'Salty', 'Phantom', 'Fierce', 'Neon',
  'Ashen', 'Daring', 'Copper', 'Wicked',
];

const NOUNS = [
  'Torpedo', 'Kraken', 'Anchor', 'Corsair', 'Falcon',
  'Marlin', 'Cannon', 'Voyager', 'Riptide', 'Serpent',
  'Badger', 'Cutlass', 'Frigate', 'Osprey', 'Trident',
  'Sabre', 'Reef', 'Dagger', 'Tempest',
];

export function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}
