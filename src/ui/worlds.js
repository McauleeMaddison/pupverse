export const WORLDS = {
  nebula: { name: 'Bloom Nebula', subtitle: 'The celestial gardens', icon: '✦', color: '#c698ff', sky: '#100a28', accent: '#ffafdc' },
  coast: { name: 'Crypto Coast', subtitle: 'Where the tide turns', icon: '◌', color: '#65f6db', sky: '#041e28', accent: '#ffd38b' },
  cyber: { name: 'Cyber Grid', subtitle: 'Enter the neon frontier', icon: '△', color: '#71bdff', sky: '#060d24', accent: '#ff64cb' },
};
export const RARITY_FX = {
  common: { color: '#b7cbdc', intensity: 1, label: 'New discovery' },
  uncommon: { color: '#6cecb0', intensity: 1, label: 'Uncommon discovery' },
  rare: { color: '#69bdff', intensity: 2, label: 'Rare signature unlocked' },
  epic: { color: '#c593ff', intensity: 3, label: 'Epic energy awakened' },
  legendary: { color: '#ffd384', intensity: 4, label: 'A legend has arrived' },
  mythic: { color: '#ff8bc9', intensity: 5, label: 'Beyond the impossible' },
  mystic: { color: '#acfff0', intensity: 5, label: 'A cosmic anomaly' },
};
export function rarityEffect(rarity) { return RARITY_FX[String(rarity).toLowerCase()] || RARITY_FX.common; }
export function readVisualSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('pupverse-visuals') || '{}');
    return { world: WORLDS[saved.world] ? saved.world : 'nebula', quality: ['auto', 'eco', 'high'].includes(saved.quality) ? saved.quality : 'auto' };
  } catch { return { world: 'nebula', quality: 'auto' }; }
}
