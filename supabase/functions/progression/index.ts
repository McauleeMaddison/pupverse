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
      const userId = ctx.userClaims?.sub ?? ctx.userClaims?.id;
      if (!userId) return json({ error: "Authentication required" }, 401);

      if (body?.action === "open-pack") {
        const { data, error } = await ctx.supabase.rpc("open_player_pack", {
          p_pack_id: String(body.packId || ""),
          p_request_id: String(body.requestId || ""),
        });
        if (error) throw error;
        return json(data, 201);
      }

      return json({ error: "Unknown progression action" }, 400);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Progression request failed";
      console.error("progression_function_error", { message });
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

