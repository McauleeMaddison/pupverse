import { isSupabaseConfigured, supabase } from "../lib/supabase.js";

const activeChannels = new Set();

let queueHeartbeat = null;
let matchPresenceHeartbeat = null;
let presenceMatchId = null;

function assertConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      "Supabase is not configured. Check your .env.local VITE_SUPABASE variables."
    );
  }
}

function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normaliseUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
}

function getAvatar(username) {
  return (
    String(username || "PV")
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 2)
      .toUpperCase() || "PV"
  );
}

function collectionToPlayerCards(collection) {
  if (!Array.isArray(collection)) return [];

  const quantities = new Map();

  collection.forEach((entry) => {
    const cardId =
      typeof entry === "string"
        ? entry
        : entry?.card_id || entry?.id || null;

    if (!cardId) return;

    const quantity =
      typeof entry === "object" && Number.isFinite(entry.quantity)
        ? entry.quantity
        : 1;

    quantities.set(cardId, (quantities.get(cardId) || 0) + quantity);
  });

  return [...quantities.entries()].map(([card_id, quantity]) => ({
    card_id,
    quantity,
    favourite: false,
    acquired_at: null,
  }));
}

async function optionalQuery(label, query, fallback = []) {
  const { data, error } = await query;

  if (error) {
    console.warn(`[PupVerse] Optional ${label} data unavailable:`, error.message);
    return fallback;
  }

  return data ?? fallback;
}

async function invokeArena(body) {
  assertConfigured();

  const { data, error } = await supabase.functions.invoke("arena", {
    body,
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data;
}

async function invokeProgression(body) {
  assertConfigured();

  const { data, error } = await supabase.functions.invoke("progression", {
    body,
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data;
}

export async function initializeArenaBackend(onAuthChange) {
  if (!isSupabaseConfigured || !supabase) {
    return { session: null };
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  if (data.session?.access_token) {
    supabase.realtime.setAuth(data.session.access_token);
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.access_token) {
      supabase.realtime.setAuth(session.access_token);
    }

    onAuthChange?.(session, event);
  });

  return { session: data.session };
}

export async function signUp({ email, password, username }) {
  assertConfigured();

  const cleanEmail = normaliseEmail(email);
  const cleanUsername = normaliseUsername(username);

  if (!cleanEmail.includes("@")) {
    throw new Error("Enter a valid email address.");
  }

  if (cleanUsername.length < 3) {
    throw new Error(
      "Username must use at least 3 letters, numbers, or underscores."
    );
  }

  if (!password || password.length < 8) {
    throw new Error("Password must contain at least 8 characters.");
  }

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      emailRedirectTo: window.location.origin,
      data: {
        username: cleanUsername,
      },
    },
  });

  if (error) throw error;

  return data;
}

export async function signIn({ email, password }) {
  assertConfigured();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normaliseEmail(email),
    password,
  });

  if (error) throw error;

  return data;
}

export async function requestPasswordReset(email) {
  assertConfigured();
  const cleanEmail = normaliseEmail(email);
  if (!cleanEmail.includes("@")) throw new Error("Enter the email address used for your PupVerse account.");

  const { data, error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: `${window.location.origin}/?reset-password=1`,
  });
  if (error) throw error;
  return data;
}

export async function signInAsGuest() {
  assertConfigured();

  const { data, error } = await supabase.auth.signInAnonymously({
    options: {
      data: {
        username: `pup_${crypto.randomUUID().slice(0, 8)}`,
      },
    },
  });

  if (error) throw error;

  return data;
}

export async function upgradeGuestAccount({ email, username }) {
  assertConfigured();

  const cleanEmail = normaliseEmail(email);
  const cleanUsername = normaliseUsername(username);

  if (!cleanEmail.includes("@")) {
    throw new Error("Enter a valid email address.");
  }

  if (cleanUsername.length < 3) {
    throw new Error(
      "Username must use at least 3 letters, numbers, or underscores."
    );
  }

  const { data, error } = await supabase.auth.updateUser({
    email: cleanEmail,
    data: {
      username: cleanUsername,
    },
  });

  if (error) throw error;

  if (data.user?.id) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ username: cleanUsername })
      .eq("id", data.user.id);

    if (profileError) throw profileError;
  }

  return data;
}

