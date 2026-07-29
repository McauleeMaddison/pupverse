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
  getCollectionWithCounts,
  getCollectionProgress,
  getDailyMissionBoard,
  setCollectionFilter,
  setCollectionSort,
  toggleFavouriteCard,
  getActiveDeckCardIds,
  setActiveDeckCardIds,
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
  claimDailyMissionReward,
} from "./game/state.js";
import { startAnimatedBackground } from "./ui/animatedBackground.js";
import { renderCardImage, setupImageFallbacks } from "./ui/cardImages.js";
import { getAbilityBoost, getEffectiveStatValue, isPrestigeRarity } from "./game/battleRules.js";
import { escapeHtml, titleCase } from "./utils/format.js";
import { trackEvent } from "./utils/analytics.js";
import {
  initializeArenaBackend,
  signInAsGuest,
  upgradeGuestAccount,
  linkGuestProvider,
  signUp as backendSignUp,
  signIn as backendSignIn,
  requestPasswordReset,
  completeGuestPasswordUpgrade,
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
  claimRemoteDailyReward,
  updateRemoteDeck,
  setFavouriteCard as setRemoteFavouriteCard,
  isSupabaseConfigured,
} from "./services/arenaBackend.js";

const app = document.querySelector("#app");
if (!app) throw new Error("PupVerse could not find the #app element.");

const stats = CARD_STATS;
const HOME_SECTORS = {
  CryptoPups: {
    icon: "◌",
    title: "Crypto Coast",
    copy: "Beach-born duelists built for speed bursts and stylish finishers.",
  },
  CyberPups: {
    icon: "△",
    title: "Cyber Grid",
    copy: "Armored tacticians who grind out rounds with precision and defence.",
  },
  AlienPups: {
    icon: "✦",
    title: "Bloom Nebula",
    copy: "High-rarity cosmic beasts that spike fights with volatile late-round power.",
  },
};
const RARITY_WEIGHTS = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
  mythic: 6,
  mystic: 7,
};
const PLAYSTYLE_COPY = {
  power: "frontline burst pressure",
  speed: "tempo control and fast turns",
  intelligence: "mind-game reads and counterplay",
  defence: "anchor defence and attrition",
  luck: "high-variance steal potential",
};
const HOME_PANEL_STORAGE_NAMESPACE = "pupverse-home-panels";
const HOME_PANEL_KEYS = ["showcase", "daily", "command"];

let selectedVaultCardId = null;
let vaultCardFlipped = false;
let homeDeckFlippedCardId = null;
let homeDeckOrbitPaused = false;
let homeDeckOrbitRotation = 0;
let packTimer = null;
let matchmakingTimer = null;
let subscribedMatchId = null;
let packOverlay = null;
let revealedPackCards = 0;
let packOpeningRequestInFlight = false;
let activeInfoPanel = null;
let onlineStatus = navigator.onLine;
let deferredInstallPrompt = null;
let compareCardIds = [];
let vaultDeckDraftIds = null;
let deckSaveInFlight = false;
const TEXT_SIZE_STORAGE_KEY = "pupverse-large-text";
let largeTextEnabled = window.localStorage?.getItem(TEXT_SIZE_STORAGE_KEY) === "true";
const ONBOARDING_STORAGE_KEY = "pupverse-beta-onboarding-dismissed";
const DAILY_COMPLETION_ANALYTICS_KEY = "pupverse-daily-completion:";
const FEEDBACK_URL = "https://github.com/McauleeMaddison/pupverse/issues/new";

function getFeedbackUrl() {
  const url = new URL(FEEDBACK_URL);
  const viewport = `${window.innerWidth || "?"} × ${window.innerHeight || "?"}`;
  const platform = navigator.userAgentData?.platform || navigator.platform || "Unknown platform";
  url.searchParams.set("title", "PupVerse beta feedback");
  url.searchParams.set("body", `## What happened?\n<!-- Briefly tell us what you were trying to do and what went wrong. -->\n\n## What did you expect?\n\n## Device details\n- Platform: ${platform}\n- Browser: ${navigator.userAgent}\n- Viewport: ${viewport}\n- Signed in: yes / no\n\n<!-- Please do not include your password, email address, or private account details. -->`);
  return url.toString();
}
const RANKED_BETA_ENABLED = false;

const backend = {
  configured: isSupabaseConfigured,
  session: null,
  profile: null,
  decks: [],
  leaderboard: [],
  dailyBoard: null,
  remoteMatch: null,
  presence: {},
  authMode: "signin",
  upgradingGuest: false,
  resettingPassword: false,
  message: "",
  error: "",
};
const homePanels = loadHomePanels();

function getAccountErrorMessage(error) {
  const candidates = [
    error?.message,
    error?.error_description,
    error?.details,
    error?.context?.message,
    error?.context?.body,
    typeof error === "string" ? error : "",
  ];
  let message = "";

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim() || candidate.trim() === "{}") continue;
    try {
      const parsed = JSON.parse(candidate);
      const parsedMessage = parsed?.message || parsed?.error_description || parsed?.error || parsed?.details;
      if (typeof parsedMessage === "string" && parsedMessage.trim()) {
        message = parsedMessage.trim();
        break;
      }
    } catch {
      message = candidate.trim();
      break;
    }
  }

  const lowerMessage = message.toLowerCase();
  if (/redirect|site url|redirect_to/.test(lowerMessage)) return "Account confirmation is not configured for this app address yet. Please try again shortly.";
  if (/email.*disabled|signups?.*disabled/.test(lowerMessage)) return "New account creation is temporarily unavailable. Please try again shortly.";
  if (/rate limit|too many requests/.test(lowerMessage)) return "Too many attempts from this device. Please wait a few minutes, then try again.";
  if (/database|saving new user|profile/.test(lowerMessage)) return "Your account could not be prepared securely. Please try again in a moment.";
  if (/network|fetch|failed to fetch/.test(lowerMessage)) return "We could not reach the secure account service. Check your connection and try again.";
  return message || "Account creation did not complete. Please try again in a moment.";
}

function getDefaultHomePanels() {
  const compactViewport = window.matchMedia?.("(max-width: 820px)")?.matches ?? false;
  if (!compactViewport) {
    return { showcase: true, daily: true, command: true };
  }

  return {
    showcase: false,
    daily: false,
    command: false,
  };
}

function getHomePanelStorageKey() {
  const compactViewport = window.matchMedia?.("(max-width: 820px)")?.matches ?? false;
  return `${HOME_PANEL_STORAGE_NAMESPACE}-${compactViewport ? "mobile" : "desktop"}`;
}

function loadHomePanels() {
  const defaults = getDefaultHomePanels();

  try {
    const rawValue = window.localStorage?.getItem(getHomePanelStorageKey());
    if (!rawValue) return defaults;

    const parsed = JSON.parse(rawValue);
    return HOME_PANEL_KEYS.reduce((panels, key) => {
      panels[key] = typeof parsed?.[key] === "boolean" ? parsed[key] : defaults[key];
      return panels;
    }, { ...defaults });
  } catch {
    return defaults;
  }
}

function persistHomePanels() {
  try {
    window.localStorage?.setItem(getHomePanelStorageKey(), JSON.stringify(homePanels));
  } catch {}
}

function isHomePanelOpen(panelKey) {
  return Boolean(homePanels[panelKey]);
}

function toggleHomePanel(panelKey) {
  if (!HOME_PANEL_KEYS.includes(panelKey)) return;
  homePanels[panelKey] = !isHomePanelOpen(panelKey);
  persistHomePanels();
  renderApp();
}

function ensureHomePanelOpen(panelKey) {
  if (!HOME_PANEL_KEYS.includes(panelKey) || isHomePanelOpen(panelKey)) return;
  homePanels[panelKey] = true;
  persistHomePanels();
}

function getCoinBalance() {
  return backend.profile?.coins ?? gameState.coins;
}

function hasTutorialWin() {
  return (Number(gameState.playerWins) || 0) > 0;
}

function hasOpenedFirstPack() {
  return (Number(gameState.totalPacksOpened) || 0) > 0;
}

function hasCompletedFirstMission(dailyBoard) {
  return Number(dailyBoard?.completedCount || 0) > 0;
}

function hasClaimedFirstReward(dailyBoard) {
  return Boolean(dailyBoard?.rewardClaimed);
}

function playHaptic(pattern = 12) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  navigator.vibrate?.(pattern);
}

function canStartGuestRun() {
  return backend.configured && !backend.session;
}

function getPrimaryPlayConfig() {
  if (!hasTutorialWin()) {
    return {
      action: "go-battle",
      tag: "Tutorial",
      title: "Win your first round",
      copy: "Learn the stat battle in under a minute.",
    };
  }

  if (backend.session?.user) {
    return {
      action: "go-online",
      tag: "Live arena",
      title: "Queue a real match",
      copy: "Take your synced squad into protected PvP.",
    };
  }

  return {
    action: "go-battle",
    tag: "Solo arena",
    title: "Run a quick rematch",
    copy: "Short battles keep the collection loop moving.",
  };
}

function getRookieSteps(dailyBoard) {
  const starterPack = packs[0];

  return [
    {
      id: "guest",
      label: "Guest start",
      description: "Save this run instantly, then secure the account later.",
      complete: !canStartGuestRun(),
      action: "start-guest",
      hidden: !backend.configured,
    },
    {
      id: "tutorial",
      label: "Tutorial win",
      description: "Beat one solo round to learn the stat battle loop.",
      complete: hasTutorialWin(),
      action: "go-battle",
    },
    {
      id: "pack",
      label: "First pack",
      description: "Open one starter pack and send the pulls into your vault.",
      complete: hasOpenedFirstPack(),
      action: "open-pack",
      packId: starterPack?.id || "crypto",
    },
    {
      id: "mission",
      label: "First mission",
      description: "Progress the daily board so the first live reward unlocks fast.",
      complete: hasCompletedFirstMission(dailyBoard),
      action: "focus-daily",
    },
    {
      id: "reward",
      label: "First reward",
      description: "Claim the bonus card and 24 coins once the board is cleared.",
      complete: hasClaimedFirstReward(dailyBoard),
      action: dailyBoard?.canClaim ? "claim-daily" : "focus-daily",
    },
  ].filter((step) => !step.hidden);
}

function getActiveRookieStep(dailyBoard) {
  return getRookieSteps(dailyBoard).find((step) => !step.complete) || null;
}

