import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

async function sendWhatsApp(to: string, body: string) {
  const from = "whatsapp:+18782340551";
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
}

async function getEstado(userId: string) {
  const { data } = await supabase.from("user_data").select("value").eq("user_id", userId).eq("key", "wa_estado").maybeSingle();
  return data ? JSON.parse(data.value) : null;
}

async function setEstado(userId: string, estado: any) {
  await supabase.from("user_data").upsert({ user_id: userId, key: "wa_estado", value: JSON.stringify(estado) }, { onConflict: "user_id,key" });
}

async function clearEstado(userId: string) {
  await supabase.from("user_data").delete().eq("user_id", userId).eq("key", "wa_estado");
}

async function procesarConIA(mensaje: string, empleadas: any[]): Promise<any> {
  const mesActual = meses[new Date().getMonth()];
  const listaEmpleadas = empleadas.map(e => e.nombre).join(", ");
  const prompt = `Eres asistente de SinContador (app panameña de pagos domésticos).
Empleadas: ${listaEmpleadas || "ninguna"}
Mes actual: ${mesActual} ${new Date().getFullYear()}
Mensaje: "${mensaje}"

JSON:
{"accion":"registrar_pago|registrar_prestamo|consultar_pago|ver_empleadas|ver_historial|ayuda|cancelar|otro","empleada":"nombre o null","monto":numero_o_null,"quincena":1_o_2_o_null,"mes":"mes o null","metodoPago":"Yappy|ACH|Efectivo|Transferencia|null","motivo":"motivo o null","cuotaMensual":numero_o_null}
Solo JSON.`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o", max_tokens: 200, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  try { return JSON.parse((data.choices?.[0]?.message?.content || "{}").replace(/```json|```/g, "").trim()); }
  catch { return { accion: "otro" }; }
}

