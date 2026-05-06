// api/send-cierre-completo.js
// Recibe un pipeline_id, genera los 4 PDFs internos/cliente del cotizador y de cierre,
// descarga PO y diseño del cliente desde Supabase Storage si existen,
// y manda un email a smartinez + compras con TODO adjunto y links como respaldo.

import {
  pdfClienteCotizador,
  pdfInternoCotizador,
  pdfClienteCierre,
  pdfInternoCierre,
} from './_lib/pdf-generadores.js';

const SB_URL = 'https://ozibjgsxyzdbporcarwv.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aWJqZ3N4eXpkYnBvcmNhcnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTc5MjEsImV4cCI6MjA5Mjk3MzkyMX0.mO77vLN92En0fvn1U-FFif43CsCG_QMiVKSclBCL7-M';
const SB_H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

const DESTINATARIOS = ['smartinez@sharpplastics.com', 'compras@sharpplastics.com'];

// Descarga un archivo desde una URL pública y lo devuelve como base64
async function descargarComoBase64(url, maxBytes = 15 * 1024 * 1024) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.warn('descargarComoBase64: HTTP', r.status, 'para', url);
      return null;
    }
    const ab = await r.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      console.warn('descargarComoBase64: archivo demasiado grande:', ab.byteLength, 'bytes para', url);
      return null;
    }
    return Buffer.from(ab).toString('base64');
  } catch (e) {
    console.warn('descargarComoBase64 fail para', url, '-', e.message);
    return null;
  }
}

