import "./style.css";
import { CARD_STATS, SHOWCASE_CARD_IDS } from "./app/constants.js";
import { cards } from "./data/cards.js";
import { packs } from "./data/packs.js";
import {
  gameState,
  startComputerBattle,
  chooseBattleStat,
  resetGameStats,
  startPackOpening,
  finishPackOpening,
  getFilteredCollectionCards,
  getCollectionProgress,
  setCollectionFilter,
  addDevCoins,
  getStatValue,
  openArenaLeague,
  startArenaQueue,
  createFriendRoom,
  joinFriendRoom,
  cancelArenaQueue,
  confirmArenaMatch,
  chooseOnlineStat,
  advanceArenaRound,
  sendQuickReaction,
  getRankTier,
  getNextRankTarget,
  getRankProgress,
  hydrateCloudProgress,
  useLocalProgress,
} from "./game/state.js";
import { startAnimatedBackground } from "./ui/animatedBackground.js";
import { renderCardImage, setupImageFallbacks } from "./ui/cardImages.js";
import { getAbilityBoost, getEffectiveStatValue, isPrestigeRarity } from "./game/battleRules.js";
import { escapeHtml, titleCase } from "./utils/format.js";
import {
  initializeArenaBackend,
  signInAsGuest,
  upgradeGuestAccount,
  linkGuestProvider,
  signUp as backendSignUp,
  signIn as backendSignIn,
  signOut as backendSignOut,
  loadPlayerData,
  requestMatch,
  cancelMatchmaking as cancelBackendMatchmaking,
  subscribeToQueue,
  maintainQueue,
  createRemoteFriendRoom,
  joinRemoteFriendRoom,
  subscribeToFriendRoom,
  loadRemoteMatch,
  resolveRemoteRound,
  forfeitRemoteMatch,
  subscribeToMatch,
  removeArenaSubscriptions,
  reportRemotePlayer,
  blockRemotePlayer,
  openRemotePack,
  isSupabaseConfigured,
} from "./services/arenaBackend.js";

const app = document.querySelector("#app");
if (!app) throw new Error("PupVerse could not find the #app element.");

const stats = CARD_STATS;

let selectedVaultCardId = null;
let vaultCardFlipped = false;
let packTimer = null;
let matchmakingTimer = null;
let subscribedMatchId = null;
let packOverlay = null;
let revealedPackCards = 0;
let packOpeningRequestInFlight = false;

const backend = {
  configured: isSupabaseConfigured,
  session: null,
  profile: null,
  decks: [],
  leaderboard: [],
  remoteMatch: null,
  presence: {},
  authMode: "signin",
  upgradingGuest: false,
  message: "",
  error: "",
};

function activeDeck() {
  return backend.decks.find((deck) => deck.active) || backend.decks[0] || null;
}

async function refreshPlayerData() {
  const userId = backend.session?.user?.id;
  if (!userId) return;
  const result = await loadPlayerData(userId);
  backend.profile = result.profile;
  backend.decks = result.decks;
  backend.leaderboard = result.leaderboard;
  hydrateCloudProgress(result.profile, result.playerCards, result.packOpenings);
}

async function handleSession(session) {
  backend.session = session;
  backend.error = "";
  if (session) {
    try {
      await refreshPlayerData();
    } catch (error) {
      backend.error = error.message;
    }
  } else {
    backend.profile = null;
    backend.decks = [];
    backend.remoteMatch = null;
    useLocalProgress();
  }
  renderApp();
}

async function bootstrapBackend() {
  if (!backend.configured) return;

  try {
    const { session } = await initializeArenaBackend(handleSession);

    // Do not automatically create an anonymous account.
    // Public players must deliberately create or sign into an account.
    await handleSession(session);
  } catch (error) {
    backend.error = error.message;
    renderApp();
  }
}

function renderBrand() {
  return `<button class="pvx-brand" data-action="go-home" aria-label="PupVerse home"><span class="pvx-brand-gem"><i>PV</i></span><span><b>PUP<span>VERSE</span></b><small>Collect · Battle · Conquer</small></span></button>`;
}

function renderShell(content, active = gameState.mode) {
  const coins = backend.profile?.coins ?? gameState.coins;
  const avatar = escapeHtml(backend.profile?.avatar || "MP");
  const username = escapeHtml(backend.profile?.username || "MADDYPUP");
  const isGuest = Boolean(backend.session?.user?.is_anonymous);
  const hasSession = Boolean(backend.session?.user);

  return `
    <section class="pvx-shell">
      <header class="pvx-topbar">
        ${renderBrand()}

        <nav class="pvx-nav" aria-label="Primary navigation">
          <button class="${active === "home" ? "active" : ""}" data-action="go-home">
            <span>⌂</span><b>Home</b>
          </button>

          <button class="${active === "collection" ? "active" : ""}" data-action="go-vault">
            <span>◇</span><b>Vault</b>
          </button>

          <button class="${active === "shop" ? "active" : ""}" data-action="go-shop">
            <span>✦</span><b>Packs</b>
          </button>

          <button class="${active === "battle" ? "active" : ""}" data-action="go-battle">
            <span>⚔</span><b>Solo</b>
          </button>

          <button class="${active === "online" ? "active" : ""}" data-action="go-online">
            <span>◉</span><b>Online</b>
          </button>
        </nav>

        <div class="pvx-account">
          <span class="pvx-coins">◈ <b>${coins}</b></span>
          <span class="pvx-avatar">${avatar}</span>

          <span class="pvx-user">
            <b>${username}</b>
            <small>Level ${backend.profile?.level ?? gameState.level}</small>
          </span>

          ${
            isGuest
              ? `
                <button class="pvx-signout" data-action="upgrade-guest">
                  Secure account
                </button>

                <button class="pvx-signout" data-action="backend-signout">
                  Sign out
                </button>
              `
              : hasSession
                ? `
                  <button class="pvx-signout" data-action="backend-signout">
                    Sign out
                  </button>
                `
                : ""
          }
        </div>
      </header>

      <main class="pvx-main">
        ${content}
      </main>

      <nav class="pvx-mobile-nav" aria-label="Mobile navigation">
        <button class="${active === "home" ? "active" : ""}" data-action="go-home">
          <span>⌂</span><b>Home</b>
        </button>

        <button class="${active === "collection" ? "active" : ""}" data-action="go-vault">
          <span>◇</span><b>Vault</b>
        </button>

        <button class="${active === "shop" ? "active" : ""}" data-action="go-shop">
          <span>✦</span><b>Packs</b>
        </button>

        <button class="${active === "battle" ? "active" : ""}" data-action="go-battle">
          <span>⚔</span><b>Solo</b>
        </button>

        <button class="${active === "online" ? "active" : ""}" data-action="go-online">
          <span>◉</span><b>Online</b>
        </button>
      </nav>
    </section>
  `;
}

function getShowcaseCards() {
  return SHOWCASE_CARD_IDS
    .map((id) => cards.find((card) => card.id === id)).filter(Boolean);
}

function renderCombatStatValue(card, statKey) {
  const boost = getAbilityBoost(card, statKey);
  return `<strong>${getEffectiveStatValue(card, statKey)}</strong>${boost ? `<i class="pvx-stat-boost">+${boost} ability</i>` : ""}`;
}