function encontrarEmpleada(nombre: string, empleadas: any[]) {
  if (!nombre) return null;
  const n = nombre.toLowerCase();
  return empleadas.find(e => e.nombre?.toLowerCase().includes(n) || n.includes(e.nombre?.split(" ")[0]?.toLowerCase()));
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("OK", { status: 200 });
  
  const formData = await req.formData();
  const from = formData.get("From") as string;
  const body = ((formData.get("Body") as string) || "").trim();
  const mediaUrl = formData.get("MediaUrl0") as string | null;
  const phone = from.replace("whatsapp:+", "");

  const { data: profile } = await supabase.from("profiles").select("id").eq("phone", phone).maybeSingle();
  if (!profile) {
    await sendWhatsApp(from, "Tu número no está vinculado en SinContador. Entra a sincontador.app y agrega tu WhatsApp en tu perfil.");
    return new Response("OK", { status: 200 });
  }

  const userId = profile.id;
  const [empRes, histRes, prestRes] = await Promise.all([
    supabase.from("user_data").select("value").eq("user_id", userId).eq("key", "emp_v1").maybeSingle(),
    supabase.from("user_data").select("value").eq("user_id", userId).eq("key", "hist_v1").maybeSingle(),
    supabase.from("user_data").select("value").eq("user_id", userId).eq("key", "prest_v1").maybeSingle(),
  ]);

  const empleadas = empRes.data ? JSON.parse(empRes.data.value) : [];
  const historial = histRes.data ? JSON.parse(histRes.data.value) : [];
  const prestamos = prestRes.data ? JSON.parse(prestRes.data.value) : [];

  // ── ESTADO ACTIVO (conversación en pasos) ──────────────────────────────
  const estado = await getEstado(userId);

  if (estado) {
    const bodyLower = body.toLowerCase();
    
    // Cancelar
    if (bodyLower === "cancelar" || bodyLower === "no" || bodyLower === "salir") {
      await clearEstado(userId);
      await sendWhatsApp(from, "❌ Cancelado. ¿En qué más te puedo ayudar?");
      return new Response("OK", { status: 200 });
    }

    // ── Flujo: PRÉSTAMO esperando cuota ──
    if (estado.paso === "prestamo_cuota") {
      const cuota = parseFloat(body.replace(/[^0-9.]/g, ""));
      if (isNaN(cuota) || cuota <= 0) {
        await sendWhatsApp(from, "Por favor escribe solo el monto de la cuota quincenal. Ejemplo: *50*\n\nO escribe *cancelar* para cancelar.");
        return new Response("OK", { status: 200 });
      }
      // Confirmar antes de guardar
      await setEstado(userId, { ...estado, paso: "prestamo_confirmar", cuotaQuincenal: cuota });
      const emp = encontrarEmpleada(estado.empleada, empleadas);
      await sendWhatsApp(from,
        `📋 *Confirma el préstamo:*\n\n` +
        `Empleada: ${emp?.nombre}\n` +
        `Monto: $${estado.monto.toFixed(2)}\n` +
        `Motivo: ${estado.motivo || "Préstamo personal"}\n` +
        `Cuota quincenal: $${cuota.toFixed(2)}\n` +
        `Cuota mensual: $${(cuota * 2).toFixed(2)}\n\n` +
        `Responde *sí* para confirmar o *cancelar* para cancelar.`
      );
      return new Response("OK", { status: 200 });
    }

    // ── Flujo: PRÉSTAMO esperando confirmación ──
    if (estado.paso === "prestamo_confirmar") {
      const bodyLower2 = body.toLowerCase();
      if (bodyLower2 === "sí" || bodyLower2 === "si" || bodyLower2 === "yes" || bodyLower2 === "ok" || bodyLower2 === "confirmar") {
        const emp = encontrarEmpleada(estado.empleada, empleadas);
        if (!emp) { await clearEstado(userId); return new Response("OK", { status: 200 }); }
        const prestamo = {
          id: Date.now(), empleadoId: emp.id,
          monto: estado.monto, saldo: estado.monto,
          cuotaMensual: estado.cuotaQuincenal * 2,
          cuotaQuincenal: estado.cuotaQuincenal,
          motivo: estado.motivo || "Préstamo personal",
          fecha: new Date().toISOString().split("T")[0],
          registradoPorWhatsApp: true,
        };
        prestamos.push(prestamo);
        await supabase.from("user_data").upsert({ user_id: userId, key: "prest_v1", value: JSON.stringify(prestamos) }, { onConflict: "user_id,key" });
        await clearEstado(userId);
        await sendWhatsApp(from,
          `✅ *Préstamo registrado exitosamente*\n\n` +
          `Empleada: ${emp.nombre}\n` +
          `Monto: $${estado.monto.toFixed(2)}\n` +
          `Motivo: ${prestamo.motivo}\n` +
          `Cuota quincenal: $${estado.cuotaQuincenal.toFixed(2)}\n` +
          `Cuota mensual: $${(estado.cuotaQuincenal * 2).toFixed(2)}\n` +
          `Se descontará automáticamente de cada quincena.\n\n` +
          `Ver en sincontador.app`
        );
      } else {
        await sendWhatsApp(from, "Responde *sí* para confirmar o *cancelar* para cancelar.");
      }
      return new Response("OK", { status: 200 });
    }

    // ── Flujo: PAGO esperando método ──
    if (estado.paso === "pago_metodo") {
      const metodos: any = { "1": "Yappy", "2": "ACH", "3": "Efectivo", "4": "Transferencia", "yappy": "Yappy", "ach": "ACH", "efectivo": "Efectivo", "transferencia": "Transferencia" };
      const metodo = metodos[body.toLowerCase()] || metodos[body] || body;
      const emp = encontrarEmpleada(estado.empleada, empleadas);
      if (!emp) { await clearEstado(userId); return new Response("OK", { status: 200 }); }
      const now = new Date();
      const pago = {
        id: Date.now(), empleadoId: emp.id,
        quincena: estado.quincena || (now.getDate() <= 15 ? 1 : 2),
        mes: estado.mes || meses[now.getMonth()], año: now.getFullYear(),
        fecha: now.toISOString().split("T")[0], netoEmpleado: estado.monto,
        metodoPago: metodo, notas: "Registrado por WhatsApp",
        fotoComprobante: mediaUrl || null, registradoPorWhatsApp: true,
      };
      historial.push(pago);
      await supabase.from("user_data").upsert({ user_id: userId, key: "hist_v1", value: JSON.stringify(historial) }, { onConflict: "user_id,key" });
      await clearEstado(userId);
      await sendWhatsApp(from,
        `✅ *Pago registrado exitosamente*\n\n` +
        `Empleada: ${emp.nombre}\n` +
        `Monto: $${estado.monto.toFixed(2)}\n` +
        `Quincena ${pago.quincena} de ${pago.mes} ${pago.año}\n` +
        `Método: ${metodo}\n` +
        `Fecha: ${pago.fecha}\n\n` +
        `Ver en sincontador.app`
      );
      return new Response("OK", { status: 200 });
    }
  }

  // ── NUEVO MENSAJE ──────────────────────────────────────────────────────
  const info = await procesarConIA(body, empleadas);

  // REGISTRAR PAGO
  if (info.accion === "registrar_pago" && info.empleada && info.monto) {
    const emp = encontrarEmpleada(info.empleada, empleadas);
    if (!emp) {
      await sendWhatsApp(from, `No encontré a "${info.empleada}".\nTus empleadas: ${empleadas.map((e:any)=>e.nombre).join(", ") || "ninguna"}`);
      return new Response("OK", { status: 200 });
    }
    if (!info.metodoPago) {
      // Guardar estado y preguntar método
      await setEstado(userId, { paso: "pago_metodo", empleada: info.empleada, monto: info.monto, quincena: info.quincena, mes: info.mes });
      await sendWhatsApp(from,
        `💳 ¿Cómo pagaste a ${emp.nombre}?\n\n` +
        `1️⃣ Yappy\n2️⃣ ACH\n3️⃣ Efectivo\n4️⃣ Transferencia\n\n` +
        `Escribe el número o el nombre.`
      );
    } else {
      const now = new Date();
      const pago = {
        id: Date.now(), empleadoId: emp.id,
        quincena: info.quincena || (now.getDate() <= 15 ? 1 : 2),
        mes: info.mes || meses[now.getMonth()], año: now.getFullYear(),
        fecha: now.toISOString().split("T")[0], netoEmpleado: info.monto,
        metodoPago: info.metodoPago, notas: "Registrado por WhatsApp",
        fotoComprobante: mediaUrl || null, registradoPorWhatsApp: true,
      };
      historial.push(pago);
      await supabase.from("user_data").upsert({ user_id: userId, key: "hist_v1", value: JSON.stringify(historial) }, { onConflict: "user_id,key" });
      await sendWhatsApp(from,
        `✅ *Pago registrado exitosamente*\n\n` +
        `Empleada: ${emp.nombre}\n` +
        `Monto: $${info.monto.toFixed(2)}\n` +
        `Quincena ${pago.quincena} de ${pago.mes} ${pago.año}\n` +
        `Método: ${info.metodoPago}\n` +
        `Fecha: ${pago.fecha}\n\n` +
        `Ver en sincontador.app`
      );
    }

  // REGISTRAR PRÉSTAMO
  } else if (info.accion === "registrar_prestamo" && info.empleada && info.monto) {
    const emp = encontrarEmpleada(info.empleada, empleadas);
    if (!emp) {
      await sendWhatsApp(from, `No encontré a "${info.empleada}".\nTus empleadas: ${empleadas.map((e:any)=>e.nombre).join(", ")}`);
      return new Response("OK", { status: 200 });
    }
    // Siempre preguntar cuota quincenal
    await setEstado(userId, { paso: "prestamo_cuota", empleada: info.empleada, monto: info.monto, motivo: info.motivo });
    await sendWhatsApp(from,
      `💰 *Nuevo préstamo para ${emp.nombre}*\n\n` +
      `Monto: $${info.monto.toFixed(2)}\n` +
      `Motivo: ${info.motivo || "Préstamo personal"}\n\n` +
      `¿Cuánto le vas a descontar *por quincena*?\n` +
      `Escribe solo el monto. Ejemplo: *50*\n\n` +
      `O escribe *cancelar* para cancelar.`
    );

  // CONSULTAR CUÁNTO PAGAR
  } else if (info.accion === "consultar_pago") {
    if (info.empleada) {
      const emp = encontrarEmpleada(info.empleada, empleadas);
      if (!emp) {
        await sendWhatsApp(from, `No encontré a "${info.empleada}".\nTus empleadas: ${empleadas.map((e:any)=>e.nombre).join(", ")}`);
        return new Response("OK", { status: 200 });
      }
      const salario = parseFloat(emp.salario) || 0;
      const quincena = salario / 2;
      const css = emp.aplicaCSS !== false ? quincena * 0.0975 : 0;
      const segEdu = emp.aplicaSegEdu !== false ? quincena * 0.0125 : 0;
      const prestsEmp = prestamos.filter((p:any) => p.empleadoId === emp.id && p.saldo > 0);
      const cuotaPrest = prestsEmp.reduce((s:number, p:any) => s + (p.cuotaQuincenal || p.cuotaMensual/2 || 0), 0);
      const neto = quincena - css - segEdu - cuotaPrest;
      let msg = `💰 *Próximo pago de ${emp.nombre}*\n\n`;
      msg += `Salario mensual: $${salario.toFixed(2)}\n`;
      msg += `Quincena bruta: $${quincena.toFixed(2)}\n`;
      if (css > 0) msg += `CSS (9.75%): -$${css.toFixed(2)}\n`;
      if (segEdu > 0) msg += `Seg. Edu (1.25%): -$${segEdu.toFixed(2)}\n`;
      if (cuotaPrest > 0) msg += `Cuota préstamo: -$${cuotaPrest.toFixed(2)}\n`;
      msg += `\n*Neto a pagar: $${neto.toFixed(2)}*`;
      if (prestsEmp.length > 0) msg += `\n\nPréstamo pendiente: $${prestsEmp[0].saldo.toFixed(2)}`;
      await sendWhatsApp(from, msg);
    } else {
      let msg = `💰 *Próxima quincena*\n\n`;
      let total = 0;
      for (const emp of empleadas) {
        const salario = parseFloat(emp.salario) || 0;
        const quincena = salario / 2;
        const css = emp.aplicaCSS !== false ? quincena * 0.0975 : 0;
        const segEdu = emp.aplicaSegEdu !== false ? quincena * 0.0125 : 0;
        const prestsEmp = prestamos.filter((p:any) => p.empleadoId === emp.id && p.saldo > 0);
        const cuotaPrest = prestsEmp.reduce((s:number, p:any) => s + (p.cuotaQuincenal || p.cuotaMensual/2 || 0), 0);
        const neto = quincena - css - segEdu - cuotaPrest;
        total += neto;
        msg += `${emp.nombre}: *$${neto.toFixed(2)}*\n`;
      }
      if (empleadas.length > 1) msg += `\nTotal: *$${total.toFixed(2)}*`;
      await sendWhatsApp(from, msg);
    }

  // VER EMPLEADAS
  } else if (info.accion === "ver_empleadas") {
    if (empleadas.length === 0) {
      await sendWhatsApp(from, "No tienes empleadas registradas. Entra a sincontador.app para agregar una.");
    } else {
      const lista = empleadas.map((e:any) => `👩 *${e.nombre}*\n   $${e.salario}/mes · desde ${e.fechaIngreso||"—"}`).join("\n\n");
      await sendWhatsApp(from, `*Tus empleadas (${empleadas.length})*\n\n${lista}`);
    }

  // VER HISTORIAL
  } else if (info.accion === "ver_historial") {
    const emp = info.empleada ? encontrarEmpleada(info.empleada, empleadas) : null;
    const pagosRecientes = historial.filter((p:any) => !emp || p.empleadoId === emp.id).slice(-5).reverse();
    if (pagosRecientes.length === 0) {
      await sendWhatsApp(from, "No hay pagos registrados aún.");
    } else {
      const lista = pagosRecientes.map((p:any) => {
        const e = empleadas.find((x:any) => x.id === p.empleadoId);
        return `${e?.nombre||"?"} — $${p.netoEmpleado} — Q${p.quincena} ${p.mes} ${p.año}`;
      }).join("\n");
      await sendWhatsApp(from, `*Últimos pagos${emp ? " de "+emp.nombre : ""}*\n\n${lista}\n\nVer más: sincontador.app`);
    }

  // AYUDA
  } else if (info.accion === "ayuda") {
    await sendWhatsApp(from,
      `*SinContador WhatsApp* 🤖\n\n` +
      `💵 *Registrar pago*\n"Pagué a Rosa $340 quincena 1 junio"\n\n` +
      `🏦 *Registrar préstamo*\n"Préstamo a María $200"\n\n` +
      `💰 *Calcular próximo pago*\n"¿Cuánto le pago a Rosa?"\n\n` +
      `📋 *Ver historial*\n"Últimos pagos de Rosa"\n\n` +
      `👩 *Ver empleadas*\n"Mis empleadas"\n\n` +
      `O manda foto del comprobante con el nombre.`
    );
  } else {
    await sendWhatsApp(from, `No entendí. Escribe *ayuda* para ver qué puedo hacer.`);
  }

  return new Response("OK", { status: 200 });
});
