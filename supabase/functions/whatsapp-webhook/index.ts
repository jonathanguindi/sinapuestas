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
  await fetch(url, { method:"POST", headers:{"Authorization":`Basic ${auth}`,"Content-Type":"application/x-www-form-urlencoded"}, body: new URLSearchParams({To:to,From:from,Body:body}).toString() });
}
async function getEstado(uid: string) {
  const {data} = await supabase.from("user_data").select("value").eq("user_id",uid).eq("key","wa_estado").maybeSingle();
  return data ? JSON.parse(data.value) : null;
}
async function setEstado(uid: string, e: any) {
  await supabase.from("user_data").upsert({user_id:uid,key:"wa_estado",value:JSON.stringify(e)},{onConflict:"user_id,key"});
}
async function clearEstado(uid: string) {
  await supabase.from("user_data").delete().eq("user_id",uid).eq("key","wa_estado");
}
function divisor(emp: any) { return parseInt(emp?.divisorSalario)||26; }
function calcularPagoCompleto(emp: any, prest: any[], extras: any={}) {
  const s=parseFloat(emp.salario)||0, q=s/2;
  const css=emp.aplicaCSS!==false?q*0.0975:0, segEdu=emp.aplicaSegEdu!==false?q*0.0125:0;
  const vh=s/(divisor(emp)*8);
  const horasEx=(parseFloat(extras.horasExtra)||0)*vh*1.25;
  const horasExNoc=(parseFloat(extras.horasNocturnas)||0)*vh*1.50;
  const bonos=parseFloat(extras.bonos)||0;
  const ausencias=(parseFloat(extras.ausencias)||0)*(s/divisor(emp));
  const otrasDeduc=parseFloat(extras.otrasDeduc)||0;
  const prestsEmp=prest.filter((p:any)=>p.empleadoId===emp.id&&p.saldo>0);
  const descPrest=prestsEmp.reduce((sum:number,p:any)=>sum+(p.cuotaQuincenal||p.cuotaMensual/2||0),0);
  const neto=q+horasEx+horasExNoc+bonos-css-segEdu-ausencias-otrasDeduc-descPrest;
  return {q,css,segEdu,horasEx,horasExNoc,bonos,ausencias,otrasDeduc,descPrest,neto,prestsEmp};
}
function calcularLiquidacion(emp: any, motivo: string, fechaSalida: string) {
  const s=parseFloat(emp.salario)||0, vd=s/divisor(emp);
  const ent=emp.fechaIngreso?new Date(emp.fechaIngreso):null, sal=new Date(fechaSalida);
  let a=0,m=0,d=0;
  if(ent){a=sal.getFullYear()-ent.getFullYear();m=sal.getMonth()-ent.getMonth();d=sal.getDate()-ent.getDate();if(d<0){m--;d+=30;}if(m<0){a--;m+=12;}}
  const tm=a*12+m, maniv=m+(d>=15?1:0), vacP=(s/12)*maniv;
  const mes=sal.getMonth(), pm=[3,7,11]; let mup=pm.filter((x:number)=>x<mes).pop()??11;
  let mdd=mes-mup; if(mdd<=0) mdd=4;
  const decimP=(s/12)*Math.min(mdd,4), dm=sal.getDate(), diasT=dm<=15?dm:dm-15, pagoDias=diasT*vd;
  let ind=0,prim=0,prev=0; const sem=s/4.3333;
  if(motivo==="despido"){let ap=a;if(m>=6)ap++;ind=Math.min(ap*s,3*s);if(tm>=12)prim=sem*1.92*(a+(m>=6?0.5:m/12));prev=tm<24?sem:sem*2;}
  else if(motivo==="mutuo"||motivo==="justificado"){if(tm>=12)prim=sem*1.92*(a+m/12);}
  return {a,m,tm,diasT,pagoDias,vacP,maniv,decimP,prim,ind,prev,total:pagoDias+vacP+decimP+prim+ind+prev,s};
}
function calcularDecimo(emp: any) {
  const now=new Date(), mes=now.getMonth(), pm=[3,7,11];
  let mup=pm.filter((x:number)=>x<mes).pop()??11; let mdd=mes-mup; if(mdd<=0) mdd=4;
  return ((parseFloat(emp.salario)||0)/12)*Math.min(mdd,4);
}
function calcularVacaciones(emp: any) {
  if(!emp.fechaIngreso) return null;
  const hoy=new Date(), ing=new Date(emp.fechaIngreso);
  let a=hoy.getFullYear()-ing.getFullYear();
  if(hoy<new Date(hoy.getFullYear(),ing.getMonth(),ing.getDate()))a--;
  const prox=new Date(ing); prox.setFullYear(ing.getFullYear()+a+1);
  return {prox:prox.toLocaleDateString("es-PA"),dias:Math.ceil((prox.getTime()-hoy.getTime())/86400000),a,pago:parseFloat(emp.salario)||0};
}
function encontrar(nombre: string, emps: any[]) {
  if(!nombre) return null; const n=nombre.toLowerCase();
  return emps.find((e:any)=>e.nombre?.toLowerCase().includes(n)||n.includes(e.nombre?.split(" ")[0]?.toLowerCase()));
}
async function ia(msg: string, emps: any[]): Promise<any> {
  const prompt=`Eres asistente de SinContador Panama. Empleadas: ${emps.map((e:any)=>e.nombre).join(", ")||"ninguna"}. Mes: ${meses[new Date().getMonth()]} ${new Date().getFullYear()}. Mensaje: "${msg}". JSON: {"accion":"registrar_pago|registrar_prestamo|consultar_pago|ver_empleadas|ver_historial|liquidar|ver_decimo|ver_vacaciones|ver_prestamos|registrar_aumento|registrar_vacaciones_pagadas|dashboard|archivo|ayuda|cancelar|otro","empleada":"nombre o null","monto":numero_o_null,"quincena":1_o_2_o_null,"mes":"mes o null","metodoPago":"Yappy|ACH|Efectivo|Transferencia|null","motivo":"texto o null","cuotaMensual":numero_o_null,"salarioNuevo":numero_o_null,"horasExtra":numero_o_null,"bonos":numero_o_null,"ausencias":numero_o_null,"otrasDeduc":numero_o_null}. Solo JSON.`;
  const res=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o",max_tokens:300,messages:[{role:"user",content:prompt}]})});
  const data=await res.json();
  try{return JSON.parse((data.choices?.[0]?.message?.content||"{}").replace(/```json|```/g,"").trim());}catch{return {accion:"otro"};}
}
serve(async (req) => {
  if(req.method!=="POST") return new Response("OK",{status:200});
  const fd=await req.formData();
  const from=fd.get("From") as string, body=((fd.get("Body") as string)||"").trim(), media=fd.get("MediaUrl0") as string|null;
  const phone=from.replace("whatsapp:+","");
  const {data:prof}=await supabase.from("profiles").select("id").eq("phone",phone).maybeSingle();
  if(!prof){await sendWhatsApp(from,"Tu numero no esta vinculado. Entra a sincontador.app y agrega tu WhatsApp.");return new Response("OK",{status:200});}
  const uid=prof.id;
  const [er,hr,pr]=await Promise.all([supabase.from("user_data").select("value").eq("user_id",uid).eq("key","emp_v1").maybeSingle(),supabase.from("user_data").select("value").eq("user_id",uid).eq("key","hist_v1").maybeSingle(),supabase.from("user_data").select("value").eq("user_id",uid).eq("key","prest_v1").maybeSingle()]);
  const emps=er.data?JSON.parse(er.data.value):[], hist=hr.data?JSON.parse(hr.data.value):[], prest=pr.data?JSON.parse(pr.data.value):[];
  const save=async(k:string,v:any)=>supabase.from("user_data").upsert({user_id:uid,key:k,value:JSON.stringify(v)},{onConflict:"user_id,key"});
  const est=await getEstado(uid), bl=body.toLowerCase();
  if(est){
    if(["cancelar","salir","no"].includes(bl)){await clearEstado(uid);await sendWhatsApp(from,"Cancelado.");return new Response("OK",{status:200});}
    if(est.paso==="prestamo_cuota"){const c=parseFloat(body.replace(/[^0-9.]/g,""));if(isNaN(c)||c<=0){await sendWhatsApp(from,"Escribe el monto quincenal. Ej: 50\nO cancelar.");return new Response("OK",{status:200});}await setEstado(uid,{...est,paso:"prestamo_confirmar",cuotaQ:c});const e=encontrar(est.empleada,emps);await sendWhatsApp(from,`Confirma:\n\n${e?.nombre}\nMonto: $${est.monto.toFixed(2)}\nCuota quincenal: $${c.toFixed(2)}\nCuota mensual: $${(c*2).toFixed(2)}\n\nEscribe si o cancelar.`);return new Response("OK",{status:200});}
    if(est.paso==="prestamo_confirmar"){if(["si","sí","yes","ok","confirmar"].includes(bl)){const e=encontrar(est.empleada,emps);if(!e){await clearEstado(uid);return new Response("OK",{status:200});}prest.push({id:Date.now(),empleadoId:e.id,monto:est.monto,saldo:est.monto,cuotaMensual:est.cuotaQ*2,cuotaQuincenal:est.cuotaQ,motivo:est.motivo||"Prestamo",fecha:new Date().toISOString().split("T")[0],registradoPorWhatsApp:true});await save("prest_v1",prest);await clearEstado(uid);await sendWhatsApp(from,`Prestamo registrado\n\n${e.nombre}\nMonto: $${est.monto.toFixed(2)}\nCuota quincenal: $${est.cuotaQ.toFixed(2)}\n\nsincontador.app`);}else{await sendWhatsApp(from,"Escribe si o cancelar.");}return new Response("OK",{status:200});}
    if(est.paso==="pago_metodo"){const mt:any={"1":"Yappy","2":"ACH","3":"Efectivo","4":"Transferencia","yappy":"Yappy","ach":"ACH","efectivo":"Efectivo","transferencia":"Transferencia"};const m=mt[bl]||body;const e=encontrar(est.empleada,emps);if(!e){await clearEstado(uid);return new Response("OK",{status:200});}const now=new Date();const pago={id:Date.now(),empleadoId:e.id,quincena:est.quincena||(now.getDate()<=15?1:2),mes:est.mes||meses[now.getMonth()],año:now.getFullYear(),fecha:now.toISOString().split("T")[0],netoEmpleado:est.monto,metodoPago:m,notas:"WhatsApp",fotoComprobante:media||null,registradoPorWhatsApp:true};hist.push(pago);await save("hist_v1",hist);await clearEstado(uid);await sendWhatsApp(from,`Pago registrado\n\n${e.nombre}\n$${est.monto.toFixed(2)}\nQ${pago.quincena} ${pago.mes} ${pago.año}\n${m}\n\nsincontador.app`);return new Response("OK",{status:200});}
    if(est.paso==="pago_extras_confirmar"){if(["si","sí","yes","ok","confirmar"].includes(bl)){await setEstado(uid,{...est,paso:"pago_metodo"});await sendWhatsApp(from,"Como pagaste?\n\n1 Yappy\n2 ACH\n3 Efectivo\n4 Transferencia");}else{await sendWhatsApp(from,"Escribe si o cancelar.");}return new Response("OK",{status:200});}
    if(est.paso==="liq_motivo"){const opts:any={"1":"renuncia","2":"despido","3":"mutuo","4":"justificado","renuncia":"renuncia","despido":"despido","mutuo":"mutuo","justificado":"justificado"};const mot=opts[bl];if(!mot){await sendWhatsApp(from,"Escribe:\n1 Renuncia\n2 Despido sin causa\n3 Mutuo acuerdo\n4 Despido justificado\n\nO cancelar.");return new Response("OK",{status:200});}await setEstado(uid,{...est,paso:"liq_fecha",motivo:mot});await sendWhatsApp(from,`Motivo: ${mot}\n\nFecha de salida? (YYYY-MM-DD)\nEj: ${new Date().toISOString().split("T")[0]}\nO escribe hoy.`);return new Response("OK",{status:200});}
    if(est.paso==="liq_fecha"){const fecha=bl==="hoy"?new Date().toISOString().split("T")[0]:body.trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)){await sendWhatsApp(from,"Formato: YYYY-MM-DD\nEj: 2026-06-16\nO escribe hoy.");return new Response("OK",{status:200});}const e=encontrar(est.empleada,emps);if(!e){await clearEstado(uid);return new Response("OK",{status:200});}const liq=calcularLiquidacion(e,est.motivo,fecha);await setEstado(uid,{...est,paso:"liq_confirmar",fecha,liq});const ml:any={renuncia:"Renuncia voluntaria",despido:"Despido sin causa",mutuo:"Mutuo acuerdo",justificado:"Despido justificado"};let msg=`Liquidacion de ${e.nombre}\n====================\n\nMotivo: ${ml[est.motivo]}\nAntiguedad: ${liq.a} anos, ${liq.m} meses\n\nDias trabajados (${liq.diasT}): $${liq.pagoDias.toFixed(2)}\nVacaciones prop.: $${liq.vacP.toFixed(2)}\nDecimo prop.: $${liq.decimP.toFixed(2)}\n`;if(liq.prim>0)msg+=`Prima: $${liq.prim.toFixed(2)}\n`;if(liq.ind>0)msg+=`Indemnizacion: $${liq.ind.toFixed(2)}\n`;if(liq.prev>0)msg+=`Preaviso: $${liq.prev.toFixed(2)}\n`;msg+=`\nTOTAL: $${liq.total.toFixed(2)}\n\nEscribe si o cancelar.`;await sendWhatsApp(from,msg);return new Response("OK",{status:200});}
    if(est.paso==="liq_confirmar"){if(["si","sí","yes","ok","confirmar"].includes(bl)){const e=encontrar(est.empleada,emps);if(!e){await clearEstado(uid);return new Response("OK",{status:200});}await save("emp_v1",emps.map((x:any)=>x.id===e.id?{...x,activa:false,fechaSalida:est.fecha,motivoSalida:est.motivo}:x));await clearEstado(uid);await sendWhatsApp(from,`Liquidacion confirmada\n\n${e.nombre}\nTotal: $${est.liq.total.toFixed(2)}\n\nsincontador.app`);}else{await sendWhatsApp(from,"Escribe si o cancelar.");}return new Response("OK",{status:200});}
    if(est.paso==="aumento_confirmar"){if(["si","sí","yes","ok","confirmar"].includes(bl)){const e=encontrar(est.empleada,emps);if(!e){await clearEstado(uid);return new Response("OK",{status:200});}const aum={id:Date.now(),fecha:new Date().toISOString().split("T")[0],salarioAnterior:est.salAnterior,salarioNuevo:est.salNuevo,motivo:"WhatsApp"};await save("emp_v1",emps.map((x:any)=>x.id===e.id?{...x,salario:String(est.salNuevo),aumentos:[...(x.aumentos||[]),aum]}:x));await clearEstado(uid);await sendWhatsApp(from,`Aumento registrado\n\n${e.nombre}\nAnterior: $${est.salAnterior.toFixed(2)}\nNuevo: $${est.salNuevo.toFixed(2)}\n\nsincontador.app`);}else{await sendWhatsApp(from,"Escribe si o cancelar.");}return new Response("OK",{status:200});}
    if(est.paso==="vac_confirmar"){if(["si","sí","yes","ok","confirmar"].includes(bl)){const e=encontrar(est.empleada,emps);if(!e){await clearEstado(uid);return new Response("OK",{status:200});}const entry={id:Date.now(),fecha:new Date().toISOString().split("T")[0],monto:est.monto,periodo:"",notas:"WhatsApp"};await save("emp_v1",emps.map((x:any)=>x.id===e.id?{...x,vacacionesPagadas:[...(x.vacacionesPagadas||[]),entry]}:x));await clearEstado(uid);await sendWhatsApp(from,`Vacaciones pagadas registradas\n\n${e.nombre}\nMonto: $${est.monto.toFixed(2)}\n\nsincontador.app`);}else{await sendWhatsApp(from,"Escribe si o cancelar.");}return new Response("OK",{status:200});}
  }
  const info=await ia(body,emps);
  if(info.accion==="registrar_pago"&&info.empleada&&info.monto){
    const e=encontrar(info.empleada,emps);
    if(!e){await sendWhatsApp(from,`No encontre a "${info.empleada}".\nTus empleadas: ${emps.map((x:any)=>x.nombre).join(", ")||"ninguna"}`);return new Response("OK",{status:200});}
    const tieneExtras=info.horasExtra||info.bonos||info.ausencias||info.otrasDeduc;
    if(tieneExtras){const extras={horasExtra:info.horasExtra,bonos:info.bonos,ausencias:info.ausencias,otrasDeduc:info.otrasDeduc};const c=calcularPagoCompleto(e,prest,extras);await setEstado(uid,{paso:"pago_extras_confirmar",empleada:info.empleada,monto:c.neto,quincena:info.quincena,mes:info.mes,extras});let msg=`Pago de ${e.nombre}\n\nBruta: $${c.q.toFixed(2)}\n`;if(c.horasEx>0)msg+=`Horas extra: +$${c.horasEx.toFixed(2)}\n`;if(c.bonos>0)msg+=`Bonos: +$${c.bonos.toFixed(2)}\n`;if(c.css>0)msg+=`CSS: -$${c.css.toFixed(2)}\n`;if(c.segEdu>0)msg+=`Seg.Edu: -$${c.segEdu.toFixed(2)}\n`;if(c.ausencias>0)msg+=`Ausencias: -$${c.ausencias.toFixed(2)}\n`;if(c.descPrest>0)msg+=`Prestamo: -$${c.descPrest.toFixed(2)}\n`;msg+=`\nNeto: $${c.neto.toFixed(2)}\n\nEscribe si o cancelar.`;await sendWhatsApp(from,msg);}
    else if(!info.metodoPago){await setEstado(uid,{paso:"pago_metodo",empleada:info.empleada,monto:info.monto,quincena:info.quincena,mes:info.mes});await sendWhatsApp(from,`Como pagaste a ${e.nombre}?\n\n1 Yappy\n2 ACH\n3 Efectivo\n4 Transferencia`);}
    else{const now=new Date();const pago={id:Date.now(),empleadoId:e.id,quincena:info.quincena||(now.getDate()<=15?1:2),mes:info.mes||meses[now.getMonth()],año:now.getFullYear(),fecha:now.toISOString().split("T")[0],netoEmpleado:info.monto,metodoPago:info.metodoPago,notas:"WhatsApp",fotoComprobante:media||null,registradoPorWhatsApp:true};hist.push(pago);await save("hist_v1",hist);await sendWhatsApp(from,`Pago registrado\n\n${e.nombre}\n$${info.monto.toFixed(2)}\nQ${pago.quincena} ${pago.mes} ${pago.año}\n${info.metodoPago}\n\nsincontador.app`);}
  } else if(info.accion==="registrar_prestamo"&&info.empleada&&info.monto){
    const e=encontrar(info.empleada,emps);if(!e){await sendWhatsApp(from,`No encontre a "${info.empleada}".`);return new Response("OK",{status:200});}
    await setEstado(uid,{paso:"prestamo_cuota",empleada:info.empleada,monto:info.monto,motivo:info.motivo});await sendWhatsApp(from,`Prestamo para ${e.nombre}\nMonto: $${info.monto.toFixed(2)}\n\nCuanto le descuentas por quincena? Ej: 50\n\nO cancelar.`);
  } else if(info.accion==="registrar_aumento"&&info.empleada&&info.salarioNuevo){
    const e=encontrar(info.empleada,emps);if(!e){await sendWhatsApp(from,`No encontre a "${info.empleada}".`);return new Response("OK",{status:200});}
    const salAnt=parseFloat(e.salario)||0;await setEstado(uid,{paso:"aumento_confirmar",empleada:info.empleada,salAnterior:salAnt,salNuevo:info.salarioNuevo});
    await sendWhatsApp(from,`Confirma el aumento:\n\n${e.nombre}\nAnterior: $${salAnt.toFixed(2)}\nNuevo: $${info.salarioNuevo.toFixed(2)}\n+$${(info.salarioNuevo-salAnt).toFixed(2)}/mes\n\nEscribe si o cancelar.`);
  } else if(info.accion==="registrar_vacaciones_pagadas"&&info.empleada&&info.monto){
    const e=encontrar(info.empleada,emps);if(!e){await sendWhatsApp(from,`No encontre a "${info.empleada}".`);return new Response("OK",{status:200});}
    await setEstado(uid,{paso:"vac_confirmar",empleada:info.empleada,monto:info.monto});await sendWhatsApp(from,`Confirma vacaciones pagadas:\n\n${e.nombre}\nMonto: $${info.monto.toFixed(2)}\n\nEscribe si o cancelar.`);
  } else if(info.accion==="liquidar"&&info.empleada){
    const e=encontrar(info.empleada,emps);if(!e){await sendWhatsApp(from,`No encontre a "${info.empleada}".\nTus empleadas: ${emps.map((x:any)=>x.nombre).join(", ")}`);return new Response("OK",{status:200});}
    await setEstado(uid,{paso:"liq_motivo",empleada:info.empleada});await sendWhatsApp(from,`Liquidacion de ${e.nombre}\n\n1 Renuncia voluntaria\n2 Despido sin causa\n3 Mutuo acuerdo\n4 Despido justificado\n\nO cancelar.`);
  } else if(info.accion==="consultar_pago"){
    const e=info.empleada?encontrar(info.empleada,emps):null;
    if(e){const c=calcularPagoCompleto(e,prest);let msg=`Pago de ${e.nombre}\n\nBruta: $${c.q.toFixed(2)}\n`;if(c.css>0)msg+=`CSS: -$${c.css.toFixed(2)}\n`;if(c.segEdu>0)msg+=`Seg.Edu: -$${c.segEdu.toFixed(2)}\n`;if(c.descPrest>0)msg+=`Prestamo: -$${c.descPrest.toFixed(2)}\n`;msg+=`\nNeto: $${c.neto.toFixed(2)}`;const sp=prest.filter((p:any)=>p.empleadoId===e.id&&p.saldo>0);if(sp.length>0)msg+=`\nPrestamo pendiente: $${sp[0].saldo.toFixed(2)}`;await sendWhatsApp(from,msg);}
    else{let msg=`Proxima quincena\n\n`,t=0;for(const e of emps){const c=calcularPagoCompleto(e,prest);t+=c.neto;msg+=`${e.nombre}: $${c.neto.toFixed(2)}\n`;}if(emps.length>1)msg+=`\nTotal: $${t.toFixed(2)}`;await sendWhatsApp(from,msg);}
  } else if(info.accion==="ver_decimo"){
    const e=info.empleada?encontrar(info.empleada,emps):null;
    if(e){await sendWhatsApp(from,`Decimo de ${e.nombre}\n\nAcumulado: $${calcularDecimo(e).toFixed(2)}\nSalario: $${parseFloat(e.salario).toFixed(2)}/mes\n\nSe paga en abril, agosto y diciembre.`);}
    else{let msg=`Decimo acumulado\n\n`;for(const e of emps)msg+=`${e.nombre}: $${calcularDecimo(e).toFixed(2)}\n`;await sendWhatsApp(from,msg);}
  } else if(info.accion==="ver_vacaciones"){
    const e=info.empleada?encontrar(info.empleada,emps):null;
    if(e){const v=calcularVacaciones(e);if(!v){await sendWhatsApp(from,`${e.nombre} no tiene fecha de ingreso.`);return new Response("OK",{status:200});}const vp=(e.vacacionesPagadas||[]).reduce((s:number,x:any)=>s+(x.monto||0),0);let msg=`Vacaciones de ${e.nombre}\n\nProximas: ${v.prox}\nEn ${v.dias} dias\nAnos: ${v.a}\nPago estimado: $${v.pago.toFixed(2)}`;if(vp>0)msg+=`\nYa pagadas: $${vp.toFixed(2)}`;await sendWhatsApp(from,msg);}
    else{let msg=`Proximas vacaciones\n\n`;for(const e of emps){const v=calcularVacaciones(e);if(v)msg+=`${e.nombre}: ${v.prox} (${v.dias} dias)\n`;}await sendWhatsApp(from,msg||"Sin fechas de ingreso.");}
  } else if(info.accion==="ver_prestamos"){
    const e=info.empleada?encontrar(info.empleada,emps):null;const pa=prest.filter((p:any)=>p.saldo>0&&(!e||p.empleadoId===e.id));
    if(!pa.length){await sendWhatsApp(from,e?`${e.nombre} no tiene prestamos activos.`:"No hay prestamos activos.");}
    else{let msg=`Prestamos activos\n\n`;for(const p of pa){const em=emps.find((x:any)=>x.id===p.empleadoId);msg+=`${em?.nombre||"?"}: $${p.saldo.toFixed(2)} pendiente\nCuota quincenal: $${(p.cuotaQuincenal||p.cuotaMensual/2||0).toFixed(2)}\n\n`;}await sendWhatsApp(from,msg.trim());}
  } else if(info.accion==="ver_historial"){
    const e=info.empleada?encontrar(info.empleada,emps):null;
    if(e){const pe=hist.filter((p:any)=>p.empleadoId===e.id),pr2=pe.slice(-8).reverse(),tot=pe.reduce((s:number,p:any)=>s+(parseFloat(p.netoEmpleado)||0),0);const c=calcularPagoCompleto(e,prest);let msg=`Reporte de ${e.nombre}\n================\n\nSalario: $${parseFloat(e.salario).toFixed(2)}/mes\n`;if(e.fechaIngreso)msg+=`Ingreso: ${e.fechaIngreso}\n`;msg+=`\nProxima quincena: $${c.neto.toFixed(2)}\n`;if(c.css>0)msg+=`  CSS: -$${c.css.toFixed(2)}\n`;if(c.segEdu>0)msg+=`  Seg.Edu: -$${c.segEdu.toFixed(2)}\n`;if(c.descPrest>0)msg+=`  Prestamo: -$${c.descPrest.toFixed(2)}\n`;const sp=prest.filter((p:any)=>p.empleadoId===e.id&&p.saldo>0);if(sp.length>0)msg+=`Prestamo pendiente: $${sp[0].saldo.toFixed(2)}\n`;msg+=`Decimo acumulado: $${calcularDecimo(e).toFixed(2)}\n`;const v=calcularVacaciones(e);if(v)msg+=`Proximas vacaciones: ${v.prox}\n`;if(pr2.length>0){msg+=`\nUltimos pagos\n`;pr2.forEach((p:any)=>{msg+=`Q${p.quincena} ${p.mes} ${p.año}: $${parseFloat(p.netoEmpleado).toFixed(2)} (${p.metodoPago||"-"})\n`;});msg+=`\nTotal pagado: $${tot.toFixed(2)}`;}else msg+=`\nSin pagos registrados.`;await sendWhatsApp(from,msg+`\n\nsincontador.app`);}
    else{const pr2=hist.slice(-8).reverse();if(!pr2.length){await sendWhatsApp(from,"No hay pagos registrados.");}else{const l=pr2.map((p:any)=>{const em=emps.find((x:any)=>x.id===p.empleadoId);return `${em?.nombre||"?"} - $${parseFloat(p.netoEmpleado).toFixed(2)} - Q${p.quincena} ${p.mes}`;}).join("\n");await sendWhatsApp(from,`Ultimos pagos\n\n${l}\n\nsincontador.app`);}}
  } else if(info.accion==="dashboard"){
    const act=emps.filter((e:any)=>e.activa!==false);let tq=0,td=0;for(const e of act){tq+=calcularPagoCompleto(e,prest).neto;td+=calcularDecimo(e);}
    const pa=prest.filter((p:any)=>p.saldo>0),tp=pa.reduce((s:number,p:any)=>s+p.saldo,0);
    const hm=hist.filter((p:any)=>{const f=new Date(p.fecha||"");return f.getMonth()===new Date().getMonth()&&f.getFullYear()===new Date().getFullYear();});
    let msg=`Mi resumen\n====================\n\nEmpleadas activas: ${act.length}\nProxima quincena: $${tq.toFixed(2)}\nDecimo acumulado: $${td.toFixed(2)}\n`;
    if(pa.length>0)msg+=`Prestamos activos: ${pa.length} ($${tp.toFixed(2)})\n`;
    if(hm.length>0)msg+=`Pagado este mes: $${hm.reduce((s:number,p:any)=>s+(parseFloat(p.netoEmpleado)||0),0).toFixed(2)}\n`;
    msg+=`\n`; for(const e of act)msg+=`${e.nombre}: $${calcularPagoCompleto(e,prest).neto.toFixed(2)}\n`;
    await sendWhatsApp(from,msg+`\nsincontador.app`);
  } else if(info.accion==="archivo"){
    const in2=emps.filter((e:any)=>e.activa===false);if(!in2.length){await sendWhatsApp(from,"No hay empleadas archivadas.");}else{let msg=`Empleadas archivadas\n\n`;for(const e of in2)msg+=`${e.nombre} - ${e.fechaSalida||"—"} (${e.motivoSalida||"—"})\n`;await sendWhatsApp(from,msg);}
  } else if(info.accion==="ver_empleadas"){
    const act=emps.filter((e:any)=>e.activa!==false);if(!act.length){await sendWhatsApp(from,"No tienes empleadas.");}else{await sendWhatsApp(from,`Tus empleadas (${act.length})\n\n${act.map((e:any)=>`${e.nombre} - $${e.salario}/mes${e.fechaIngreso?" · desde "+e.fechaIngreso:""}`).join("\n")}`);}
  } else if(info.accion==="ayuda"){
    await sendWhatsApp(from,`SinContador WhatsApp\n\nPagar: "Pague a Rosa $340 quincena 1 junio"\nExtras: "Pague a Rosa, 3 horas extra, bono $20"\nPrestamo: "Prestamo a Rosa $200"\nAumento: "Aumento a Rosa a $400"\nVacaciones: "Vacaciones pagadas a Rosa $340"\nLiquidar: "Liquidar a Rosa"\nCalcular: "Cuanto le pago a Rosa"\nDecimo: "Decimo de Rosa"\nVacaciones: "Vacaciones de Rosa"\nPrestamos: "Prestamos de Rosa"\nHistorial: "Historial de Rosa"\nResumen: "Mi resumen"\nEmpleadas: "Mis empleadas"\nArchivo: "Empleadas archivadas"`);
  } else {await sendWhatsApp(from,"No entendi. Escribe ayuda.");}
  return new Response("OK",{status:200});
});
