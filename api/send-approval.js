const SB_URL = 'https://ozibjgsxyzdbporcarwv.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aWJqZ3N4eXpkYnBvcmNhcnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTc5MjEsImV4cCI6MjA5Mjk3MzkyMX0.mO77vLN92En0fvn1U-FFif43CsCG_QMiVKSclBCL7-M';
const APPROVAL_EMAIL = 'smartinez@sharpplastics.com';
const BASE_URL = 'https://sharp-plastics-mes-v2.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orden_id, orden_op, cliente, sub_cliente, piezas, colores, foto_urls = [], observaciones } = req.body;
  if (!orden_id) return res.status(400).json({ error: 'orden_id requerido' });

  console.log('send-approval: orden_id=', orden_id, 'foto_urls:', foto_urls.length, foto_urls.map(u => u ? 'OK' : 'null'));

  // Token de aprobación
  const token = Buffer.from(`${orden_id}:${Date.now()}:approve`).toString('base64url');
  await fetch(`${SB_URL}/rest/v1/ordenes_produccion?id=eq.${orden_id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
    body: JSON.stringify({ aprobacion_token: token, aprobacion_estado: 'pendiente', aprobacion_enviada_at: new Date().toISOString() }),
  });

  const approveUrl = `${BASE_URL}/api/approve-order?token=${token}&id=${orden_id}`;
  const verFotosUrl = `${BASE_URL}/api/ver-fotos?id=${orden_id}`;
  const fotoLabels = ['Frente', 'Reverso', 'Detalle tinta', 'Vista general'];
  const fotosOk = foto_urls.filter(Boolean);

  const fotosHTML = fotosOk.length > 0
    ? `<div style="padding:0 32px;margin-bottom:24px;text-align:center">
        <a href="${verFotosUrl}" target="_blank" style="display:inline-block;background:#0d0f12;color:#fff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:10px;text-decoration:none">
          📷 Ver ${fotosOk.length} fotos de aprobación
        </a>
        <p style="font-size:11px;color:#9ca3af;margin:8px 0 0">Se abre una página con todas las fotos</p>
      </div>`
    : '';

  const emailHTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#0d0f12;padding:20px 32px">
    <span style="font-size:18px;font-weight:700;color:#fff">MES <span style="color:#f59e0b">//</span> Sharp Plastics</span>
  </div>
  <div style="padding:24px 32px 0">
    <h1 style="margin:0 0 6px;font-size:20px;color:#111">Aprobación de ajuste requerida</h1>
    <p style="margin:0;font-size:14px;color:#6b7280">Una orden está lista y esperando tu aprobación para iniciar producción.</p>
  </div>
  <div style="margin:20px 32px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:4px 0;font-size:12px;color:#6b7280;width:35%">Orden</td><td style="font-size:14px;font-weight:600">${orden_op||'—'}</td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#6b7280">Cliente</td><td style="font-size:14px;font-weight:600">${sub_cliente||cliente||'—'}</td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#6b7280">Piezas</td><td style="font-size:14px;font-weight:600">${(piezas||0).toLocaleString()} pzas</td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#6b7280">Colores</td><td style="font-size:14px;font-weight:600">${colores||'—'}</td></tr>
      ${observaciones?`<tr><td style="padding:4px 0;font-size:12px;color:#6b7280;vertical-align:top">Notas</td><td style="font-size:13px">${observaciones}</td></tr>`:''}
    </table>
  </div>
  ${fotosHTML}
  <div style="padding:24px 32px;text-align:center">
    <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-size:15px;font-weight:700;padding:14px 40px;border-radius:10px;text-decoration:none">✅ Aprobar y liberar producción</a>
    <p style="font-size:11px;color:#9ca3af;margin:12px 0 0">Link de un solo uso · expira en 48 horas</p>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:12px 32px;text-align:center">
    <p style="font-size:11px;color:#9ca3af;margin:0">Sharp Plastics MES · Sistema de ejecución de manufactura</p>
  </div>
</div>
</body></html>`;

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: 'MES Sharp Plastics <onboarding@resend.dev>',
      to: [APPROVAL_EMAIL],
      subject: `⏳ Aprobación requerida — ${orden_op||'Orden'} · ${sub_cliente||cliente||'—'}`,
      html: emailHTML,
    }),
  });

  if (!resendRes.ok) {
    const err = await resendRes.json();
    console.error('Resend error:', err);
    return res.status(500).json({ error: 'Error enviando email', detail: err });
  }

  return res.status(200).json({ ok: true, fotos_subidas: fotosOk.length });
}
