const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    if (body?.action !== "checkout") return json({ success: false, error: "Unbekannte Aktion" }, 400);

    const amount = Math.round(Number(body.amount_cent ?? body.amount));
    if (!Number.isFinite(amount) || amount < 1) return json({ success: false, error: "Ungültiger Betrag" }, 400);

    const apiKey = Deno.env.get("SUMUP_API_KEY");
    const merchantCode = Deno.env.get("SUMUP_MERCHANT_CODE");
    const readerId = Deno.env.get("SUMUP_READER_ID");
    const affiliateKey = Deno.env.get("SUMUP_AFFILIATE_KEY");
    const affiliateAppId = Deno.env.get("SUMUP_AFFILIATE_APP_ID") || "de.rudelbar.kasse";
    if (!apiKey || !merchantCode || !readerId || !affiliateKey) {
      return json({ success: false, error: "SumUp-Secrets unvollständig (API_KEY, MERCHANT_CODE, READER_ID, AFFILIATE_KEY)." }, 500);
    }

    const txId = crypto.randomUUID();
    const endpoint = `https://api.sumup.com/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}/checkout`;
    const createRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        total_amount: { currency: body.currency || "EUR", minor_unit: 2, value: amount },
        description: body.description || "Rudelbar Kartenzahlung",
        affiliate: { app_id: affiliateAppId, key: affiliateKey, foreign_transaction_id: txId, tags: { source: "rudelbar-pwa" } },
      }),
    });
    const created = await createRes.json().catch(() => ({}));
    if (!createRes.ok) return json({ success: false, status: "failed", error: created?.detail || created?.message || `SumUp HTTP ${createRes.status}`, sumup: created }, createRes.status);

    const checkoutId = created?.data?.checkout_id;
    if (!checkoutId) return json({ success: false, status: "failed", error: "SumUp hat keine Checkout-ID geliefert.", sumup: created }, 502);

    const statusUrl = `${endpoint}/${encodeURIComponent(checkoutId)}`;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const statusRes = await fetch(statusUrl, { headers: { "Authorization": `Bearer ${apiKey}` } });
      const statusBody = await statusRes.json().catch(() => ({}));
      if (!statusRes.ok) continue;
      const status = String(statusBody?.data?.status || "pending").toLowerCase();
      if (status === "successful") return json({ success: true, status, checkout_id: checkoutId, transaction_id: statusBody?.data?.client_transaction_id || txId, data: statusBody.data });
      if (status === "failed" || status === "cancelled") return json({ success: false, status, message: status === "cancelled" ? "Zahlung wurde abgebrochen." : (statusBody?.data?.payment_failure_reason || "Kartenzahlung fehlgeschlagen."), checkout_id: checkoutId });
    }

    return json({ success: false, status: "pending", error: "Zeitüberschreitung: SumUp hat innerhalb von 90 Sekunden keinen Endstatus gemeldet.", checkout_id: checkoutId }, 504);
  } catch (e) {
    return json({ success: false, status: "failed", error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
