// api/generate-approval-pdf.js
// ═══════════════════════════════════════════════════════════════════════
// Genera un PDF de revisión de aprobación combinando:
//   1) Portada con datos del pedido
//   2) Páginas del diseño del cliente (PDF)
//   3) Fotos de aprobación (1 por página, grande)
//   4) Fotos de validación de color/pantone (1 por página, grande)
//
// El PDF se sube a Storage: pedidos-pdf/{orden_id}/aprobacion-{ts}.pdf
// y devuelve la URL pública.
// ═══════════════════════════════════════════════════════════════════════

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const SB_URL = 'https://ozibjgsxyzdbporcarwv.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aWJqZ3N4eXpkYnBvcmNhcnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTc5MjEsImV4cCI6MjA5Mjk3MzkyMX0.mO77vLN92En0fvn1U-FFif43CsCG_QMiVKSclBCL7-M';

// Fetch con retry (a veces Storage tarda unos ms en responder tras subir foto)
async function fetchBytes(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
    } catch (e) { /* retry */ }
    await new Promise(res => setTimeout(res, 300));
  }
  throw new Error(`No se pudo descargar: ${url}`);
}

// Intenta detectar si un buffer es JPG, PNG, o WEBP. pdf-lib solo soporta JPG y PNG.
function detectImageType(bytes) {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
  return 'unknown';
}

