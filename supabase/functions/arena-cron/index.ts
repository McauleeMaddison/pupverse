import { withSupabase } from "npm:@supabase/server";

export default {
  fetch: withSupabase({ auth: "secret:arena-cron" }, async (_req, ctx) => {
    const { data, error } = await ctx.supabaseAdmin.rpc("sweep_stale_arena_state");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ swept: data });
  }),
};

