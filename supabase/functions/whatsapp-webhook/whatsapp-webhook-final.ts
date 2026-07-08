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
  await fetch(url, { method:"POST", headers:{"Authorization":`Basic ${auth}`,"Content-Type":"application/x-www-form-urlencoded"}, body: new URLSearchParams({To:to, From:from, Body:body}).toString() });
}

async function getEstado(userId: string) {
  const { data } = await supabase.from("user_data").select("value").eq("user_id",userId).eq("key","wa_estado").maybeSingle();
  return data ? JSON.parse(data.value) : null;
}
async function setEstado(userId: string, estado: any) {
  await supabase.from("user_data").upsert({user_id:userId, key:"wa_estado", value:JSON.stringify(estado)}, {onConflict:"user_id,key"});
}
async function clearEstado(userId: string) {
  await supabase.from("user_data").delete().eq("user_id",userId).eq("key","wa_estado");
}

// ─── FUNCIONES DE CÁLCULO (igual que la app) ─────────────────────────────────
function divisorEmp(emp: any) { return (parseInt(emp?.divisorSalario)||26); }
function valorDiaEmp(emp: any) { return (parseFloat(emp?.salario)||0) / divisorEmp(emp); }

function calcularLiquidacion(emp: any, motivo: string, fechaSalida: string) {
  const salarioMensual = parseFloat(emp.salario) || 0;
  const valorDia = valorDiaEmp(emp);
  const fechaEntrada = emp.fechaIngreso ? new Date(emp.fechaIngreso) : null;
  const fechaSalidaDate = fechaSalida ? new Date(fechaSalida) : new Date();
  let anosCompletos = 0, mesesExtra = 0, diasExtra = 0;
  if (fechaEntrada) {
    anosCompletos = fechaSalidaDate.getFullYear() - fechaEntrada.getFullYear();
    mesesExtra = fechaSalidaDate.getMonth() - fechaEntrada.getMonth();
    diasExtra = fechaSalidaDate.getDate() - fechaEntrada.getDate();
    if (diasExtra < 0) { mesesExtra--; diasExtra += 30; }
    if (mesesExtra < 0) { anosCompletos--; mesesExtra += 12; }
  }
  const totalMeses = anosCompletos * 12 + mesesExtra;
  const mesesDesdeAniversario = mesesExtra + (diasExtra >= 15 ? 1 : 0);
  const vacProporcionales = (salarioMensual / 12) * mesesDesdeAniversario;
  const mesActual = fechaSalidaDate.getMonth();
  const pagosMes = [3, 7, 11];
  let mesUltimoPago = pagosMes.filter((m:number) => m < mesActual).pop() ?? 11;
  let mesesDesdeDecimo = mesActual - mesUltimoPago;
  if (mesesDesdeDecimo <= 0) mesesDesdeDecimo = 4;
  const decimoProporcional = (salarioMensual / 12) * Math.min(mesesDesdeDecimo, 4);
  const diaDelMes = fechaSalidaDate.getDate();
  const diasTrabajadosPeriodo = diaDelMes <= 15 ? diaDelMes : diaDelMes - 15;
  const pagoDiasTrabajados = diasTrabajadosPeriodo * valorDia;
  let indemnizacion = 0, primaAntiguedad = 0, preaviso = 0;
  const salarioSemanal = salarioMensual / 4.3333;
  if (motivo === "despido") {
    let aniosParaCalculo = anosCompletos;
    if (mesesExtra >= 6) aniosParaCalculo++;
    indemnizacion = Math.min(aniosParaCalculo * salarioMensual, 3 * salarioMensual);
    if (totalMeses >= 12) primaAntiguedad = salarioSemanal * 1.92 * (anosCompletos + (mesesExtra >= 6 ? 0.5 : mesesExtra/12));
    preaviso = totalMeses < 24 ? salarioSemanal : salarioSemanal * 2;
  } else if (motivo === "mutuo" || motivo === "justificado") {
    if (totalMeses >= 12) primaAntiguedad = salarioSemanal * 1.92 * (anosCompletos + mesesExtra/12);
  }
  const total = pagoDiasTrabajados + vacProporcionales + decimoProporcional + primaAntiguedad + indemnizacion + preaviso;
  return { anosCompletos, mesesExtra, totalMeses, pagoDiasTrabajados, diasTrabajadosPeriodo, vacProporcionales, mesesDesdeAniversario, decimoProporcional, primaAntiguedad, indemnizacion, preaviso, total, salarioMensual };
}