function inferFilename(url, fallback) {
  if (!url) return fallback;
  try {
    const u = new URL(url);
    const last = (u.pathname.split('/').pop() || '').split('?')[0];
    if (last && /\.(pdf|jpg|jpeg|png)$/i.test(last)) return decodeURIComponent(last);
  } catch (e) {}
  return fallback;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pipeline_id } = req.body || {};
  if (!pipeline_id) return res.status(400).json({ error: 'Falta pipeline_id' });

  try {
    // 1) Cargar pedido
    const pipeRes = await fetch(`${SB_URL}/rest/v1/pipeline_mf?id=eq.${pipeline_id}&select=*`, { headers: SB_H });
    if (!pipeRes.ok) throw new Error('Error consultando pipeline_mf: ' + pipeRes.status);
    const piperows = await pipeRes.json();
    if (!piperows || !piperows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    const pedido = piperows[0];

    // 2) Cargar orden de producción más reciente (si existe)
    let orden = null;
    const ordRes = await fetch(`${SB_URL}/rest/v1/ordenes_produccion?pipeline_id=eq.${pipeline_id}&order=created_at.desc&limit=1&select=*`, { headers: SB_H });
    if (ordRes.ok) {
      const rows = await ordRes.json();
      orden = rows && rows[0] ? rows[0] : null;
    }

    // 3) Cargar tarifas para PDF interno cotizador
    let tarifas = {};
    const tfRes = await fetch(`${SB_URL}/rest/v1/tarifas_fijas?select=*`, { headers: SB_H });
    if (tfRes.ok) {
      const tfRows = await tfRes.json();
      tfRows.forEach(t => { tarifas[t.clave] = parseFloat(t.valor) || 0; });
    }

    // 4) Generar los 4 PDFs (server-side)
    console.log('[send-cierre-completo] generando PDFs para', pipeline_id);
    const pdf1 = pdfClienteCotizador(pedido);
    const pdf2 = pdfInternoCotizador(pedido, tarifas);
    const pdf3 = pdfClienteCierre(pedido, orden);
    const pdf4 = pdfInternoCierre(pedido, orden);
    console.log('[send-cierre-completo] PDFs OK');

    // 5) Descargar PO y diseño si existen
    const baseFilename = (pedido.po || pedido.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const adjuntos = [
      { filename: `1-Cotizacion-Cliente-${baseFilename}.pdf`, content: pdf1 },
      { filename: `2-Costo-Interno-${baseFilename}.pdf`, content: pdf2 },
      { filename: `3-Aprobacion-Cliente-${baseFilename}.pdf`, content: pdf3 },
      { filename: `4-Reporte-Produccion-Interno-${baseFilename}.pdf`, content: pdf4 },
    ];

    const linksRespaldo = [];
    if (pedido.pdf_po_url) {
      const poB64 = await descargarComoBase64(pedido.pdf_po_url);
      if (poB64) {
        adjuntos.push({
          filename: inferFilename(pedido.pdf_po_url, `5-Orden-Compra-${baseFilename}.pdf`),
          content: poB64,
        });
      }
      linksRespaldo.push({ label: '📋 Orden de compra (PO)', url: pedido.pdf_po_url });
    }
    if (pedido.pdf_diseno_url) {
      const disB64 = await descargarComoBase64(pedido.pdf_diseno_url);
      if (disB64) {
        adjuntos.push({
          filename: inferFilename(pedido.pdf_diseno_url, `6-Diseno-Cliente-${baseFilename}.pdf`),
          content: disB64,
        });
      }
      linksRespaldo.push({ label: '🎨 Diseño del cliente', url: pedido.pdf_diseno_url });
    }
    if (Array.isArray(orden && orden.foto_urls) && orden.foto_urls.length) {
      const verFotosUrl = `https://sharp-plastics-mes-v2.vercel.app/api/ver-fotos?id=${orden.id}`;
      linksRespaldo.push({ label: '📷 Fotos de producción', url: verFotosUrl });
    }

    console.log('[send-cierre-completo] adjuntos totales:', adjuntos.length);

    // 6) Construir HTML del email
    const fmtMoney = n => '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 });
    const piezas = pedido.piezas || 0;
    const buenas = (orden && orden.piezas_buenas) || 0;
    const mermaTotal = (() => {
      if (!orden) return 0;
      const aj = Object.values(orden.merma_ajuste || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      const pr = Object.values(orden.merma_produccion || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      return aj + pr;
    })();
    const total = buenas + mermaTotal;
    const rend = total > 0 ? ((buenas / total) * 100).toFixed(1) : '—';

    const linksHTML = linksRespaldo.map(l =>
      `<a href="${l.url}" style="display:inline-block;background:#f3f4f6;color:#111;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;margin:3px">${l.label}</a>`
    ).join(' ');

    const emailHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="background:#0d0f12;color:#fff;padding:20px 32px">
    <div style="font-size:11px;color:#9ca3af;letter-spacing:.1em;text-transform:uppercase">Sharp Plastics MES</div>
    <div style="font-size:20px;font-weight:700;margin-top:4px">📦 Reporte completo de producción</div>
  </div>

  <div style="padding:20px 32px">
    <div style="font-size:18px;font-weight:700;color:#111;margin-bottom:4px">${pedido.sub_cliente || pedido.cliente || '—'}</div>
    <div style="font-size:13px;color:#6b7280;margin-bottom:14px">PO ${pedido.po || '—'}  ·  Botella ${pedido.capacidad || '—'}ml  ·  ${piezas.toLocaleString()} pzas pedidas</div>

    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:16px">
      <tr style="background:#f9fafb"><td style="padding:8px 12px;font-size:12px;color:#6b7280;width:50%">Piezas buenas</td><td style="padding:8px 12px;font-size:14px;font-weight:700;text-align:right">${buenas.toLocaleString()}</td></tr>
      <tr><td style="padding:8px 12px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">Merma total</td><td style="padding:8px 12px;font-size:14px;font-weight:700;text-align:right;color:#dc2626;border-top:1px solid #e5e7eb">${mermaTotal.toLocaleString()}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px 12px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">Rendimiento</td><td style="padding:8px 12px;font-size:14px;font-weight:700;text-align:right;color:#059669;border-top:1px solid #e5e7eb">${rend}%</td></tr>
      ${pedido.venta_total ? `<tr><td style="padding:8px 12px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">Venta</td><td style="padding:8px 12px;font-size:14px;font-weight:700;text-align:right;border-top:1px solid #e5e7eb">${fmtMoney(pedido.venta_total)}</td></tr>` : ''}
    </table>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-bottom:8px">📎 PDFs adjuntos en este correo (${adjuntos.length})</div>
      <ul style="margin:0;padding-left:20px;font-size:12px;color:#374151;line-height:1.6">
        <li>Cotización del cliente</li>
        <li>Costo interno (cotización)</li>
        <li>Aprobación del cliente (QA)</li>
        <li>Reporte de producción (interno)</li>
        ${pedido.pdf_po_url ? '<li>Orden de compra del cliente</li>' : ''}
        ${pedido.pdf_diseno_url ? '<li>Diseño del cliente</li>' : ''}
      </ul>
    </div>

    ${linksHTML ? `<div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-bottom:8px">🔗 Links de respaldo</div>
      ${linksHTML}
    </div>` : ''}
  </div>

  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:12px 32px;text-align:center">
    <p style="font-size:11px;color:#9ca3af;margin:0">Sharp Plastics MES · Reporte automático generado al cierre de orden</p>
  </div>
</div>
</body></html>`;

    // 7) Mandar email
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'MES Sharp Plastics <onboarding@resend.dev>',
        to: DESTINATARIOS,
        subject: `📦 Reporte completo — ${pedido.po || pedido.id.slice(0,8)} · ${pedido.sub_cliente || pedido.cliente || '—'}${rend !== '—' ? ` · ${rend}% rend` : ''}`,
        html: emailHTML,
        attachments: adjuntos,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.json();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Error enviando email', detail: err });
    }

    console.log('[send-cierre-completo] OK enviado a', DESTINATARIOS.join(', '));
    return res.status(200).json({ ok: true, attachments: adjuntos.length, links: linksRespaldo.length });
  } catch (e) {
    console.error('[send-cierre-completo] error:', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
