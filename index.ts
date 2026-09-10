import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Methode nicht erlaubt." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server-Konfiguration fehlt." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json();
    const token = String(body?.token || "").trim();
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!token || token.length < 40) return json({ error: "Einladungslink ungültig." }, 400);
    if (!name) return json({ error: "Bitte einen Namen angeben." }, 400);
    if (!email || !email.includes("@")) return json({ error: "Bitte eine gültige E-Mail angeben." }, 400);
    if (password.length < 8) return json({ error: "Das Passwort muss mindestens 8 Zeichen lang sein." }, 400);

    const now = new Date().toISOString();

    const { data: invite, error: inviteError } = await admin
      .from("einladungen")
      .select("id,expires_at,used_at")
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", now)
      .maybeSingle();

    if (inviteError) {
      console.error(inviteError);
      return json({ error: "Einladung konnte nicht geprüft werden." }, 500);
    }

    if (!invite) return json({ error: "Einladung ist ungültig, abgelaufen oder bereits benutzt." }, 403);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (createError || !created.user) {
      console.error(createError);
      const msg = createError?.message?.toLowerCase().includes("already")
        ? "Für diese E-Mail existiert bereits ein Konto."
        : "Konto konnte nicht erstellt werden.";
      return json({ error: msg }, 400);
    }

    const { data: claimed, error: claimError } = await admin.rpc("claim_rudelbar_invite", {
      p_token: token,
      p_user_id: created.user.id,
    });

    if (claimError || claimed !== true) {
      console.error(claimError);
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "Einladung wurde bereits verwendet oder ist abgelaufen." }, 409);
    }

    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ error: "Ungültige Anfrage." }, 400);
  }
});
