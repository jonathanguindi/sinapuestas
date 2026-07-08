import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.text();
    const { image, mimeType } = JSON.parse(body);
    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType || "image/jpeg"};base64,${image}` } },
            { type: "text", text: "Extrae los datos de este pasaporte y responde SOLO con JSON puro sin markdown:\n{\"nombre\":\"nombre completo\",\"fechaNacimiento\":\"YYYY-MM-DD\",\"pasaporte\":\"número\",\"pasaporteVence\":\"YYYY-MM-DD\",\"nacionalidad\":\"país\",\"sexo\":\"M o F\",\"cedula\":\"si aparece sino vacío\"}" }
          ]
        }]
      })
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    let parsed = {};
    try { parsed = JSON.parse(clean); } catch(e) { parsed = { _raw: text }; }
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