function renderRoundValue(value, boost = 0) {
  return `<strong>${value}${boost ? `<small>+${boost}</small>` : ""}</strong>`;
}

function getPrestigeWinClass(card, won) {
  if (!won || !isPrestigeRarity(card)) return "";
  return `prestige-winner rarity-${String(card.rarity || "").toLowerCase()}`;
}

function renderHome() {
  const progress = getCollectionProgress();
  const showcase = getShowcaseCards();
  const rating = backend.profile?.rank_rating ?? gameState.rankRating;
  return renderShell(`
    <section class="pvx-home">
      <div class="pvx-home-aurora"></div><div class="pvx-home-orbit orbit-a"></div><div class="pvx-home-orbit orbit-b"></div>
      <div class="pvx-hero-copy">
        <p class="pvx-eyebrow"><i></i> The ultimate pup card universe</p>
        <h1><span>PUP</span><em>VERSE</em></h1>
        <p class="pvx-hero-text">Collect cosmic pups. Build an unbeatable deck. Enter a living neon arena where every card has a story—and every stat can change the fight.</p>
        <div class="pvx-hero-actions"><button class="pvx-primary" data-action="go-online"><span>Play Online</span><b>Enter Arena League</b><i>→</i></button><button class="pvx-secondary" data-action="go-battle"><span>⚔</span><b>Solo Battle</b></button></div>
        <div class="pvx-micro-stats"><article><small>Player level</small><strong>${backend.profile?.level ?? gameState.level}</strong><i style="--value:72%"></i></article><article><small>Arena wins</small><strong>${backend.profile?.online_wins ?? gameState.onlineWins}</strong><i style="--value:54%"></i></article><article><small>League rating</small><strong>${rating}</strong><i style="--value:${getRankProgress(rating)}%"></i></article></div>
      </div>
      <div class="pvx-hero-cards" aria-label="Featured PupVerse cards">
        <div class="pvx-card-rings"></div><div class="pvx-card-platform"></div>
        ${showcase.map((card, index) => `<button class="pvx-hero-card hero-${index + 1}" data-action="preview-card" data-card-id="${card.id}" aria-label="Preview ${escapeHtml(card.name)}">${renderCardImage(card)}<span>${escapeHtml(card.rarity)}</span></button>`).join("")}
        <span class="pvx-float-rune rune-a">✦</span><span class="pvx-float-rune rune-b">◇</span><span class="pvx-float-rune rune-c">+</span>
      </div>
      <section class="pvx-home-bottom">
        <article class="pvx-progress-card"><div class="pvx-panel-icon">◇</div><div><small>Collection vault</small><h2>${progress.uniqueOwned} <span>/ ${progress.totalCards} discovered</span></h2><div class="pvx-progress"><i style="width:${progress.percentage}%"></i></div><p><b>${progress.percentage}% complete</b><span>${progress.duplicateCount} duplicates</span></p></div><button data-action="go-vault">Explore vault →</button></article>
        <article class="pvx-daily-card"><span class="pvx-live"><i></i> Daily mission</span><h2>Win two arena rounds</h2><p>Take any deck into battle and prove your strongest stats.</p><div><span>1 / 2</span><b>+150 XP</b></div><button data-action="go-battle">Continue mission</button></article>
        <article class="pvx-rank-card"><div class="pvx-rank-gem"><span>◆</span></div><div><small>Current league</small><h2>${getRankTier(rating)}</h2><p>${rating} RP · ${Math.max(0, getNextRankTarget(rating) - rating)} to promotion</p></div><button data-action="go-online">Ranked queue</button></article>
      </section>
    </section>`, "home");
}

function renderPackCard(pack) {
  const packCards = cards.filter((card) => card.pack === pack.cardPackName).slice(0, 3);
  const canAfford = gameState.coins >= pack.cost;
  return `<article class="pvx-pack-card ${pack.themeClass} ${canAfford ? "" : "locked"}"><div class="pvx-pack-aurora"></div><div class="pvx-pack-fan">${packCards.map((card, index) => renderCardImage(card, `fan-${index + 1}`)).join("")}</div><div class="pvx-pack-capsule"><div class="pvx-pack-lid"></div><div class="pvx-pack-body"><span>${pack.icon}</span><i></i></div></div><span class="pvx-pack-type">${escapeHtml(pack.name)}</span><h2>${escapeHtml(pack.cardPackName)}</h2><p>${escapeHtml(pack.description)}</p><div class="pvx-pack-meta"><span>${pack.amount} cards</span><span>◈ ${pack.cost}</span></div><button data-action="open-pack" data-pack-id="${pack.id}" ${canAfford ? "" : "disabled"}>${canAfford ? "Open cosmic pack" : `Need ${pack.cost - gameState.coins} more coins`}<span>→</span></button></article>`;
}

function renderShop() {
  return renderShell(`
    <section class="pvx-page pvx-shop">
      <header class="pvx-page-header"><div><p class="pvx-eyebrow"><i></i> New discoveries await</p><h1>PACK <span>SHOP</span></h1><p>Crack open a universe. Every pack contains three animated card reveals.</p></div><div class="pvx-balance"><small>Vault balance</small><strong>◈ ${gameState.coins}</strong><button data-action="dev-coins">+25 test coins</button></div></header>
      <div class="pvx-shop-message"><span>✦</span><p>${escapeHtml(gameState.shopMessage)}</p></div>
      <section class="pvx-pack-grid">${packs.map(renderPackCard).join("")}</section>
      <section class="pvx-latest"><div class="pvx-section-title"><div><p class="pvx-eyebrow"><i></i> Recently discovered</p><h2>Latest pulls</h2></div><button data-action="go-vault">View full vault →</button></div><div class="pvx-latest-grid">${gameState.lastOpenedPack.length ? gameState.lastOpenedPack.map((card, index) => `<button class="pvx-latest-card" style="--delay:${index * .12}s" data-action="preview-card" data-card-id="${card.id}">${renderCardImage(card)}<span><small>${escapeHtml(card.rarity)}</small><b>${escapeHtml(card.name)}</b><em>${escapeHtml(card.element)}</em></span></button>`).join("") : `<div class="pvx-empty"><span>✦</span><h3>Your next discovery starts here</h3><p>Open a pack and your newest pups will land in this showcase.</p></div>`}</div></section>
    </section>`, "shop");
}

function renderVaultCard(card, index) {
  const strongest = stats.reduce((best, stat) => getStatValue(card, stat.key) > getStatValue(card, best.key) ? stat : best, stats[0]);
  return `<button class="pvx-vault-card" style="--delay:${Math.min(index, 12) * .045}s" data-action="preview-card" data-card-id="${card.id}"><div class="pvx-vault-image"><span class="pvx-rarity rarity-${card.rarity.toLowerCase()}">${escapeHtml(card.rarity)}</span>${card.count > 1 ? `<span class="pvx-quantity">×${card.count}</span>` : ""}${renderCardImage(card)}<div class="pvx-card-sheen"></div><span class="pvx-inspect">Inspect card <i>↗</i></span></div><div class="pvx-vault-copy"><small>${escapeHtml(card.pack)}</small><h3>${escapeHtml(card.name)}</h3><p>${escapeHtml(card.element)}</p><div><span>${strongest.short}</span><strong>${getStatValue(card, strongest.key)}</strong><i style="width:${getStatValue(card, strongest.key)}%"></i></div></div></button>`;
}