// Agrega una página con la imagen centrada y su label debajo.
// La imagen ocupa hasta el 90% del ancho y 85% del alto, preservando aspecto.
async function agregarPaginaImagen(pdfDoc, imgBytes, label, font) {
  const type = detectImageType(imgBytes);
  let embeddedImg;
  try {
    if (type === 'jpg') embeddedImg = await pdfDoc.embedJpg(imgBytes);
    else if (type === 'png') embeddedImg = await pdfDoc.embedPng(imgBytes);
    else {
      // Intentar como JPG por default; si falla, saltar la foto
      embeddedImg = await pdfDoc.embedJpg(imgBytes);
    }
  } catch (e) {
    console.warn(`No se pudo embedar imagen (${label}):`, e.message);
    return;
  }

  const page = pdfDoc.addPage([612, 792]); // Letter tamaño puntos (8.5×11 in)
  const pageW = 612, pageH = 792;
  const maxW = pageW * 0.90;
  const maxH = pageH * 0.82; // deja espacio abajo para el label
  const scale = Math.min(maxW / embeddedImg.width, maxH / embeddedImg.height);
  const w = embeddedImg.width * scale;
  const h = embeddedImg.height * scale;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2 + 24; // ligeramente arriba del centro para dejar espacio al label

  page.drawImage(embeddedImg, { x, y, width: w, height: h });

  if (label) {
    const fontSize = 14;
    const textW = font.widthOfTextAtSize(label, fontSize);
    page.drawText(label, {
      x: (pageW - textW) / 2,
      y: y - 30,
      size: fontSize,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    orden_id,
    orden_op,
    cliente,
    sub_cliente,
    po,
    piezas,
    colores,
    color_botella,
    color_tapa,
    foto_urls = [],
    foto_color_urls = [],
    diseno_url,
  } = req.body;

  if (!orden_id) return res.status(400).json({ error: 'orden_id requerido' });

  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // ─── PORTADA ────────────────────────────────────────────────────────
    const cover = pdfDoc.addPage([612, 792]);
    cover.drawText('SHARP PLASTICS', { x: 40, y: 750, size: 24, font: fontBold, color: rgb(0.05, 0.06, 0.07) });
    cover.drawText('Revisión de aprobación', { x: 40, y: 720, size: 14, font, color: rgb(0.4, 0.4, 0.4) });
    cover.drawLine({ start: { x: 40, y: 700 }, end: { x: 572, y: 700 }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });

    const rows = [
      ['Orden', orden_op || '—'],
      ['PO', po || '—'],
      ['Cliente', sub_cliente || cliente || '—'],
      ['Piezas', (piezas || 0).toLocaleString() + ' pzas'],
      ['Colores', colores || '—'],
      ['Color botella', color_botella || '—'],
      ['Color tapa', color_tapa || '—'],
      ['Fecha generación', new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })],
    ];
    let yy = 660;
    for (const [k, v] of rows) {
      cover.drawText(k + ':', { x: 40, y: yy, size: 11, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
      cover.drawText(String(v), { x: 160, y: yy, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
      yy -= 22;
    }

    cover.drawText('Contenido de este documento:', { x: 40, y: yy - 20, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    yy -= 40;
    const contenido = [
      '1. Diseño del cliente',
      '2. Fotos de aprobación (Frente, Reverso, Lado izquierdo, Lado derecho)',
      '3. Fotos de validación de color / pantones',
    ];
    for (const line of contenido) {
      cover.drawText('• ' + line, { x: 50, y: yy, size: 11, font, color: rgb(0.25, 0.25, 0.25) });
      yy -= 18;
    }

    cover.drawText('Sharp Plastics MES · Sistema de ejecución de manufactura',
      { x: 40, y: 40, size: 9, font, color: rgb(0.6, 0.6, 0.6) });

    // ─── DISEÑO DEL CLIENTE (PDF) ───────────────────────────────────────
    if (diseno_url) {
      try {
        const disenoBytes = await fetchBytes(diseno_url);
        const disenoPdf = await PDFDocument.load(disenoBytes);
        const disenoPages = await pdfDoc.copyPages(disenoPdf, disenoPdf.getPageIndices());
        for (const p of disenoPages) pdfDoc.addPage(p);
      } catch (e) {
        console.warn('No se pudo cargar PDF de diseño:', e.message);
        // Agregar página de aviso
        const warn = pdfDoc.addPage([612, 792]);
        warn.drawText('Diseño del cliente', { x: 40, y: 700, size: 18, font: fontBold });
        warn.drawText('No se pudo cargar el archivo del diseño.', { x: 40, y: 670, size: 12, font, color: rgb(0.8, 0.2, 0.2) });
        warn.drawText('URL: ' + diseno_url, { x: 40, y: 650, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
      }
    }

    // ─── FOTOS DE APROBACIÓN (1 por página) ─────────────────────────────
    const labelsFotos = ['Frente', 'Reverso', 'Lado izquierdo', 'Lado derecho'];
    for (let i = 0; i < 4; i++) {
      const url = foto_urls[i];
      if (!url) continue;
      try {
        const bytes = await fetchBytes(url);
        await agregarPaginaImagen(pdfDoc, bytes, labelsFotos[i], font);
      } catch (e) {
        console.warn(`Foto aprobación ${i} falló:`, e.message);
      }
    }

    // ─── FOTOS DE PANTONE / COLOR (1 por página) ────────────────────────
    for (let i = 0; i < foto_color_urls.length; i++) {
      const url = foto_color_urls[i];
      if (!url) continue;
      try {
        const bytes = await fetchBytes(url);
        await agregarPaginaImagen(pdfDoc, bytes, `Color ${i + 1}`, font);
      } catch (e) {
        console.warn(`Foto color ${i} falló:`, e.message);
      }
    }

    // ─── SERIALIZAR Y SUBIR A STORAGE ───────────────────────────────────
    const pdfBytes = await pdfDoc.save();
    const timestamp = Date.now();
    // Nombre humanizado con el PO (o orden_op como fallback) para que el
    // usuario reconozca de qué pedido es al descargar. Se sanea para
    // eliminar caracteres inválidos en paths de Storage.
    const identificador = String(po || orden_op || 'sin-po')
      .replace(/[^a-zA-Z0-9\-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60) || 'sin-po';
    const path = `${orden_id}/aprobacion-${identificador}-${timestamp}.pdf`;
    const upUrl = `${SB_URL}/storage/v1/object/pedidos-pdf/${path}`;

    const upRes = await fetch(upUrl, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      },
      body: pdfBytes,
    });

    if (!upRes.ok) {
      const errTxt = await upRes.text();
      console.error('Storage upload error:', errTxt);
      return res.status(500).json({ error: 'Error subiendo PDF a Storage', detail: errTxt });
    }

    const publicUrl = `${SB_URL}/storage/v1/object/public/pedidos-pdf/${path}`;

    // Guardar URL en la orden
    await fetch(`${SB_URL}/rest/v1/ordenes_produccion?id=eq.${orden_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pdf_aprobacion_url: publicUrl }),
    });

    return res.status(200).json({ ok: true, url: publicUrl, path });
  } catch (e) {
    console.error('generate-approval-pdf error:', e);
    return res.status(500).json({ error: e.message });
  }
}
