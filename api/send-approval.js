const SB_URL = 'https://ozibjgsxyzdbporcarwv.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aWJqZ3N4eXpkYnBvcmNhcnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTc5MjEsImV4cCI6MjA5Mjk3MzkyMX0.mO77vLN92En0fvn1U-FFif43CsCG_QMiVKSclBCL7-M';
// Lista de aprobadores autorizados. El correo se envía a todos y cualquiera
// puede aprobar/rechazar. El identificador del que aprueba viaja en el link
// como parámetro `?as=` para poder registrar quién lo aprobó en el checklist.
const APPROVERS = [
  { key: 'samuel', name: 'Samuel Martínez', email: 'smartinez@sharpplastics.com' },
  { key: 'sgc',    name: 'SGC',             email: 'sgc@sharpplastics.com' },
];
const BASE_URL = 'https://sharp-plastics-mes-v2.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    orden_id, orden_op, cliente, sub_cliente, piezas, colores,
    color_botella, color_tapa, po,
    foto_urls = [], foto_color_urls = [], foto_crosshatch_url = null,
    observaciones, diseno_url
  } = req.body;

  if (!orden_id) return res.status(400).json({ error: 'orden_id requerido' });

  console.log('send-approval: orden_id=', orden_id, 'foto_urls:', foto_urls.length, 'foto_color_urls:', foto_color_urls.length, 'crosshatch:', !!foto_crosshatch_url);

  // Token de aprobación + guardar foto_urls
  const token = Buffer.from(`${orden_id}:${Date.now()}:approve`).toString('base64url');
  await fetch(`${SB_URL}/rest/v1/ordenes_produccion?id=eq.${orden_id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
    body: JSON.stringify({
      aprobacion_token: token,
      aprobacion_estado: 'pendiente',
      aprobacion_enviada_at: new Date().toISOString(),
      foto_urls: foto_urls.filter(u => u && typeof u === 'string' && u.startsWith('http')),
      foto_color_urls: foto_color_urls.filter(u => u && typeof u === 'string' && u.startsWith('http')),
      foto_crosshatch_url: (foto_crosshatch_url && typeof foto_crosshatch_url === 'string' && foto_crosshatch_url.startsWith('http')) ? foto_crosshatch_url : null,
    }),
  });

  // Generar PDF de aprobacion combinado. Si falla, seguimos sin PDF.
  let pdfAprobacionUrl = null;
  try {
    const pdfRes = await fetch(`${BASE_URL}/api/generate-approval-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orden_id, orden_op, cliente, sub_cliente, po, piezas, colores,
        color_botella, color_tapa,
        foto_urls: foto_urls.filter(Boolean),
        foto_color_urls: foto_color_urls.filter(Boolean),
        foto_crosshatch_url,
        diseno_url,
      }),
    });
    if (pdfRes.ok) {
      const j = await pdfRes.json();
      pdfAprobacionUrl = j.url;
      console.log('PDF de aprobacion generado:', pdfAprobacionUrl);
    } else {
      console.warn('generate-approval-pdf fallo:', await pdfRes.text());
    }
  } catch (e) {
    console.warn('generate-approval-pdf error:', e.message);
  }

  const pdfBloque = pdfAprobacionUrl ? `
    <div style="padding:0 32px;margin-bottom:20px;text-align:center">
      <a href="${pdfAprobacionUrl}" target="_blank" style="display:inline-block;background:#1e2028;color:#fef3c7;font-size:14px;font-weight:600;padding:12px 32px;border-radius:10px;text-decoration:none">
        📄 Descargar PDF de revisión completo
      </a>
      <p style="font-size:11px;color:#9ca3af;margin:8px 0 0">Incluye diseño del cliente, fotos de aprobación y fotos de pantone (1 por página)</p>
    </div>` : `
    <div style="padding:0 32px;margin-bottom:20px;text-align:center">
      <p style="font-size:12px;color:#dc2626;margin:0">⚠️ No se pudo generar el PDF combinado. Revisa las fotos directamente en el MES.</p>
    </div>`;

  // Enviar un correo INDIVIDUAL a cada aprobador. Cada link lleva `?as=`
  // con el identificador del aprobador. Cuando cualquiera hace click y aprueba,
  // el checklist registra quién fue (revisado_por: {key,name,email}).
  const buildEmailHTML = (aprobador) => {
    const checklistUrl = `${BASE_URL}/?aprobar=${orden_id}&token=${token}&as=${aprobador.key}`;
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#0d0f12;padding:20px 32px">
    <span style="font-size:18px;font-weight:700;color:#fff">MES <span style="color:#f59e0b">//</span> Sharp Plastics</span>
  </div>
  <div style="padding:24px 32px 0">
    <h1 style="margin:0 0 6px;font-size:20px;color:#111">Aprobación de ajuste requerida</h1>
    <p style="margin:0;font-size:14px;color:#6b7280">Hola ${aprobador.name}, descarga el PDF de revisión, revísalo con calma, y luego completa el checklist de aprobación en el sistema.</p>
  </div>
  <div style="margin:20px 32px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:4px 0;font-size:12px;color:#6b7280;width:35%">Orden</td><td style="font-size:14px;font-weight:600">${orden_op||'—'}</td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#6b7280">Cliente</td><td style="font-size:14px;font-weight:600">${sub_cliente||cliente||'—'}</td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#6b7280">PO</td><td style="font-size:14px;font-weight:600">${po||'—'}</td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#6b7280">Piezas</td><td style="font-size:14px;font-weight:600">${(piezas||0).toLocaleString()} pzas</td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#6b7280">Colores</td><td style="font-size:14px;font-weight:600">${colores||'—'}</td></tr>
      ${observaciones?`<tr><td style="padding:4px 0;font-size:12px;color:#6b7280;vertical-align:top">Notas</td><td style="font-size:13px">${observaciones}</td></tr>`:''}
    </table>
  </div>
  ${pdfBloque}
  <div style="padding:12px 32px 24px;text-align:center">
    <a href="${checklistUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-size:15px;font-weight:700;padding:14px 40px;border-radius:10px;text-decoration:none">✅ Checklist de aprobación</a>
    <p style="font-size:11px;color:#9ca3af;margin:12px 0 0">Se abre el sistema con el checklist de 8 puntos.<br>Marca cada uno como Sí/No.<br><span style="color:#6b7280">Tu aprobación quedará registrada como <strong>${aprobador.name}</strong></span></p>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:12px 32px;text-align:center">
    <p style="font-size:11px;color:#9ca3af;margin:0">Sharp Plastics MES · Sistema de ejecución de manufactura</p>
  </div>
</div>
</body></html>`;
  };

  const subject = `⏳ Aprobacion requerida — ${orden_op||'Orden'} · ${sub_cliente||cliente||'—'}`;
  const enviosOK = [];
  const enviosFallidos = [];
  for (const aprobador of APPROVERS) {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'MES Sharp Plastics <onboarding@resend.dev>',
          to: [aprobador.email],
          subject,
          html: buildEmailHTML(aprobador),
        }),
      });
      if (resendRes.ok) {
        enviosOK.push(aprobador.email);
      } else {
        const err = await resendRes.json().catch(() => ({}));
        enviosFallidos.push({ email: aprobador.email, err });
        console.error('Resend error para', aprobador.email, ':', err);
      }
    } catch (e) {
      enviosFallidos.push({ email: aprobador.email, err: e.message });
      console.error('Excepción para', aprobador.email, ':', e);
    }
  }

  if (!enviosOK.length) {
    return res.status(500).json({ error: 'No se pudo enviar a ningún aprobador', detail: enviosFallidos });
  }

  return res.status(200).json({
    ok: true,
    fotos_subidas: foto_urls.filter(Boolean).length,
    pdf_aprobacion_url: pdfAprobacionUrl,
    enviado_a: enviosOK,
    fallidos: enviosFallidos.length ? enviosFallidos : undefined,
  });
}
