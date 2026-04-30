// api/send-cierre.js
// Recibe datos del cierre y manda email a los destinatarios con resumen de la orden
const SB_URL = 'https://ozibjgsxyzdbporcarwv.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aWJqZ3N4eXpkYnBvcmNhcnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTc5MjEsImV4cCI6MjA5Mjk3MzkyMX0.mO77vLN92En0fvn1U-FFif43CsCG_QMiVKSclBCL7-M';

// Por ahora solo smartinez — cuando esté listo agregar compras@sharpplastics.com
const DESTINATARIOS = ['smartinez@sharpplastics.com'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    orden_id, orden_op, cliente, sub_cliente, producto,
    piezas_total, piezas_buenas, merma_total, rendimiento,
    tiempo_ajuste, tiempo_produccion, tiempo_total,
    reajustes, seg_bot, pzas_hora,
    colores, consumo_real, merma_detalle, tiempos_muertos,
    crosshatch, prueba_agua, firma, observaciones,
    foto_urls = []
  } = req.body;

  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const verFotosUrl = orden_id ? `https://sharp-plastics-mes-v2.vercel.app/api/ver-fotos?id=${orden_id}` : null;

  // Filas de consumo real
  const consumoHTML = (consumo_real || []).map((cr, i) => {
    const col = (colores || [])[i] || { nombre: `Color ${i+1}`, pantone: '' };
    const real = (parseFloat(cr.gramos_usados) || 0) - (parseFloat(cr.gramos_sobrante) || 0);
    const diff = real - (parseFloat(cr.gramos_estimado) || 0);
    const diffStr = diff !== 0 ? ` (${diff > 0 ? '+' : ''}${diff.toFixed(1)}g vs estimado)` : '';
    return `<tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:5px 10px;font-size:12px;font-weight:600">${col.nombre}${col.pantone ? ' · ' + col.pantone : ''}</td>
      <td style="padding:5px 10px;font-size:12px;text-align:center;font-family:monospace">${real > 0 ? real.toFixed(1) + 'g' : '—'}${diffStr}</td>
    </tr>`;
  }).join('');

  // Filas de merma
  const mermaHTML = (merma_detalle || []).map(([k, v]) =>
    `<tr><td style="padding:4px 10px;font-size:12px">${k}</td><td style="padding:4px 10px;font-size:12px;text-align:right;font-family:monospace;color:#dc2626">${v}</td></tr>`
  ).join('');

  // Filas de tiempos muertos
  const tmHTML = (tiempos_muertos || []).map(([k, v]) =>
    `<tr><td style="padding:4px 10px;font-size:12px">${k}</td><td style="padding:4px 10px;font-size:12px;text-align:right;font-family:monospace">${v}</td></tr>`
  ).join('');

  const rendColor = parseFloat(rendimiento) >= 95 ? '#16a34a' : parseFloat(rendimiento) >= 85 ? '#d97706' : '#dc2626';

  const emailHTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

  <div style="background:#0d0f12;padding:20px 32px">
    <span style="font-size:18px;font-weight:700;color:#fff">MES <span style="color:#f59e0b">//</span> Sharp Plastics</span>
    <div style="font-size:11px;color:#6b7280;margin-top:3px">Reporte de cierre de producción</div>
  </div>

  <div style="padding:20px 32px 0">
    <h1 style="margin:0 0 4px;font-size:18px;color:#111">✅ Orden completada</h1>
    <p style="margin:0;font-size:13px;color:#6b7280">${fecha}</p>
  </div>

  <!-- Info del pedido -->
  <div style="margin:16px 32px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:3px 0;font-size:11px;color:#6b7280;width:35%">Orden</td><td style="font-size:13px;font-weight:700">${orden_op || '—'}</td></tr>
      <tr><td style="padding:3px 0;font-size:11px;color:#6b7280">Cliente</td><td style="font-size:13px;font-weight:700">${sub_cliente || cliente || '—'}</td></tr>
      <tr><td style="padding:3px 0;font-size:11px;color:#6b7280">Producto</td><td style="font-size:13px">${producto || '—'}</td></tr>
      <tr><td style="padding:3px 0;font-size:11px;color:#6b7280">Colores</td><td style="font-size:13px">${(colores || []).map(c => c.nombre + (c.pantone ? ' · ' + c.pantone : '')).join(', ') || '—'}</td></tr>
    </table>
  </div>

  <!-- Stats -->
  <div style="padding:0 32px;margin-bottom:16px">
    <table width="100%" cellspacing="6" cellpadding="0">
      <tr>
        <td width="33%" style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px;text-align:center">
          <div style="font-family:monospace;font-size:22px;font-weight:700;color:#16a34a">${(piezas_buenas || 0).toLocaleString()}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px">Piezas buenas</div>
        </td>
        <td width="4px"></td>
        <td width="33%" style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px;text-align:center">
          <div style="font-family:monospace;font-size:22px;font-weight:700;color:#dc2626">${merma_total || 0}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px">Merma total</div>
        </td>
        <td width="4px"></td>
        <td width="33%" style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:10px;text-align:center">
          <div style="font-family:monospace;font-size:22px;font-weight:700;color:${rendColor}">${rendimiento || '—'}%</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px">Rendimiento</div>
        </td>
      </tr>
    </table>
  </div>

  <!-- Tiempos -->
  <div style="padding:0 32px;margin-bottom:16px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#374151;margin-bottom:8px">Tiempos</div>
    <table width="100%" cellspacing="6" cellpadding="0">
      <tr>
        ${[['Total', tiempo_total, '#111'], ['Ajuste', tiempo_ajuste, '#d97706'], ['Producción', tiempo_produccion, '#2563eb']].map(([l,v,c]) =>
          `<td style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px;text-align:center">
            <div style="font-family:monospace;font-size:14px;font-weight:700;color:${c}">${v || '—'}</div>
            <div style="font-size:10px;color:#6b7280;margin-top:1px">${l}</div>
          </td>`).join('<td width="4px"></td>')}
      </tr>
      <tr><td colspan="5" height="6"></td></tr>
      <tr>
        ${[['Reajustes', reajustes || 0, '#dc2626'], ['seg/botella', seg_bot || '—', '#111'], ['pzas/hora', pzas_hora || '—', '#111']].map(([l,v,c]) =>
          `<td style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px;text-align:center">
            <div style="font-family:monospace;font-size:14px;font-weight:700;color:${c}">${v}</div>
            <div style="font-size:10px;color:#6b7280;margin-top:1px">${l}</div>
          </td>`).join('<td width="4px"></td>')}
      </tr>
    </table>
  </div>

  ${tmHTML ? `
  <div style="padding:0 32px;margin-bottom:16px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#374151;margin-bottom:6px">Tiempos muertos</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <tbody>${tmHTML}</tbody>
    </table>
  </div>` : ''}

  ${mermaHTML ? `
  <div style="padding:0 32px;margin-bottom:16px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#374151;margin-bottom:6px">Merma por causa</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <tbody>${mermaHTML}</tbody>
    </table>
  </div>` : ''}

  ${consumoHTML ? `
  <div style="padding:0 32px;margin-bottom:16px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#374151;margin-bottom:6px">Consumo real de tintas</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <tbody>${consumoHTML}</tbody>
    </table>
  </div>` : ''}

  ${verFotosUrl ? `
  <div style="padding:0 32px;margin-bottom:16px;text-align:center">
    <a href="${verFotosUrl}" style="display:inline-block;background:#0d0f12;color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:8px;text-decoration:none">📷 Ver fotos de producción</a>
  </div>` : ''}

  ${observaciones ? `<div style="padding:0 32px;margin-bottom:16px;font-size:12px;color:#374151;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-left:32px;margin-right:32px;padding:10px 14px"><strong>Observaciones:</strong> ${observaciones}</div>` : ''}

  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:12px 32px;text-align:center;margin-top:8px">
    <p style="font-size:11px;color:#9ca3af;margin:0">Sharp Plastics MES · Liberado por: <strong>${firma || '—'}</strong></p>
  </div>
</div>
</body></html>`;

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: 'MES Sharp Plastics <onboarding@resend.dev>',
      to: DESTINATARIOS,
      subject: `✅ Orden completada — ${orden_op || 'Orden'} · ${sub_cliente || cliente || '—'} · ${rendimiento || '—'}% rendimiento`,
      html: emailHTML,
    }),
  });

  if (!resendRes.ok) {
    const err = await resendRes.json();
    console.error('Resend error:', err);
    return res.status(500).json({ error: 'Error enviando email', detail: err });
  }

  return res.status(200).json({ ok: true });
}
