import { withSupabase } from "npm:@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

const authenticatedHandler = withSupabase(
  { auth: "user" },
  async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    try {
      const body = await req.json();
      const action = String(body?.action || "");
      const userId = ctx.userClaims?.sub ?? ctx.userClaims?.id;
      if (!userId) return json({ error: "Authentication required" }, 401);

      if (action === "queue") {
        const { data, error } = await ctx.supabase.rpc("request_matchmaking", {
          p_mode: body.mode,
          p_deck_id: body.deckId,
        });
        if (error) throw error;
        return json(data);
      }

      if (action === "cancel-queue") {
        const { error } = await ctx.supabase.rpc("cancel_matchmaking");
        if (error) throw error;
        return json({ status: "cancelled" });
      }

      if (action === "create-room") {
        const { data, error } = await ctx.supabase.rpc("create_friend_room", {
          p_deck_id: body.deckId,
        });
        if (error) throw error;
        return json(data);
      }

      if (action === "join-room") {
        const { data, error } = await ctx.supabase.rpc("join_friend_room", {
          p_code: body.code,
          p_deck_id: body.deckId,
        });
        if (error) throw error;
        return json(data);
      }

      if (action === "match-state") {
        const { data, error } = await ctx.supabase.rpc("get_match_state", {
          p_match_id: body.matchId,
        });
        if (error) throw error;
        return json(data);
      }

      if (action === "resolve-round") {
        const { data, error } = await ctx.supabase.rpc("resolve_match_round", {
          p_match_id: body.matchId,
          p_stat: body.stat,
          p_action_nonce: body.actionNonce,
        });
        if (error) throw error;
        return json(data);
      }

      if (action === "presence") {
        const { error } = await ctx.supabase.rpc("set_match_presence", {
          p_match_id: body.matchId,
          p_connected: Boolean(body.connected),
        });
        if (error) throw error;
        return json({ status: "ok" });
      }

      if (action === "forfeit") {
        const { error } = await ctx.supabase.rpc("forfeit_match", {
          p_match_id: body.matchId,
        });
        if (error) throw error;
        return json({ status: "forfeited" });
      }

      if (action === "report") {
        const details = String(body.details || "").trim().slice(0, 500) || null;
        const { error } = await ctx.supabase.from("reports").insert({
          reporter_id: userId,
          reported_player_id: body.reportedPlayerId,
          match_id: body.matchId,
          reason: body.reason,
          details,
        });
        if (error) throw error;
        return json({ status: "reported" }, 201);
      }

      if (action === "block") {
        const { error } = await ctx.supabase.from("player_blocks").upsert({
          blocker_id: userId,
          blocked_id: body.playerId,
        });
        if (error) throw error;
        return json({ status: "blocked" }, 201);
      }

      return json({ error: "Unknown arena action" }, 400);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Arena request failed";
      console.error("arena_function_error", { message });
      return json({ error: message }, 400);
    }
  },
);

export default {
  fetch(req: Request) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    return authenticatedHandler(req);
  },
};

