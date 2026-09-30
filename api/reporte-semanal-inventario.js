// api/reporte-semanal-inventario.js
// Reporte semanal de inventario de botellas + pedidos cerrados + merma
// Llamado por Vercel Cron: todos los miércoles a las 9am (UTC-6 = 15:00 UTC)

const DESTINATARIOS = [
  'smartinez@sharpplastics.com',
  'compras@sharpplastics.com',
  'produccion@sharpplastics.com',
];

const SB_URL = process.env.SUPABASE_URL || 'https://ozibjgsxyzdbporcarwv.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aWJqZ3N4eXpkYnBvcmNhcnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTc5MjEsImV4cCI6MjA5Mjk3MzkyMX0.mO77vLN92En0fvn1U-FFif43CsCG_QMiVKSclBCL7-M';
const SB_H = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

const fmt = n => Math.floor(Number(n)||0).toLocaleString('es-MX');

async function sbGet(tabla, filtro) {
  const r = await fetch(`${SB_URL}/rest/v1/${tabla}?${filtro||''}`, { headers: SB_H });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default async function handler(req, res) {
  // Permitir GET (cron) y POST (manual)
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const ahora = new Date();
    const hace7dias = new Date(ahora - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Stock actual de botellas
    const stock = await sbGet('inventario_stock',
      'select=cantidad,ubicacion,producto_id,variante_id,' +
      'inventario_productos(nombre,categoria,capacidad),' +
      'inventario_variantes(nombre,pantone)' +
      '&order=producto_id.asc,variante_id.asc'
    );

    // Filtrar solo botellas
    const botellas = stock.filter(s => s.inventario_productos?.categoria === 'botella');

    // Agrupar por producto+variante (sumar almacen + produccion)
    const stockMap = {};
    for (const s of botellas) {
      const key = `${s.producto_id}|${s.variante_id}`;
      if (!stockMap[key]) {
        stockMap[key] = {
          producto: s.inventario_productos?.nombre || '—',
          variante: s.inventario_variantes?.nombre || '—',
          pantone: s.inventario_variantes?.pantone || '',
          almacen: 0,
          produccion: 0,
        };
      }
      if (s.ubicacion === 'almacen') stockMap[key].almacen += Number(s.cantidad)||0;
      if (s.ubicacion === 'produccion') stockMap[key].produccion += Number(s.cantidad)||0;
    }
    const stockRows = Object.values(stockMap).filter(r => r.almacen + r.produccion > 0);

    // 2. Pedidos cerrados esta semana
    const pedidosCerrados = await sbGet('pipeline_mf',
      `select=sub_cliente,po,capacidad,piezas,color_botella,color_tapa,updated_at` +
      `&estado=in.(Completado,Entregado)` +
      `&updated_at=gte.${hace7dias}` +
      `&order=updated_at.desc`
    );
    // Renombrar updated_at a fecha_completado para el template
    pedidosCerrados.forEach(p => { p.fecha_completado = p.updated_at; });

    // 3. Movimientos de consumo esta semana (merma incluida en observaciones)
    const movimientos = await sbGet('inventario_movimientos',
      `select=cantidad,observaciones,created_at,` +
      `inventario_productos(nombre,capacidad),inventario_variantes(nombre)` +
      `&tipo=eq.consumo_pedido` +
      `&created_at=gte.${hace7dias}` +
      `&order=created_at.desc`
    );

    // Calcular totales de consumo y merma
    let totalBotellas = 0, totalMerma = 0;
    const consumoMap = {};
    for (const m of movimientos) {
      if (m.inventario_productos?.capacidad) {
        totalBotellas += Number(m.cantidad)||0;
        const obs = m.observaciones || '';
        const mermaMatch = obs.match(/(\d+)\s*merma/);
        const merma = mermaMatch ? parseInt(mermaMatch[1]) : 0;
        totalMerma += merma;
        const key = `${m.inventario_productos.nombre} ${m.inventario_variantes?.nombre||''}`.trim();
        if (!consumoMap[key]) consumoMap[key] = { total: 0, merma: 0 };
        consumoMap[key].total += Number(m.cantidad)||0;
        consumoMap[key].merma += merma;
      }
    }

    // ── HTML DEL EMAIL ──
    const semanaStr = ahora.toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

    const filasStock = stockRows.map(r => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px"><strong>${r.producto}</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px">${r.variante}${r.pantone?' <span style="color:#6b7280;font-size:10px">('+r.pantone+')</span>':''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-family:monospace">${fmt(r.almacen)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-family:monospace">${fmt(r.produccion)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-family:monospace;font-weight:700">${fmt(r.almacen+r.produccion)}</td>
      </tr>`).join('');

    const filasPedidos = pedidosCerrados.length ? pedidosCerrados.map(p => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px"><strong>${p.sub_cliente||'—'}</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;font-family:monospace">${p.po||'—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center">${p.capacidad||'—'}ml</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px">${p.color_botella||'—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-family:monospace">${fmt(p.piezas)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${p.fecha_completado?new Date(p.fecha_completado).toLocaleDateString('es-MX'):'—'}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" style="padding:16px;text-align:center;color:#6b7280;font-size:12px">Sin pedidos cerrados esta semana</td></tr>';

    const filasConsumo = Object.entries(consumoMap).map(([key, v]) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px">${key}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-family:monospace">${fmt(v.total)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-family:monospace;color:#dc2626">${fmt(v.merma)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-family:monospace;color:#6b7280">${v.total>0?(v.merma/v.total*100).toFixed(1)+'%':'—'}</td>
      </tr>`).join('') || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#6b7280;font-size:12px">Sin consumos registrados esta semana</td></tr>';

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="max-width:720px;margin:0 auto;background:#fff">
    <div style="background:#0d0f12;color:#fff;padding:20px 28px">
      <div style="font-family:'Courier New',monospace;font-size:11px;color:#9ca3af;letter-spacing:2px">SHARP <span style="color:#f59e0b">PLASTICS</span> MES v2</div>
      <div style="font-size:20px;font-weight:700;margin-top:6px">📦 Reporte Semanal de Inventario</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px">${semanaStr}</div>
    </div>

    <!-- Resumen ejecutivo -->
    <div style="padding:20px 28px;background:#f9fafb;border-bottom:1px solid #e5e7eb;display:flex;gap:16px">
      <div style="flex:1;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#3b82f6">${fmt(totalBotellas)}</div>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase">Botellas consumidas</div>
      </div>
      <div style="flex:1;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#10b981">${pedidosCerrados.length}</div>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase">Pedidos cerrados</div>
      </div>
      <div style="flex:1;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#ef4444">${fmt(totalMerma)}</div>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase">Merma total</div>
      </div>
      <div style="flex:1;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#f59e0b">${totalBotellas>0?(totalMerma/totalBotellas*100).toFixed(1)+'%':'—'}</div>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase">% merma</div>
      </div>
    </div>

    <!-- Stock actual de botellas -->
    <div style="padding:24px 28px">
      <h2 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#374151;margin:0 0 12px">Stock actual de botellas</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Producto</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Color</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Almacén</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Producción</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Total</th>
          </tr>
        </thead>
        <tbody>${filasStock || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#6b7280">Sin stock registrado</td></tr>'}</tbody>
      </table>
    </div>

    <!-- Pedidos cerrados esta semana -->
    <div style="padding:0 28px 24px">
      <h2 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#374151;margin:0 0 12px">Pedidos cerrados esta semana</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Cliente</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">PO</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#6b7280">Cap.</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Color</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Piezas</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Fecha</th>
          </tr>
        </thead>
        <tbody>${filasPedidos}</tbody>
      </table>
    </div>

    <!-- Consumo y merma por variante -->
    <div style="padding:0 28px 24px">
      <h2 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#374151;margin:0 0 12px">Consumo y merma por variante</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Botella</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Consumido</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Merma</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">% merma</th>
          </tr>
        </thead>
        <tbody>${filasConsumo}</tbody>
      </table>
    </div>

    <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
      <div style="font-size:11px;color:#9ca3af">Sharp Plastics MES v2 — Reporte generado automáticamente cada miércoles a las 9:00 am</div>
    </div>
  </div>
</body></html>`;

    // Enviar con Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MES Sharp Plastics <onboarding@resend.dev>',
        to: DESTINATARIOS,
        subject: `📦 Reporte Semanal Inventario — ${ahora.toLocaleDateString('es-MX', {day:'2-digit',month:'short',year:'numeric'})}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.json().catch(() => ({}));
      return res.status(500).json({ error: 'Error enviando email', detail: err });
    }

    return res.status(200).json({ ok: true, enviado_a: DESTINATARIOS, pedidos: pedidosCerrados.length });

  } catch (e) {
    console.error('reporte-semanal error:', e);
    return res.status(500).json({ error: e.message });
  }
}
