// api/send-monitor.js
const APPROVAL_EMAIL = 'smartinez@sharpplastics.com';
const BASE_URL = 'https://sharp-plastics-mes-v2.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { orden_id, orden_op, cliente, piezas, colores, capacidad } = req.body;
  if (!orden_id) return res.status(400).json({ error: 'orden_id requerido' });

  const monitorUrl = `${BASE_URL}/api/monitor?id=${orden_id}`;
  const fecha = new Date().toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'});

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: 'MES Sharp Plastics <onboarding@resend.dev>',
      to: [APPROVAL_EMAIL],
      subject: `🟢 Orden iniciada — ${orden_op || '—'} · ${cliente || '—'}`,
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:500px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <div style="background:#0d0f12;padding:16px 24px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:16px;font-weight:700;color:#fff">MES <span style="color:#f59e0b">//</span> Sharp Plastics</span>
    <span style="font-size:11px;color:#6b7280">${fecha}</span>
  </div>
  <div style="padding:24px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <span style="font-size:28px">🟢</span>
      <div>
        <h2 style="margin:0;font-size:18px;color:#111">Orden iniciada</h2>
        <p style="margin:0;font-size:13px;color:#6b7280">Ajuste en proceso</p>
      </div>
    </div>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:20px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:3px 0;font-size:11px;color:#6b7280;width:35%">Orden</td><td style="font-size:14px;font-weight:700">${orden_op||'—'}</td></tr>
        <tr><td style="padding:3px 0;font-size:11px;color:#6b7280">Cliente</td><td style="font-size:14px;font-weight:700">${cliente||'—'}</td></tr>
        <tr><td style="padding:3px 0;font-size:11px;color:#6b7280">Piezas</td><td style="font-size:14px;font-weight:600">${(piezas||0).toLocaleString()}</td></tr>
        ${capacidad?`<tr><td style="padding:3px 0;font-size:11px;color:#6b7280">Botella</td><td style="font-size:14px;font-weight:600">${capacidad}ml</td></tr>`:''}
        ${colores?`<tr><td style="padding:3px 0;font-size:11px;color:#6b7280;vertical-align:top">Colores</td><td style="font-size:13px">${colores}</td></tr>`:''}
      </table>
    </div>
    <a href="${monitorUrl}" style="display:block;background:#16a34a;color:#fff;text-align:center;padding:14px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none">
      📊 Ver producción en tiempo real
    </a>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin:10px 0 0">Se actualiza cada 8 segundos · Solo lectura</p>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:10px 24px;text-align:center">
    <p style="font-size:11px;color:#9ca3af;margin:0">Sharp Plastics MES</p>
  </div>
</div>
</body></html>`,
    }),
  });

  if (!r.ok) {
    const err = await r.json();
    console.error('Resend error:', err);
    return res.status(500).json({ error: err });
  }
  return res.status(200).json({ ok: true, url: monitorUrl });
}

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: 'MES Sharp Plastics <onboarding@resend.dev>',
      to: [APPROVAL_EMAIL],
      subject: `🔴 En producción — ${orden_op || '—'} · ${cliente || '—'}`,
      html: `<div style="font-family:Arial;max-width:500px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <div style="background:#0d0f12;padding:16px 24px">
          <span style="font-size:16px;font-weight:700;color:#fff">MES <span style="color:#f59e0b">//</span> Sharp Plastics</span>
        </div>
        <div style="padding:24px">
          <h2 style="margin:0 0 6px;font-size:18px;color:#111">🔴 Producción iniciada</h2>
          <p style="color:#6b7280;font-size:13px;margin:0 0 20px">${orden_op || '—'} · ${cliente || '—'} · ${(piezas||0).toLocaleString()} pzas</p>
          <a href="${monitorUrl}" style="display:block;background:#16a34a;color:#fff;text-align:center;padding:14px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none">
            📊 Ver producción en tiempo real
          </a>
          <p style="font-size:11px;color:#9ca3af;text-align:center;margin:12px 0 0">
            Se actualiza automáticamente cada 8 segundos · Solo lectura
          </p>
        </div>
        <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:12px 24px;text-align:center">
          <p style="font-size:11px;color:#9ca3af;margin:0">Sharp Plastics MES</p>
        </div>
      </div>`,
    }),
  });

  if (!r.ok) {
    const err = await r.json();
    return res.status(500).json({ error: err });
  }
  return res.status(200).json({ ok: true, url: monitorUrl });
}
