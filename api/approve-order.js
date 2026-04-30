// api/approve-order.js
// Recibe GET ?token=xxx&id=yyy desde el link del email
// Valida token, marca orden como aprobada en Supabase, muestra página de confirmación

const SB_URL = 'https://ozibjgsxyzdbporcarwv.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aWJqZ3N4eXpkYnBvcmNhcnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTc5MjEsImV4cCI6MjA5Mjk3MzkyMX0.mO77vLN92En0fvn1U-FFif43CsCG_QMiVKSclBCL7-M';

function htmlPage(title, emoji, message, color, detail = '') {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#0d0f12;font-family:'Helvetica Neue',Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
  <div style="text-align:center;padding:40px 24px;max-width:400px">
    <div style="font-size:64px;margin-bottom:16px">${emoji}</div>
    <h1 style="color:#fff;font-size:24px;font-weight:700;margin:0 0 10px">${title}</h1>
    <p style="color:#9ca3af;font-size:15px;margin:0 0 8px">${message}</p>
    ${detail ? `<p style="color:#6b7280;font-size:12px;margin:0">${detail}</p>` : ''}
    <div style="margin-top:32px;padding:12px 20px;background:#1f2937;border-radius:8px;display:inline-block">
      <span style="font-size:13px;font-weight:700;color:#f59e0b;letter-spacing:-.3px">MES <span style="color:#fff">//</span> Sharp Plastics</span>
    </div>
  </div>
</body></html>`;
}

export default async function handler(req, res) {
  const { token, id } = req.query;

  if (!token || !id) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(400).send(htmlPage('Link inválido', '❌', 'El link de aprobación no es válido.', '#ef4444'));
  }

  // Obtener la orden de Supabase
  const getRes = await fetch(`${SB_URL}/rest/v1/ordenes_produccion?id=eq.${id}&select=id,op,cliente,aprobacion_token,aprobacion_estado,aprobacion_enviada_at`, {
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
  });

  const rows = await getRes.json();
  if (!rows || !rows.length) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(404).send(htmlPage('Orden no encontrada', '🔍', 'No se encontró la orden de producción.', '#6b7280'));
  }

  const orden = rows[0];

  // Verificar token
  if (orden.aprobacion_token !== token) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(403).send(htmlPage('Token inválido', '🔒', 'El link de aprobación no coincide.', '#ef4444', 'Puede haber expirado o ya fue usado.'));
  }

  // Verificar que no haya expirado (48 horas)
  if (orden.aprobacion_enviada_at) {
    const sent = new Date(orden.aprobacion_enviada_at);
    const now = new Date();
    const hours = (now - sent) / 1000 / 3600;
    if (hours > 48) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(410).send(htmlPage('Link expirado', '⏰', 'Este link de aprobación expiró (48 horas).', '#f59e0b', 'El operador debe enviar una nueva solicitud.'));
    }
  }

  // Ya aprobado anteriormente
  if (orden.aprobacion_estado === 'aprobado') {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(htmlPage('Ya aprobado', '✅', `La orden ${orden.op || id} ya fue aprobada anteriormente.`, '#16a34a', 'La producción ya fue liberada.'));
  }

  // Aprobar — actualizar Supabase
  await fetch(`${SB_URL}/rest/v1/ordenes_produccion?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
    },
    body: JSON.stringify({
      aprobacion_estado: 'aprobado',
      aprobacion_at: new Date().toISOString(),
      // Limpiar token para que no se pueda usar de nuevo
      aprobacion_token: null,
    }),
  });

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(htmlPage(
    '¡Producción aprobada!',
    '✅',
    `La orden ${orden.op || ''} ha sido aprobada.`,
    '#16a34a',
    'El operador ya puede iniciar la producción desde la app.'
  ));
}