function focusHomeSection(panelKey, selector) {
  ensureHomePanelOpen(panelKey);
  selectedVaultCardId = null;
  vaultCardFlipped = false;
  gameState.mode = "home";
  renderApp();
  requestAnimationFrame(() => {
    document
      .querySelector(selector)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function startGuestRun() {
  const result = await signInAsGuest();
  await handleSession(result.session || null);
  startComputerBattle();
  renderApp();
}

function startPrimaryPlayFlow() {
  selectedVaultCardId = null;
  vaultCardFlipped = false;

  if (getPrimaryPlayConfig().action === "go-online") {
    openArenaLeague();
  } else {
    startComputerBattle();
  }

  renderApp();
}

function activeDeck() {
  return backend.decks.find((deck) => deck.active && deck.deck_cards?.length === 5) || null;
}

async function refreshPlayerData() {
  const userId = backend.session?.user?.id;
  if (!userId) return;
  const result = await loadPlayerData(userId);
  backend.profile = result.profile;
  backend.decks = result.decks;
  const remoteDeck = result.decks.find((deck) => deck.active) || result.decks[0];
  if (remoteDeck?.deck_cards?.length) gameState.activeDeckCardIds = remoteDeck.deck_cards.map((entry) => entry.card_id);
  backend.leaderboard = result.leaderboard;
  backend.dailyBoard = result.dailyBoard;
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
    backend.dailyBoard = null;
    backend.remoteMatch = null;
    useLocalProgress();
  }
  renderApp();
}

async function bootstrapBackend() {
  if (!backend.configured) return;

  try {
    const { session } = await initializeArenaBackend((nextSession, event) => {
      if (event === "PASSWORD_RECOVERY") {
        backend.resettingPassword = true;
        openArenaLeague();
      }
      handleSession(nextSession);
    });

    // Do not automatically create an anonymous account.
    // Public players must deliberately create or sign into an account.
    await handleSession(session);
  } catch (error) {
    backend.error = error.message;
    renderApp();
  }
}

function renderBrand() {
  return `<button class="pvx-brand" data-action="go-home" aria-label="PupVerse home"><span class="pvx-brand-gem"><i>PV</i></span><span><b>PUP<span>VERSE</span></b><small>Neon collectible card battler</small></span></button>`;
}

function hasDismissedOnboarding() {
  try { return window.localStorage?.getItem(ONBOARDING_STORAGE_KEY) === "true"; }
  catch { return false; }
}

function renderInfoPanel() {
  if (!activeInfoPanel) return "";
  const panels = {
    beta: { eyebrow: "Public beta", title: "Built with players", copy: "PupVerse is actively being tuned. Game balance, rewards, and online features may change while we learn from the community." },
    safety: { eyebrow: "Player safety", title: "Play smart. Stay kind.", copy: "PupVerse is designed for players aged 13+. Do not share personal details, passwords, or private room codes publicly. Use the in-match Report and Block controls if another player breaks the rules." },
    privacy: { eyebrow: "Privacy", title: "Only what the game needs", copy: "Account details are used to save your progress and keep matches secure. Product analytics use anonymous event names, not personal details. Contact support to request help with your account." },
    terms: { eyebrow: "Terms of play", title: "Keep the arena fair", copy: "No cheating, harassment, account sharing, or attempts to manipulate rewards or rankings. Beta content is virtual only, has no cash value, and may change as the game evolves." },
    howto: { eyebrow: "How to play", title: "Choose. Compare. Win.", copy: "In Solo Battle, choose one stat from your pup’s card. The higher value wins the round. Win a battle, open packs to grow your Vault, then return to Daily Ops for a bonus card and coins." },
    install: { eyebrow: "Install PupVerse", title: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "Add it to your iPhone" : /Android/i.test(navigator.userAgent) ? "Add it to your Android" : "Install on mobile", copy: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "In Safari, tap Share, then choose Add to Home Screen. PupVerse will launch like an app from your home screen." : /Android/i.test(navigator.userAgent) ? "In Chrome, open the browser menu and choose Install app or Add to Home screen. You can then launch PupVerse from your app drawer." : "Open PupVerse on Safari for iPhone or Chrome for Android, then use the browser menu to add it to your home screen." },
  };
  const panel = panels[activeInfoPanel];
  if (!panel) return "";
  return `<section class="pvx-info-modal" role="dialog" aria-modal="true" aria-labelledby="infoPanelTitle"><button class="pvx-info-scrim" data-action="close-info" aria-label="Close information panel"></button><article><button class="pvx-info-close" data-action="close-info" aria-label="Close">×</button><p class="pvx-eyebrow"><i></i> ${panel.eyebrow}</p><h2 id="infoPanelTitle">${panel.title}</h2><p>${panel.copy}</p><button class="pvx-primary" data-action="close-info">Got it <i>→</i></button></article></section>`;
}

function renderBetaFooter() {
  return `<footer class="pvx-beta-footer"><div><span class="pvx-beta-pill">Public beta</span><p>${onlineStatus ? "Play instantly · Progress may change during beta" : "You’re offline · Local play is still available"}</p></div><nav aria-label="Beta information"><button data-action="toggle-text-size" aria-pressed="${largeTextEnabled}">${largeTextEnabled ? "Standard text" : "Larger text"}</button><button data-action="show-info" data-panel="howto">How to play</button><button data-action="install-app">${deferredInstallPrompt ? "Install app" : "Install"}</button><button data-action="show-info" data-panel="safety">Safety</button><button data-action="show-info" data-panel="privacy">Privacy</button><button data-action="show-info" data-panel="terms">Terms</button><button data-action="open-feedback">Feedback ↗</button></nav></footer>`;
}

function renderShell(content, active = gameState.mode) {
  const coins = backend.profile?.coins ?? gameState.coins;
  const avatar = escapeHtml(backend.profile?.avatar || "MP");
  const username = escapeHtml(backend.profile?.username || "MADDYPUP");
  const isGuest = Boolean(backend.session?.user?.is_anonymous);
  const hasSession = Boolean(backend.session?.user);
  const mobileAccountLabel = hasSession ? "Online" : "Sign in";

  return `
    <section class="pvx-shell">
      <a class="pvx-skip-link" href="#pvx-main-content">Skip to game content</a>
      <header class="pvx-topbar">
        ${renderBrand()}

        <nav class="pvx-nav" aria-label="Primary navigation">
          <button class="${active === "home" ? "active" : ""}" data-action="go-home">
            <span>⌂</span><b>Home</b>
          </button>

          <button class="${active === "daily" ? "active" : ""}" data-action="go-daily">
            <span>✦</span><b>Daily</b>
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

        <button class="pvx-mobile-account" data-action="go-online" aria-label="${mobileAccountLabel}: open account and online play">
          <span class="pvx-avatar" aria-hidden="true">${avatar}</span>
          <b>${mobileAccountLabel}</b>
        </button>
      </header>

      <main class="pvx-main" id="pvx-main-content" tabindex="-1">
        ${content}
      </main>

      ${renderBetaFooter()}

      <nav class="pvx-mobile-nav" aria-label="Mobile navigation">
        <button class="${active === "battle" || active === "online" ? "active" : ""}" data-action="go-play">
          <span>⚔</span><b>Play</b>
        </button>

        <button class="${active === "daily" ? "active" : ""}" data-action="go-daily">
          <span>✦</span><b>Daily Ops</b>
        </button>

        <button class="${active === "collection" ? "active" : ""}" data-action="go-vault">
          <span>◇</span><b>Vault</b>
        </button>

        <button class="${active === "online" ? "active" : ""}" data-action="go-online">
          <span>◉</span><b>${hasSession ? "Online" : "Account"}</b>
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

function getRecommendedBattleStat(card) {
  return stats.reduce((best, stat) => (
    getEffectiveStatValue(card, stat.key) > getEffectiveStatValue(card, best.key) ? stat : best
  ), stats[0]);
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getMilestone(value, step, minimum = step) {
  return Math.max(minimum, Math.ceil((Math.max(0, value) + 1) / step) * step);
}

function getCardPowerScore(card) {
  return stats.reduce((total, stat) => total + getEffectiveStatValue(card, stat.key), 0);
}

function getRarityWeight(card) {
  return RARITY_WEIGHTS[String(card?.rarity || "").toLowerCase()] || 0;
}

function getDominantStat(cardList) {
  return (
    stats
      .map((stat) => ({
        ...stat,
        value: cardList.length
          ? Math.round(
              cardList.reduce(
                (total, card) => total + getEffectiveStatValue(card, stat.key),
                0
              ) / cardList.length
            )
          : 0,
      }))
      .sort((left, right) => right.value - left.value)[0] || {
      ...stats[0],
      value: 0,
    }
  );
}

function getPackCompletionData(ownedCards) {
  return packs.map((pack) => {
    const packCards = cards.filter((card) => card.pack === pack.cardPackName);
    const ownedInPack = ownedCards.filter((card) => card.pack === pack.cardPackName);
    const dominant = getDominantStat(ownedInPack);
    const completion = clampPercent((ownedInPack.length / Math.max(1, packCards.length)) * 100);
    const flagship =
      [...ownedInPack].sort((left, right) => getCardPowerScore(right) - getCardPowerScore(left))[0] ||
      packCards[0] ||
      null;
    const meta = HOME_SECTORS[pack.cardPackName] || {
      icon: "◇",
      title: pack.cardPackName,
      copy: pack.description,
    };

    return {
      ...meta,
      pack,
      completion,
      ownedUnique: ownedInPack.length,
      totalCards: packCards.length,
      duplicates: ownedInPack.reduce((total, card) => total + Math.max(0, card.count - 1), 0),
      dominant,
      flagship,
      pressure: clampPercent(completion * 0.55 + dominant.value * 0.45),
    };
  });
}

function getHomeCommandData() {
  const ownedCards = getCollectionWithCounts();
  const progress = getCollectionProgress();
  const rating = backend.profile?.rank_rating ?? gameState.rankRating;
  const sectors = getPackCompletionData(ownedCards);
  const rosterLead =
    [...ownedCards].sort((left, right) => getCardPowerScore(right) - getCardPowerScore(left))[0] ||
    getShowcaseCards()[0] ||
    cards[0] ||
    null;
  const rarestCard =
    [...ownedCards].sort((left, right) =>
      getRarityWeight(right) - getRarityWeight(left) ||
      getCardPowerScore(right) - getCardPowerScore(left)
    )[0] || rosterLead;
  const rosterStat = getDominantStat(ownedCards);
  const recommendedPack = [...sectors].sort((left, right) =>
    (right.totalCards - right.ownedUnique) - (left.totalCards - left.ownedUnique) ||
    left.completion - right.completion ||
    left.pack.cost - right.pack.cost
  )[0] || sectors[0];
  const battleTarget = getMilestone(gameState.totalBattles, 5);
  const winTarget = getMilestone(backend.profile?.online_wins ?? gameState.onlineWins, 10, 10);
  const nextRankTarget = getNextRankTarget(rating);

  return {
    progress,
    rating,
    ownedCards,
    sectors,
    rosterLead,
    rarestCard,
    rosterStat,
    recommendedPack,
    prestigeCount: ownedCards.filter((card) => isPrestigeRarity(card)).length,
    journey: [
      {
        label: "Vault ascension",
        percent: progress.percentage,
        progressLabel: `${progress.uniqueOwned}/${progress.totalCards}`,
        reward: `${Math.max(0, progress.totalCards - progress.uniqueOwned)} pups still hidden`,
      },
      {
        label: "Battle rhythm",
        percent: clampPercent((gameState.totalBattles / battleTarget) * 100),
        progressLabel: `${gameState.totalBattles}/${battleTarget}`,
        reward: `${Math.max(0, battleTarget - gameState.totalBattles)} rounds to next sync`,
      },
      {
        label: "League climb",
        percent: getRankProgress(rating),
        progressLabel: `${rating}/${nextRankTarget}`,
        reward: `${Math.max(0, nextRankTarget - rating)} RP to promotion`,
      },
      {
        label: "Arena momentum",
        percent: clampPercent(((backend.profile?.online_wins ?? gameState.onlineWins) / winTarget) * 100),
        progressLabel: `${backend.profile?.online_wins ?? gameState.onlineWins}/${winTarget}`,
        reward: `${Math.max(0, winTarget - (backend.profile?.online_wins ?? gameState.onlineWins))} wins to milestone`,
      },
    ],
    liveOps: [
      sectors[0]
        ? {
            window: "Sector pulse",
            title: sectors[0].title,
            copy: `${sectors[0].completion}% charted · ${sectors[0].dominant.label} dominance`,
          }
        : {
            window: "Sector pulse",
            title: "First contact",
            copy: "Open your first pack to reveal which faction leads your run.",
          },
      rosterLead
        ? {
            window: "Prime unit",
            title: rosterLead.name,
            copy: `${rosterLead.rarity} ${rosterLead.element} with ${getCardPowerScore(rosterLead)} total combat output`,
          }
        : {
            window: "Prime unit",
            title: "No champion selected",
            copy: "Your first rare pull will become the face of the roster.",
          },
      recommendedPack
        ? {
            window: "Next breach",
            title: recommendedPack.pack.name,
            copy: `${Math.max(0, recommendedPack.totalCards - recommendedPack.ownedUnique)} undiscovered pups · cost ${recommendedPack.pack.cost}`,
          }
        : {
            window: "Next breach",
            title: "CryptoPups Pack",
            copy: "Start by unlocking a balanced core squad for solo and online play.",
          },
    ],
  };
}

function renderJourneyTrack(track) {
  return `<article class="pvx-journey-track"><div><small>${escapeHtml(track.label)}</small><strong>${escapeHtml(track.progressLabel)}</strong></div><div class="pvx-progress"><i style="width:${track.percent}%"></i></div><p>${escapeHtml(track.reward)}</p></article>`;
}

function getDailyTaskAction(task) {
  const soloTask = task.group === "soloWins" || task.group === "soloBattles";
  return soloTask
    ? { action: "go-battle", label: "Play solo" }
    : { action: "go-shop", label: "Open packs" };
}

function renderDailyTask(task) {
  const taskAction = getDailyTaskAction(task);
  return `<article class="pvx-daily-task ${task.complete ? "complete" : ""}"><div class="pvx-daily-task-head"><span>${escapeHtml(task.icon)}</span><div><small>${escapeHtml(task.title)}</small><p>${escapeHtml(task.description)}</p></div><strong>${task.complete ? "Done" : `${task.progress}/${task.goal}`}</strong></div><div class="pvx-progress"><i style="width:${task.percent}%"></i></div>${task.complete ? "" : `<button class="pvx-daily-task-action" data-action="${taskAction.action}">${escapeHtml(taskAction.label)}<i>→</i></button>`}</article>`;
}

function renderStreakCalendar(streak, rewardClaimed) {
  const today = new Date();
  const activeDays = Math.min(Math.max(0, streak), 7);
  const endsToday = rewardClaimed;
  const firstActiveIndex = 7 - activeDays - (endsToday ? 0 : 1);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const isToday = index === 6;
    const complete = activeDays > 0 && index >= Math.max(0, firstActiveIndex) && index < (endsToday ? 7 : 6);
    return `<li class="${complete ? "complete" : ""} ${isToday ? "today" : ""}" aria-label="${date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}${complete ? ", streak secured" : ""}"><small>${date.toLocaleDateString(undefined, { weekday: "narrow" })}</small><b>${complete ? "✓" : date.getDate()}</b></li>`;
  }).join("");
  const label = streak ? `${streak} day run` : "Start your run";
  const note = rewardClaimed ? "Today is secured." : "Claim today’s drop to extend it.";
  return `<section class="pvx-streak-calendar" aria-label="Daily streak calendar"><header><span>Streak path</span><strong>♨ ${label}</strong></header><ol>${days}</ol><p>${note}</p></section>`;
}

function getDailyNextAction(dailyBoard) {
  if (dailyBoard.rewardClaimed) {
    return { eyebrow: "Today complete", title: "Your ritual is banked", copy: "Your reward is safely in the vault. Explore the new pull or return after the refresh.", action: "go-vault", label: "Inspect vault" };
  }
  if (dailyBoard.canClaim) {
    return { eyebrow: "Board cleared", title: "Claim your daily drop", copy: "All four missions are complete. Finish the loop with today’s bonus card and coins.", action: "claim-daily", label: "Claim reward" };
  }
  const nextTask = dailyBoard.tasks.find((task) => !task.complete);
  if (!nextTask) return { eyebrow: "Daily Ops", title: "Keep your momentum", copy: "Your next reward is being prepared.", action: "go-home", label: "Back home" };
  const taskAction = getDailyTaskAction(nextTask);
  return { eyebrow: "Recommended next", title: nextTask.title, copy: nextTask.description, action: taskAction.action, label: taskAction.label };
}

function renderHomeMissionSummary(dailyBoard) {
  const nextAction = getDailyNextAction(dailyBoard);
  return `<article class="pvx-home-mission-summary ${dailyBoard.canClaim ? "ready" : ""} ${dailyBoard.rewardClaimed ? "claimed" : ""}"><div class="pvx-home-mission-top"><div><small>Daily Ops</small><h2>${dailyBoard.rewardClaimed ? "Ritual complete" : `${dailyBoard.completedCount}/${dailyBoard.totalTasks} missions`}</h2></div><span>${dailyBoard.rewardClaimed ? "✓" : `${dailyBoard.totalTasks - dailyBoard.completedCount} left`}</span></div><div class="pvx-home-mission-dots" aria-label="${dailyBoard.completedCount} of ${dailyBoard.totalTasks} daily missions complete">${dailyBoard.tasks.map((task) => `<i class="${task.complete ? "complete" : ""}"></i>`).join("")}</div><p>${escapeHtml(nextAction.copy)}</p><button data-action="${nextAction.action}">${escapeHtml(nextAction.label)} <i>→</i></button></article>`;
}

function renderSectorSnapshot(sector) {
  return `<article class="pvx-sector-mini"><div class="pvx-sector-mini-head"><span>${escapeHtml(sector.icon)}</span><small>${escapeHtml(sector.title)}</small><strong>${sector.ownedUnique}/${sector.totalCards}</strong></div><div class="pvx-progress"><i style="width:${sector.pressure}%"></i></div><p>${sector.completion}% scanned · ${escapeHtml(sector.dominant.short)} ${sector.dominant.value}</p></article>`;
}

function renderCoreActionCard(action) {
  const packAttr = action.packId ? ` data-pack-id="${escapeHtml(action.packId)}"` : "";

  return `
    <article class="pvx-core-action ${action.featured ? "featured" : ""}">
      <div class="pvx-core-action-icon">${escapeHtml(action.icon)}</div>
      <div class="pvx-core-action-copy">
        <small>${escapeHtml(action.kicker)}</small>
        <h2>${escapeHtml(action.title)}</h2>
        <p>${escapeHtml(action.copy)}</p>
      </div>
      <div class="pvx-core-action-meta">
        <strong>${escapeHtml(action.meta)}</strong>
        <button class="pvx-core-action-cta ${action.featured ? "featured" : ""}" data-action="${action.action}"${packAttr}>
          <span>${escapeHtml(action.button)}</span><i>→</i>
        </button>
      </div>
    </article>
  `;
}

function renderRookieStep(step, index, active) {
  const packAttr = step.packId ? ` data-pack-id="${escapeHtml(step.packId)}"` : "";

  return `
    <article class="pvx-rookie-step ${step.complete ? "complete" : ""} ${active ? "current" : ""}">
      <span>${step.complete ? "✓" : index + 1}</span>
      <div>
        <small>${escapeHtml(step.label)}</small>
        <p>${escapeHtml(step.description)}</p>
      </div>
      ${
        step.complete
          ? `<strong>Done</strong>`
          : active
            ? `<button data-action="${step.action}"${packAttr}>Continue</button>`
            : `<strong>Queued</strong>`
      }
    </article>
  `;
}

function renderHomePanel({ panelKey, className = "", eyebrow, title, summary, badge, content }) {
  const open = isHomePanelOpen(panelKey);

  return `
    <section class="pvx-home-panel ${className} ${open ? "open" : "collapsed"}" data-panel-state="${open ? "open" : "collapsed"}">
      <header class="pvx-home-panel-head">
        <div class="pvx-home-panel-copy">
          <p class="pvx-eyebrow"><i></i> ${escapeHtml(eyebrow)}</p>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(summary)}</p>
        </div>
        <div class="pvx-home-panel-meta">
          ${badge ? `<span class="pvx-home-panel-badge">${escapeHtml(badge)}</span>` : ""}
          <button class="pvx-home-panel-toggle" data-action="toggle-home-panel" data-panel="${panelKey}" aria-expanded="${open}">
            <small>${open ? "Minimise" : "Open panel"}</small>
            <b>${open ? "-" : "+"}</b>
          </button>
        </div>
      </header>
      ${open ? `<div class="pvx-home-panel-body">${content}</div>` : ""}
    </section>
  `;
}

function getActiveDailyBoard() {
  const sourceBoard = backend.session?.user
    ? backend.dailyBoard || getDailyMissionBoard()
    : getDailyMissionBoard();

  if (!sourceBoard) return getDailyMissionBoard();

  return {
    ...sourceBoard,
    rewardCard:
      sourceBoard.rewardCard ||
      cards.find((card) => card.id === sourceBoard.rewardCardId) ||
      null,
  };
}

function trackDailyBoardCompletion(board = getActiveDailyBoard()) {
  const total = Number(board?.totalTasks || 0);
  const completed = Number(board?.completedCount || 0);
  if (!total || completed < total) return;

  const source = backend.session?.user ? "cloud" : "local";
  const player = backend.session?.user?.id || "device";
  const boardKey = board?.id || board?.cycleKey || board?.refreshAt || "current";
  const storageKey = `${DAILY_COMPLETION_ANALYTICS_KEY}${source}:${player}:${boardKey}`;

  try {
    if (window.localStorage?.getItem(storageKey)) return;
    window.localStorage?.setItem(storageKey, "true");
  } catch {
    // Do not risk duplicate analytics if browser storage is unavailable.
    return;
  }

  trackEvent("daily_board_completed", { source });
}

function renderHomeDeckHand() {
  const deckCards = getActiveDeckCardIds().map((id) => cards.find((card) => card.id === id)).filter(Boolean);
  const ready = deckCards.length === 5;
  return `<section class="pvx-home-deck-hand pvx-home-deck-orbit ${ready ? "ready" : "incomplete"} ${homeDeckOrbitPaused ? "is-paused" : ""}"><header><div><small>Active hand</small><h2>${ready ? "Your cards are in motion" : `${deckCards.length}/5 cards selected`}</h2></div><button class="pvx-deck-orbit-control" data-action="toggle-deck-orbit" aria-pressed="${homeDeckOrbitPaused}" aria-label="${homeDeckOrbitPaused ? "Resume" : "Pause"} deck rotation"><span>${homeDeckOrbitPaused ? "▶" : "Ⅱ"}</span>${homeDeckOrbitPaused ? "Resume" : "Pause"}</button></header><div class="pvx-home-deck-fan" data-deck-orbit style="--orbit-turn:${homeDeckOrbitRotation}deg">${deckCards.length ? `<div class="pvx-deck-orbit-glow" aria-hidden="true"></div>${deckCards.map((card, index) => `<div class="pvx-deck-orbit-slot card-${index + 1}" style="--slot:${index * (360 / deckCards.length)}deg"><button class="pvx-home-deck-card ${homeDeckFlippedCardId === card.id ? "flipped" : ""}" data-action="toggle-home-deck-card" data-card-id="${card.id}" aria-pressed="${homeDeckFlippedCardId === card.id}" aria-label="Flip ${escapeHtml(card.name)}"><span class="pvx-home-deck-card-inner"><span class="pvx-home-deck-card-front">${renderCardImage(card)}<b>${escapeHtml(card.name)}</b></span><span class="pvx-home-deck-card-back"><small>${escapeHtml(card.rarity)} · ${escapeHtml(card.element)}</small><strong>${escapeHtml(card.name)}</strong><div>${stats.map((stat) => `<span><i>${stat.short}</i><b>${getStatValue(card, stat.key)}</b></span>`).join("")}</div><em>Tap to flip back</em></span></span></button></div>`).join("")}` : `<div class="pvx-home-deck-empty"><i>◇</i><b>Your first deck is waiting</b><span>Choose five cards in the Vault to build your hand.</span></div>`}</div><footer><p>${ready ? "Drag to steer the hand. Tap a card to hold and inspect it, then tap again to return it to motion." : "Your strongest five cards become your active hand."}</p><div><button data-action="go-vault">Manage deck</button><button class="pvx-home-deck-battle" data-action="go-battle" ${ready ? "" : "disabled"}>${ready ? "Battle now →" : "Select cards"}</button></div></footer></section>`;
}

function renderHome() {
  const dailyBoard = getActiveDailyBoard();
  const level = backend.profile?.level ?? gameState.level;
  const showOnboarding = !hasDismissedOnboarding() && !hasTutorialWin();
  const playConfig = getPrimaryPlayConfig();
  const heroPrimaryAction = !hasTutorialWin()
    ? { action: "go-battle", label: "Start first battle", kicker: "No account needed" }
    : { action: "go-play", label: playConfig.title, kicker: playConfig.tag };
  const heroSecondaryAction = {
    action: dailyBoard.canClaim ? "claim-daily" : "go-daily",
    label: dailyBoard.canClaim ? "Claim today's reward" : "View daily ops",
  };
  const showAccountCta = backend.configured && !backend.session;
  const coreActions = [
    {
      icon: "⚔",
      kicker: "Play",
      title: !hasTutorialWin() ? "Enter the arena" : playConfig.title,
      copy: !hasTutorialWin()
        ? "Start a fast tutorial match, choose your strongest stat, and take your first win."
        : playConfig.copy,
      meta: !hasTutorialWin()
        ? "Play instantly"
        : hasTutorialWin()
          ? `${gameState.playerWins} solo win${gameState.playerWins === 1 ? "" : "s"}`
          : "1 round to clear",
      action: !hasTutorialWin() ? "go-battle" : "go-play",
      button: !hasTutorialWin() ? "Start battle" : "Play now",
      featured: true,
    },
  ];

  return renderShell(`
    <section class="pvx-home">
      <div class="pvx-home-aurora"></div><div class="pvx-home-orbit orbit-a"></div><div class="pvx-home-orbit orbit-b"></div>
      <section class="pvx-home-hero">
        <div class="pvx-hero-copy">
          <p class="pvx-eyebrow"><i></i> Your first match is ready</p>
          <h1><span>NEON</span><em>BATTLES</em></h1>
          <p class="pvx-hero-text">Choose a stat. Win the round. Build your collection. PupVerse delivers fast, focused card battles with a rewarding daily rhythm.</p>
          <div class="pvx-home-badges"><span>Fast three-minute battles</span><span>Play instantly</span><span>Daily card + 24 coins</span></div>
          <div class="pvx-hero-actions"><button class="pvx-primary" data-action="${heroPrimaryAction.action}"><span>${escapeHtml(heroPrimaryAction.kicker)}</span><b>${escapeHtml(heroPrimaryAction.label)}</b><i>→</i></button><button class="pvx-secondary" data-action="${heroSecondaryAction.action}"><span>✦</span><b>${escapeHtml(heroSecondaryAction.label)}</b></button>${showAccountCta ? `<button class="pvx-account-cta" data-action="go-signup"><span>◉</span><b>Create account or sign in</b><i>→</i></button>` : ""}</div>
          <div class="pvx-home-level"><small>Player level</small><strong>${level}</strong><span>Keep your streak moving</span></div>
        </div>
        ${renderHomeDeckHand()}
      </section>
      <section class="pvx-home-command"><div class="pvx-core-actions">${coreActions.map(renderCoreActionCard).join("")}</div>${renderHomeMissionSummary(dailyBoard)}</section>
      ${showOnboarding ? `<aside class="pvx-onboarding" aria-label="Getting started"><div><p class="pvx-eyebrow"><i></i> Your first three moves</p><h2>Start simple. Build momentum.</h2><p>Every first session follows the same satisfying loop—battle, collect, return.</p></div><ol><li><b>01</b><span><strong>Battle</strong><small>Choose a stat and take your first round.</small></span></li><li><b>02</b><span><strong>Open a pack</strong><small>Turn your win into fresh tactical options.</small></span></li><li><b>03</b><span><strong>Visit Daily Ops</strong><small>Complete missions for a bonus drop.</small></span></li></ol><button data-action="dismiss-onboarding">I’m ready <i>→</i></button></aside>` : ""}
    </section>`, "home");
}

function renderDailyOps() {
  const dailyBoard = getActiveDailyBoard();
  const rewardCard = dailyBoard.rewardCard;
  const remaining = dailyBoard.totalTasks - dailyBoard.completedCount;
  const streak = Number(dailyBoard.streak || backend.profile?.daily_streak || 0);
  const nextAction = getDailyNextAction(dailyBoard);
  const dailyRewardCopy = dailyBoard.rewardClaimed
    ? "Today's reward is safely in your vault. A fresh mission board arrives at the next reset."
    : dailyBoard.rewardLocked
      ? "Sign in to protect daily drops and claim them from the progression service."
      : dailyBoard.canClaim
        ? "Every mission is complete. Your bonus card and coins are ready to collect."
        : `${remaining} mission${remaining === 1 ? "" : "s"} left before today's reward unlocks.`;

  return renderShell(`
    <section class="pvx-daily-page ${dailyBoard.rewardClaimed ? "claimed" : ""}">
      <div class="pvx-daily-page-glow"></div>
      <header class="pvx-daily-page-head">
        <div>
          <p class="pvx-eyebrow"><i></i> Your daily ritual</p>
          <h1>DAILY <span>OPS</span></h1>
          <p>Four focused challenges. One premium drop. Complete the board before the next refresh and keep your streak alive.</p>
        </div>
        <div class="pvx-daily-reset"><small>Next refresh</small><strong>${dailyBoard.refreshesIn}</strong><span>${dailyBoard.completedCount}/${dailyBoard.totalTasks} complete</span></div>
      </header>
      <div class="pvx-daily-page-layout">
        <section class="pvx-daily-missions">
          <div class="pvx-daily-section-label"><span>Today’s challenges</span><div><small class="pvx-daily-streak">♨ ${streak} day streak</small><small>${dailyBoard.completedCount === dailyBoard.totalTasks ? "Board complete" : "Keep going"}</small></div></div>
          <section class="pvx-daily-next ${dailyBoard.canClaim ? "ready" : ""} ${dailyBoard.rewardClaimed ? "claimed" : ""}" aria-live="polite"><div><small>${escapeHtml(nextAction.eyebrow)}</small><h2>${escapeHtml(nextAction.title)}</h2><p>${escapeHtml(nextAction.copy)}</p></div><button data-action="${nextAction.action}">${escapeHtml(nextAction.label)} <i>→</i></button></section>
          <div class="pvx-daily-task-grid">${dailyBoard.tasks.map(renderDailyTask).join("")}</div>
        </section>
        <aside class="pvx-daily-reward-panel">
          <div class="pvx-daily-reward-copy"><small>Today’s drop</small><h3>${rewardCard ? escapeHtml(rewardCard.name) : "Bonus reward"}</h3><p>${escapeHtml(dailyRewardCopy)}</p></div>
          ${renderStreakCalendar(streak, dailyBoard.rewardClaimed)}
          ${rewardCard ? `<button class="pvx-daily-reward-card" data-action="preview-card" data-card-id="${rewardCard.id}" aria-label="Preview ${escapeHtml(rewardCard.name)}">${renderCardImage(rewardCard)}<span><small>${escapeHtml(rewardCard.rarity)}</small><b>${escapeHtml(rewardCard.name)}</b><em>${escapeHtml(rewardCard.element)}</em></span></button>` : ""}
          <div class="pvx-daily-loot"><span>Bonus card</span><strong>◈ ${dailyBoard.coinsReward}</strong><small>Coins included</small></div>
          <button class="pvx-primary" data-action="claim-daily" ${dailyBoard.canClaim ? "" : "disabled"}>${dailyBoard.rewardClaimed ? "Collected" : dailyBoard.rewardLocked ? "Sign in to claim" : dailyBoard.canClaim ? "Claim daily drop" : "Finish daily challenges"}<i>→</i></button>
          <button class="pvx-daily-home-link" data-action="go-home">Back home</button>
        </aside>
      </div>
    </section>`, "daily");
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
  const favourite = gameState.favouriteCards.includes(card.id);
  const inDeck = getVaultDeckDraftIds().includes(card.id);
  const compared = compareCardIds.includes(card.id);
  return `<article class="pvx-vault-card" style="--delay:${Math.min(index, 12) * .045}s"><button class="pvx-vault-card-main" data-action="preview-card" data-card-id="${card.id}"><div class="pvx-vault-image"><span class="pvx-rarity rarity-${card.rarity.toLowerCase()}">${escapeHtml(card.rarity)}</span>${card.count > 1 ? `<span class="pvx-quantity">×${card.count}</span>` : ""}${renderCardImage(card)}<div class="pvx-card-sheen"></div><span class="pvx-inspect">Inspect card <i>↗</i></span></div><div class="pvx-vault-copy"><small>${escapeHtml(card.pack)}</small><h3>${escapeHtml(card.name)}</h3><p>${escapeHtml(card.element)}</p><div><span>${strongest.short}</span><strong>${getStatValue(card, strongest.key)}</strong><i style="width:${getStatValue(card, strongest.key)}%"></i></div></div></button><footer><button class="${favourite ? "active" : ""}" data-action="toggle-favourite" data-card-id="${card.id}" aria-label="${favourite ? "Remove" : "Add"} ${escapeHtml(card.name)} ${favourite ? "from" : "to"} favourites">${favourite ? "♥" : "♡"}</button><button class="${inDeck ? "active" : ""}" data-action="toggle-deck-card" data-card-id="${card.id}" aria-pressed="${inDeck}">${inDeck ? "In hand" : "Add hand"}</button><button class="${compared ? "active" : ""}" data-action="toggle-compare" data-card-id="${card.id}" ${!compared && compareCardIds.length >= 2 ? "disabled" : ""}>${compared ? "Selected" : "Compare"}</button></footer></article>`;
}

function getVaultDeckDraftIds() {
  if (!vaultDeckDraftIds) vaultDeckDraftIds = [...getActiveDeckCardIds()];
  return vaultDeckDraftIds;
}

function hasVaultDeckDraftChanges() {
  const active = getActiveDeckCardIds();
  const draft = getVaultDeckDraftIds();
  return active.length !== draft.length || active.some((cardId, index) => cardId !== draft[index]);
}

function renderDeckBuilder() {
  const draft = getVaultDeckDraftIds();
  const deckCards = draft.map((id) => cards.find((card) => card.id === id)).filter(Boolean);
  const ready = deckCards.length === 5;
  const changed = hasVaultDeckDraftChanges();
  const cardSlots = Array.from({ length: 5 }, (_, index) => {
    const card = deckCards[index];
    return card
      ? `<button data-action="toggle-deck-card" data-card-id="${card.id}" style="--hand-slot:${index};--hand-rise:${Math.abs(index - 2) * 6}px" aria-label="Remove ${escapeHtml(card.name)} from your draft hand">${renderCardImage(card)}<i aria-hidden="true">×</i><b>${escapeHtml(card.name)}</b></button>`
      : `<div><i>＋</i><small>Choose card</small></div>`;
  }).join("");

  return `<section class="pvx-deck-builder pvx-hand-editor"><header><div><small>Active hand</small><h2>${ready ? "Five cards ready" : `${deckCards.length}/5 cards selected`}</h2></div><span>${changed ? "Unsaved changes" : "Saved"}</span></header><div class="pvx-deck-slots">${cardSlots}</div><p>${ready ? "Tap a card to remove it, then choose a replacement below." : "Choose five cards below to build your battle hand."}</p><footer>${changed ? `<button data-action="discard-deck-draft" ${deckSaveInFlight ? "disabled" : ""}>Discard</button><button class="pvx-primary" data-action="save-active-deck" ${ready && !deckSaveInFlight ? "" : "disabled"}>${deckSaveInFlight ? "Saving…" : "Save hand →"}</button>` : ready ? `<button class="pvx-primary" data-action="go-battle">Battle now →</button>` : ""}</footer></section>`;
}

function renderComparePanel() {
  if (!compareCardIds.length) return "";
  const compareCards = compareCardIds.map((id) => cards.find((card) => card.id === id)).filter(Boolean);
  return `<section class="pvx-compare-panel"><header><div><small>Card comparison</small><h2>${compareCards.length === 1 ? "Choose one more card" : "Head-to-head stats"}</h2></div><button data-action="clear-compare">Clear</button></header><div>${compareCards.map((card) => `<article>${renderCardImage(card)}<b>${escapeHtml(card.name)}</b>${stats.map((stat) => `<span><small>${stat.short}</small><strong>${getStatValue(card, stat.key)}</strong></span>`).join("")}</article>`).join("")}</div></section>`;
}

function renderCollection() {
  const progress = getCollectionProgress();
  const filtered = getFilteredCollectionCards();
  const counts = { All: progress.uniqueOwned, Favourites: gameState.favouriteCards.length, Duplicates: progress.duplicateCount, CryptoPups: progress.cryptoOwned, CyberPups: progress.cyberOwned, AlienPups: progress.alienOwned };
  const browsingAll = gameState.collectionFilter === "All" && gameState.collectionSort === "newest";
  return renderShell(`
    <section class="pvx-page pvx-vault">
      <header class="pvx-page-header vault-header"><div><p class="pvx-eyebrow"><i></i> Your cosmic archive</p><h1>COLLECTION <span>VAULT</span></h1><p>Every pup you discover lives here. Inspect a card to reveal its full holographic data.</p></div><div class="pvx-vault-meter"><div><strong>${progress.percentage}%</strong><small>complete</small></div><span><i style="--progress:${progress.percentage * 3.6}deg"></i></span></div></header>
      <section class="pvx-vault-summary"><article><span>◇</span><div><small>Unique pups</small><strong>${progress.uniqueOwned}<i> / ${progress.totalCards}</i></strong></div></article><article><span>✦</span><div><small>Total cards</small><strong>${gameState.collection.length}</strong></div></article><article><span>⧉</span><div><small>Duplicates</small><strong>${progress.duplicateCount}</strong></div></article><article class="wide"><div><small>Archive completion</small><strong>${progress.percentage}%</strong></div><div class="pvx-progress"><i style="width:${progress.percentage}%"></i></div></article></section>
      ${renderDeckBuilder()}
      ${renderComparePanel()}
      <nav class="pvx-filterbar" aria-label="Collection filters">${Object.entries(counts).map(([name, count]) => `<button class="${gameState.collectionFilter === name ? "active" : ""}" data-action="filter-vault" data-filter="${name}" aria-pressed="${gameState.collectionFilter === name}"><span>${name}</span><b>${count}</b></button>`).join("")}</nav>
      <nav class="pvx-vault-sort" aria-label="Sort collection"><span>Sort</span>${["newest", "rarity", "duplicates", "name"].map((sort) => `<button class="${gameState.collectionSort === sort ? "active" : ""}" data-action="sort-vault" data-sort="${sort}">${titleCase(sort)}</button>`).join("")}</nav>
      <div class="pvx-vault-browse-status" aria-live="polite"><span>${filtered.length} ${filtered.length === 1 ? "card" : "cards"} shown</span><small>${escapeHtml(gameState.collectionFilter)} · ${escapeHtml(titleCase(gameState.collectionSort))}</small>${browsingAll ? "" : `<button data-action="clear-vault-browse">Reset view</button>`}</div>
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
  return `<div class="pvx-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(card.name)} card details"><button class="pvx-modal-scrim" data-action="close-card" aria-label="Close card"></button><section class="pvx-card-viewer"><button class="pvx-modal-close" data-action="close-card" aria-label="Close">×</button><div class="pvx-modal-stage"><div class="pvx-holo-rings"></div><button class="pvx-flip-card ${vaultCardFlipped ? "flipped" : ""}" data-action="flip-card" aria-label="Flip ${escapeHtml(card.name)} card"><div class="pvx-flip-inner"><div class="pvx-flip-front">${renderCardImage(card)}<div class="pvx-card-sheen"></div></div>${renderCardBack(card)}</div></button><p>Tap card to ${vaultCardFlipped ? "view artwork" : "reveal combat data"}</p></div><div class="pvx-modal-copy"><p class="pvx-eyebrow"><i></i> ${escapeHtml(card.pack)} archive</p><h1>${escapeHtml(card.name)}</h1><div class="pvx-modal-tags"><span>${escapeHtml(card.rarity)}</span><span>${escapeHtml(card.element)}</span><span>${card.year}</span>${owned ? `<span>Owned ×${owned}</span>` : `<span>Preview</span>`}</div><p>${escapeHtml(card.ability?.description || "A one-of-a-kind pup forged in the PupVerse.")}</p><div class="pvx-modal-actions"><button class="pvx-primary" data-action="flip-card">${vaultCardFlipped ? "Show card art" : "Reveal stats"}<i>↻</i></button><button data-action="go-battle">Take to battle</button><button data-action="share-card" data-card-id="${card.id}">Share pull ↗</button></div><small class="pvx-modal-tip">Drag-free 3D reveal · Reduced-motion friendly</small></div></section></div>`;
}

function renderBattleCard(card, owner, hidden = false, player = false) {
  if (hidden) return `<article class="pvx-battle-card mystery"><span>${owner}</span><div class="pvx-mystery-card"><div class="pvx-mystery-rings"></div><b>PV</b><strong>?</strong><small>Opponent card encrypted</small></div></article>`;
  const won = gameState.computerRevealed && ((player && gameState.winner === "player") || (!player && gameState.winner === "computer"));
  const rarityClass = String(card.rarity || "standard").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `<article class="pvx-battle-card ${player ? "player" : "rival"} rarity-${rarityClass} ${gameState.winner ? (won ? "victorious" : "defeated") : ""} ${getPrestigeWinClass(card, won)}"><span>${owner}</span><div class="pvx-battle-image"><div class="pvx-rarity-aura" aria-hidden="true"></div>${renderCardImage(card)}<div class="pvx-card-sheen"></div>${won ? `<div class="pvx-win-burst"><i></i><i></i><i></i><b>${escapeHtml(card.rarity)} Victory</b></div>` : ""}${gameState.selectedStat ? `<b>${titleCase(gameState.selectedStat)} locked</b>` : ""}</div><h3>${escapeHtml(card.name)}</h3><p>${escapeHtml(card.rarity)} · ${escapeHtml(card.element)}</p></article>`;
}

function renderBattleHand(activeCard) {
  const activeDeck = getActiveDeckCardIds().map((id) => cards.find((card) => card.id === id)).filter(Boolean);
  const hand = activeDeck.length === 5 ? activeDeck : [activeCard, ...cards.filter((card) => card.id !== activeCard?.id)].slice(0, 5);
  return `<div class="pvx-battle-hand" aria-label="Your five-card hand">${hand.map((card, index) => `<span class="${card.id === activeCard?.id ? "selected" : ""}" style="--hand-index:${index}">${renderCardImage(card)}</span>`).join("")}</div>`;
}

function renderSoloBattle() {
  if (!gameState.playerCard || !gameState.computerCard) startComputerBattle();
  const selected = gameState.selectedStat;
  const result = gameState.roundResult;
  const dailyBoard = getActiveDailyBoard();
  const recommendedStat = getRecommendedBattleStat(gameState.playerCard);
  const outcomeLabel = gameState.winner === "player" ? "Round won" : gameState.winner === "computer" ? "Round lost" : gameState.winner === "draw" ? "Round drawn" : "Awaiting your move";
  const tutorialBanner = !hasTutorialWin()
    ? {
        eyebrow: "Rookie tutorial",
        title: "Win 1 round to unlock the first pack",
        copy: "Keep this first battle simple: choose the strongest stat, win the round, then jump straight into your first pack opening.",
        action: "show-info",
        panel: "howto",
        button: "How battles work",
      }
    : !hasOpenedFirstPack()
      ? {
          eyebrow: "Tutorial cleared",
          title: "Your first pack is next",
          copy: "The first win is secured. Open a starter pack now so the vault, daily board, and reward loop all come online.",
          action: "open-pack",
          button: "Open starter pack",
          packId: packs[0]?.id || "crypto",
        }
      : !hasCompletedFirstMission(dailyBoard)
        ? {
            eyebrow: "Daily board live",
            title: "Push the first mission",
            copy: "You have enough momentum now. Finish the open tasks on Daily Ops and claim the first bonus drop.",
            action: "focus-daily",
            button: "Open daily ops",
          }
        : null;
  const tutorialActionAttr = tutorialBanner?.packId
    ? ` data-pack-id="${escapeHtml(tutorialBanner.packId)}"`
    : tutorialBanner?.panel ? ` data-panel="${escapeHtml(tutorialBanner.panel)}"` : "";

  return renderShell(`
    <section class="pvx-arena">
      <header class="pvx-arena-head"><div><p class="pvx-eyebrow"><i></i> Solo combat simulation</p><h1>BATTLE <span>ARENA</span></h1></div><div class="pvx-scoreboard"><article><small>You</small><strong>${gameState.playerWins}</strong></article><span>VS</span><article><small>CPU</small><strong>${gameState.computerWins}</strong></article></div><button data-action="reset-solo">Reset run</button></header>
      ${
        tutorialBanner
          ? `<section class="pvx-battle-tutorial"><div><small>${escapeHtml(tutorialBanner.eyebrow)}</small><h2>${escapeHtml(tutorialBanner.title)}</h2><p>${escapeHtml(tutorialBanner.copy)}</p></div><button data-action="${tutorialBanner.action}"${tutorialActionAttr}>${escapeHtml(tutorialBanner.button)}</button></section>`
          : ""
      }
      <main class="pvx-arena-board impact-${selected || "idle"} ${gameState.winner ? `result-${gameState.winner}` : ""}"><div class="pvx-arena-sky"></div><div class="pvx-arena-nebula nebula-one"></div><div class="pvx-arena-nebula nebula-two"></div><div class="pvx-arena-comet"></div><div class="pvx-arena-floor"></div><div class="pvx-arena-beam beam-left"></div><div class="pvx-arena-beam beam-right"></div><div class="pvx-arena-impact" aria-hidden="true"><i></i><i></i><i></i></div><div class="pvx-head-to-head player-side">${renderBattleCard(gameState.playerCard, "Your challenger", false, true)}${renderBattleHand(gameState.playerCard)}</div><section class="pvx-referee" aria-live="polite"><span><i></i> Head-to-head arena</span><div class="pvx-vs-core"><b>VS</b><i></i></div>${gameState.winner ? `<b class="pvx-round-verdict ${gameState.winner}">${outcomeLabel}</b>` : ""}<p class="${gameState.winner || ""}">${escapeHtml(gameState.resultMessage)}</p>${selected ? `<div class="pvx-round-values">${renderRoundValue(result?.playerValue ?? getEffectiveStatValue(gameState.playerCard, selected), result?.playerBoost)}<span>${titleCase(selected)}</span>${renderRoundValue(result?.opponentValue ?? getEffectiveStatValue(gameState.computerCard, selected), result?.opponentBoost)}</div>` : `<small>Choose the stat that gives your pup the edge</small>`}</section><div class="pvx-head-to-head rival-side">${renderBattleCard(gameState.computerCard, "CPU challenger", !gameState.computerRevealed)}</div></main>
      <section class="pvx-stat-dock"><div><small>${gameState.computerRevealed ? "Official result" : "Your move"}</small><strong>${gameState.computerRevealed ? outcomeLabel : "Select one combat stat"}</strong>${!gameState.computerRevealed && !hasTutorialWin() ? `<p class="pvx-first-battle-coach"><i>✦</i><span><b>Strong opening move</b> ${escapeHtml(recommendedStat.label)} is your highest stat at ${getEffectiveStatValue(gameState.playerCard, recommendedStat.key)}.</span></p>` : ""}</div><div class="pvx-stat-grid">${stats.map((stat) => `<button class="${getAbilityBoost(gameState.playerCard, stat.key) ? "has-boost" : ""} ${!hasTutorialWin() && stat.key === recommendedStat.key ? "coach" : ""}" data-action="solo-stat" data-stat="${stat.key}" ${gameState.computerRevealed ? "disabled" : ""}><span>${stat.icon}</span><small>${stat.short}</small>${renderCombatStatValue(gameState.playerCard, stat.key)}<em>${stat.label}</em></button>`).join("")}</div>${gameState.computerRevealed ? `<button class="pvx-next" data-action="next-solo">Next round →</button>` : `<span class="pvx-timer">◷ 20s</span>`}</section>
    </section>`, "battle");
}

function renderRankGem(rating = gameState.rankRating) {
  return `<div class="pvx-rank-gem large"><span>◆</span><i>✦</i><b>${getRankTier(rating)}</b></div>`;
}

function renderOnlineHub() {
  if (backend.resettingPassword && backend.session) return renderPasswordRecovery();
  if (backend.configured && !backend.session) return renderAuth();
  if (backend.upgradingGuest) return renderGuestUpgrade();
  const rating = backend.profile?.rank_rating ?? gameState.rankRating;
  const modes = [
    { id: "casual", tag: "Unranked", title: "Casual Match", copy: "Fast real-player battles with no rating loss. Test decks, earn XP and have fun.", icon: "ϟ", perks: ["No rating loss", "+XP & coins"] },
    { id: "ranked", tag: "Coming after beta", title: "Ranked League", copy: "Ranked opens after live matchmaking, recovery, and fair-play checks are complete.", icon: "◆", perks: ["Protected launch", "Season rewards"], featured: true, disabled: !RANKED_BETA_ENABLED },
    { id: "friend", tag: "Private room", title: "Friend Battle", copy: "Create a six-character room code and invite exactly the player you want.", icon: "∞", perks: ["Private invite", "Preset reactions"] },
  ];
  return renderShell(`<section class="pvx-online-hub"><header><div><p class="pvx-eyebrow"><i></i> Competitive universe</p><h1>ARENA <span>LEAGUE</span></h1><p>Real challengers. Protected matches. One path to PupVerse Champion.</p></div><article class="pvx-current-rank">${renderRankGem(rating)}<div><small>Current rank</small><h2>${getRankTier(rating)}</h2><p>${rating} RP · ${getNextRankTarget(rating) - rating} to promotion</p><div class="pvx-progress"><i style="width:${getRankProgress(rating)}%"></i></div></div></article></header><section class="pvx-mode-grid">${modes.map((mode) => `<article class="pvx-mode ${mode.featured ? "featured" : ""} ${mode.disabled ? "disabled" : ""}">${mode.featured ? `<span class="pvx-featured">${mode.disabled ? "Beta hold" : "Flagship mode"}</span>` : ""}<div class="pvx-mode-art"><div class="pvx-mode-rings"></div><b>${mode.icon}</b></div><div class="pvx-mode-copy"><small>${mode.tag}</small><h2>${mode.title}</h2><p>${mode.copy}</p><div>${mode.perks.map((perk) => `<span>${perk}</span>`).join("")}</div><button data-action="online-mode" data-mode="${mode.id}" ${mode.disabled ? "disabled" : ""}>${mode.disabled ? "Launching after beta" : mode.id === "friend" ? "Create or join" : mode.id === "ranked" ? "Enter ranked" : "Find challenger"}<i>→</i></button></div></article>`).join("")}</section>${backend.leaderboard.length ? `<section class="pvx-leaderboard"><div><p class="pvx-eyebrow"><i></i> Live standings</p><h2>Season leaders</h2></div><ol>${backend.leaderboard.slice(0, 5).map((player) => `<li><b>#${player.position}</b><span class="pvx-avatar">${escapeHtml(player.avatar)}</span><strong>${escapeHtml(player.username)}</strong><small>${escapeHtml(player.rank_tier)}</small><em>${player.rank_rating} RP</em></li>`).join("")}</ol></section>` : `<section class="pvx-online-note"><span>◆</span><p><strong>${backend.configured ? "Secure multiplayer enabled" : "Multiplayer preview mode"}</strong>${backend.configured ? "Supabase authentication, private rooms and server-side match decisions are connected." : "The full flow is playable locally. Add Supabase keys to connect real accounts."}</p></section>`}</section>`, "online");
}

function renderGuestUpgrade() {
  return renderShell(`<section class="pvx-auth"><div class="pvx-auth-art"><div class="pvx-auth-orbits"></div>${renderRankGem(gameState.rankRating)}<p class="pvx-eyebrow"><i></i> Keep this Vault forever</p><h1>SECURE YOUR<br><span>PLAYER ACCOUNT</span></h1><p>Link an email or social identity without losing your cards, coins, decks or rank.</p><div><span>◆ Same player ID</span><span>◆ Vault preserved</span><span>◆ Cross-device access</span></div></div><form class="pvx-auth-card" data-guest-upgrade-form><p>Upgrade this guest player</p><label><span>Username</span><input id="upgradeUsername" autocomplete="username" minlength="3" maxlength="20" value="${escapeHtml(backend.profile?.username || "")}" required></label><label><span>Email</span><input id="upgradeEmail" type="email" autocomplete="email" placeholder="you@example.com" required></label>${backend.error ? `<p class="pvx-form-error" role="alert">${escapeHtml(backend.error)}</p>` : ""}${backend.message ? `<p class="pvx-form-message" role="status">${escapeHtml(backend.message)}</p>` : ""}<button class="pvx-auth-submit" data-action="guest-upgrade-submit" type="submit">Link email securely<span>→</span></button><button type="button" data-action="guest-link-provider" data-provider="google">Continue with Google</button><button type="button" data-action="cancel-guest-upgrade">Back to Arena</button><small>Your current anonymous player ID is retained. Confirm the email link before signing out.</small></form></section>`, "online");
}

function renderAuth() {
  const signup = backend.authMode === "signup";
  return renderShell(`<section class="pvx-auth"><div class="pvx-auth-art"><div class="pvx-auth-orbits"></div>${renderRankGem(1248)}<p class="pvx-eyebrow"><i></i> Protected player identity</p><h1>START YOUR<br><span>NEON RUN</span></h1><p>Create a synced account or start instantly as a guest. Your packs, rank, daily drops, and recovery all stay protected once you decide to secure the run.</p><div><span>◆ Guest start</span><span>◆ Synced rewards</span><span>◆ Match recovery</span></div></div><form class="pvx-auth-card" data-auth-form><nav><button class="${signup ? "" : "active"}" type="button" data-action="auth-tab" data-mode="signin">Sign in</button><button class="${signup ? "active" : ""}" type="button" data-action="auth-tab" data-mode="signup">Create account</button></nav><p>${signup ? "Create your player identity" : "Welcome back, challenger"}</p>${signup ? `<label><span>Username</span><input id="authUsername" autocomplete="username" minlength="3" maxlength="20" placeholder="NeonPup" required></label>` : ""}<label><span>Email</span><input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com" required></label><label><span>Password</span><input id="authPassword" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" placeholder="8+ characters" required></label>${backend.error ? `<p class="pvx-form-error" role="alert">${escapeHtml(backend.error)}</p>` : ""}${backend.message ? `<p class="pvx-form-message" role="status">${escapeHtml(backend.message)}</p>` : ""}<button class="pvx-auth-submit" data-action="auth-submit" type="submit">${signup ? "Create player" : "Sign in securely"}<span>→</span></button>${!signup ? `<button class="pvx-auth-ghost" type="button" data-action="request-password-reset">Forgot password?</button>` : ""}<button class="pvx-auth-ghost" type="button" data-action="start-guest">Start as guest now</button><small>Use a username, never your real name. You can secure the guest run later without losing the vault.</small></form></section>`, "online");
}

function renderPasswordRecovery() {
  return renderShell(`<section class="pvx-auth"><div class="pvx-auth-art"><div class="pvx-auth-orbits"></div>${renderRankGem(1248)}<p class="pvx-eyebrow"><i></i> Account recovery</p><h1>SET A NEW<br><span>PASSWORD</span></h1><p>Your recovery link is secure and temporary. Choose a fresh password to return to your saved run.</p></div><form class="pvx-auth-card" data-password-recovery-form><p>Choose your new password</p><label><span>New password</span><input id="recoveryPassword" type="password" autocomplete="new-password" minlength="8" placeholder="8+ characters" required></label><label><span>Confirm password</span><input id="recoveryPasswordConfirm" type="password" autocomplete="new-password" minlength="8" placeholder="Repeat your password" required></label>${backend.error ? `<p class="pvx-form-error" role="alert">${escapeHtml(backend.error)}</p>` : ""}${backend.message ? `<p class="pvx-form-message" role="status">${escapeHtml(backend.message)}</p>` : ""}<button class="pvx-auth-submit" data-action="password-recovery-submit" type="submit">Save new password<span>→</span></button><small>Use at least eight characters. Once saved, your account stays signed in on this device.</small></form></section>`, "online");
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
  if (packOverlay.phase === "opening") return `<section class="pvx-pack-overlay ${pack.themeClass}" aria-live="polite"><div class="pvx-opening-stars"></div><div class="pvx-opening-ring ring-one"></div><div class="pvx-opening-ring ring-two"></div><p class="pvx-eyebrow"><i></i> ${escapeHtml(pack.name)}</p><h1>COSMIC <span>UNSEALING</span></h1><div class="pvx-opening-pack"><div class="pvx-opening-lid"></div><div class="pvx-opening-body"><span>${pack.icon}</span><i></i></div><div class="pvx-opening-energy"></div></div><div class="pvx-opening-status"><span><i></i></span><b>Securing your pull</b><small>Coins are charged once. Your cards are next.</small></div><button data-action="skip-pack">Reveal now</button></section>`;
  const pulls = packOverlay.cards || [];
  const allRevealed = pulls.length > 0 && revealedPackCards >= pulls.length;
  const walkout = pulls.some((card) => ["mythic", "legendary"].includes(String(card.rarity || "").toLowerCase()));
  return `<section class="pvx-pack-overlay reveal ${walkout ? "pvx-pack-walkout" : ""} ${pack.themeClass}" aria-live="polite"><div class="pvx-opening-stars"></div><div class="pvx-reveal-radiance" aria-hidden="true"></div>${walkout ? `<div class="pvx-walkout-lights" aria-hidden="true"><i></i><i></i></div>` : ""}<p class="pvx-eyebrow"><i></i> ${walkout ? "Prestige pull detected" : "Pack unsealed"}</p><h1>${walkout ? "THE VAULT <span>OPENS</span>" : "YOUR NEW <span>PUPS</span>"}</h1><p class="pvx-reveal-status"><b>${allRevealed ? "Vault updated" : `${revealedPackCards + 1} of ${pulls.length} ready to reveal`}</b><span>${allRevealed ? "Every pull is safely in your collection." : walkout ? "A prestige signature is waiting. Break each seal." : "Tap the next card to break its seal, or reveal the full set."}</span></p><div class="pvx-reveal-grid ${allRevealed ? "complete" : ""}">${pulls.map((card, index) => { const rarity = String(card.rarity || "standard").toLowerCase().replace(/[^a-z0-9]+/g, "-"); return `<button class="pvx-reveal-card rarity-${rarity} ${index < revealedPackCards ? "revealed" : ""}" style="--delay:${index * .13}s;--tilt:${(index - (pulls.length - 1) / 2) * 3}deg" data-action="reveal-pack-card" data-index="${index}" aria-label="${index < revealedPackCards ? `${escapeHtml(card.name)} revealed` : `Reveal card ${index + 1}`}" ${index > revealedPackCards ? "disabled" : ""}><div class="pvx-reveal-inner"><div class="pvx-reveal-back"><i class="pvx-reveal-sigil">✦</i><span>PV</span><b>?</b><small>Tap to break seal</small></div><div class="pvx-reveal-front"><div class="pvx-card-hologram" aria-hidden="true"></div>${renderCardImage(card)}<div><small>${escapeHtml(card.rarity)}</small><h2>${escapeHtml(card.name)}</h2><p>${escapeHtml(card.element)}</p></div></div></div></button>`; }).join("")}</div>${allRevealed ? `<div class="pvx-vault-arrival" aria-live="polite"><span>✦</span><div><b>${pulls.length} new ${pulls.length === 1 ? "card" : "cards"} secured</b><small>Transferred into your Collection Vault</small></div><i>◆</i></div>` : ""}<div class="pvx-reveal-actions">${!allRevealed ? `<button data-action="reveal-all">Reveal all</button>` : `<button class="pvx-primary" data-action="finish-reveal">Open Collection Vault →</button>`}<button data-action="close-pack">Back to shop</button></div></section>`;
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
  } else if (gameState.mode === "daily") screen = renderDailyOps();
  else screen = renderHome();
  app.innerHTML = `<canvas id="spaceCanvas"></canvas><main class="app-shell">${screen}</main>${renderPackOverlay()}${renderInfoPanel()}`;
  app.onclick = handleClick;
  app.onsubmit = (event) => {
    event.preventDefault();
    event.target.querySelector('[data-action="auth-submit"], [data-action="guest-upgrade-submit"], [data-action="password-recovery-submit"]')?.click();
  };
  document.body.classList.toggle("pvx-modal-open", Boolean(selectedVaultCardId || packOverlay));
  document.body.classList.toggle("pvx-large-text", largeTextEnabled);
  const lowPowerDevice = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  document.body.classList.toggle("pvx-performance-mode", Boolean(lowPowerDevice));
  trackDailyBoardCompletion();
  setupImageFallbacks();
  setupHomeDeckOrbit();
  startAnimatedBackground();
}

function setupHomeDeckOrbit() {
  const orbit = app.querySelector("[data-deck-orbit]");
  if (!orbit) return;
  let startX = 0;
  let startRotation = homeDeckOrbitRotation;
  let dragged = false;
  let suppressClick = false;
  orbit.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    startX = event.clientX;
    startRotation = homeDeckOrbitRotation;
    dragged = false;
    orbit.setPointerCapture?.(event.pointerId);
  });
  orbit.addEventListener("pointermove", (event) => {
    if (!orbit.hasPointerCapture?.(event.pointerId)) return;
    const distance = event.clientX - startX;
    if (Math.abs(distance) < 5 && !dragged) return;
    dragged = true;
    homeDeckOrbitPaused = true;
    homeDeckOrbitRotation = startRotation + distance * 0.7;
    orbit.closest(".pvx-home-deck-orbit")?.classList.add("is-paused");
    orbit.style.setProperty("--orbit-turn", `${homeDeckOrbitRotation}deg`);
  });
  orbit.addEventListener("pointerup", (event) => {
    if (orbit.hasPointerCapture?.(event.pointerId)) orbit.releasePointerCapture?.(event.pointerId);
    suppressClick = dragged;
  });
  orbit.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }, true);
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
  if (!deck) throw new Error("Create an active deck with five cards first.");
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
    if (gameState.totalPacksOpened === 1) trackEvent("first_pack_opened", { source: backend.session ? "cloud" : "local" });
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
  if (action === "show-info") { activeInfoPanel = target.dataset.panel; return renderApp(); }
  if (action === "close-info") { activeInfoPanel = null; return renderApp(); }
  if (action === "toggle-text-size") { largeTextEnabled = !largeTextEnabled; try { window.localStorage?.setItem(TEXT_SIZE_STORAGE_KEY, String(largeTextEnabled)); } catch {} return renderApp(); }
  if (action === "install-app") {
    if (!deferredInstallPrompt) { activeInfoPanel = "install"; return renderApp(); }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    trackEvent("app_install_prompt", { accepted: choice.outcome === "accepted" });
    deferredInstallPrompt = null;
    return renderApp();
  }
  if (action === "open-feedback") { trackEvent("feedback_opened"); window.open(getFeedbackUrl(), "_blank", "noopener,noreferrer"); return; }
  if (action === "dismiss-onboarding") { try { window.localStorage?.setItem(ONBOARDING_STORAGE_KEY, "true"); } catch {} return renderApp(); }
  if (action === "go-home") {
    if (backend.session?.user) {
      await refreshPlayerData().catch((error) => {
        console.warn("[PupVerse] Home refresh failed:", error?.message || error);
      });
    }
    return go("home");
  }
  if (action === "go-play") { if (!hasTutorialWin()) trackEvent("first_battle_started"); return startPrimaryPlayFlow(); }
  if (action === "go-daily" || action === "focus-daily") return go("daily");
  if (action === "start-guest") {
    if (!onlineStatus) return notice("You’re offline. Start a Solo Battle now and connect later to save your run.");
    try {
      return await startGuestRun();
    } catch (error) {
      backend.error = error.message;
      renderApp();
      return notice(error.message || "Guest start failed.");
    }
  }
  if (action === "go-shop") return go("shop");
  if (action === "go-vault") return go("collection");
  if (action === "toggle-deck-orbit") { homeDeckOrbitPaused = !homeDeckOrbitPaused; return renderApp(); }
  if (action === "toggle-home-deck-card") {
    const returningToMotion = homeDeckFlippedCardId === target.dataset.cardId;
    homeDeckFlippedCardId = returningToMotion ? null : target.dataset.cardId;
    homeDeckOrbitPaused = !returningToMotion;
    playHaptic(returningToMotion ? 8 : [8, 18]);
    return renderApp();
  }
  if (action === "go-battle") { if (!hasTutorialWin()) trackEvent("first_battle_started"); selectedVaultCardId = null; vaultCardFlipped = false; startComputerBattle(); return renderApp(); }
  if (action === "go-online") { selectedVaultCardId = null; vaultCardFlipped = false; openArenaLeague(); return renderApp(); }
  if (action === "go-signup") { backend.authMode = "signup"; backend.error = ""; backend.message = ""; selectedVaultCardId = null; vaultCardFlipped = false; openArenaLeague(); return renderApp(); }
  if (action === "toggle-home-panel") return toggleHomePanel(target.dataset.panel);
  if (action === "preview-card") { selectedVaultCardId = target.dataset.cardId; vaultCardFlipped = false; return renderApp(); }
  if (action === "close-card") { selectedVaultCardId = null; vaultCardFlipped = false; return renderApp(); }
  if (action === "flip-card") { vaultCardFlipped = !vaultCardFlipped; return renderApp(); }
  if (action === "share-card") {
    const card = cards.find((item) => item.id === target.dataset.cardId);
    if (!card) return;
    const shareData = { title: `PupVerse · ${card.name}`, text: `I just pulled ${card.name}, a ${card.rarity} PupVerse card. Can you top it?`, url: window.location.origin };
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      else return notice("Sharing is not available in this browser yet.");
      trackEvent("card_shared", { rarity: String(card.rarity).toLowerCase() });
      return notice(navigator.share ? "Share sheet opened." : "Pull copied — ready to share.");
    } catch (error) {
      if (error?.name !== "AbortError") notice("Could not open sharing. Try again in your browser.");
      return;
    }
  }
  if (action === "filter-vault") { setCollectionFilter(target.dataset.filter); playHaptic(6); return renderApp(); }
  if (action === "sort-vault") { setCollectionSort(target.dataset.sort); playHaptic(6); return renderApp(); }
  if (action === "clear-vault-browse") { setCollectionFilter("All"); setCollectionSort("newest"); playHaptic(8); return renderApp(); }
  if (action === "toggle-compare") {
    const cardId = target.dataset.cardId;
    compareCardIds = compareCardIds.includes(cardId) ? compareCardIds.filter((id) => id !== cardId) : [...compareCardIds, cardId].slice(0, 2);
    return renderApp();
  }
  if (action === "clear-compare") { compareCardIds = []; return renderApp(); }
  if (action === "toggle-deck-card") {
    const cardId = target.dataset.cardId;
    const draft = getVaultDeckDraftIds();
    if (draft.includes(cardId)) {
      vaultDeckDraftIds = draft.filter((id) => id !== cardId);
      playHaptic(8);
    } else if (draft.length >= 5) {
      notice("Your draft hand already has five cards. Remove one before adding another.");
    } else {
      vaultDeckDraftIds = [...draft, cardId];
      playHaptic([8, 16]);
    }
    return renderApp();
  }
  if (action === "discard-deck-draft") {
    vaultDeckDraftIds = [...getActiveDeckCardIds()];
    return renderApp();
  }
  if (action === "save-active-deck") {
    const draft = [...getVaultDeckDraftIds()];
    if (deckSaveInFlight) return;
    if (draft.length !== 5) return notice("Choose exactly five cards before saving your active hand.");
    deckSaveInFlight = true;
    renderApp();
    try {
      if (backend.configured && backend.session) {
        await updateRemoteDeck(draft, crypto.randomUUID());
        await refreshPlayerData();
      } else {
        const result = setActiveDeckCardIds(draft);
        if (!result.ok) throw new Error(result.error);
      }
      vaultDeckDraftIds = null;
      playHaptic([12, 28, 18]);
      notice("Active hand saved securely.");
    } catch (error) {
      notice(error.message || "Could not save your hand. Your previous active hand is still protected.");
    } finally {
      deckSaveInFlight = false;
      renderApp();
    }
    return;
  }
  if (action === "toggle-favourite") {
    const cardId = target.dataset.cardId;
    const favourite = toggleFavouriteCard(cardId);
    if (backend.configured && backend.session) {
      setRemoteFavouriteCard(cardId, favourite).catch((error) => notice(error.message || "Favourite will sync when you reconnect."));
    }
    return renderApp();
  }
  if (action === "dev-coins") {
    const added = addDevCoins();
    renderApp();
    if (!added) notice("Test coins are disabled for persistent player accounts.");
    return;
  }
  if (action === "open-pack") {
    if (backend.configured && backend.session && !onlineStatus) return notice("You’re offline. Reconnect before opening a synced pack so your coins stay protected.");
    if (!startPackOpening(target.dataset.packId)) return renderApp();
    packOverlay = { phase: "opening", packId: target.dataset.packId, requestId: crypto.randomUUID() };
    playHaptic([8, 22, 10]);
    renderApp();
    clearTimeout(packTimer);
    packTimer = setTimeout(finishPackAnimation, 2800);
    return;
  }
  if (action === "claim-daily") {
    if (backend.configured && backend.session) {
      if (!onlineStatus) return notice("You’re offline. Reconnect to claim your protected daily reward.");
      try {
        const result = await claimRemoteDailyReward(crypto.randomUUID());
        const rewardCard = cards.find((card) => card.id === result.reward_card_id) || null;

        await refreshPlayerData().catch((error) => {
          console.warn("[PupVerse] Daily board refresh failed:", error?.message || error);
        });

        if (rewardCard) {
          gameState.lastOpenedPack = [rewardCard];
        }

        renderApp();
        if (result.ok) trackEvent("daily_reward_claimed", { source: "cloud" });
        return notice(
          result.ok
            ? `Daily drop secured: ${rewardCard?.name || "bonus card"} and ${result.coins || 24} coins.`
            : result.error || "Daily drop updated."
        );
      } catch (error) {
        renderApp();
        return notice(error.message || "Daily drop claim failed.");
      }
    }

    const result = claimDailyMissionReward();
    if (result.ok) trackEvent("daily_reward_claimed", { source: "local" });
    renderApp();
    return notice(result.message || result.error || "Daily drop updated.");
  }
  if (action === "skip-pack") { playHaptic([10, 35, 18]); clearTimeout(packTimer); return finishPackAnimation(); }
  if (action === "reveal-pack-card") { const index = Number(target.dataset.index); if (index === revealedPackCards) { revealedPackCards += 1; playHaptic(revealedPackCards === packOverlay?.cards?.length ? [15, 45, 28] : 12); } return renderApp(); }
  if (action === "reveal-all") { revealedPackCards = packOverlay?.cards?.length || 0; playHaptic([12, 35, 12]); return renderApp(); }
  if (action === "finish-reveal") { playHaptic([18, 35, 28]); packOverlay = null; return go("collection"); }
  if (action === "close-pack") { packOverlay = null; return renderApp(); }
  if (action === "solo-stat") { chooseBattleStat(target.dataset.stat); if (gameState.winner === "player") playHaptic([18, 40, 28]); else if (gameState.winner === "computer") playHaptic(35); else playHaptic([10, 28, 10]); if (gameState.winner === "player" && gameState.playerWins === 1) trackEvent("first_battle_won"); return renderApp(); }
  if (action === "next-solo") { startComputerBattle(); return renderApp(); }
  if (action === "reset-solo") { resetGameStats(); startComputerBattle(); return renderApp(); }
  if (action === "online-home") { await removeArenaSubscriptions(); openArenaLeague(); return renderApp(); }
  if (action === "online-mode") {
    const mode = target.dataset.mode;
    if (mode === "ranked" && !RANKED_BETA_ENABLED) return notice("Ranked opens after the public-beta verification pass.");
    if (backend.configured && backend.session && !onlineStatus) return notice("You’re offline. Reconnect before starting matchmaking.");
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
      if (!deck) return notice("Create an active five-card deck first.");
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
  if (action === "request-password-reset") {
    const email = document.querySelector("#authEmail")?.value.trim();
    backend.error = ""; backend.message = "";
    try {
      await requestPasswordReset(email);
      backend.message = "Password reset email sent. Open it on this device, then choose a new password.";
    } catch (error) { console.error("[PupVerse] Password reset request failed:", error); backend.error = getAccountErrorMessage(error); }
    return renderApp();
  }
  if (action === "upgrade-guest") { backend.upgradingGuest = true; backend.error = ""; backend.message = ""; openArenaLeague(); return renderApp(); }
  if (action === "cancel-guest-upgrade") { backend.upgradingGuest = false; backend.error = ""; backend.message = ""; return renderApp(); }
  if (action === "guest-upgrade-submit") {
    event.preventDefault();
    if (!target.form?.reportValidity()) return;
    backend.error = ""; backend.message = ""; target.disabled = true;
    try {
      await upgradeGuestAccount({
        email: document.querySelector("#upgradeEmail")?.value.trim(),
        username: document.querySelector("#upgradeUsername")?.value.trim(),
      });
      backend.message = "Confirmation sent. Open that email on this device before signing out.";
      await refreshPlayerData();
    } catch (error) { console.error("[PupVerse] Account upgrade failed:", error); backend.error = getAccountErrorMessage(error); }
    return renderApp();
  }
  if (action === "guest-link-provider") {
    try { await linkGuestProvider(target.dataset.provider); }
    catch (error) { console.error("[PupVerse] Account provider link failed:", error); backend.error = getAccountErrorMessage(error); return renderApp(); }
    return;
  }
  if (action === "auth-submit") {
    event.preventDefault();
    if (!target.form?.reportValidity()) return;
    if (!onlineStatus) { backend.error = "You’re offline. Reconnect before signing in or creating an account."; return renderApp(); }
    backend.error = ""; backend.message = ""; target.disabled = true;
    try {
      if (backend.authMode === "signup") trackEvent("account_signup_started");
      const credentials = { email: document.querySelector("#authEmail")?.value.trim(), password: document.querySelector("#authPassword")?.value || "", username: document.querySelector("#authUsername")?.value.trim() };
      const result = backend.authMode === "signup" ? await backendSignUp(credentials) : await backendSignIn(credentials);
      if (backend.authMode === "signup") trackEvent("account_signup_completed");
      if (backend.authMode === "signup" && !result.session) { backend.authMode = "signin"; backend.message = "Account created. Confirm your email, then sign in."; }
    } catch (error) { console.error("[PupVerse] Account authentication failed:", error); backend.error = getAccountErrorMessage(error); }
    return renderApp();
  }
  if (action === "password-recovery-submit") {
    event.preventDefault();
    if (!target.form?.reportValidity()) return;
    const password = document.querySelector("#recoveryPassword")?.value || "";
    const confirmation = document.querySelector("#recoveryPasswordConfirm")?.value || "";
    if (password !== confirmation) { backend.error = "Your passwords do not match."; return renderApp(); }
    backend.error = ""; backend.message = ""; target.disabled = true;
    try {
      await completeGuestPasswordUpgrade(password);
      backend.resettingPassword = false;
      window.history.replaceState({}, "", window.location.origin);
      await refreshPlayerData();
      backend.message = "Password updated. Your account is ready.";
    } catch (error) { console.error("[PupVerse] Password reset failed:", error); backend.error = getAccountErrorMessage(error); }
    return renderApp();
  }
  if (action === "backend-signout") { await backendSignOut(); return handleSession(null); }
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (selectedVaultCardId) { selectedVaultCardId = null; vaultCardFlipped = false; renderApp(); }
  else if (packOverlay) { packOverlay = null; renderApp(); }
});

function trackSessionStart() {
  const storageKey = "pupverse-last-session-date";
  const today = new Date().toISOString().slice(0, 10);
  try {
    const previous = window.localStorage?.getItem(storageKey);
    const daysSincePrevious = previous
      ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / (24 * 60 * 60 * 1000))
      : null;
    if (daysSincePrevious === 1) trackEvent("day_1_return");
    window.localStorage?.setItem(storageKey, today);
  } catch {}
}

window.addEventListener("online", () => { onlineStatus = true; renderApp(); notice("You’re back online. Synced features are available again."); });
window.addEventListener("offline", () => { onlineStatus = false; renderApp(); notice("You’re offline. Solo play remains available; synced features will retry when you reconnect."); });
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; renderApp(); });
window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; trackEvent("app_installed"); renderApp(); notice("PupVerse is installed. See you in the arena."); });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

trackSessionStart();
renderApp();
bootstrapBackend();
