// api/reporte-semanal-inventario.js
// Reporte semanal: stock de botellas + pedidos cerrados (buenas/merma) en los últimos 7 días
// Vercel Cron: miércoles 9am CDMX (15:00 UTC)

const DESTINATARIOS = [
  'smartinez@sharpplastics.com',
  'compras@sharpplastics.com',
  'produccion@sharpplastics.com',
];

const SB_URL = process.env.SUPABASE_URL || 'https://ozibjgsxyzdbporcarwv.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aWJqZ3N4eXpkYnBvcmNhcnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTc5MjEsImV4cCI6MjA5Mjk3MzkyMX0.mO77vLN92En0fvn1U-FFif43CsCG_QMiVKSclBCL7-M';
const SB_H = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

const fmt = n => Math.floor(Number(n)||0).toLocaleString('es-MX');
const sumObj = o => Object.values(o||{}).reduce((s,v)=>s+(Number(v)||0),0);

async function sbGet(tabla, filtro) {
  const r = await fetch(`${SB_URL}/rest/v1/${tabla}?${filtro||''}`, { headers: SB_H });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const ahora = new Date();
    const hace7dias = new Date(ahora - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Stock actual de botellas (almacén + producción)
    const stock = await sbGet('inventario_stock',
      'select=cantidad,ubicacion,producto_id,variante_id,' +
      'inventario_productos(nombre,categoria,capacidad),' +
      'inventario_variantes(nombre,pantone)' +
      '&order=producto_id.asc,variante_id.asc'
    );
    const botellas = stock.filter(s => s.inventario_productos?.categoria === 'botella');
    const stockMap = {};
    for (const s of botellas) {
      const key = `${s.producto_id}|${s.variante_id}`;
      if (!stockMap[key]) {
        stockMap[key] = {
          producto: s.inventario_productos?.nombre || '—',
          variante: s.inventario_variantes?.nombre || '—',
          pantone: s.inventario_variantes?.pantone || '',
          almacen: 0, produccion: 0,
        };
      }
      if (s.ubicacion === 'almacen') stockMap[key].almacen += Number(s.cantidad)||0;
      if (s.ubicacion === 'produccion') stockMap[key].produccion += Number(s.cantidad)||0;
    }
    const stockRows = Object.values(stockMap).filter(r => r.almacen + r.produccion > 0);

    // 2. Pedidos cerrados en los últimos 7 días (fuente: ordenes_produccion)
    const ordenes = await sbGet('ordenes_produccion',
      'select=pipeline_id,piezas_buenas,merma_ajuste,merma_produccion,updated_at' +
      '&estado=in.(completado,Completado)' +
      `&updated_at=gte.${hace7dias}` +
      '&order=updated_at.desc'
    );
    const ids = ordenes.map(o => o.pipeline_id).filter(Boolean);
    const pipes = ids.length
      ? await sbGet('pipeline_mf', `select=id,sub_cliente,po,capacidad,piezas,color_botella&id=in.(${ids.join(',')})`)
      : [];
    const pipeMap = {};
    pipes.forEach(p => { pipeMap[p.id] = p; });

    const pedidosCerrados = ordenes.map(o => {
      const p = pipeMap[o.pipeline_id] || {};
      return {
        sub_cliente: p.sub_cliente, po: p.po, capacidad: p.capacidad,
        color_botella: p.color_botella, pedido: p.piezas,
        buenas: Number(o.piezas_buenas)||0,
        merma: sumObj(o.merma_ajuste) + sumObj(o.merma_produccion),
        fecha: o.updated_at,
      };
    });

    // 3. Totales y consumo por variante (buenas + merma = lo que sale del inventario)
    let totalBuenas = 0, totalMerma = 0;
    const consumoMap = {};
    for (const p of pedidosCerrados) {
      totalBuenas += p.buenas;
      totalMerma += p.merma;
      const key = `Botella ${p.capacidad||'?'}ml ${p.color_botella||''}`.trim();
      if (!consumoMap[key]) consumoMap[key] = { buenas: 0, merma: 0 };
      consumoMap[key].buenas += p.buenas;
      consumoMap[key].merma += p.merma;
    }
    const totalConsumido = totalBuenas + totalMerma;
    const pctMerma = totalConsumido > 0 ? (totalMerma / totalConsumido * 100).toFixed(1) + '%' : '—';

    // ── HTML ──
    const semanaStr = ahora.toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const td = 'padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px';
    const th = 'padding:8px 12px;font-size:11px;text-transform:uppercase;color:#6b7280';

    const filasStock = stockRows.map(r => `
      <tr>
        <td style="${td}"><strong>${r.producto}</strong></td>
        <td style="${td}">${r.variante}${r.pantone?' <span style="color:#6b7280;font-size:10px">('+r.pantone+')</span>':''}</td>
        <td style="${td};text-align:right;font-family:monospace">${fmt(r.almacen)}</td>
        <td style="${td};text-align:right;font-family:monospace">${fmt(r.produccion)}</td>
        <td style="${td};text-align:right;font-family:monospace;font-weight:700">${fmt(r.almacen+r.produccion)}</td>
      </tr>`).join('') || `<tr><td colspan="5" style="padding:16px;text-align:center;color:#6b7280">Sin stock registrado</td></tr>`;

    const filasPedidos = pedidosCerrados.length ? pedidosCerrados.map(p => `
      <tr>
        <td style="${td}"><strong>${p.sub_cliente||'—'}</strong></td>
        <td style="${td};font-family:monospace">${p.po||'—'}</td>
        <td style="${td};text-align:center">${p.capacidad||'—'}ml</td>
        <td style="${td}">${p.color_botella||'—'}</td>
        <td style="${td};text-align:right;font-family:monospace">${fmt(p.buenas)}</td>
        <td style="${td};text-align:right;font-family:monospace;color:#dc2626">${fmt(p.merma)}</td>
        <td style="${td};color:#6b7280">${p.fecha?new Date(p.fecha).toLocaleDateString('es-MX'):'—'}</td>
      </tr>`).join('')
    : `<tr><td colspan="7" style="padding:16px;text-align:center;color:#6b7280;font-size:12px">Sin pedidos cerrados esta semana</td></tr>`;

    const filasConsumo = Object.entries(consumoMap).map(([key, v]) => {
      const total = v.buenas + v.merma;
      return `
      <tr>
        <td style="${td}">${key}</td>
        <td style="${td};text-align:right;font-family:monospace;color:#059669">${fmt(v.buenas)}</td>
        <td style="${td};text-align:right;font-family:monospace;color:#dc2626">${fmt(v.merma)}</td>
        <td style="${td};text-align:right;font-family:monospace;font-weight:700">${fmt(total)}</td>
        <td style="${td};text-align:right;font-family:monospace;color:#6b7280">${total>0?(v.merma/total*100).toFixed(1)+'%':'—'}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="5" style="padding:16px;text-align:center;color:#6b7280;font-size:12px">Sin consumos esta semana</td></tr>`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="max-width:720px;margin:0 auto;background:#fff">
    <div style="background:#0d0f12;color:#fff;padding:20px 28px">
      <div style="font-family:'Courier New',monospace;font-size:11px;color:#9ca3af;letter-spacing:2px">SHARP <span style="color:#f59e0b">PLASTICS</span> MES v2</div>
      <div style="font-size:20px;font-weight:700;margin-top:6px">📦 Reporte Semanal de Inventario</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px">${semanaStr} · últimos 7 días</div>
    </div>

    <div style="padding:20px 28px;background:#f9fafb;border-bottom:1px solid #e5e7eb;display:flex;gap:16px">
      <div style="flex:1;text-align:center"><div style="font-size:28px;font-weight:700;color:#3b82f6">${pedidosCerrados.length}</div><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Pedidos cerrados</div></div>
      <div style="flex:1;text-align:center"><div style="font-size:28px;font-weight:700;color:#10b981">${fmt(totalBuenas)}</div><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Botellas buenas</div></div>
      <div style="flex:1;text-align:center"><div style="font-size:28px;font-weight:700;color:#ef4444">${fmt(totalMerma)}</div><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Merma</div></div>
      <div style="flex:1;text-align:center"><div style="font-size:28px;font-weight:700;color:#f59e0b">${pctMerma}</div><div style="font-size:11px;color:#6b7280;text-transform:uppercase">% merma</div></div>
    </div>

    <div style="padding:24px 28px">
      <h2 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#374151;margin:0 0 12px">Pedidos cerrados esta semana</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
        <thead><tr style="background:#f3f4f6">
          <th style="${th};text-align:left">Cliente</th><th style="${th};text-align:left">PO</th>
          <th style="${th};text-align:center">Cap.</th><th style="${th};text-align:left">Color</th>
          <th style="${th};text-align:right">Buenas</th><th style="${th};text-align:right">Merma</th>
          <th style="${th};text-align:left">Fecha</th>
        </tr></thead>
        <tbody>${filasPedidos}</tbody>
      </table>
    </div>

    <div style="padding:0 28px 24px">
      <h2 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#374151;margin:0 0 4px">Consumo por variante</h2>
      <div style="font-size:11px;color:#6b7280;margin-bottom:12px">Total consumido = buenas + merma (lo que sale del inventario de botellas)</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
        <thead><tr style="background:#f3f4f6">
          <th style="${th};text-align:left">Botella</th><th style="${th};text-align:right">Buenas</th>
          <th style="${th};text-align:right">Merma</th><th style="${th};text-align:right">Total consumido</th>
          <th style="${th};text-align:right">% merma</th>
        </tr></thead>
        <tbody>${filasConsumo}</tbody>
      </table>
    </div>

    <div style="padding:0 28px 24px">
      <h2 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#374151;margin:0 0 12px">Stock actual de botellas</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
        <thead><tr style="background:#f3f4f6">
          <th style="${th};text-align:left">Producto</th><th style="${th};text-align:left">Color</th>
          <th style="${th};text-align:right">Almacén</th><th style="${th};text-align:right">Producción</th>
          <th style="${th};text-align:right">Total</th>
        </tr></thead>
        <tbody>${filasStock}</tbody>
      </table>
    </div>

    <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
      <div style="font-size:11px;color:#9ca3af">Sharp Plastics MES v2 — Reporte automático cada miércoles 9:00 am</div>
    </div>
  </div>
</body></html>`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'MES Sharp Plastics <mes@sharpplastics.com>',
        to: DESTINATARIOS,
        subject: `📦 Reporte Semanal Inventario — ${ahora.toLocaleDateString('es-MX', {day:'2-digit',month:'short',year:'numeric'})}`,
        html,
      }),
    });
    if (!resendRes.ok) {
      const err = await resendRes.json().catch(() => ({}));
      return res.status(500).json({ error: 'Error enviando email', detail: err });
    }
    return res.status(200).json({ ok: true, enviado_a: DESTINATARIOS, pedidos: pedidosCerrados.length, buenas: totalBuenas, merma: totalMerma });

  } catch (e) {
    console.error('reporte-semanal error:', e);
    return res.status(500).json({ error: e.message });
  }
}