function calcularDecimo(emp: any, historial: any[]) {
  const pagosEmp = historial.filter((p:any) => p.empleadoId === emp.id);
  const now = new Date();
  const mesActual = now.getMonth();
  const pagosMes = [3, 7, 11];
  let mesUltimoPago = pagosMes.filter((m:number) => m < mesActual).pop() ?? 11;
  let mesesPeriodo = mesActual - mesUltimoPago;
  if (mesesPeriodo <= 0) mesesPeriodo = 4;
  const salario = parseFloat(emp.salario) || 0;
  return (salario / 12) * Math.min(mesesPeriodo, 4);
}

function calcularVacaciones(emp: any) {
  if (!emp.fechaIngreso) return null;
  const hoy = new Date();
  const ingreso = new Date(emp.fechaIngreso);
  let anios = hoy.getFullYear() - ingreso.getFullYear();
  if (hoy < new Date(hoy.getFullYear(), ingreso.getMonth(), ingreso.getDate())) anios--;
  const proxAniv = new Date(ingreso);
  proxAniv.setFullYear(ingreso.getFullYear() + anios + 1);
  const diasRestantes = Math.ceil((proxAniv.getTime() - hoy.getTime()) / 86400000);
  const salario = parseFloat(emp.salario) || 0;
  const pagoVac = (salario / 30) * 30;
  return { proxAniv: proxAniv.toLocaleDateString("es-PA"), diasRestantes, aniosCompletos: anios, pagoEstimado: pagoVac };
}

function encontrarEmpleada(nombre: string, empleadas: any[]) {
  if (!nombre) return null;
  const n = nombre.toLowerCase();
  return empleadas.find((e:any) => e.nombre?.toLowerCase().includes(n) || n.includes(e.nombre?.split(" ")[0]?.toLowerCase()));
}