function renderCollection() {
  const progress = getCollectionProgress();
  const filtered = getFilteredCollectionCards();
  const counts = { All: progress.uniqueOwned, CryptoPups: progress.cryptoOwned, CyberPups: progress.cyberOwned, AlienPups: progress.alienOwned };
  return renderShell(`
    <section class="pvx-page pvx-vault">
      <header class="pvx-page-header vault-header"><div><p class="pvx-eyebrow"><i></i> Your cosmic archive</p><h1>COLLECTION <span>VAULT</span></h1><p>Every pup you discover lives here. Inspect a card to reveal its full holographic data.</p></div><div class="pvx-vault-meter"><div><strong>${progress.percentage}%</strong><small>complete</small></div><span><i style="--progress:${progress.percentage * 3.6}deg"></i></span></div></header>
      <section class="pvx-vault-summary"><article><span>◇</span><div><small>Unique pups</small><strong>${progress.uniqueOwned}<i> / ${progress.totalCards}</i></strong></div></article><article><span>✦</span><div><small>Total cards</small><strong>${gameState.collection.length}</strong></div></article><article><span>⧉</span><div><small>Duplicates</small><strong>${progress.duplicateCount}</strong></div></article><article class="wide"><div><small>Archive completion</small><strong>${progress.percentage}%</strong></div><div class="pvx-progress"><i style="width:${progress.percentage}%"></i></div></article></section>
      <nav class="pvx-filterbar" aria-label="Collection filters">${Object.entries(counts).map(([name, count]) => `<button class="${gameState.collectionFilter === name ? "active" : ""}" data-action="filter-vault" data-filter="${name}"><span>${name}</span><b>${count}</b></button>`).join("")}</nav>
      <section class="pvx-vault-grid">${filtered.length ? filtered.map(renderVaultCard).join("") : `<div class="pvx-empty vault-empty"><span>◇</span><h3>This vault wing is waiting</h3><p>Open matching packs to discover pups from this universe.</p><button data-action="go-shop">Open pack shop</button></div>`}</section>
    </section>
    ${renderCardModal()}`, "collection");
}

function renderCardBack(card) {
  return `<div class="pvx-modal-card-back"><div class="pvx-back-grid"></div><div class="pvx-back-head"><span>${escapeHtml(card.rarity)}</span><b>${escapeHtml(card.pack)}</b></div><p class="pvx-back-kicker">PupVerse combat data</p><h2>${escapeHtml(card.name)}</h2><span class="pvx-element">${escapeHtml(card.element)}</span><div class="pvx-back-stats">${stats.map((stat) => `<article><span>${stat.icon}</span><div><small>${stat.label}</small><i><b style="width:${getStatValue(card, stat.key)}%"></b></i></div><strong>${getStatValue(card, stat.key)}</strong></article>`).join("")}</div><div class="pvx-ability"><small>Special ability</small><h3>${escapeHtml(card.ability?.name || "Cosmic Instinct")}</h3><p>${escapeHtml(card.ability?.description || "A mysterious PupVerse power waits to be unleashed.")}</p><span class="pvx-ability-orb">✦</span></div><div class="pvx-card-seal">PV</div></div>`;
}

function renderCardModal() {
  if (!selectedVaultCardId) return "";
  const card = cards.find((item) => item.id === selectedVaultCardId);
  if (!card) return "";
  const owned = gameState.collection.filter((id) => id === card.id).length;
  return `<div class="pvx-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(card.name)} card details"><button class="pvx-modal-scrim" data-action="close-card" aria-label="Close card"></button><section class="pvx-card-viewer"><button class="pvx-modal-close" data-action="close-card" aria-label="Close">×</button><div class="pvx-modal-stage"><div class="pvx-holo-rings"></div><button class="pvx-flip-card ${vaultCardFlipped ? "flipped" : ""}" data-action="flip-card" aria-label="Flip ${escapeHtml(card.name)} card"><div class="pvx-flip-inner"><div class="pvx-flip-front">${renderCardImage(card)}<div class="pvx-card-sheen"></div></div>${renderCardBack(card)}</div></button><p>Tap card to ${vaultCardFlipped ? "view artwork" : "reveal combat data"}</p></div><div class="pvx-modal-copy"><p class="pvx-eyebrow"><i></i> ${escapeHtml(card.pack)} archive</p><h1>${escapeHtml(card.name)}</h1><div class="pvx-modal-tags"><span>${escapeHtml(card.rarity)}</span><span>${escapeHtml(card.element)}</span><span>${card.year}</span>${owned ? `<span>Owned ×${owned}</span>` : `<span>Preview</span>`}</div><p>${escapeHtml(card.ability?.description || "A one-of-a-kind pup forged in the PupVerse.")}</p><div class="pvx-modal-actions"><button class="pvx-primary" data-action="flip-card">${vaultCardFlipped ? "Show card art" : "Reveal stats"}<i>↻</i></button><button data-action="go-battle">Take to battle</button></div><small class="pvx-modal-tip">Drag-free 3D reveal · Reduced-motion friendly</small></div></section></div>`;
}

function renderBattleCard(card, owner, hidden = false, player = false) {
  if (hidden) return `<article class="pvx-battle-card mystery"><span>${owner}</span><div class="pvx-mystery-card"><div class="pvx-mystery-rings"></div><b>PV</b><strong>?</strong><small>Opponent card encrypted</small></div></article>`;
  const won = gameState.computerRevealed && ((player && gameState.winner === "player") || (!player && gameState.winner === "computer"));
  return `<article class="pvx-battle-card ${player ? "player" : "rival"} ${getPrestigeWinClass(card, won)}"><span>${owner}</span><div class="pvx-battle-image">${renderCardImage(card)}<div class="pvx-card-sheen"></div>${won && isPrestigeRarity(card) ? `<div class="pvx-win-burst"><i></i><i></i><i></i><b>${escapeHtml(card.rarity)} Victory</b></div>` : ""}${gameState.selectedStat ? `<b>${titleCase(gameState.selectedStat)} locked</b>` : ""}</div><h3>${escapeHtml(card.name)}</h3><p>${escapeHtml(card.rarity)} · ${escapeHtml(card.element)}</p></article>`;
}