export async function completeGuestPasswordUpgrade(password) {
  assertConfigured();

  if (!password || password.length < 8) {
    throw new Error("Password must contain at least 8 characters.");
  }

  const { data, error } = await supabase.auth.updateUser({
    password,
  });

  if (error) throw error;

  return data;
}

export async function linkGuestProvider(provider) {
  assertConfigured();

  if (!["google", "apple"].includes(provider)) {
    throw new Error("Unsupported sign-in provider.");
  }

  const { data, error } = await supabase.auth.linkIdentity({
    provider,
  });

  if (error) throw error;

  return data;
}

export async function signOut() {
  assertConfigured();

  await removeArenaSubscriptions();

  const { error } = await supabase.auth.signOut();

  if (error) throw error;
}

export async function loadPlayerData(userId) {
  assertConfigured();

  const [profileResult, remoteCards, packOpenings, decks, leaderboard, dailyBoard] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, username, avatar, banner, level, xp, coins, rank_rating, rank_tier, online_wins, ranked_wins, losses, draws, created_at"
      )
      .eq("id", userId)
      .single(),

    optionalQuery(
      "card vault",
      supabase
        .from("player_cards")
        .select("card_id, quantity, favourite, acquired_at")
        .eq("player_id", userId)
        .order("acquired_at")
    ),

    optionalQuery(
      "pack history",
      supabase
        .from("pack_openings")
        .select("id, pack_id, card_ids, coins_spent, balance_after, opened_at")
        .eq("player_id", userId)
        .order("opened_at", { ascending: false })
        .limit(25)
    ),

    optionalQuery(
      "decks",
      supabase
        .from("decks")
        .select("id, name, active, deck_cards(card_id, position)")
        .eq("player_id", userId)
        .order("created_at")
    ),

    optionalQuery(
      "leaderboard",
      supabase.from("leaderboard").select("*").order("position").limit(25)
    ),

    (async () => {
      try {
        return await invokeProgression({
          action: "daily-board",
        });
      } catch (error) {
        console.warn(
          "[PupVerse] Optional daily board unavailable:",
          error?.message || error
        );
        return null;
      }
    })(),
  ]);

  if (profileResult.error) throw profileResult.error;

  const profile = {
    ...profileResult.data,
    avatar: profileResult.data.avatar || getAvatar(profileResult.data.username),
    online_wins: profileResult.data.online_wins ?? 0,
    ranked_wins: profileResult.data.ranked_wins ?? 0,
    rank_tier: profileResult.data.rank_tier ?? "Rookie",
  };

  return {
    profile,
    playerCards:
      remoteCards.length > 0
        ? remoteCards
        : collectionToPlayerCards([]),
    packOpenings,
    decks,
    leaderboard,
    dailyBoard,
  };
}

export async function openRemotePack(packId, requestId) {
  return invokeProgression({
    action: "open-pack",
    packId,
    requestId: requestId || crypto.randomUUID(),
  });
}

export async function claimRemoteDailyReward(requestId) {
  return invokeProgression({
    action: "claim-daily",
    requestId: requestId || crypto.randomUUID(),
  });
}

export async function updateRemoteDeck(cardIds, requestId) {
  return invokeProgression({
    action: "set-deck",
    cardIds,
    requestId: requestId || crypto.randomUUID(),
  });
}

export async function getInviteCode() {
  return invokeProgression({ action: "invite-code" });
}

export async function claimReferralReward(code, requestId) {
  return invokeProgression({
    action: "claim-referral",
    code,
    requestId: requestId || crypto.randomUUID(),
  });
}

export async function setFavouriteCard(cardId, favourite) {
  assertConfigured();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const playerId = session?.user?.id;

  if (!playerId) {
    throw new Error("Authentication required.");
  }

  const { error } = await supabase
    .from("player_cards")
    .update({ favourite: Boolean(favourite) })
    .eq("player_id", playerId)
    .eq("card_id", cardId);

  if (error) throw error;
}

export async function requestMatch(mode, deckId) {
  return invokeArena({
    action: "queue",
    mode,
    deckId,
  });
}

export async function cancelMatchmaking() {
  clearInterval(queueHeartbeat);
  queueHeartbeat = null;

  return invokeArena({
    action: "cancel-queue",
  });
}