async function procesarConIA(mensaje: string, empleadas: any[]): Promise<any> {
  const mesActual = meses[new Date().getMonth()];
  const lista = empleadas.map((e:any) => e.nombre).join(", ");
  const prompt = `Eres asistente de SinContador Panama. Empleadas: ${lista||"ninguna"}. Mes: ${mesActual} ${new Date().getFullYear()}.
Mensaje: "${mensaje}"
JSON: {"accion":"registrar_pago|registrar_prestamo|consultar_pago|ver_empleadas|ver_historial|liquidar|ver_decimo|ver_vacaciones|ver_prestamos|ayuda|cancelar|otro","empleada":"nombre o null","monto":numero_o_null,"quincena":1_o_2_o_null,"mes":"mes o null","metodoPago":"Yappy|ACH|Efectivo|Transferencia|null","motivo":"motivo o null","cuotaMensual":numero_o_null}
Solo JSON.`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {method:"POST", headers:{"Authorization":`Bearer ${OPENAI_API_KEY}`,"Content-Type":"application/json"}, body:JSON.stringify({model:"gpt-4o", max_tokens:200, messages:[{role:"user",content:prompt}]})});
  const data = await res.json();
  try { return JSON.parse((data.choices?.[0]?.message?.content||"{}").replace(/```json|```/g,"").trim()); }
  catch { return {accion:"otro"}; }
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("OK", {status:200});
  const formData = await req.formData();
  const from = formData.get("From") as string;
  const body = ((formData.get("Body") as string)||"").trim();
  const mediaUrl = formData.get("MediaUrl0") as string|null;
  const phone = from.replace("whatsapp:+","");

  const { data: profile } = await supabase.from("profiles").select("id").eq("phone",phone).maybeSingle();
  if (!profile) { await sendWhatsApp(from,"Tu numero no esta vinculado en SinContador. Entra a sincontador.app y agrega tu WhatsApp en tu perfil."); return new Response("OK",{status:200}); }

  const userId = profile.id;
  const [empRes,histRes,prestRes] = await Promise.all([
    supabase.from("user_data").select("value").eq("user_id",userId).eq("key","emp_v1").maybeSingle(),
    supabase.from("user_data").select("value").eq("user_id",userId).eq("key","hist_v1").maybeSingle(),
    supabase.from("user_data").select("value").eq("user_id",userId).eq("key","prest_v1").maybeSingle(),
  ]);
  const empleadas = empRes.data ? JSON.parse(empRes.data.value) : [];
  const historial = histRes.data ? JSON.parse(histRes.data.value) : [];
  const prestamos = prestRes.data ? JSON.parse(prestRes.data.value) : [];

  // ── ESTADO ACTIVO ──────────────────────────────────────────────────────────
  const estado = await getEstado(userId);
  if (estado) {
    const bl = body.toLowerCase();
    if (bl==="cancelar"||bl==="salir"||bl==="no") { await clearEstado(userId); await sendWhatsApp(from,"Cancelado."); return new Response("OK",{status:200}); }

    // Flujo préstamo - cuota
    if (estado.paso==="prestamo_cuota") {
      const cuota = parseFloat(body.replace(/[^0-9.]/g,""));
      if (isNaN(cuota)||cuota<=0) { await sendWhatsApp(from,"Escribe solo el monto quincenal. Ej: 50\n\nO escribe cancelar."); return new Response("OK",{status:200}); }
      await setEstado(userId,{...estado, paso:"prestamo_confirmar", cuotaQ:cuota});
      const emp = encontrarEmpleada(estado.empleada,empleadas);
      await sendWhatsApp(from,`Confirma:\n\nEmpleada: ${emp?.nombre}\nMonto: $${estado.monto.toFixed(2)}\nMotivo: ${estado.motivo||"Prestamo"}\nCuota quincenal: $${cuota.toFixed(2)}\nCuota mensual: $${(cuota*2).toFixed(2)}\n\nEscribe si para confirmar o cancelar.`);
      return new Response("OK",{status:200});
    }

    // Flujo préstamo - confirmar
    if (estado.paso==="prestamo_confirmar") {
      if (["si","sí","yes","ok","confirmar"].includes(bl)) {
        const emp = encontrarEmpleada(estado.empleada,empleadas);
        if (!emp) { await clearEstado(userId); return new Response("OK",{status:200}); }
        const prest = {id:Date.now(), empleadoId:emp.id, monto:estado.monto, saldo:estado.monto, cuotaMensual:estado.cuotaQ*2, cuotaQuincenal:estado.cuotaQ, motivo:estado.motivo||"Prestamo", fecha:new Date().toISOString().split("T")[0], registradoPorWhatsApp:true};
        prestamos.push(prest);
        await supabase.from("user_data").upsert({user_id:userId,key:"prest_v1",value:JSON.stringify(prestamos)},{onConflict:"user_id,key"});
        await clearEstado(userId);
        await sendWhatsApp(from,`Prestamo registrado\n\nEmpleada: ${emp.nombre}\nMonto: $${estado.monto.toFixed(2)}\nCuota quincenal: $${estado.cuotaQ.toFixed(2)}\nCuota mensual: $${(estado.cuotaQ*2).toFixed(2)}\n\nVer en sincontador.app`);
      } else { await sendWhatsApp(from,"Escribe si para confirmar o cancelar."); }
      return new Response("OK",{status:200});
    }

    // Flujo pago - método
    if (estado.paso==="pago_metodo") {
      const metodos: any = {"1":"Yappy","2":"ACH","3":"Efectivo","4":"Transferencia","yappy":"Yappy","ach":"ACH","efectivo":"Efectivo","transferencia":"Transferencia"};
      const metodo = metodos[bl]||body;
      const emp = encontrarEmpleada(estado.empleada,empleadas);
      if (!emp) { await clearEstado(userId); return new Response("OK",{status:200}); }
      const now = new Date();
      const pago = {id:Date.now(), empleadoId:emp.id, quincena:estado.quincena||(now.getDate()<=15?1:2), mes:estado.mes||meses[now.getMonth()], año:now.getFullYear(), fecha:now.toISOString().split("T")[0], netoEmpleado:estado.monto, metodoPago:metodo, notas:"Registrado por WhatsApp", fotoComprobante:mediaUrl||null, registradoPorWhatsApp:true};
      historial.push(pago);
      await supabase.from("user_data").upsert({user_id:userId,key:"hist_v1",value:JSON.stringify(historial)},{onConflict:"user_id,key"});
      await clearEstado(userId);
      await sendWhatsApp(from,`Pago registrado\n\nEmpleada: ${emp.nombre}\nMonto: $${estado.monto.toFixed(2)}\nQuincena ${pago.quincena} de ${pago.mes} ${pago.año}\nMetodo: ${metodo}\nFecha: ${pago.fecha}\n\nVer en sincontador.app`);
      return new Response("OK",{status:200});
    }

    // Flujo liquidación - motivo
    if (estado.paso==="liq_motivo") {
      const opts: any = {"1":"renuncia","2":"despido","3":"mutuo","4":"justificado","renuncia":"renuncia","despido":"despido","mutuo":"mutuo","justificado":"justificado"};
      const motivo = opts[bl];
      if (!motivo) { await sendWhatsApp(from,"Escribe 1, 2, 3 o 4:\n\n1 Renuncia voluntaria\n2 Despido sin causa\n3 Mutuo acuerdo\n4 Despido justificado\n\nO escribe cancelar."); return new Response("OK",{status:200}); }
      await setEstado(userId,{...estado, paso:"liq_fecha", motivo});
      const hoy = new Date().toISOString().split("T")[0];
      await sendWhatsApp(from,`Motivo: ${motivo}\n\nCual es la fecha de salida?\nFormato: YYYY-MM-DD\nEjemplo: ${hoy}\n\nO escribe hoy para usar la fecha de hoy.`);
      return new Response("OK",{status:200});
    }

    // Flujo liquidación - fecha
    if (estado.paso==="liq_fecha") {
      let fecha = bl === "hoy" ? new Date().toISOString().split("T")[0] : body.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { await sendWhatsApp(from,"Formato incorrecto. Usa YYYY-MM-DD.\nEjemplo: 2026-06-16\n\nO escribe hoy."); return new Response("OK",{status:200}); }
      const emp = encontrarEmpleada(estado.empleada, empleadas);
      if (!emp) { await clearEstado(userId); return new Response("OK",{status:200}); }
      const liq = calcularLiquidacion(emp, estado.motivo, fecha);
      await setEstado(userId,{...estado, paso:"liq_confirmar", fecha, liq});
      const motivoLabel: any = {renuncia:"Renuncia voluntaria", despido:"Despido sin causa", mutuo:"Mutuo acuerdo", justificado:"Despido justificado"};
      let msg = `Liquidacion de ${emp.nombre}\n`;
      msg += `====================\n\n`;
      msg += `Motivo: ${motivoLabel[estado.motivo]}\n`;
      msg += `Antiguedad: ${liq.anosCompletos} anos, ${liq.mesesExtra} meses\n\n`;
      msg += `Desglose:\n`;
      msg += `Dias trabajados (${liq.diasTrabajadosPeriodo} dias): $${liq.pagoDiasTrabajados.toFixed(2)}\n`;
      msg += `Vacaciones prop. (${liq.mesesDesdeAniversario} meses): $${liq.vacProporcionales.toFixed(2)}\n`;
      msg += `Decimo prop.: $${liq.decimoProporcional.toFixed(2)}\n`;
      if (liq.primaAntiguedad > 0) msg += `Prima antiguedad: $${liq.primaAntiguedad.toFixed(2)}\n`;
      if (liq.indemnizacion > 0) msg += `Indemnizacion: $${liq.indemnizacion.toFixed(2)}\n`;
      if (liq.preaviso > 0) msg += `Preaviso: $${liq.preaviso.toFixed(2)}\n`;
      msg += `\nTOTAL: $${liq.total.toFixed(2)}\n\n`;
      msg += `Escribe si para confirmar y registrar, o cancelar.`;
      await sendWhatsApp(from, msg);
      return new Response("OK",{status:200});
    }

    // Flujo liquidación - confirmar
    if (estado.paso==="liq_confirmar") {
      if (["si","sí","yes","ok","confirmar"].includes(bl)) {
        const emp = encontrarEmpleada(estado.empleada, empleadas);
        if (!emp) { await clearEstado(userId); return new Response("OK",{status:200}); }
        // Marcar empleada como inactiva
        const empActualizado = {...emp, activa:false, fechaSalida:estado.fecha, motivoSalida:estado.motivo};
        const nuevasEmpleadas = empleadas.map((e:any) => e.id === emp.id ? empActualizado : e);
        await supabase.from("user_data").upsert({user_id:userId,key:"emp_v1",value:JSON.stringify(nuevasEmpleadas)},{onConflict:"user_id,key"});
        await clearEstado(userId);
        await sendWhatsApp(from,`Liquidacion confirmada para ${emp.nombre}\nTotal: $${estado.liq.total.toFixed(2)}\n\nVer detalles completos en sincontador.app`);
      } else { await sendWhatsApp(from,"Escribe si para confirmar o cancelar."); }
      return new Response("OK",{status:200});
    }
  }

  // ── NUEVO MENSAJE ──────────────────────────────────────────────────────────
  const info = await procesarConIA(body, empleadas);

  // REGISTRAR PAGO
  if (info.accion==="registrar_pago"&&info.empleada&&info.monto) {
    const emp = encontrarEmpleada(info.empleada,empleadas);
    if (!emp) { await sendWhatsApp(from,`No encontre a "${info.empleada}". Tus empleadas: ${empleadas.map((e:any)=>e.nombre).join(", ")||"ninguna"}`); return new Response("OK",{status:200}); }
    if (!info.metodoPago) {
      await setEstado(userId,{paso:"pago_metodo", empleada:info.empleada, monto:info.monto, quincena:info.quincena, mes:info.mes});
      await sendWhatsApp(from,`Como pagaste a ${emp.nombre}?\n\n1 Yappy\n2 ACH\n3 Efectivo\n4 Transferencia`);
    } else {
      const now = new Date();
      const pago = {id:Date.now(), empleadoId:emp.id, quincena:info.quincena||(now.getDate()<=15?1:2), mes:info.mes||meses[now.getMonth()], año:now.getFullYear(), fecha:now.toISOString().split("T")[0], netoEmpleado:info.monto, metodoPago:info.metodoPago, notas:"Registrado por WhatsApp", fotoComprobante:mediaUrl||null, registradoPorWhatsApp:true};
      historial.push(pago);
      await supabase.from("user_data").upsert({user_id:userId,key:"hist_v1",value:JSON.stringify(historial)},{onConflict:"user_id,key"});
      await sendWhatsApp(from,`Pago registrado\n\nEmpleada: ${emp.nombre}\nMonto: $${info.monto.toFixed(2)}\nQuincena ${pago.quincena} de ${pago.mes} ${pago.año}\nMetodo: ${info.metodoPago}\n\nVer en sincontador.app`);
    }

  // REGISTRAR PRÉSTAMO
  } else if (info.accion==="registrar_prestamo"&&info.empleada&&info.monto) {
    const emp = encontrarEmpleada(info.empleada,empleadas);
    if (!emp) { await sendWhatsApp(from,`No encontre a "${info.empleada}".`); return new Response("OK",{status:200}); }
    await setEstado(userId,{paso:"prestamo_cuota", empleada:info.empleada, monto:info.monto, motivo:info.motivo});
    await sendWhatsApp(from,`Nuevo prestamo para ${emp.nombre}\nMonto: $${info.monto.toFixed(2)}\n\nCuanto le vas a descontar por quincena?\nEscribe solo el monto. Ej: 50\n\nO escribe cancelar.`);

  // LIQUIDAR
  } else if (info.accion==="liquidar"&&info.empleada) {
    const emp = encontrarEmpleada(info.empleada,empleadas);
    if (!emp) { await sendWhatsApp(from,`No encontre a "${info.empleada}". Tus empleadas: ${empleadas.map((e:any)=>e.nombre).join(", ")}`); return new Response("OK",{status:200}); }
    await setEstado(userId,{paso:"liq_motivo", empleada:info.empleada});
    await sendWhatsApp(from,`Liquidacion de ${emp.nombre}\n\nCual es el motivo?\n\n1 Renuncia voluntaria\n2 Despido sin causa\n3 Mutuo acuerdo\n4 Despido justificado\n\nEscribe el numero o cancelar.`);

  // CONSULTAR PAGO
  } else if (info.accion==="consultar_pago") {
    const emp = info.empleada ? encontrarEmpleada(info.empleada,empleadas) : null;
    if (emp) {
      const salario=parseFloat(emp.salario)||0; const quincena=salario/2;
      const css=emp.aplicaCSS!==false?quincena*0.0975:0; const segEdu=emp.aplicaSegEdu!==false?quincena*0.0125:0;
      const prestsEmp=prestamos.filter((p:any)=>p.empleadoId===emp.id&&p.saldo>0);
      const cuotaP=prestsEmp.reduce((s:number,p:any)=>s+(p.cuotaQuincenal||p.cuotaMensual/2||0),0);
      const neto=quincena-css-segEdu-cuotaP;
      let msg=`Proximo pago de ${emp.nombre}\n\nSalario: $${salario.toFixed(2)}/mes\nBruta: $${quincena.toFixed(2)}\n`;
      if (css>0) msg+=`CSS: -$${css.toFixed(2)}\n`;
      if (segEdu>0) msg+=`Seg.Edu: -$${segEdu.toFixed(2)}\n`;
      if (cuotaP>0) msg+=`Prestamo: -$${cuotaP.toFixed(2)}\n`;
      msg+=`\nNeto a pagar: $${neto.toFixed(2)}`;
      if (prestsEmp.length>0) msg+=`\nPrestamo pendiente: $${prestsEmp[0].saldo.toFixed(2)}`;
      await sendWhatsApp(from,msg);
    } else {
      let msg=`Proxima quincena\n\n`; let total=0;
      for (const e of empleadas) {
        const s=parseFloat(e.salario)||0; const q=s/2;
        const c=e.aplicaCSS!==false?q*0.0975:0; const se=e.aplicaSegEdu!==false?q*0.0125:0;
        const cp=prestamos.filter((p:any)=>p.empleadoId===e.id&&p.saldo>0).reduce((sum:number,p:any)=>sum+(p.cuotaQuincenal||p.cuotaMensual/2||0),0);
        const n=q-c-se-cp; total+=n;
        msg+=`${e.nombre}: $${n.toFixed(2)}\n`;
      }
      if (empleadas.length>1) msg+=`\nTotal: $${total.toFixed(2)}`;
      await sendWhatsApp(from,msg);
    }

  // VER DÉCIMO
  } else if (info.accion==="ver_decimo") {
    const emp = info.empleada ? encontrarEmpleada(info.empleada,empleadas) : null;
    if (emp) {
      const decimo = calcularDecimo(emp,historial);
      await sendWhatsApp(from,`Decimo de ${emp.nombre}\n\nAcumulado este periodo: $${decimo.toFixed(2)}\nSalario mensual: $${parseFloat(emp.salario).toFixed(2)}\n\nEl decimo se paga en abril, agosto y diciembre.\n\nVer mas: sincontador.app`);
    } else {
      let msg=`Decimo acumulado\n\n`;
      for (const e of empleadas) {
        const d=calcularDecimo(e,historial);
        msg+=`${e.nombre}: $${d.toFixed(2)}\n`;
      }
      await sendWhatsApp(from,msg);
    }

  // VER VACACIONES
  } else if (info.accion==="ver_vacaciones") {
    const emp = info.empleada ? encontrarEmpleada(info.empleada,empleadas) : null;
    if (emp) {
      const vac = calcularVacaciones(emp);
      if (!vac) { await sendWhatsApp(from,`${emp.nombre} no tiene fecha de ingreso registrada.`); return new Response("OK",{status:200}); }
      await sendWhatsApp(from,`Vacaciones de ${emp.nombre}\n\nProximas vacaciones: ${vac.proxAniv}\nEn ${vac.diasRestantes} dias\nAnos completos: ${vac.aniosCompletos}\nPago estimado: $${vac.pagoEstimado.toFixed(2)}\n\nVer mas: sincontador.app`);
    } else {
      let msg=`Proximas vacaciones\n\n`;
      for (const e of empleadas) {
        const v=calcularVacaciones(e);
        if (v) msg+=`${e.nombre}: ${v.proxAniv} (en ${v.diasRestantes} dias)\n`;
      }
      await sendWhatsApp(from,msg||"No hay empleadas con fecha de ingreso.");
    }

  // VER PRÉSTAMOS
  } else if (info.accion==="ver_prestamos") {
    const emp = info.empleada ? encontrarEmpleada(info.empleada,empleadas) : null;
    const prestsActivos = prestamos.filter((p:any)=>p.saldo>0&&(!emp||p.empleadoId===emp.id));
    if (prestsActivos.length===0) {
      await sendWhatsApp(from,emp?`${emp.nombre} no tiene prestamos activos.`:"No hay prestamos activos.");
    } else {
      let msg=`Prestamos activos\n\n`;
      for (const p of prestsActivos) {
        const e=empleadas.find((x:any)=>x.id===p.empleadoId);
        msg+=`${e?.nombre||"?"}: $${p.saldo.toFixed(2)} pendiente\nCuota quincenal: $${(p.cuotaQuincenal||p.cuotaMensual/2||0).toFixed(2)}\nMotivo: ${p.motivo||"Prestamo"}\n\n`;
      }
      await sendWhatsApp(from,msg.trim());
    }

  // VER HISTORIAL
  } else if (info.accion==="ver_historial") {
    const emp = info.empleada ? encontrarEmpleada(info.empleada,empleadas) : null;
    if (emp) {
      const pagosEmp = historial.filter((p:any)=>p.empleadoId===emp.id);
      const pagosRecientes = pagosEmp.slice(-8).reverse();
      const totalPagado = pagosEmp.reduce((s:number,p:any)=>s+(parseFloat(p.netoEmpleado)||0),0);
      const prestsEmp = prestamos.filter((p:any)=>p.empleadoId===emp.id);
      const salario=parseFloat(emp.salario)||0; const quincena=salario/2;
      const css=emp.aplicaCSS!==false?quincena*0.0975:0; const segEdu=emp.aplicaSegEdu!==false?quincena*0.0125:0;
      const cuotaP=prestsEmp.filter((p:any)=>p.saldo>0).reduce((s:number,p:any)=>s+(p.cuotaQuincenal||p.cuotaMensual/2||0),0);
      const neto=quincena-css-segEdu-cuotaP;
      let msg=`Reporte de ${emp.nombre}\n================\n\n`;
      msg+=`Salario: $${salario.toFixed(2)}/mes\n`;
      if (emp.fechaIngreso) msg+=`Ingreso: ${emp.fechaIngreso}\n`;
      msg+=`\nProxima quincena\n`;
      msg+=`Bruta: $${quincena.toFixed(2)}\n`;
      if (css>0) msg+=`CSS: -$${css.toFixed(2)}\n`;
      if (segEdu>0) msg+=`Seg.Edu: -$${segEdu.toFixed(2)}\n`;
      if (cuotaP>0) msg+=`Prestamo: -$${cuotaP.toFixed(2)}\n`;
      msg+=`Neto: $${neto.toFixed(2)}\n`;
      const saldoPrest=prestsEmp.filter((p:any)=>p.saldo>0).reduce((s:number,p:any)=>s+p.saldo,0);
      if (saldoPrest>0) msg+=`\nPrestamo pendiente: $${saldoPrest.toFixed(2)}\n`;
      if (pagosRecientes.length>0) {
        msg+=`\nUltimos pagos\n`;
        pagosRecientes.forEach((p:any)=>{msg+=`Q${p.quincena} ${p.mes} ${p.año}: $${parseFloat(p.netoEmpleado).toFixed(2)} (${p.metodoPago||"—"})\n`;});
        msg+=`\nTotal pagado: $${totalPagado.toFixed(2)}`;
      } else { msg+=`\nSin pagos registrados.`; }
      msg+=`\n\nsincontador.app`;
      await sendWhatsApp(from,msg);
    } else {
      const pagosRecientes = historial.slice(-8).reverse();
      if (pagosRecientes.length===0) { await sendWhatsApp(from,"No hay pagos registrados."); }
      else {
        const lista=pagosRecientes.map((p:any)=>{const e=empleadas.find((x:any)=>x.id===p.empleadoId); return `${e?.nombre||"?"} - $${parseFloat(p.netoEmpleado).toFixed(2)} - Q${p.quincena} ${p.mes} ${p.año}`;}).join("\n");
        await sendWhatsApp(from,`Ultimos pagos\n\n${lista}\n\nsincontador.app`);
      }
    }

  // VER EMPLEADAS
  } else if (info.accion==="ver_empleadas") {
    if (empleadas.length===0) { await sendWhatsApp(from,"No tienes empleadas registradas."); }
    else {
      const lista=empleadas.map((e:any)=>`${e.nombre} - $${e.salario}/mes${e.fechaIngreso?" · desde "+e.fechaIngreso:""}`).join("\n");
      await sendWhatsApp(from,`Tus empleadas (${empleadas.length})\n\n${lista}`);
    }

  // AYUDA
  } else if (info.accion==="ayuda") {
    await sendWhatsApp(from,`SinContador WhatsApp\n\nPagar: "Pague a Rosa $340 quincena 1 junio por Yappy"\nPrestamo: "Prestamo a Maria $200"\nLiquidar: "Liquidar a Rosa"\nCalcular: "Cuanto le pago a Rosa"\nDecimo: "Decimo de Rosa"\nVacaciones: "Vacaciones de Rosa"\nPrestamos: "Prestamos de Rosa"\nHistorial: "Historial de Rosa"\nEmpleadas: "Mis empleadas"\n\nO manda foto del comprobante con el nombre.`);
  } else {
    await sendWhatsApp(from,"No entendi. Escribe ayuda para ver que puedo hacer.");
  }
  return new Response("OK",{status:200});
});