function renderSoloBattle() {
  if (!gameState.playerCard || !gameState.computerCard) startComputerBattle();
  const selected = gameState.selectedStat;
  const result = gameState.roundResult;
  return renderShell(`
    <section class="pvx-arena">
      <header class="pvx-arena-head"><div><p class="pvx-eyebrow"><i></i> Solo combat simulation</p><h1>BATTLE <span>ARENA</span></h1></div><div class="pvx-scoreboard"><article><small>You</small><strong>${gameState.playerWins}</strong></article><span>VS</span><article><small>CPU</small><strong>${gameState.computerWins}</strong></article></div><button data-action="reset-solo">Reset run</button></header>
      <main class="pvx-arena-board"><div class="pvx-arena-sky"></div><div class="pvx-arena-floor"></div><div class="pvx-arena-beam beam-left"></div><div class="pvx-arena-beam beam-right"></div>${renderBattleCard(gameState.playerCard, "Your challenger", false, true)}<section class="pvx-referee"><span><i></i> Arena referee online</span><div class="pvx-vs-core"><b>VS</b><i></i></div><p class="${gameState.winner || ""}">${escapeHtml(gameState.resultMessage)}</p>${selected ? `<div class="pvx-round-values">${renderRoundValue(result?.playerValue ?? getEffectiveStatValue(gameState.playerCard, selected), result?.playerBoost)}<span>${titleCase(selected)}</span>${renderRoundValue(result?.opponentValue ?? getEffectiveStatValue(gameState.computerCard, selected), result?.opponentBoost)}</div>` : `<small>Choose the stat that gives your pup the edge</small>`}</section>${renderBattleCard(gameState.computerCard, "CPU challenger", !gameState.computerRevealed)}</main>
      <section class="pvx-stat-dock"><div><small>${gameState.computerRevealed ? "Official result" : "Your move"}</small><strong>${gameState.computerRevealed ? titleCase(gameState.winner) : "Select one combat stat"}</strong></div><div class="pvx-stat-grid">${stats.map((stat) => `<button class="${getAbilityBoost(gameState.playerCard, stat.key) ? "has-boost" : ""}" data-action="solo-stat" data-stat="${stat.key}" ${gameState.computerRevealed ? "disabled" : ""}><span>${stat.icon}</span><small>${stat.short}</small>${renderCombatStatValue(gameState.playerCard, stat.key)}<em>${stat.label}</em></button>`).join("")}</div>${gameState.computerRevealed ? `<button class="pvx-next" data-action="next-solo">Next round →</button>` : `<span class="pvx-timer">◷ 20s</span>`}</section>
    </section>`, "battle");
}

function renderRankGem(rating = gameState.rankRating) {
  return `<div class="pvx-rank-gem large"><span>◆</span><i>✦</i><b>${getRankTier(rating)}</b></div>`;
}

function renderOnlineHub() {
  if (backend.configured && !backend.session) return renderAuth();
  if (backend.upgradingGuest) return renderGuestUpgrade();
  const rating = backend.profile?.rank_rating ?? gameState.rankRating;
  const modes = [
    { id: "casual", tag: "Unranked", title: "Casual Match", copy: "Fast real-player battles with no rating loss. Test decks, earn XP and have fun.", icon: "ϟ", perks: ["No rating loss", "+XP & coins"] },
    { id: "ranked", tag: "Season 04", title: "Ranked League", copy: "The flagship competition. Outsmart rivals and climb toward PupVerse Champion.", icon: "◆", perks: ["Fair matchmaking", "Season rewards"], featured: true },
    { id: "friend", tag: "Private room", title: "Friend Battle", copy: "Create a six-character room code and invite exactly the player you want.", icon: "∞", perks: ["Private invite", "Preset reactions"] },
  ];
  return renderShell(`<section class="pvx-online-hub"><header><div><p class="pvx-eyebrow"><i></i> Competitive universe</p><h1>ARENA <span>LEAGUE</span></h1><p>Real challengers. Protected matches. One path to PupVerse Champion.</p></div><article class="pvx-current-rank">${renderRankGem(rating)}<div><small>Current rank</small><h2>${getRankTier(rating)}</h2><p>${rating} RP · ${getNextRankTarget(rating) - rating} to promotion</p><div class="pvx-progress"><i style="width:${getRankProgress(rating)}%"></i></div></div></article></header><section class="pvx-mode-grid">${modes.map((mode) => `<article class="pvx-mode ${mode.featured ? "featured" : ""}">${mode.featured ? `<span class="pvx-featured">Flagship mode</span>` : ""}<div class="pvx-mode-art"><div class="pvx-mode-rings"></div><b>${mode.icon}</b></div><div class="pvx-mode-copy"><small>${mode.tag}</small><h2>${mode.title}</h2><p>${mode.copy}</p><div>${mode.perks.map((perk) => `<span>${perk}</span>`).join("")}</div><button data-action="online-mode" data-mode="${mode.id}">${mode.id === "friend" ? "Create or join" : mode.id === "ranked" ? "Enter ranked" : "Find challenger"}<i>→</i></button></div></article>`).join("")}</section>${backend.leaderboard.length ? `<section class="pvx-leaderboard"><div><p class="pvx-eyebrow"><i></i> Live standings</p><h2>Season leaders</h2></div><ol>${backend.leaderboard.slice(0, 5).map((player) => `<li><b>#${player.position}</b><span class="pvx-avatar">${escapeHtml(player.avatar)}</span><strong>${escapeHtml(player.username)}</strong><small>${escapeHtml(player.rank_tier)}</small><em>${player.rank_rating} RP</em></li>`).join("")}</ol></section>` : `<section class="pvx-online-note"><span>◆</span><p><strong>${backend.configured ? "Secure multiplayer enabled" : "Multiplayer preview mode"}</strong>${backend.configured ? "Supabase authentication, private rooms and server-side match decisions are connected." : "The full flow is playable locally. Add Supabase keys to connect real accounts."}</p></section>`}</section>`, "online");
}

function renderGuestUpgrade() {
  return renderShell(`<section class="pvx-auth"><div class="pvx-auth-art"><div class="pvx-auth-orbits"></div>${renderRankGem(gameState.rankRating)}<p class="pvx-eyebrow"><i></i> Keep this Vault forever</p><h1>SECURE YOUR<br><span>PLAYER ACCOUNT</span></h1><p>Link an email or social identity without losing your cards, coins, decks or rank.</p><div><span>◆ Same player ID</span><span>◆ Vault preserved</span><span>◆ Cross-device access</span></div></div><form class="pvx-auth-card" data-guest-upgrade-form><p>Upgrade this guest player</p><label><span>Username</span><input id="upgradeUsername" autocomplete="username" minlength="3" maxlength="20" value="${escapeHtml(backend.profile?.username || "")}" required></label><label><span>Email</span><input id="upgradeEmail" type="email" autocomplete="email" placeholder="you@example.com" required></label>${backend.error ? `<p class="pvx-form-error">${escapeHtml(backend.error)}</p>` : ""}${backend.message ? `<p class="pvx-form-message">${escapeHtml(backend.message)}</p>` : ""}<button class="pvx-auth-submit" data-action="guest-upgrade-submit" type="submit">Link email securely<span>→</span></button><button type="button" data-action="guest-link-provider" data-provider="google">Continue with Google</button><button type="button" data-action="cancel-guest-upgrade">Back to Arena</button><small>Your current anonymous player ID is retained. Confirm the email link before signing out.</small></form></section>`, "online");
}

