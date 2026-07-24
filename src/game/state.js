import { cards } from "../data/cards.js";
import { packs } from "../data/packs.js";
import { getBaseStatValue, resolveStatContest } from "./battleRules.js";

const SAVE_KEY = "pupverse-save-v3";
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_COIN_REWARD = 24;
const DAILY_TASK_GROUPS = ["soloWins", "soloBattles", "packsOpened", "collection"];
const DAILY_TASK_POOL = [
  {
    id: "solo-win-1",
    group: "soloWins",
    metric: "playerWins",
    goal: 1,
    icon: "⚔",
    title: "Win 1 solo round",
    description: "Land one clean stat victory in the training arena.",
  },
  {
    id: "solo-win-2",
    group: "soloWins",
    metric: "playerWins",
    goal: 2,
    icon: "⚔",
    title: "Win 2 solo rounds",
    description: "Chain together two successful solo arena wins.",
  },
  {
    id: "solo-win-3",
    group: "soloWins",
    metric: "playerWins",
    goal: 3,
    icon: "⚔",
    title: "Win 3 solo rounds",
    description: "Push your best deck through a three-win solo streak.",
  },
  {
    id: "solo-play-3",
    group: "soloBattles",
    metric: "totalBattles",
    goal: 3,
    icon: "◷",
    title: "Play 3 solo rounds",
    description: "Stay in rhythm and complete three training rounds.",
  },
  {
    id: "solo-play-5",
    group: "soloBattles",
    metric: "totalBattles",
    goal: 5,
    icon: "◷",
    title: "Play 5 solo rounds",
    description: "Run a longer session and sharpen your stat reads.",
  },
  {
    id: "pack-open-1",
    group: "packsOpened",
    metric: "totalPacksOpened",
    goal: 1,
    icon: "✦",
    title: "Open 1 pack",
    description: "Crack one pack to feed the vault with fresh pups.",
  },
  {
    id: "pack-open-2",
    group: "packsOpened",
    metric: "totalPacksOpened",
    goal: 2,
    icon: "✦",
    title: "Open 2 packs",
    description: "Double up on discoveries and widen the roster.",
  },
  {
    id: "collect-cards-4",
    group: "collection",
    metric: "collectionCount",
    goal: 4,
    icon: "◇",
    title: "Collect 4 cards",
    description: "Add four more pups to your vault in any way you can.",
  },
  {
    id: "collect-unique-1",
    group: "collection",
    metric: "uniqueOwned",
    goal: 1,
    icon: "◇",
    title: "Discover 1 new pup",
    description: "Find a card you have never owned before.",
  },
  {
    id: "collect-unique-2",
    group: "collection",
    metric: "uniqueOwned",
    goal: 2,
    icon: "◇",
    title: "Discover 2 new pups",
    description: "Expand the archive with two new unique cards.",
  },
  {
    id: "collect-duplicates-2",
    group: "collection",
    metric: "duplicateCount",
    goal: 2,
    icon: "⧉",
    title: "Gain 2 duplicates",
    description: "Build out fusion material by pulling two duplicates.",
  },
];
const STARTER_DAILY_TASKS = [
  {
    id: "starter-play-1",
    group: "soloBattles",
    metric: "totalBattles",
    goal: 1,
    icon: "◷",
    title: "Play 1 tutorial round",
    description: "Step into the arena once to start your first run.",
  },
  {
    id: "starter-win-1",
    group: "soloWins",
    metric: "playerWins",
    goal: 1,
    icon: "⚔",
    title: "Win 1 tutorial round",
    description: "Take your first clean victory in the starter arena.",
  },
  {
    id: "starter-pack-1",
    group: "packsOpened",
    metric: "totalPacksOpened",
    goal: 1,
    icon: "✦",
    title: "Open 1 starter pack",
    description: "Crack your first pack and send the pulls into the vault.",
  },
  {
    id: "starter-discover-1",
    group: "collection",
    metric: "uniqueOwned",
    goal: 1,
    icon: "◇",
    title: "Discover 1 new pup",
    description: "Reveal one new card to complete your first mission board.",
  },
];
let progressSource = "local";

