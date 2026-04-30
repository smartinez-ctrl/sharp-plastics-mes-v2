// api/send-approval.js
// Recibe: { orden_id, orden_op, cliente, sub_cliente, piezas, colores, fotos: [base64...], observaciones }
// Envía email a smartinez@sharpplastics.com con fotos y botón de aprobación

const SB_URL = 'https://ozibjgsxyzdbporcarwv.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aWJqZ3N4eXpkYnBvcmNhcnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTc5MjEsImV4cCI6MjA5Mjk3MzkyMX0.mO77vLN92En0fvn1U-FFif43CsCG_QMiVKSclBCL7-M';
const APPROVAL_EMAIL = 'smartinez@sharpplastics.com';
const BASE_URL = 'https://sharp-plastics-mes-v2.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orden_id, orden_op, cliente, sub_cliente, piezas, colores, fotos = [], observaciones } = req.body;

  if (!orden_id) return res.status(400).json({ error: 'orden_id requerido' });

  // Generar token de aprobación único
  const token = Buffer.from(`${orden_id}:${Date.now()}:approve`).toString('base64url');

  // Guardar token en Supabase para validar después
  await fetch(`${SB_URL}/rest/v1/ordenes_produccion?id=eq.${orden_id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
    },
    body: JSON.stringify({
      aprobacion_token: token,
      aprobacion_estado: 'pendiente',
      aprobacion_enviada_at: new Date().toISOString(),
    }),
  });

  // Construir HTML del email
  const approveUrl = `${BASE_URL}/api/approve-order?token=${token}&id=${orden_id}`;
  const fotoLabels = ['Frente', 'Reverso', 'Detalle tinta', 'Vista general'];

  const fotosHTML = fotos
    .map((f, i) => f ? `
      <div style="display:inline-block;width:48%;margin:1%;vertical-align:top">
        <img src="${f}" style="width:100%;border-radius:8px;border:1px solid #e5e7eb">
        <p style="font-size:11px;color:#6b7280;text-align:center;margin:4px 0 0">${fotoLabels[i] || `Foto ${i+1}`}</p>
      </div>` : '')
    .join('');

  const emailHTML = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

    <!-- Header -->
    <div style="background:#0d0f12;padding:24px 32px;display:flex;align-items:center">
      <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-.5px">MES <span style="color:#f59e0b">//</span> Sharp Plastics</span>
    </div>

    <!-- Title -->
    <div style="padding:28px 32px 0">
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#111">Aprobación de ajuste requerida</h1>
      <p style="margin:0;font-size:14px;color:#6b7280">Una orden está lista y esperando tu aprobación para iniciar producción.</p>
    </div>

    <!-- Order Info -->
    <div style="margin:24px 32px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:5px 0;font-size:12px;color:#6b7280;width:40%">Orden</td><td style="font-size:14px;font-weight:600;color:#111">${orden_op || '—'}</td></tr>
        <tr><td style="padding:5px 0;font-size:12px;color:#6b7280">Cliente</td><td style="font-size:14px;font-weight:600;color:#111">${sub_cliente || cliente || '—'}</td></tr>
        <tr><td style="padding:5px 0;font-size:12px;color:#6b7280">Piezas</td><td style="font-size:14px;font-weight:600;color:#111">${(piezas||0).toLocaleString()} pzas</td></tr>
        <tr><td style="padding:5px 0;font-size:12px;color:#6b7280">Colores</td><td style="font-size:14px;font-weight:600;color:#111">${colores || '—'}</td></tr>
        ${observaciones ? `<tr><td style="padding:5px 0;font-size:12px;color:#6b7280;vertical-align:top">Observaciones</td><td style="font-size:13px;color:#374151">${observaciones}</td></tr>` : ''}
      </table>
    </div>

    <!-- Fotos -->
    ${fotosHTML ? `
    <div style="padding:0 32px">
      <h2 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 12px;text-transform:uppercase;letter-spacing:.06em">Fotos de aprobación</h2>
      <div>${fotosHTML}</div>
    </div>` : ''}

    <!-- Approve Button -->
    <div style="padding:32px;text-align:center">
      <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-size:16px;font-weight:700;padding:16px 48px;border-radius:10px;text-decoration:none;letter-spacing:-.2px">
        ✅ Aprobar y liberar producción
      </a>
      <p style="font-size:11px;color:#9ca3af;margin:16px 0 0">Este link es de un solo uso y expira en 48 horas.<br>Si no reconoces esta solicitud, ignora este mensaje.</p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center">
      <p style="font-size:11px;color:#9ca3af;margin:0">Sharp Plastics MES · Sistema de ejecución de manufactura</p>
    </div>
  </div>
</body>
</html>`;

  // Enviar con Resend
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'MES Sharp Plastics <onboarding@resend.dev>',
      to: [APPROVAL_EMAIL],
      subject: `⏳ Aprobación requerida — ${orden_op || 'Orden'} · ${sub_cliente || cliente || '—'}`,
      html: emailHTML,
    }),
  });

  if (!resendRes.ok) {
    const err = await resendRes.json();
    console.error('Resend error:', err);
    return res.status(500).json({ error: 'Error enviando email', detail: err });
  }

  return res.status(200).json({ ok: true, message: 'Email enviado a ' + APPROVAL_EMAIL });
}