function renderAuth() {
  const signup = backend.authMode === "signup";
  return renderShell(`<section class="pvx-auth"><div class="pvx-auth-art"><div class="pvx-auth-orbits"></div>${renderRankGem(1248)}<p class="pvx-eyebrow"><i></i> Protected player identity</p><h1>ENTER THE<br><span>ARENA LEAGUE</span></h1><p>Your decks, rank, rewards and match history travel safely with your account.</p><div><span>◆ Server referee</span><span>◆ Private Realtime</span><span>◆ Match recovery</span></div></div><form class="pvx-auth-card" data-auth-form><nav><button class="${signup ? "" : "active"}" type="button" data-action="auth-tab" data-mode="signin">Sign in</button><button class="${signup ? "active" : ""}" type="button" data-action="auth-tab" data-mode="signup">Create account</button></nav><p>${signup ? "Create your player identity" : "Welcome back, challenger"}</p>${signup ? `<label><span>Username</span><input id="authUsername" autocomplete="username" minlength="3" maxlength="20" placeholder="NeonPup" required></label>` : ""}<label><span>Email</span><input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com" required></label><label><span>Password</span><input id="authPassword" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" placeholder="8+ characters" required></label>${backend.error ? `<p class="pvx-form-error">${escapeHtml(backend.error)}</p>` : ""}${backend.message ? `<p class="pvx-form-message">${escapeHtml(backend.message)}</p>` : ""}<button class="pvx-auth-submit" data-action="auth-submit" type="submit">${signup ? "Create player" : "Sign in securely"}<span>→</span></button><small>Use a username—never your real name. Email is never public.</small></form></section>`, "online");
}

function renderQueue() {
  const names = { casual: "Casual Match", ranked: "Ranked League", friend: "Friend Battle" };
  return renderShell(`<section class="pvx-queue"><div class="pvx-radar"><i></i><i></i><i></i><span></span><b>◆</b></div><p class="pvx-eyebrow"><i></i> ${names[gameState.arenaMode] || "Online match"}</p><h1>FINDING YOUR <span>RIVAL</span></h1><p>${escapeHtml(gameState.queueMessage)}</p><div><span>◆ Deck locked</span><span>◆ Fair rating band</span><span>◆ Referee ready</span></div><button data-action="cancel-queue">Cancel search</button></section>`, "online");
}

function renderFriendSelect() {
  return renderShell(`<section class="pvx-friends"><header><p class="pvx-eyebrow"><i></i> Private matchmaking</p><h1>BATTLE YOUR <span>PACK</span></h1><p>Only invited players can enter. No open chat, no strangers, no surprises.</p></header><section><article><span>01</span><b>∞</b><h2>Create a room</h2><p>Generate a one-time code and share it with one friend.</p><button data-action="create-room">Generate room code →</button></article><i>OR</i><article><span>02</span><b>⌁</b><h2>Join a room</h2><p>Enter the six-character code your friend shared.</p><label><span>Room code</span><input id="friendCode" maxlength="8" placeholder="PV8X2Q" autocomplete="off"></label><p id="friendError" class="pvx-room-error"></p><button data-action="join-room">Join friend →</button></article></section><aside><span>◆</span><p><strong>Private by design.</strong> Preset reactions only—no open chat or direct messaging.</p></aside></section>`, "online");
}

function renderFriendRoom() {
  return renderShell(`<section class="pvx-room"><div class="pvx-room-live"><i></i> Private room ready</div><h1>${escapeHtml(gameState.friendRoomCode)}</h1><p>Send this code to your friend. Both decks lock the moment the match begins.</p><button data-action="copy-code">Copy room code</button><section><article class="ready"><span>${escapeHtml(backend.profile?.avatar || "MP")}</span><div><strong>${escapeHtml(backend.profile?.username || "MADDYPUP")}</strong><small>Ready</small></div></article><i>VS</i><article><span>?</span><div><strong>Waiting for friend</strong><small>Invite pending</small></div></article></section>${backend.configured && backend.session ? `<small>Match launches automatically when your friend joins.</small>` : `<button class="pvx-preview-match" data-action="friend-preview">Preview multiplayer battle</button>`}<button class="pvx-quiet" data-action="online-home">Close room</button></section>`, "online");
}

function renderOnlineBattleCard(card, owner, hidden = false, remote = false, won = false) {
  if (hidden || !card) return `<article class="pvx-online-card mystery"><span>${escapeHtml(owner)}</span><div><i></i><b>PV</b><strong>?</strong><small>Protected deck snapshot</small></div></article>`;
  const normalized = remote ? { ...card, frontImage: card.front_image } : card;
  return `<article class="pvx-online-card ${getPrestigeWinClass(card, won)}"><span>${escapeHtml(owner)}</span><div>${renderCardImage(normalized)}<div class="pvx-card-sheen"></div>${won && isPrestigeRarity(card) ? `<div class="pvx-win-burst"><i></i><i></i><i></i><b>${escapeHtml(card.rarity)} Victory</b></div>` : ""}</div><h3>${escapeHtml(card.name)}</h3><p>${escapeHtml(card.rarity)} · ${escapeHtml(card.element)}</p></article>`;
}

function getRemotePlayers(state) {
  const id = backend.session?.user?.id;
  return { me: state?.players?.find((player) => player.player_id === id), opponent: state?.players?.find((player) => player.player_id !== id) };
}

function renderOnlineBattle() {
  if (backend.remoteMatch?.match) return renderRemoteBattle();
  const match = gameState.onlineMatch;
  if (!match) return renderOnlineHub();
  const index = Math.min(match.round - 1, match.playerDeck.length - 1);
  const playerCard = match.playerDeck[index];
  const opponentCard = match.opponentDeck[index];
  const resolved = Boolean(match.selectedStat);
  return renderOnlineBattleLayout({ mode: match.mode, round: match.round, myScore: match.playerScore, rivalScore: match.opponentScore, myName: "MADDYPUP", rivalName: match.opponent.username, myRank: getRankTier(), rivalRank: match.opponent.rankTier, myCard: playerCard, rivalCard: opponentCard, hideRival: !resolved, message: match.roundMessage, canAct: !resolved, selectedStat: match.selectedStat, roundWinner: match.roundWinner, remote: false, complete: match.complete });
}

function renderRemoteBattle() {
  const state = backend.remoteMatch;
  if (["completed", "abandoned"].includes(state.match.status)) return renderRemoteResult();
  const { me, opponent } = getRemotePlayers(state);
  const myTurn = state.match.current_turn_player_id === backend.session?.user?.id;
  const active = state.match.status === "active";
  const latest = state.rounds?.[state.rounds.length - 1];
  const roundWinner = latest?.winner_id === me?.player_id ? "player" : latest?.winner_id === opponent?.player_id ? "opponent" : latest ? "draw" : null;
  return renderOnlineBattleLayout({ mode: state.match.mode, round: state.match.round_number, myScore: me?.score || 0, rivalScore: opponent?.score || 0, myName: backend.profile?.username || "PLAYER", rivalName: opponent?.profile?.username || "RIVAL", myRank: backend.profile?.rank_tier || "Rookie", rivalRank: opponent?.profile?.rank_tier || "Rookie", myCard: state.my_card, rivalCard: state.opponent_card, hideRival: !state.opponent_card, message: !active ? "Connecting both players to the private referee…" : myTurn ? "Your move. Choose one official stat." : `Waiting for ${opponent?.profile?.username || "your rival"}…`, canAct: active && myTurn, selectedStat: latest?.selected_stat, roundWinner, remote: true, presence: Object.keys(backend.presence).length });
}

