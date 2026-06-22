function formatStatName(statName) {
  return statName.charAt(0).toUpperCase() + statName.slice(1);
}

function getAbilityVisualClass(card) {
  const abilityText = `${card.ability.name} ${card.ability.description} ${card.element}`.toLowerCase();

  if (abilityText.includes("shield") || abilityText.includes("guard") || abilityText.includes("bulwark")) {
    return "ability-shield";
  }

  if (abilityText.includes("dash") || abilityText.includes("rush") || abilityText.includes("pounce") || abilityText.includes("step")) {
    return "ability-speed";
  }

  if (abilityText.includes("bloom") || abilityText.includes("petal") || abilityText.includes("vine")) {
    return "ability-bloom";
  }

  if (abilityText.includes("comet") || abilityText.includes("crash")) {
    return "ability-comet";
  }

  if (abilityText.includes("star") || abilityText.includes("cosmic") || abilityText.includes("halo") || abilityText.includes("galaxy")) {
    return "ability-cosmic";
  }

  return "ability-neon";
}

export function renderCardBack(card, isPlayerCard = false, selectedStat = null) {
  const abilityClass = getAbilityVisualClass(card);
  const statRows = Object.entries(card.stats)
    .map(([statName, value]) => {
      const isSelected = selectedStat === statName;

      return `
        <button 
          class="stat-row ${isSelected ? "selected-stat" : ""}" 
          data-stat="${statName}"
          ${isPlayerCard ? "" : "disabled"}
        >
          <div class="stat-topline">
            <span>${formatStatName(statName)}</span>
            <strong>${value}/100</strong>
          </div>

          <div class="stat-track">
            <div class="stat-fill" style="width: ${value}%"></div>
          </div>
        </button>
      `;
    })
    .join("");

  return `
    <section class="card-face card-back ${card.rarity.toLowerCase()}">
      <div class="back-glow"></div>

      <div class="back-header">
        <span>${card.year}</span>
        <strong>${card.pack}</strong>
      </div>

      <div class="back-title">
        <p>${card.rarity}</p>
        <h2>${card.name}</h2>
      </div>

      <div class="element-pill">
        ${card.element}
      </div>

      <div class="stats-panel">
        ${statRows}
      </div>

      <button class="ability-panel ${abilityClass}" type="button" aria-label="${card.ability.name}: ${card.ability.description}">
        <span>Special Ability</span>
        <h3>${card.ability.name}</h3>
        <p>${card.ability.description}</p>

        <div class="ability-holo" aria-hidden="true">
          <div class="ability-core"></div>
          <div class="ability-ring ability-ring-one"></div>
          <div class="ability-ring ability-ring-two"></div>
          <div class="ability-burst ability-burst-one"></div>
          <div class="ability-burst ability-burst-two"></div>
          <div class="ability-wave"></div>
        </div>
      </button>

      <div class="coin-stamp">🐾</div>
    </section>
  `;
}

export function renderBattleCard(card, options = {}) {
  const {
    showStats = false,
    isPlayerCard = false,
    selectedStat = null,
    label = "Card",
  } = options;
  const shellClass = isPlayerCard ? "player-card-shell" : "computer-card-shell";

  if (!card) {
    return `
      <article class="battle-card-shell ${shellClass}">
        <p class="card-label">${label}</p>
        <div class="empty-card">
          <p>No card loaded</p>
        </div>
      </article>
    `;
  }

  return `
    <article class="battle-card-shell ${shellClass}">
      <p class="card-label">${label}</p>

      <div class="pup-card ${showStats ? "is-flipped" : ""}">
        <div class="pup-card-inner">
          
          <section class="card-face card-front">
            <img src="${card.frontImage}" alt="${card.name}" onerror="this.style.display='none'; this.parentElement.classList.add('art-missing');" />
            <div class="card-art-fallback">
              <span>${card.rarity}</span>
              <strong>${card.name}</strong>
              <small>${card.pack}</small>
            </div>
          </section>

          ${renderCardBack(card, isPlayerCard, selectedStat)}

        </div>
      </div>
    </article>
  `;
}

export function renderMysteryCard() {
  return `
    <article class="battle-card-shell computer-card-shell">
      <p class="card-label">Computer Card</p>

      <div class="pup-card mystery-card">
        <div class="mystery-inner">
          <div class="mystery-glow"></div>
          <p>?</p>
          <span>Choose a stat to reveal</span>
        </div>
      </div>
    </article>
  `;
}
