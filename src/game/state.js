import { cards } from "../data/cards.js";
import { packs } from "../data/packs.js";

const SAVE_KEY = "pupverse-save-v3";
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
  };

  localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

export function getStatValue(card, statName) {
  if (!card || !card.stats) return 0;

  if (typeof card.stats[statName] === "number") {
    return card.stats[statName];
  }

  if (statName === "defence" && typeof card.stats.defense === "number") {
    return card.stats.defense;
  }

  if (statName === "defense" && typeof card.stats.defence === "number") {
    return card.stats.defence;
  }

  return 0;
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
}

export function chooseBattleStat(statName) {
  if (!gameState.playerCard || !gameState.computerCard) return;
  if (gameState.computerRevealed) return;

  const playerValue = getStatValue(gameState.playerCard, statName);
  const computerValue = getStatValue(gameState.computerCard, statName);
  const cleanStatName = statName.charAt(0).toUpperCase() + statName.slice(1);

  gameState.selectedStat = statName;
  gameState.computerRevealed = true;
  gameState.totalBattles += 1;

  if (playerValue > computerValue) {
    if (progressSource === "local") gameState.coins += 5;
    gameState.playerWins += 1;
    gameState.winner = "player";
    gameState.resultMessage = progressSource === "local"
      ? `You won with ${cleanStatName}! ${playerValue} beats ${computerValue}. +5 coins`
      : `Training win with ${cleanStatName}! ${playerValue} beats ${computerValue}. Online rewards are server-controlled.`;
  } else if (playerValue < computerValue) {
    gameState.computerWins += 1;
    gameState.winner = "computer";
    gameState.resultMessage = `Computer won with ${cleanStatName}! ${computerValue} beats ${playerValue}.`;
  } else {
    gameState.winner = "draw";
    gameState.resultMessage = `Draw! Both cards had ${playerValue} ${cleanStatName}.`;
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

  saveGame();
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
  const playerValue = getStatValue(match.playerDeck[index], statName);
  const opponentValue = getStatValue(match.opponentDeck[index], statName);
  match.selectedStat = statName;

  if (playerValue > opponentValue) {
    match.playerScore += 1;
    match.roundWinner = "player";
    match.roundMessage = `Round secured — ${playerValue} beats ${opponentValue}.`;
  } else if (playerValue < opponentValue) {
    match.opponentScore += 1;
    match.roundWinner = "opponent";
    match.roundMessage = `${match.opponent.username} takes it — ${opponentValue} beats ${playerValue}.`;
  } else {
    match.roundWinner = "draw";
    match.roundMessage = `Dead even at ${playerValue}. No point awarded.`;
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
  match.roundMessage = "New round. Choose the stat that gives your pup the edge.";
}

export function sendQuickReaction(reaction) {
  gameState.quickReaction = reaction;
}