function renderOnlineBattleLayout(data) {
  const body = `<section class="pvx-live-battle"><header><div class="pvx-live-player"><span class="pvx-avatar">${escapeHtml(backend.profile?.avatar || "MP")}</span><div><b>${escapeHtml(data.myName)}</b><small>${escapeHtml(data.myRank)}</small></div></div><div class="pvx-live-score"><small>Best of 3 · Round ${data.round}</small><div><b>${data.myScore}</b><span>—</span><b>${data.rivalScore}</b></div><em>${escapeHtml(data.mode)}</em></div><div class="pvx-live-player rival"><div><b>${escapeHtml(data.rivalName)}</b><small>${escapeHtml(data.rivalRank)}</small></div><span class="pvx-avatar">RP</span></div></header><main><div class="pvx-arena-floor"></div>${renderOnlineBattleCard(data.myCard, "Your pup", false, data.remote, data.roundWinner === "player")}<section class="pvx-live-referee"><span><i></i>${data.remote ? "Protected referee" : "Match referee"}</span><div><small>Round</small><b>${data.round}</b></div><p>${escapeHtml(data.message)}</p>${data.selectedStat ? `<strong>${titleCase(data.selectedStat)} official</strong>` : ""}</section>${renderOnlineBattleCard(data.rivalCard, data.rivalName, data.hideRival, data.remote, data.roundWinner === "opponent")}</main><section class="pvx-live-dock"><div><small>${data.canAct ? "Your move" : "Match state"}</small><strong>${data.canAct ? "Choose one combat stat" : "Waiting securely"}</strong></div><div>${stats.map((stat) => `<button class="${getAbilityBoost(data.myCard, stat.key) ? "has-boost" : ""}" data-action="${data.remote ? "remote-stat" : "online-stat"}" data-stat="${stat.key}" ${data.canAct ? "" : "disabled"}><span>${stat.icon}</span><small>${stat.short}</small>${renderCombatStatValue(data.myCard, stat.key)}<em>${stat.label}</em></button>`).join("")}</div>${!data.remote && data.selectedStat && !data.complete ? `<button class="pvx-next" data-action="next-online">Next round →</button>` : `<span class="pvx-timer">◷ 20s</span>`}</section><footer><span>Safe reactions</span>${["Good luck!", "Great match!", "That was close!"].map((reaction) => `<button data-action="reaction" data-reaction="${reaction}">${reaction}</button>`).join("")}${data.remote ? `<button data-action="remote-report">Report</button><button data-action="remote-block">Block</button><em>${data.presence || 0}/2 connected</em>` : gameState.quickReaction ? `<em>${escapeHtml(gameState.quickReaction)}</em>` : ""}</footer></section>`;
  return renderShell(body, "online");
}

function renderRemoteResult() {
  const state = backend.remoteMatch;
  const { me, opponent } = getRemotePlayers(state);
  const won = state.match.winner_id === backend.session?.user?.id;
  const draw = !state.match.winner_id && state.match.status === "completed";
  const delta = (me?.rating_after ?? me?.rating_before) - (me?.rating_before ?? 0);
  return renderShell(`<section class="pvx-result"><div class="pvx-result-rays"></div>${renderRankGem(me?.rating_after || backend.profile?.rank_rating || 1000)}<p class="pvx-eyebrow"><i></i> Server-verified result</p><h1>${won ? "VICTORY" : draw ? "MATCH DRAWN" : "MATCH COMPLETE"}</h1><div class="pvx-final-score"><strong>${me?.score || 0}</strong><span>FINAL</span><strong>${opponent?.score || 0}</strong></div><p>Every action is recorded in the protected match ledger.</p><section><article><span>◈</span><small>Status</small><strong>${state.match.status}</strong></article><article><span>✦</span><small>Rounds</small><strong>${state.rounds?.length || 0}</strong></article><article><span>◆</span><small>Rank change</small><strong>${delta > 0 ? "+" : ""}${delta}</strong></article></section><div><button class="pvx-primary" data-action="remote-rematch">Find rematch →</button><button data-action="online-home">Arena lobby</button><button data-action="go-home">Exit</button></div></section>`, "online");
}

function renderLocalResult() {
  const match = gameState.onlineMatch;
  if (!match) return renderOnlineHub();
  const won = match.playerScore > match.opponentScore;
  const draw = match.playerScore === match.opponentScore;
  const resultLabel = won ? "VICTORY" : draw ? "MATCH DRAWN" : "RIVAL VICTORY";
  return renderShell(`<section class="pvx-result"><div class="pvx-result-rays"></div>${renderRankGem(gameState.rankRating)}<p class="pvx-eyebrow"><i></i> Referee-verified result</p><h1>${resultLabel}</h1><div class="pvx-final-score"><strong>${match.playerScore}</strong><span>FINAL</span><strong>${match.opponentScore}</strong></div><p>${escapeHtml(match.roundMessage)} Your rewards have been secured.</p><section><article><span>◈</span><small>Coins earned</small><strong>+${match.coinReward}</strong></article><article><span>✦</span><small>XP earned</small><strong>+${match.xpReward}</strong></article><article><span>◆</span><small>Rank change</small><strong>${match.ratingChange > 0 ? "+" : ""}${match.ratingChange}</strong></article></section><div><button class="pvx-primary" data-action="local-rematch">Play again →</button><button data-action="online-home">Arena lobby</button><button data-action="go-home">Exit</button></div></section>`, "online");
}

function renderPackOverlay() {
  if (!packOverlay) return "";
  const pack = packs.find((item) => item.id === packOverlay.packId);
  if (!pack) return "";
  if (packOverlay.phase === "opening") return `<section class="pvx-pack-overlay ${pack.themeClass}" aria-live="polite"><div class="pvx-opening-stars"></div><div class="pvx-opening-ring ring-one"></div><div class="pvx-opening-ring ring-two"></div><p class="pvx-eyebrow"><i></i> ${escapeHtml(pack.name)}</p><h1>COSMIC <span>UNSEALING</span></h1><div class="pvx-opening-pack"><div class="pvx-opening-lid"></div><div class="pvx-opening-body"><span>${pack.icon}</span><i></i></div><div class="pvx-opening-energy"></div></div><p>Charging the reveal chamber…</p><button data-action="skip-pack">Reveal now</button></section>`;
  const pulls = packOverlay.cards || [];
  return `<section class="pvx-pack-overlay reveal ${pack.themeClass}" aria-live="polite"><div class="pvx-opening-stars"></div><p class="pvx-eyebrow"><i></i> Pack unsealed</p><h1>YOUR NEW <span>PUPS</span></h1><p>Reveal each card to send it into your Collection Vault.</p><div class="pvx-reveal-grid">${pulls.map((card, index) => `<button class="pvx-reveal-card ${index < revealedPackCards ? "revealed" : ""}" style="--delay:${index * .13}s" data-action="reveal-pack-card" data-index="${index}" ${index > revealedPackCards ? "disabled" : ""}><div class="pvx-reveal-inner"><div class="pvx-reveal-back"><span>PV</span><b>?</b><small>Tap to reveal</small></div><div class="pvx-reveal-front">${renderCardImage(card)}<div><small>${escapeHtml(card.rarity)}</small><h2>${escapeHtml(card.name)}</h2><p>${escapeHtml(card.element)}</p></div></div></div></button>`).join("")}</div><div class="pvx-reveal-actions">${revealedPackCards < pulls.length ? `<button data-action="reveal-all">Reveal all</button>` : `<button class="pvx-primary" data-action="finish-reveal">Open Collection Vault →</button>`}<button data-action="close-pack">Back to shop</button></div></section>`;
}