export function subscribeToQueue(playerId, onMatched, onError) {
  assertConfigured();

  const channel = supabase
    .channel(`queue:${playerId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "matchmaking_queue",
        filter: `player_id=eq.${playerId}`,
      },
      (payload) => {
        if (
          payload.new?.status === "matched" &&
          payload.new?.matched_id
        ) {
          onMatched(payload.new.matched_id);
        }
      }
    )
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError?.(error || new Error("Matchmaking connection lost."));
      }
    });

  activeChannels.add(channel);

  return channel;
}

export function maintainQueue(mode, deckId, onMatched, onError) {
  clearInterval(queueHeartbeat);

  queueHeartbeat = setInterval(async () => {
    try {
      const result = await requestMatch(mode, deckId);

      if (result?.status === "matched" && result.match_id) {
        clearInterval(queueHeartbeat);
        queueHeartbeat = null;
        onMatched(result.match_id);
      }
    } catch (error) {
      onError?.(error);
    }
  }, 15000);
}

export async function createRemoteFriendRoom(deckId) {
  return invokeArena({
    action: "create-room",
    deckId,
  });
}

export async function joinRemoteFriendRoom(code, deckId) {
  return invokeArena({
    action: "join-room",
    code,
    deckId,
  });
}

export function subscribeToFriendRoom(code, onMatched, onError) {
  assertConfigured();

  const channel = supabase
    .channel(`friend-room-db:${code}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "friend_rooms",
        filter: `code=eq.${code}`,
      },
      (payload) => {
        if (
          payload.new?.status === "matched" &&
          payload.new?.match_id
        ) {
          onMatched(payload.new.match_id);
        }
      }
    )
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError?.(error || new Error("Room connection lost."));
      }
    });

  activeChannels.add(channel);

  return channel;
}

export async function loadRemoteMatch(matchId) {
  return invokeArena({
    action: "match-state",
    matchId,
  });
}

export async function resolveRemoteRound(matchId, stat) {
  return invokeArena({
    action: "resolve-round",
    matchId,
    stat,
    actionNonce: crypto.randomUUID(),
  });
}

export async function setRemotePresence(matchId, connected) {
  return invokeArena({
    action: "presence",
    matchId,
    connected,
  });
}

export async function forfeitRemoteMatch(matchId) {
  return invokeArena({
    action: "forfeit",
    matchId,
  });
}

export async function reportRemotePlayer({
  matchId,
  reportedPlayerId,
  reason,
  details,
}) {
  return invokeArena({
    action: "report",
    matchId,
    reportedPlayerId,
    reason,
    details,
  });
}

export async function blockRemotePlayer(playerId) {
  return invokeArena({
    action: "block",
    playerId,
  });
}

export function subscribeToMatch(
  matchId,
  playerId,
  onChange,
  onPresence,
  onError
) {
  assertConfigured();

  const changes = supabase
    .channel(`match-db:${matchId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "matches",
        filter: `id=eq.${matchId}`,
      },
      onChange
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "match_rounds",
        filter: `match_id=eq.${matchId}`,
      },
      onChange
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "match_players",
        filter: `match_id=eq.${matchId}`,
      },
      onChange
    )
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError?.(error || new Error("Match connection lost."));
      }
    });

  const presence = supabase.channel(`match:${matchId}`, {
    config: {
      private: true,
      presence: {
        key: playerId,
      },
    },
  });

  presence
    .on("presence", { event: "sync" }, () => {
      onPresence?.(presence.presenceState());
    })
    .subscribe(async (status, error) => {
      if (status === "SUBSCRIBED") {
        await presence.track({
          player_id: playerId,
          online_at: new Date().toISOString(),
        });

        await setRemotePresence(matchId, true);
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError?.(error || new Error("Private match channel lost."));
      }
    });

  activeChannels.add(changes);
  activeChannels.add(presence);

  presenceMatchId = matchId;

  clearInterval(matchPresenceHeartbeat);

  matchPresenceHeartbeat = setInterval(() => {
    setRemotePresence(matchId, true).catch((error) => onError?.(error));
  }, 15000);

  return {
    changes,
    presence,
  };
}

export async function removeArenaSubscriptions() {
  clearInterval(queueHeartbeat);
  queueHeartbeat = null;

  clearInterval(matchPresenceHeartbeat);
  matchPresenceHeartbeat = null;

  if (presenceMatchId) {
    await setRemotePresence(presenceMatchId, false).catch(() => {});
    presenceMatchId = null;
  }

  if (!supabase) return;

  await Promise.all(
    [...activeChannels].map((channel) => supabase.removeChannel(channel))
  );

  activeChannels.clear();
}

export { isSupabaseConfigured };
