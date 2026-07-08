import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { vuelo } = await req.json();
    const AVKEY = Deno.env.get("AVIATIONSTACK_API_KEY");
    const res = await fetch(`http://api.aviationstack.com/v1/flights?access_key=${AVKEY}&flight_iata=${vuelo}&limit=1`);
    const data = await res.json();
    const f = data.data?.[0];
    if (!f) return new Response(JSON.stringify({ error: "Vuelo no encontrado" }), { headers: corsHeaders });
    return new Response(JSON.stringify({
      aerolinea: f.airline?.name || "",
      destino: f.arrival?.city || f.arrival?.airport || "",
      fechaIda: f.flight_date || "",
      iata: f.arrival?.iata || ""
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch(e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
