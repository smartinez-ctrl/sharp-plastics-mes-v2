// api/ver-fotos.js — página HTML con las fotos de aprobación
const SB_URL = 'https://ozibjgsxyzdbporcarwv.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aWJqZ3N4eXpkYnBvcmNhcnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTc5MjEsImV4cCI6MjA5Mjk3MzkyMX0.mO77vLN92En0fvn1U-FFif43CsCG_QMiVKSclBCL7-M';
const BUCKET = 'fotos-aprobacion';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).send('ID requerido');

  // Obtener datos de la orden
  const ordenRes = await fetch(`${SB_URL}/rest/v1/ordenes_produccion?id=eq.${id}&select=op,cliente,producto,piezas_total`, {
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
  });
  const orden = (await ordenRes.json())[0] || {};

  // Listar fotos del bucket para esta orden
  const listRes = await fetch(`${SB_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: id+'/', limit: 10, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  });

  const files = await listRes.json();
  console.log('Files found:', JSON.stringify(files));
  const fotoLabels = ['Frente', 'Reverso', 'Detalle tinta', 'Vista general'];
  const fotoUrls = Array.isArray(files) && files.length
    ? files.map((f, i) => ({
        url: `${SB_URL}/storage/v1/object/public/${BUCKET}/${id}/${f.name}`,
        label: fotoLabels[i] || `Foto ${i+1}`,
      }))
    : [];

  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fotos de aprobación — ${orden.op || id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Arial, sans-serif; background: #f1f5f9; color: #111; }
    .header { background: #0d0f12; color: #fff; padding: 20px 32px; display: flex; justify-content: space-between; align-items: center; }
    .logo { font-size: 18px; font-weight: 800; }
    .logo span { color: #f59e0b; }
    .meta { font-size: 12px; color: #9ca3af; text-align: right; }
    .meta strong { color: #fff; font-size: 14px; display: block; }
    .container { max-width: 900px; margin: 24px auto; padding: 0 16px; }
    .info-bar { background: #fff; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; display: flex; gap: 32px; }
    .info-item { }
    .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color: #6b7280; margin-bottom: 2px; }
    .info-val { font-size: 14px; font-weight: 700; }
    .fotos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .foto-card { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    .foto-card img { width: 100%; display: block; }
    .foto-label { padding: 10px 14px; font-size: 12px; font-weight: 600; color: #374151; border-top: 1px solid #f1f5f9; }
    .print-btn { display: block; text-align: center; margin: 20px 0; }
    .print-btn button { background: #0d0f12; color: #fff; border: none; border-radius: 8px; padding: 12px 32px; font-size: 14px; font-weight: 600; cursor: pointer; }
    @media print { .print-btn { display: none; } body { background: #fff; } .container { margin: 0; } }
    @media (max-width: 600px) { .fotos-grid { grid-template-columns: 1fr; } .info-bar { flex-wrap: wrap; gap: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">SHARP <span>PLASTICS</span><div style="font-size:11px;color:#6b7280;font-weight:400;margin-top:2px">Fotos de aprobación de ajuste</div></div>
    <div class="meta"><strong>${orden.op || '—'}</strong>${fecha}</div>
  </div>
  <div class="container">
    <div class="info-bar">
      <div class="info-item"><div class="info-label">Cliente</div><div class="info-val">${orden.cliente || '—'}</div></div>
      <div class="info-item"><div class="info-label">Producto</div><div class="info-val">${orden.producto || '—'}</div></div>
      <div class="info-item"><div class="info-label">Piezas</div><div class="info-val">${(orden.piezas_total || 0).toLocaleString()}</div></div>
    </div>
    <div class="fotos-grid">
      ${fotoUrls.map(f => `
        <div class="foto-card">
          <img src="${f.url}" alt="${f.label}">
          <div class="foto-label">${f.label}</div>
        </div>`).join('')}
    </div>
    <div class="print-btn"><button onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button></div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
