// api/send-alertas-inventario.js
// Envía reporte por email con alertas de inventario (rojas + amarillas).

const ALERT_EMAIL = 'smartinez@sharpplastics.com';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumen, alertas = [], sin_match = [], usuario } = req.body || {};
  if (!alertas.length) return res.status(400).json({ error: 'Sin alertas para enviar' });

  const fmt = (n) => Math.floor(Number(n) || 0).toLocaleString('es-MX');

  const rojas = alertas.filter(a => a.alerta === 'roja');
  const amarillas = alertas.filter(a => a.alerta === 'amarilla');

  const filaFn = (a, esRoja) => `
    <tr style="background:${esRoja ? '#fef2f2' : '#fffbeb'}">
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px"><strong>${a.producto}</strong></td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-family:monospace">${fmt(a.requerido)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-family:monospace">${fmt(a.stock_total)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-family:monospace;color:${a.restante < 0 ? '#dc2626' : a.restante < a.minimo ? '#d97706' : '#374151'}">${fmt(a.restante)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-family:monospace;color:#6b7280">${a.minimo > 0 ? fmt(a.minimo) : '—'}</td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="max-width:680px;margin:0 auto;background:#fff;padding:0">
    <div style="background:#0d0f12;color:#fff;padding:20px 28px">
      <div style="font-family:'Courier New',monospace;font-size:11px;color:#9ca3af;letter-spacing:2px">SHARP <span style="color:#f59e0b">PLASTICS</span></div>
      <div style="font-size:20px;font-weight:700;margin-top:6px">🚨 Alertas de Inventario</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px">${new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}</div>
    </div>

    <div style="padding:24px 28px;border-bottom:1px solid #e5e7eb">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:#3b82f6">${resumen?.pedidos_pendientes || 0}</div>
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase">Pedidos pendientes</div>
        </div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:#dc2626">${rojas.length}</div>
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase">Críticas</div>
        </div>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:#d97706">${amarillas.length}</div>
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase">En riesgo</div>
        </div>
      </div>
    </div>

    ${rojas.length ? `
    <div style="padding:24px 28px;background:#fef2f2;border-bottom:1px solid #e5e7eb">
      <div style="font-size:14px;font-weight:700;color:#dc2626;margin-bottom:12px">🚨 ALERTAS CRÍTICAS — MATERIAL INSUFICIENTE</div>
      <div style="font-size:12px;color:#7f1d1d;margin-bottom:12px">El inventario actual NO alcanza para cubrir todos los pedidos pendientes.</div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #fecaca">
        <thead><tr style="background:#fee2e2"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#7f1d1d;text-transform:uppercase">Producto</th><th style="padding:8px 12px;text-align:right;font-size:11px;color:#7f1d1d;text-transform:uppercase">Requerido</th><th style="padding:8px 12px;text-align:right;font-size:11px;color:#7f1d1d;text-transform:uppercase">Stock total</th><th style="padding:8px 12px;text-align:right;font-size:11px;color:#7f1d1d;text-transform:uppercase">Restante</th><th style="padding:8px 12px;text-align:right;font-size:11px;color:#7f1d1d;text-transform:uppercase">Mínimo</th></tr></thead>
        <tbody>${rojas.map(a => filaFn(a, true)).join('')}</tbody>
      </table>
    </div>` : ''}

    ${amarillas.length ? `
    <div style="padding:24px 28px;background:#fffbeb">
      <div style="font-size:14px;font-weight:700;color:#d97706;margin-bottom:12px">⚠️ EN RIESGO — INVENTARIO BAJO MÍNIMO</div>
      <div style="font-size:12px;color:#78350f;margin-bottom:12px">El inventario alcanza para los pedidos pendientes pero quedaría por debajo del mínimo de reserva.</div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #fde68a">
        <thead><tr style="background:#fef3c7"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#78350f;text-transform:uppercase">Producto</th><th style="padding:8px 12px;text-align:right;font-size:11px;color:#78350f;text-transform:uppercase">Requerido</th><th style="padding:8px 12px;text-align:right;font-size:11px;color:#78350f;text-transform:uppercase">Stock total</th><th style="padding:8px 12px;text-align:right;font-size:11px;color:#78350f;text-transform:uppercase">Restante</th><th style="padding:8px 12px;text-align:right;font-size:11px;color:#78350f;text-transform:uppercase">Mínimo</th></tr></thead>
        <tbody>${amarillas.map(a => filaFn(a, false)).join('')}</tbody>
      </table>
    </div>` : ''}

    ${sin_match && sin_match.length ? `
    <div style="padding:20px 28px;background:#f3f4f6;border-top:1px solid #e5e7eb">
      <div style="font-size:13px;font-weight:700;color:#6b7280;margin-bottom:8px">Items sin match con catálogo</div>
      <div style="font-size:11px;color:#6b7280">${sin_match.length} item(s) de pedidos no se pudieron mapear al inventario (probablemente colores no agregados al catálogo). Ver detalle en el portal.</div>
    </div>` : ''}

    <div style="padding:20px 28px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb">
      <a href="https://sharp-plastics-mes-v2.vercel.app/produccion.html" style="display:inline-block;background:#0d0f12;color:#fff;font-size:13px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none">Abrir Producción en MES</a>
    </div>

    <div style="padding:14px 28px;background:#0d0f12;color:#9ca3af;font-size:10px;text-align:center">
      Generado por ${usuario || 'usuario'} desde Sharp Plastics MES
    </div>
  </div>
</body></html>`;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'MES Sharp Plastics <onboarding@resend.dev>',
        to: [ALERT_EMAIL],
        subject: `🚨 Alertas de inventario · ${rojas.length} crítica(s) · ${amarillas.length} en riesgo`,
        html,
      }),
    });
    if (!resendRes.ok) {
      const err = await resendRes.json().catch(() => ({}));
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Error enviando email', detail: err });
    }
    return res.status(200).json({ ok: true, sent_to: ALERT_EMAIL, alertas: alertas.length });
  } catch (e) {
    console.error('[send-alertas-inventario]', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