function createDefaultSave() {
  return {
    coins: 25,
    collection: [],
    playerWins: 0,
    computerWins: 0,
    totalBattles: 0,
    level: 12,
    xp: 2340,
    rankRating: 1248,
    onlineWins: 18,
    rankedWins: 11,
    totalPacksOpened: 0,
    dailyStreak: 0,
    lastDailyClaimDate: null,
    dailyOps: null,
  };
}

function loadSave() {
  const saved = localStorage.getItem(SAVE_KEY);

  if (!saved) {
    return createDefaultSave();
  }

  try {
    return {
      ...createDefaultSave(),
      ...JSON.parse(saved),
    };
  } catch {
    return createDefaultSave();
  }
}

function shuffleCards(cardList) {
  return [...cardList].sort(() => Math.random() - 0.5);
}

function getCurrentDailyCycleKey(now = Date.now()) {
  return `ops-${new Date(now).toISOString()}`;
}

function getNextDailyResetAt(dailyOps, now = Date.now()) {
  const refreshAt = Number(dailyOps?.refreshAt || 0);
  return refreshAt > now ? refreshAt : now + DAY_MS;
}

function createSeededRandom(seedInput) {
  let seed = Array.from(String(seedInput || "pupverse")).reduce(
    (total, char) => (total * 31 + char.charCodeAt(0)) >>> 0,
    0
  ) || 1;

  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function getRewardWeight(card) {
  switch (String(card?.rarity || "").toLowerCase()) {
    case "mythic":
      return 8;
    case "legendary":
      return 6;
    case "epic":
      return 4;
    case "rare":
      return 2;
    default:
      return 1;
  }
}

function shouldUseStarterDailyTasks(metrics = getMissionMetrics()) {
  return (
    Number(metrics.playerWins || 0) === 0 &&
    Number(metrics.totalBattles || 0) === 0 &&
    Number(metrics.totalPacksOpened || 0) === 0 &&
    Number(metrics.collectionCount || 0) === 0
  );
}

function pickDailyTasks(cycleKey, metrics = getMissionMetrics()) {
  if (shouldUseStarterDailyTasks(metrics)) {
    return STARTER_DAILY_TASKS.map((task) => ({ ...task }));
  }

  const random = createSeededRandom(`${cycleKey}:tasks`);

  return DAILY_TASK_GROUPS.map((group) => {
    const options = DAILY_TASK_POOL.filter((task) => task.group === group);
    const index = Math.floor(random() * options.length);
    return { ...options[index] };
  });
}

function pickDailyRewardCardId(cycleKey) {
  const rewardPool = cards.filter((card) => getRewardWeight(card) >= 2);
  const random = createSeededRandom(`${cycleKey}:reward`);

  if (!rewardPool.length) {
    return cards[0]?.id || null;
  }

  const totalWeight = rewardPool.reduce((sum, card) => sum + getRewardWeight(card), 0);
  let cursor = random() * totalWeight;

  for (const card of rewardPool) {
    cursor -= getRewardWeight(card);
    if (cursor <= 0) return card.id;
  }

  return rewardPool[rewardPool.length - 1].id;
}

function getMissionMetrics() {
  const uniqueOwned = new Set(gameState.collection).size;

  return {
    playerWins: Number(gameState.playerWins) || 0,
    totalBattles: Number(gameState.totalBattles) || 0,
    totalPacksOpened: Number(gameState.totalPacksOpened) || 0,
    collectionCount: gameState.collection.length,
    uniqueOwned,
    duplicateCount: Math.max(0, gameState.collection.length - uniqueOwned),
  };
}

function createDailyOpsState(now = Date.now()) {
  const cycleKey = getCurrentDailyCycleKey(now);
  const baseline = getMissionMetrics();
  const rookieBoard = shouldUseStarterDailyTasks(baseline);

  return {
    cycleKey,
    createdAt: new Date(now).toISOString(),
    refreshAt: now + DAY_MS,
    baseline,
    tasks: pickDailyTasks(cycleKey, baseline),
    rewardCardId: pickDailyRewardCardId(cycleKey),
    rookieBoard,
    rewardClaimed: false,
    claimedAt: null,
  };
}

function hasValidDailyOps(state) {
  return Boolean(
    state &&
      typeof state === "object" &&
      typeof state.cycleKey === "string" &&
      Number.isFinite(Number(state.refreshAt)) &&
      state.baseline &&
      Array.isArray(state.tasks) &&
      state.tasks.length === 4
  );
}

function ensureDailyOpsState(force = false) {
  const now = Date.now();
  const activeBoard = gameState.dailyOps;
  const hasExpiredBoard = hasValidDailyOps(activeBoard) && Number(activeBoard.refreshAt) <= now;
  const shouldRefreshForStarterBoard =
    shouldUseStarterDailyTasks() &&
    hasValidDailyOps(activeBoard) &&
    !Boolean(activeBoard.rookieBoard);

  if (
    force ||
    !hasValidDailyOps(activeBoard) ||
    hasExpiredBoard ||
    shouldRefreshForStarterBoard
  ) {
    gameState.dailyOps = createDailyOpsState(now);
    saveGame();
  }

  return gameState.dailyOps;
}

function formatResetCountdown(milliseconds) {
  const remaining = Math.max(0, milliseconds);
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function getRandomCardsFromPack(packName, amount = 3) {
  const packCards = cards.filter((card) => card.pack === packName);

  if (!packCards.length) return [];

  return Array.from({ length: amount }, () => {
    const randomIndex = Math.floor(Math.random() * packCards.length);
    return packCards[randomIndex];
  });
}

export const gameState = {
  ...loadSave(),

  mode: "home",

  playerCard: null,
  computerCard: null,
  selectedStat: null,
  computerRevealed: false,
  resultMessage: "Start a battle to enter the PupVerse arena.",
  winner: null,
  roundResult: null,

  lastOpenedPack: [],
  shopMessage: "Choose a pack to open. Each pack pulls from its own Pup collection.",
  isOpeningPack: false,
  activePackId: null,

  collectionFilter: "All",
  favouriteCards: [],
  packOpeningHistory: [],
};

export function hydrateCloudProgress(profile, playerCards = [], packOpenings = []) {
  if (!profile) return;
  progressSource = "cloud";
  const collection = playerCards.flatMap((entry) =>
    Array.from({ length: Math.max(0, Number(entry.quantity) || 0) }, () => entry.card_id)
  );
  const latestOpening = packOpenings[0];

  Object.assign(gameState, {
    coins: Number(profile.coins) || 0,
    level: Number(profile.level) || 1,
    xp: Number(profile.xp) || 0,
    rankRating: Number(profile.rank_rating) || 0,
    onlineWins: Number(profile.online_wins) || 0,
    rankedWins: Number(profile.ranked_wins) || 0,
    totalPacksOpened: packOpenings.length,
    collection,
    favouriteCards: playerCards.filter((entry) => entry.favourite).map((entry) => entry.card_id),
    packOpeningHistory: packOpenings,
    lastOpenedPack: (latestOpening?.card_ids || [])
      .map((cardId) => cards.find((card) => card.id === cardId))
      .filter(Boolean),
  });
}

export function useLocalProgress() {
  progressSource = "local";
  Object.assign(gameState, loadSave(), {
    favouriteCards: [],
    packOpeningHistory: [],
  });
  ensureDailyOpsState();
}

export function isCloudProgress() {
  return progressSource === "cloud";
}

export function saveGame() {
  if (progressSource === "cloud") return;
  const saveData = {
    coins: gameState.coins,
    collection: gameState.collection,
    playerWins: gameState.playerWins,
    computerWins: gameState.computerWins,
    totalBattles: gameState.totalBattles,
    level: gameState.level,
    xp: gameState.xp,
    rankRating: gameState.rankRating,
    onlineWins: gameState.onlineWins,
    rankedWins: gameState.rankedWins,
    totalPacksOpened: gameState.totalPacksOpened,
    dailyOps: gameState.dailyOps,
  };

  localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

export function getStatValue(card, statName) {
  return getBaseStatValue(card, statName);
}

function formatBoostNote(card, boost, statName) {
  if (!boost) return "";
  const label = statName.charAt(0).toUpperCase() + statName.slice(1);
  const abilityName = card?.ability?.name || card?.ability_name || "Ability";
  return `${abilityName} adds +${boost} ${label}.`;
}

export function startComputerBattle() {
  const playableCards = cards.filter((card) => card?.stats);

  if (playableCards.length < 2) {
    gameState.resultMessage = "You need at least 2 cards in cards.js to battle.";
    return;
  }

  const shuffledCards = shuffleCards(playableCards);

  gameState.mode = "battle";
  gameState.playerCard = shuffledCards[0];
  gameState.computerCard = shuffledCards[1];
  gameState.selectedStat = null;
  gameState.computerRevealed = false;
  gameState.resultMessage = "Choose your strongest stat to battle!";
  gameState.winner = null;
  gameState.roundResult = null;
}

export function chooseBattleStat(statName) {
  if (!gameState.playerCard || !gameState.computerCard) return;
  if (gameState.computerRevealed) return;

  const result = resolveStatContest(gameState.playerCard, gameState.computerCard, statName);
  const playerValue = result.playerValue;
  const computerValue = result.opponentValue;
  const cleanStatName = statName.charAt(0).toUpperCase() + statName.slice(1);
  const boostNotes = [
    formatBoostNote(gameState.playerCard, result.playerBoost, result.selectedStat),
    formatBoostNote(gameState.computerCard, result.opponentBoost, result.selectedStat),
  ].filter(Boolean).join(" ");

  gameState.selectedStat = result.selectedStat;
  gameState.computerRevealed = true;
  gameState.totalBattles += 1;
  gameState.roundResult = result;

  if (result.winner === "player") {
    if (progressSource === "local") gameState.coins += 5;
    gameState.playerWins += 1;
    gameState.winner = "player";
    gameState.resultMessage = progressSource === "local"
      ? `You won with ${cleanStatName}! ${playerValue} beats ${computerValue}. ${boostNotes} +5 coins`
      : `Training win with ${cleanStatName}! ${playerValue} beats ${computerValue}. ${boostNotes} Online rewards are server-controlled.`;
  } else if (result.winner === "opponent") {
    gameState.computerWins += 1;
    gameState.winner = "computer";
    gameState.resultMessage = `Computer won with ${cleanStatName}! ${computerValue} beats ${playerValue}. ${boostNotes}`;
  } else {
    gameState.winner = "draw";
    gameState.resultMessage = `Draw! Both cards had ${playerValue} ${cleanStatName}. ${boostNotes}`;
  }

  saveGame();
}

export function startPackOpening(packId) {
  const selectedPack = packs.find((pack) => pack.id === packId);

  if (!selectedPack) {
    gameState.shopMessage = "That pack does not exist yet.";
    return false;
  }

  if (gameState.isOpeningPack) {
    return false;
  }

  if (gameState.coins < selectedPack.cost) {
    gameState.lastOpenedPack = [];
    gameState.shopMessage = `You need ${selectedPack.cost} coins to open a ${selectedPack.name}. Win battles or press Dev +25 Coins.`;
    return false;
  }

  gameState.isOpeningPack = true;
  gameState.activePackId = packId;
  gameState.lastOpenedPack = [];
  gameState.shopMessage = `${selectedPack.name} is opening...`;

  return true;
}

export function finishPackOpening() {
  if (progressSource === "cloud") {
    gameState.isOpeningPack = false;
    gameState.activePackId = null;
    gameState.shopMessage = "Online packs must be opened by the protected referee.";
    return;
  }
  const selectedPack = packs.find((pack) => pack.id === gameState.activePackId);

  if (!selectedPack) {
    gameState.isOpeningPack = false;
    gameState.activePackId = null;
    gameState.lastOpenedPack = [];
    gameState.shopMessage = "Pack opening failed. Try again.";
    return;
  }

  const pulledCards = getRandomCardsFromPack(
    selectedPack.cardPackName,
    selectedPack.amount
  );

  if (!pulledCards.length) {
    gameState.isOpeningPack = false;
    gameState.activePackId = null;
    gameState.lastOpenedPack = [];
    gameState.shopMessage = `No cards found for ${selectedPack.cardPackName}. Check your cards.js pack names.`;
    return;
  }

  gameState.coins -= selectedPack.cost;
  gameState.totalPacksOpened += 1;
  gameState.lastOpenedPack = pulledCards;
  gameState.collection.push(...pulledCards.map((card) => card.id));
  gameState.shopMessage = `Boom! You opened ${selectedPack.name} and pulled ${pulledCards.length} cards.`;

  gameState.isOpeningPack = false;
  gameState.activePackId = null;

  saveGame();
}

export function getCollectionWithCounts() {
  const counts = {};

  gameState.collection.forEach((cardId) => {
    counts[cardId] = (counts[cardId] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([cardId, count]) => {
      const card = cards.find((currentCard) => currentCard.id === cardId);
      if (!card) return null;

      return {
        ...card,
        count,
      };
    })
    .filter(Boolean);
}

export function getFilteredCollectionCards() {
  const ownedCards = getCollectionWithCounts();

  if (gameState.collectionFilter === "All") {
    return ownedCards;
  }

  return ownedCards.filter((card) => card.pack === gameState.collectionFilter);
}

export function setCollectionFilter(filterName) {
  gameState.collectionFilter = filterName || "All";
}

export function getCollectionProgress() {
  const uniqueOwnedIds = new Set(gameState.collection);
  const uniqueOwned = uniqueOwnedIds.size;
  const totalCards = cards.length;
  const duplicateCount = gameState.collection.length - uniqueOwned;
  const percentage =
    totalCards === 0 ? 0 : Math.round((uniqueOwned / totalCards) * 100);

  const cryptoTotal = cards.filter((card) => card.pack === "CryptoPups").length;
  const cyberTotal = cards.filter((card) => card.pack === "CyberPups").length;
  const alienTotal = cards.filter((card) => card.pack === "AlienPups").length;

  const cryptoOwned = cards.filter(
    (card) => card.pack === "CryptoPups" && uniqueOwnedIds.has(card.id)
  ).length;

  const cyberOwned = cards.filter(
    (card) => card.pack === "CyberPups" && uniqueOwnedIds.has(card.id)
  ).length;

  const alienOwned = cards.filter(
    (card) => card.pack === "AlienPups" && uniqueOwnedIds.has(card.id)
  ).length;

  return {
    uniqueOwned,
    totalCards,
    duplicateCount,
    percentage,
    cryptoOwned,
    cryptoTotal,
    cyberOwned,
    cyberTotal,
    alienOwned,
    alienTotal,
  };
}

export function addDevCoins() {
  if (progressSource === "cloud") {
    gameState.shopMessage = "Test coins are disabled for persistent player accounts.";
    return false;
  }
  gameState.coins += 25;
  gameState.shopMessage = "Dev coins added for testing packs.";
  saveGame();
  return true;
}

export function resetGameStats() {
  gameState.playerWins = 0;
  gameState.computerWins = 0;
  gameState.totalBattles = 0;
  gameState.resultMessage = "Battle stats reset.";
  gameState.winner = null;
  gameState.roundResult = null;

  saveGame();
}

export function getDailyMissionBoard() {
  const dailyOps = ensureDailyOpsState();
  const metrics = getMissionMetrics();
  const tasks = dailyOps.tasks.map((task) => {
    const startingValue = Number(dailyOps.baseline?.[task.metric] || 0);
    const currentValue = Number(metrics[task.metric] || 0);
    const progress = Math.max(0, currentValue - startingValue);
    const clamped = Math.min(task.goal, progress);

    return {
      ...task,
      progress: clamped,
      complete: clamped >= task.goal,
      percent: Math.round((clamped / task.goal) * 100),
    };
  });

  const rewardCard = cards.find((card) => card.id === dailyOps.rewardCardId) || null;
  const completedCount = tasks.filter((task) => task.complete).length;
  const allComplete = completedCount === tasks.length;
  const rewardClaimed = Boolean(dailyOps.rewardClaimed);

  return {
    cycleKey: dailyOps.cycleKey,
    tasks,
    completedCount,
    totalTasks: tasks.length,
    allComplete,
    rewardClaimed,
    rewardCard,
    canClaim: progressSource === "local" && allComplete && !rewardClaimed,
    rewardLocked: progressSource !== "local",
    coinsReward: DAILY_COIN_REWARD,
    refreshesIn: formatResetCountdown(getNextDailyResetAt(dailyOps) - Date.now()),
    claimedAt: dailyOps.claimedAt,
    streak: Number(gameState.dailyStreak) || 0,
  };
}

export function claimDailyMissionReward() {
  const board = getDailyMissionBoard();

  if (progressSource !== "local") {
    return {
      ok: false,
      error: "Daily drops are currently local-vault rewards only.",
    };
  }

  if (board.rewardClaimed) {
    return {
      ok: false,
      error: "Today's drop has already been collected.",
    };
  }

  if (!board.allComplete) {
    return {
      ok: false,
      error: "Finish all four daily tasks to unlock the drop.",
    };
  }

  const rewardCard = board.rewardCard || cards[0] || null;

  gameState.coins += DAILY_COIN_REWARD;
  if (rewardCard?.id) {
    gameState.collection.push(rewardCard.id);
    gameState.lastOpenedPack = [rewardCard];
  }

  gameState.dailyOps.rewardClaimed = true;
  gameState.dailyOps.claimedAt = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const previousClaim = gameState.lastDailyClaimDate;
  const daysSincePreviousClaim = previousClaim
    ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${previousClaim}T00:00:00Z`)) / DAY_MS)
    : null;
  gameState.dailyStreak = daysSincePreviousClaim === 1 ? (Number(gameState.dailyStreak) || 0) + 1 : 1;
  gameState.lastDailyClaimDate = today;
  saveGame();

  return {
    ok: true,
    rewardCard,
    coins: DAILY_COIN_REWARD,
    message: rewardCard
      ? `Daily drop secured: ${rewardCard.name} and ${DAILY_COIN_REWARD} coins.`
      : `Daily drop secured: ${DAILY_COIN_REWARD} coins.`,
  };
}

/* =====================================================
   ARENA LEAGUE PROTOTYPE

   This local referee models the request/response contract the UI will use
   with a protected server function. It is intentionally not represented as
   production anti-cheat: a browser bundle cannot be a trust boundary.
===================================================== */

const arenaOpponents = {
  casual: {
    username: "PixelPaws",
    rankTier: "Bronze Paw",
    rankRating: 1086,
    avatar: "PP",
    banner: "Solar Sprinter",
  },
  ranked: {
    username: "NovaRider",
    rankTier: "Silver Fang",
    rankRating: 1271,
    avatar: "NR",
    banner: "Void Vanguard",
  },
  friend: {
    username: "MoonPup",
    rankTier: "Gold Howl",
    rankRating: 1422,
    avatar: "MP",
    banner: "Moonlit Howl",
  },
};

export function getRankTier(rating = gameState.rankRating) {
  if (rating >= 1800) return "PupVerse Champion";
  if (rating >= 1600) return "Neon Elite";
  if (rating >= 1400) return "Gold Howl";
  if (rating >= 1200) return "Silver Fang";
  if (rating >= 1000) return "Bronze Paw";
  return "Rookie";
}

export function getNextRankTarget(rating = gameState.rankRating) {
  const targets = [1000, 1200, 1400, 1600, 1800];
  return targets.find((target) => target > rating) || 2000;
}

export function getRankProgress(rating = gameState.rankRating) {
  const floors = [0, 1000, 1200, 1400, 1600, 1800];
  const floor = [...floors].reverse().find((value) => value <= rating) || 0;
  const target = getNextRankTarget(rating);
  return Math.min(100, Math.max(0, Math.round(((rating - floor) / (target - floor)) * 100)));
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function getArenaDeck() {
  const ownedCards = gameState.collection
    .map((cardId) => cards.find((card) => card.id === cardId))
    .filter((card) => card?.stats);
  const pool = ownedCards.length >= 3 ? ownedCards : cards.filter((card) => card?.stats);
  return shuffleCards(pool).slice(0, 3);
}

Object.assign(gameState, {
  arenaStatus: "hub",
  arenaMode: null,
  queueMessage: "Finding a fair opponent…",
  friendRoomCode: "",
  onlineMatch: null,
  quickReaction: "",
});

export function openArenaLeague() {
  gameState.mode = "online";
  gameState.arenaStatus = "hub";
  gameState.onlineMatch = null;
  gameState.quickReaction = "";
}

export function startArenaQueue(mode = "casual") {
  gameState.mode = "online";
  gameState.arenaMode = mode;
  gameState.arenaStatus = "queue";
  gameState.queueMessage = mode === "ranked" ? "Searching your rating band…" : "Finding a nearby challenger…";
}

export function createFriendRoom() {
  gameState.mode = "online";
  gameState.arenaMode = "friend";
  gameState.friendRoomCode = createRoomCode();
  gameState.arenaStatus = "friend-room";
  return gameState.friendRoomCode;
}

export function joinFriendRoom(roomCode) {
  const cleanCode = String(roomCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 8);
  if (cleanCode.length < 4) return false;
  gameState.friendRoomCode = cleanCode;
  startArenaQueue("friend");
  gameState.queueMessage = `Joining room ${cleanCode}…`;
  return true;
}

export function cancelArenaQueue() {
  gameState.arenaStatus = "hub";
  gameState.arenaMode = null;
}

export function confirmArenaMatch() {
  const mode = gameState.arenaMode || "casual";
  const playerDeck = getArenaDeck();
  const opponentDeck = getArenaDeck();

  gameState.onlineMatch = {
    id: `PV-${Date.now().toString(36).toUpperCase()}`,
    mode,
    opponent: arenaOpponents[mode],
    round: 1,
    playerScore: 0,
    opponentScore: 0,
    selectedStat: null,
    roundWinner: null,
    roundMessage: "Choose a stat. The match referee will lock the official result.",
    complete: false,
    ratingChange: 0,
    coinReward: 0,
    xpReward: 0,
    roundResult: null,
    // JSON copies model immutable match snapshots created at match start.
    playerDeck: JSON.parse(JSON.stringify(playerDeck)),
    opponentDeck: JSON.parse(JSON.stringify(opponentDeck)),
  };
  gameState.arenaStatus = "battle";
}

export function chooseOnlineStat(statName) {
  const match = gameState.onlineMatch;
  if (!match || match.complete || match.selectedStat) return;

  const index = Math.min(match.round - 1, match.playerDeck.length - 1);
  const result = resolveStatContest(match.playerDeck[index], match.opponentDeck[index], statName);
  const playerValue = result.playerValue;
  const opponentValue = result.opponentValue;
  const cleanStatName = result.selectedStat.charAt(0).toUpperCase() + result.selectedStat.slice(1);
  const boostNotes = [
    formatBoostNote(match.playerDeck[index], result.playerBoost, result.selectedStat),
    formatBoostNote(match.opponentDeck[index], result.opponentBoost, result.selectedStat),
  ].filter(Boolean).join(" ");

  match.selectedStat = result.selectedStat;
  match.roundResult = result;

  if (result.winner === "player") {
    match.playerScore += 1;
    match.roundWinner = "player";
    match.roundMessage = `Round secured — ${cleanStatName} ${playerValue} beats ${opponentValue}. ${boostNotes}`;
  } else if (result.winner === "opponent") {
    match.opponentScore += 1;
    match.roundWinner = "opponent";
    match.roundMessage = `${match.opponent.username} takes it — ${cleanStatName} ${opponentValue} beats ${playerValue}. ${boostNotes}`;
  } else {
    match.roundWinner = "draw";
    match.roundMessage = `Dead even at ${playerValue} ${cleanStatName}. ${boostNotes}`;
  }

  const finalRound = match.round >= 3 || match.playerScore >= 2 || match.opponentScore >= 2;
  if (finalRound) finishArenaMatch();
}

function finishArenaMatch() {
  const match = gameState.onlineMatch;
  if (!match) return;

  match.complete = true;
  const won = match.playerScore > match.opponentScore;
  const draw = match.playerScore === match.opponentScore;
  match.coinReward = won ? 18 : draw ? 10 : 6;
  match.xpReward = won ? 120 : draw ? 75 : 45;
  match.ratingChange = match.mode === "ranked" ? (won ? 24 : draw ? 0 : -18) : 0;

  gameState.coins += match.coinReward;
  gameState.xp += match.xpReward;
  gameState.rankRating = Math.max(0, gameState.rankRating + match.ratingChange);
  gameState.onlineWins += won ? 1 : 0;
  gameState.rankedWins += won && match.mode === "ranked" ? 1 : 0;
  gameState.arenaStatus = "result";
  saveGame();
}

export function advanceArenaRound() {
  const match = gameState.onlineMatch;
  if (!match || match.complete || !match.selectedStat) return;
  match.round += 1;
  match.selectedStat = null;
  match.roundWinner = null;
  match.roundResult = null;
  match.roundMessage = "New round. Choose the stat that gives your pup the edge.";
}

export function sendQuickReaction(reaction) {
  gameState.quickReaction = reaction;
}