function renderApp() {
  let screen;
  if (gameState.mode === "shop") screen = renderShop();
  else if (gameState.mode === "collection") screen = renderCollection();
  else if (gameState.mode === "battle") screen = renderSoloBattle();
  else if (gameState.mode === "online") {
    if (gameState.arenaStatus === "queue") screen = renderQueue();
    else if (gameState.arenaStatus === "friend-select") screen = renderFriendSelect();
    else if (gameState.arenaStatus === "friend-room") screen = renderFriendRoom();
    else if (["battle", "remote-battle"].includes(gameState.arenaStatus)) screen = renderOnlineBattle();
    else if (gameState.arenaStatus === "result") screen = backend.remoteMatch ? renderRemoteResult() : renderLocalResult();
    else screen = renderOnlineHub();
  } else screen = renderHome();
  app.innerHTML = `<canvas id="spaceCanvas"></canvas><main class="app-shell">${screen}</main>${renderPackOverlay()}`;
  app.onclick = handleClick;
  app.onsubmit = (event) => {
    event.preventDefault();
    event.target.querySelector('[data-action="auth-submit"], [data-action="guest-upgrade-submit"]')?.click();
  };
  document.body.classList.toggle("pvx-modal-open", Boolean(selectedVaultCardId || packOverlay));
  setupImageFallbacks();
  startAnimatedBackground();
}

function go(mode) {
  selectedVaultCardId = null;
  vaultCardFlipped = false;
  gameState.mode = mode;
  renderApp();
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}

function beginLocalQueue(mode) {
  startArenaQueue(mode);
  renderApp();
  clearTimeout(matchmakingTimer);
  matchmakingTimer = setTimeout(() => { confirmArenaMatch(); renderApp(); }, 1800);
}

async function enterRemoteMatch(matchId) {
  await removeArenaSubscriptions();
  subscribedMatchId = matchId;
  backend.remoteMatch = await loadRemoteMatch(matchId);
  gameState.arenaStatus = "remote-battle";
  subscribeToMatch(matchId, backend.session.user.id, () => refreshRemoteMatch(), (presence) => { backend.presence = presence; renderApp(); }, (error) => notice(error?.message || "Match connection interrupted"));
  renderApp();
}

async function refreshRemoteMatch() {
  const id = backend.remoteMatch?.match?.id || subscribedMatchId;
  if (!id) return;
  backend.remoteMatch = await loadRemoteMatch(id);
  if (["completed", "abandoned"].includes(backend.remoteMatch?.match?.status)) await refreshPlayerData();
  renderApp();
}

async function beginRemoteQueue(mode) {
  const deck = activeDeck();
  if (!deck) throw new Error("Create an active deck with at least three cards first.");
  await removeArenaSubscriptions();
  gameState.arenaMode = mode;
  gameState.arenaStatus = "queue";
  gameState.queueMessage = mode === "ranked" ? "Searching your protected rating band…" : "Searching the live challenger queue…";
  renderApp();
  const result = await requestMatch(mode, deck.id);
  if (result?.status === "matched") return enterRemoteMatch(result.match_id);
  subscribeToQueue(backend.session.user.id, (id) => enterRemoteMatch(id), (error) => notice(error?.message || "Queue connection interrupted"));
  maintainQueue(mode, deck.id, (id) => enterRemoteMatch(id), (error) => notice(error?.message || "Queue heartbeat failed"));
}

async function finishPackAnimation() {
  if (!packOverlay || packOverlay.phase !== "opening" || packOpeningRequestInFlight) return;
  packOpeningRequestInFlight = true;
  try {
    if (backend.configured && backend.session) {
      const result = await openRemotePack(packOverlay.packId, packOverlay.requestId);
      await refreshPlayerData();
      const pulledCards = (result.card_ids || [])
        .map((cardId) => cards.find((card) => card.id === cardId))
        .filter(Boolean);
      gameState.lastOpenedPack = pulledCards;
      gameState.isOpeningPack = false;
      gameState.activePackId = null;
    } else {
      finishPackOpening();
    }
    packOverlay = { ...packOverlay, phase: "reveal", cards: [...gameState.lastOpenedPack] };
    revealedPackCards = 0;
    renderApp();
  } catch (error) {
    if (backend.configured && backend.session) {
      renderApp();
      notice(`${error.message || "The protected pack referee could not complete this opening."} Tap reveal to retry safely.`);
    } else {
      finishPackOpening();
      packOverlay = null;
      renderApp();
      notice(error.message || "Pack opening failed.");
    }
  } finally {
    packOpeningRequestInFlight = false;
  }
}

function notice(message) {
  document.querySelector(".pvx-notice")?.remove();
  const element = document.createElement("div");
  element.className = "pvx-notice";
  element.textContent = message;
  document.body.appendChild(element);
  requestAnimationFrame(() => element.classList.add("visible"));
  setTimeout(() => { element.classList.remove("visible"); setTimeout(() => element.remove(), 220); }, 2800);
}

