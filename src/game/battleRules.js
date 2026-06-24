const STAT_ALIASES = {
  power: "power",
  speed: "speed",
  intelligence: "intelligence",
  defence: "defence",
  defense: "defence",
  luck: "luck",
};

const STAT_PATTERN = "(Power|Speed|Intelligence|Defence|Defense|Luck)";

export function normalizeStatKey(statName) {
  return STAT_ALIASES[String(statName || "").toLowerCase()] || null;
}

export function getAbilityBoosts(card) {
  if (card?.abilityBoosts) return card.abilityBoosts;
  if (card?.ability_boosts) return card.ability_boosts;

  const description = card?.ability?.description || card?.ability_description || "";
  const boosts = {};
  const addBoost = (statName, amount) => {
    const key = normalizeStatKey(statName);
    const value = Number(amount) || 0;
    if (!key || value <= 0) return;
    boosts[key] = (boosts[key] || 0) + value;
  };

  for (const match of description.matchAll(new RegExp(`\\+(\\d+)\\s+${STAT_PATTERN}`, "gi"))) {
    addBoost(match[2], match[1]);
  }

  for (const match of description.matchAll(new RegExp(`${STAT_PATTERN}(?:\\s+by)?\\s+\\+(\\d+)`, "gi"))) {
    addBoost(match[1], match[2]);
  }

  return boosts;
}

export function getAbilityBoost(card, statName) {
  const key = normalizeStatKey(statName);
  if (!key) return 0;
  return Number(getAbilityBoosts(card)?.[key] || 0);
}

export function getBaseStatValue(card, statName) {
  const key = normalizeStatKey(statName);
  if (!card || !card.stats || !key) return 0;
  return Number(card.stats[key] ?? 0);
}

export function getEffectiveStatValue(card, statName) {
  return getBaseStatValue(card, statName) + getAbilityBoost(card, statName);
}

export function resolveStatContest(playerCard, opponentCard, statName) {
  const playerBase = getBaseStatValue(playerCard, statName);
  const opponentBase = getBaseStatValue(opponentCard, statName);
  const playerBoost = getAbilityBoost(playerCard, statName);
  const opponentBoost = getAbilityBoost(opponentCard, statName);
  const playerValue = playerBase + playerBoost;
  const opponentValue = opponentBase + opponentBoost;

  return {
    selectedStat: normalizeStatKey(statName),
    playerBase,
    playerBoost,
    playerValue,
    opponentBase,
    opponentBoost,
    opponentValue,
    winner: playerValue > opponentValue ? "player" : playerValue < opponentValue ? "opponent" : "draw",
  };
}

export function isPrestigeRarity(card) {
  return ["legendary", "mythic", "mystic"].includes(String(card?.rarity || "").toLowerCase());
}