async function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "go-home") return go("home");
  if (action === "go-shop") return go("shop");
  if (action === "go-vault") return go("collection");
  if (action === "go-battle") { selectedVaultCardId = null; vaultCardFlipped = false; startComputerBattle(); return renderApp(); }
  if (action === "go-online") { selectedVaultCardId = null; vaultCardFlipped = false; openArenaLeague(); return renderApp(); }
  if (action === "preview-card") { selectedVaultCardId = target.dataset.cardId; vaultCardFlipped = false; return renderApp(); }
  if (action === "close-card") { selectedVaultCardId = null; vaultCardFlipped = false; return renderApp(); }
  if (action === "flip-card") { vaultCardFlipped = !vaultCardFlipped; return renderApp(); }
  if (action === "filter-vault") { setCollectionFilter(target.dataset.filter); return renderApp(); }
  if (action === "dev-coins") {
    const added = addDevCoins();
    renderApp();
    if (!added) notice("Test coins are disabled for persistent player accounts.");
    return;
  }
  if (action === "open-pack") {
    if (!startPackOpening(target.dataset.packId)) return renderApp();
    packOverlay = { phase: "opening", packId: target.dataset.packId, requestId: crypto.randomUUID() };
    renderApp();
    clearTimeout(packTimer);
    packTimer = setTimeout(finishPackAnimation, 2800);
    return;
  }
  if (action === "skip-pack") { clearTimeout(packTimer); return finishPackAnimation(); }
  if (action === "reveal-pack-card") { const index = Number(target.dataset.index); if (index === revealedPackCards) revealedPackCards += 1; return renderApp(); }
  if (action === "reveal-all") { revealedPackCards = packOverlay?.cards?.length || 0; return renderApp(); }
  if (action === "finish-reveal") { packOverlay = null; return go("collection"); }
  if (action === "close-pack") { packOverlay = null; return renderApp(); }
  if (action === "solo-stat") { chooseBattleStat(target.dataset.stat); return renderApp(); }
  if (action === "next-solo") { startComputerBattle(); return renderApp(); }
  if (action === "reset-solo") { resetGameStats(); startComputerBattle(); return renderApp(); }
  if (action === "online-home") { await removeArenaSubscriptions(); openArenaLeague(); return renderApp(); }
  if (action === "online-mode") {
    const mode = target.dataset.mode;
    if (mode === "friend") { gameState.arenaStatus = "friend-select"; return renderApp(); }
    try { return backend.configured && backend.session ? await beginRemoteQueue(mode) : beginLocalQueue(mode); }
    catch (error) { gameState.arenaStatus = "hub"; renderApp(); return notice(error.message); }
  }
  if (action === "cancel-queue") {
    clearTimeout(matchmakingTimer);
    if (backend.configured && backend.session) { await cancelBackendMatchmaking().catch(() => {}); await removeArenaSubscriptions(); }
    else cancelArenaQueue();
    gameState.arenaStatus = "hub";
    return renderApp();
  }
  if (action === "create-room") {
    if (backend.configured && backend.session) {
      const deck = activeDeck();
      if (!deck) return notice("Create an active three-card deck first.");
      try {
        const room = await createRemoteFriendRoom(deck.id);
        gameState.friendRoomCode = room.code;
        gameState.arenaStatus = "friend-room";
        subscribeToFriendRoom(room.code, (id) => enterRemoteMatch(id), (error) => notice(error?.message || "Room interrupted"));
        return renderApp();
      } catch (error) { return notice(error.message); }
    }
    createFriendRoom(); return renderApp();
  }
  if (action === "join-room") {
    const input = document.querySelector("#friendCode");
    const errorNode = document.querySelector("#friendError");
    const code = String(input?.value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (backend.configured && backend.session) {
      const deck = activeDeck();
      if (!deck || code.length !== 6) { if (errorNode) errorNode.textContent = !deck ? "Create an active deck first." : "Enter the six-character code."; return; }
      try { const result = await joinRemoteFriendRoom(code, deck.id); return enterRemoteMatch(result.match_id); }
      catch (error) { if (errorNode) errorNode.textContent = error.message; return; }
    }
    if (!joinFriendRoom(code)) { if (errorNode) errorNode.textContent = "Enter a valid room code."; return; }
    renderApp();
    matchmakingTimer = setTimeout(() => { confirmArenaMatch(); renderApp(); }, 1200);
    return;
  }
  if (action === "copy-code") { await navigator.clipboard?.writeText(gameState.friendRoomCode).catch(() => {}); return notice("Room code copied"); }
  if (action === "friend-preview") { startArenaQueue("friend"); confirmArenaMatch(); return renderApp(); }
  if (action === "online-stat") { chooseOnlineStat(target.dataset.stat); return renderApp(); }
  if (action === "next-online") { advanceArenaRound(); return renderApp(); }
  if (action === "reaction") { sendQuickReaction(target.dataset.reaction); return renderApp(); }
  if (action === "local-rematch") return beginLocalQueue(gameState.onlineMatch?.mode || "casual");
  if (action === "remote-stat") {
    target.disabled = true;
    try { backend.remoteMatch = await resolveRemoteRound(backend.remoteMatch.match.id, target.dataset.stat); if (["completed", "abandoned"].includes(backend.remoteMatch?.match?.status)) await refreshPlayerData(); return renderApp(); }
    catch (error) { notice(error.message); return refreshRemoteMatch().catch(() => {}); }
  }
  if (action === "remote-forfeit") {
    try { backend.remoteMatch = await forfeitRemoteMatch(backend.remoteMatch.match.id); await refreshPlayerData(); return renderApp(); }
    catch (error) { return notice(error.message); }
  }
  if (action === "remote-rematch") { try { return await beginRemoteQueue(backend.remoteMatch?.match?.mode === "ranked" ? "ranked" : "casual"); } catch (error) { return notice(error.message); } }
  if (action === "remote-report" || action === "remote-block") {
    const { opponent } = getRemotePlayers(backend.remoteMatch);
    if (!opponent) return;
    try {
      if (action === "remote-report") await reportRemotePlayer({ matchId: backend.remoteMatch.match.id, reportedPlayerId: opponent.player_id, reason: "other", details: "Submitted from in-match safety controls." });
      else await blockRemotePlayer(opponent.player_id);
      return notice(action === "remote-report" ? "Report submitted for review" : "Player blocked from future matchmaking");
    } catch (error) { return notice(error.message); }
  }
  if (action === "auth-tab") { backend.authMode = target.dataset.mode === "signup" ? "signup" : "signin"; backend.error = ""; backend.message = ""; return renderApp(); }
  if (action === "upgrade-guest") { backend.upgradingGuest = true; backend.error = ""; backend.message = ""; openArenaLeague(); return renderApp(); }
  if (action === "cancel-guest-upgrade") { backend.upgradingGuest = false; backend.error = ""; backend.message = ""; return renderApp(); }
  if (action === "guest-upgrade-submit") {
    event.preventDefault();
    backend.error = ""; backend.message = ""; target.disabled = true;
    try {
      await upgradeGuestAccount({
        email: document.querySelector("#upgradeEmail")?.value.trim(),
        username: document.querySelector("#upgradeUsername")?.value.trim(),
      });
      backend.message = "Confirmation sent. Open that email on this device before signing out.";
      await refreshPlayerData();
    } catch (error) { backend.error = error.message; }
    return renderApp();
  }
  if (action === "guest-link-provider") {
    try { await linkGuestProvider(target.dataset.provider); }
    catch (error) { backend.error = error.message; return renderApp(); }
    return;
  }
  if (action === "auth-submit") {
    event.preventDefault();
    backend.error = ""; backend.message = ""; target.disabled = true;
    try {
      const credentials = { email: document.querySelector("#authEmail")?.value.trim(), password: document.querySelector("#authPassword")?.value || "", username: document.querySelector("#authUsername")?.value.trim() };
      const result = backend.authMode === "signup" ? await backendSignUp(credentials) : await backendSignIn(credentials);
      if (backend.authMode === "signup" && !result.session) { backend.authMode = "signin"; backend.message = "Account created. Confirm your email, then sign in."; }
    } catch (error) { backend.error = error.message; }
    return renderApp();
  }
  if (action === "backend-signout") { await backendSignOut(); return handleSession(null); }
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (selectedVaultCardId) { selectedVaultCardId = null; vaultCardFlipped = false; renderApp(); }
  else if (packOverlay) { packOverlay = null; renderApp(); }
});

renderApp();
bootstrapBackend();
