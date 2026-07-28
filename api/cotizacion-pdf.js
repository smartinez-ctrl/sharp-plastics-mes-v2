// api/cotizacion-pdf.js
// ═══════════════════════════════════════════════════════════════════════
// Genera 2 tipos de PDF para una cotización guardada en cotizaciones_v2:
//   ?tipo=interno → explosión completa con todos los costos, subtotales, margen
//   ?tipo=cliente → resumen limpio con precio unitario y total, sin costos
//
// Ambos son 1-3 páginas en A4, generados con pdf-lib desde el snapshot
// guardado en inputs_json / resultados_json.
// ═══════════════════════════════════════════════════════════════════════

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const SB_URL = 'https://ozibjgsxyzdbporcarwv.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aWJqZ3N4eXpkYnBvcmNhcnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTc5MjEsImV4cCI6MjA5Mjk3MzkyMX0.mO77vLN92En0fvn1U-FFif43CsCG_QMiVKSclBCL7-M';

// Formato de dinero
const money = n => '$' + (Math.round((n||0)*100)/100).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const int = n => (Math.round(n||0)).toLocaleString('en-US');
const kg = n => (n||0).toFixed(2) + ' kg';

// ─────────────────────────────────────────────────────────────
// Helpers para escribir texto y tablas
// ─────────────────────────────────────────────────────────────
function drawText(page, txt, x, y, opts = {}) {
  const {size = 9, font, color = rgb(0.15, 0.15, 0.15), align = 'left'} = opts;
  const w = font.widthOfTextAtSize(String(txt||''), size);
  let xPos = x;
  if (align === 'right') xPos = x - w;
  else if (align === 'center') xPos = x - w/2;
  page.drawText(String(txt||''), {x: xPos, y, size, font, color});
  return w;
}

function drawLine(page, x1, y1, x2, y2, color = rgb(0.85, 0.85, 0.85), thickness = 0.5) {
  page.drawLine({start: {x: x1, y: y1}, end: {x: x2, y: y2}, thickness, color});
}

function drawRect(page, x, y, w, h, color) {
  page.drawRectangle({x, y, width: w, height: h, color});
}

// ─────────────────────────────────────────────────────────────
// Header común para ambos PDFs
// ─────────────────────────────────────────────────────────────
function drawHeader(page, cot, tipo, fonts) {
  const {W, H} = {W: page.getWidth(), H: page.getHeight()};
  // Banda ámbar
  drawRect(page, 0, H - 60, W, 60, rgb(0.96, 0.65, 0.14));
  drawText(page, 'SHARP PLASTICS', 40, H - 25, {size: 14, font: fonts.bold, color: rgb(0.29, 0.14, 0.03)});
  drawText(page, tipo === 'interno' ? 'COTIZACIÓN — DESGLOSE INTERNO' : 'COTIZACIÓN', 40, H - 42, {size: 10, font: fonts.reg, color: rgb(0.4, 0.2, 0.03)});
  drawText(page, cot.folio || '—', W - 40, H - 25, {size: 12, font: fonts.bold, color: rgb(0.29, 0.14, 0.03), align: 'right'});
  const fechaHoy = new Date().toLocaleDateString('es-MX', {day: '2-digit', month: 'long', year: 'numeric'});
  drawText(page, fechaHoy, W - 40, H - 42, {size: 9, font: fonts.reg, color: rgb(0.4, 0.2, 0.03), align: 'right'});
}

// ─────────────────────────────────────────────────────────────
// Bloque de datos del pedido (arriba)
// ─────────────────────────────────────────────────────────────
function drawDatosPedido(page, cot, fonts, yStart) {
  const {W} = {W: page.getWidth()};
  let y = yStart;
  drawText(page, 'DATOS DEL PEDIDO', 40, y, {size: 8, font: fonts.bold, color: rgb(0.45, 0.45, 0.45)});
  y -= 14;
  const inputs = cot.inputs_json || {};
  const rows = [
    ['Cliente', cot.cliente || '—'],
    ['Sub-cliente', cot.sub_cliente || '—'],
    ['Producto', cot.producto || '—'],
    ['Piezas', int(cot.piezas)],
    ['Colores', String(cot.colores || 0)],
    ['Fecha de entrega estimada', cot.fecha_entrega_estimada || '—'],
  ];
  rows.forEach(([k, v]) => {
    drawText(page, k, 40, y, {size: 9, font: fonts.reg, color: rgb(0.5, 0.5, 0.5)});
    drawText(page, v, 210, y, {size: 9, font: fonts.bold});
    y -= 12;
  });
  return y - 8;
}

// ─────────────────────────────────────────────────────────────
// Tabla genérica: encabezados + rows
// ─────────────────────────────────────────────────────────────
function drawTable(page, title, headers, rows, x, y, cols, fonts) {
  const W = page.getWidth();
  // Título de sección
  drawRect(page, x, y - 4, W - 2*x, 16, rgb(0.96, 0.96, 0.96));
  drawText(page, title, x + 6, y + 2, {size: 8, font: fonts.bold, color: rgb(0.29, 0.29, 0.29)});
  y -= 18;
  // Headers
  drawRect(page, x, y - 4, W - 2*x, 14, rgb(0.98, 0.98, 0.98));
  headers.forEach((h, i) => {
    const xh = cols[i];
    drawText(page, h, xh.x, y + 2, {size: 7.5, font: fonts.bold, color: rgb(0.4, 0.4, 0.4), align: xh.align || 'left'});
  });
  y -= 14;
  drawLine(page, x, y, W - x, y);
  // Rows
  rows.forEach(r => {
    y -= 12;
    r.forEach((val, i) => {
      const xh = cols[i];
      const opts = {size: 8, font: fonts.reg, align: xh.align || 'left'};
      if (i === r.length - 1 && (typeof val === 'string' && val.startsWith('$'))) opts.font = fonts.bold;
      drawText(page, val, xh.x, y, opts);
    });
    drawLine(page, x, y - 4, W - x, y - 4, rgb(0.94, 0.94, 0.94));
  });
  return y - 8;
}

// ─────────────────────────────────────────────────────────────
// PDF INTERNO — explosión completa
// ─────────────────────────────────────────────────────────────
async function buildPDFInterno(cot, doc, fonts) {
  const inputs = cot.inputs_json || {};
  const res = cot.resultados_json || {};
  let page = doc.addPage([595, 842]);  // A4
  const W = page.getWidth();

  drawHeader(page, cot, 'interno', fonts);
  let y = page.getHeight() - 80;

  y = drawDatosPedido(page, cot, fonts, y);

  // Bloque grande de resumen
  drawRect(page, 40, y - 60, W - 80, 56, rgb(0.98, 0.94, 0.85));
  drawText(page, 'COSTO TOTAL', 50, y - 18, {size: 8, font: fonts.bold, color: rgb(0.55, 0.35, 0.03)});
  drawText(page, money(res.costo_total), 50, y - 36, {size: 18, font: fonts.bold, color: rgb(0.55, 0.35, 0.03)});
  drawText(page, 'Costo por pieza: ' + money(res.costo_unitario), 50, y - 52, {size: 9, font: fonts.reg, color: rgb(0.4, 0.2, 0.03)});

  drawText(page, 'PRECIO AL CLIENTE', W - 250, y - 18, {size: 8, font: fonts.bold, color: rgb(0.55, 0.35, 0.03)});
  drawText(page, money(res.precio_total), W - 250, y - 36, {size: 18, font: fonts.bold, color: rgb(0.55, 0.35, 0.03)});
  drawText(page, `Utilidad: ${money(res.utilidad)}   ·   Margen: ${(res.margen_pct||0).toFixed(1)}%`, W - 250, y - 52, {size: 9, font: fonts.reg, color: rgb(0.4, 0.2, 0.03)});

  y -= 76;

  // Tabla 1 — Materiales del cliente (sin costo, referencia)
  const mc = inputs.materiales_cliente || {};
  const rowsMC = [
    ['Resina botella', kg(mc.botella?.kg_total), int(mc.botella?.pzas), '(cliente aporta)'],
    ['Resina tapa', kg(mc.tapa?.kg_total), int(mc.tapa?.pzas), '(cliente aporta)'],
    ['Chupones', '—', int(mc.chupon?.pzas), '(cliente aporta)'],
    ['Liners', '—', int(mc.liner?.pzas), '(cliente aporta)'],
    ['Cajas empaque', '—', int(mc.cajas?.total) + ' cajas', '(cliente aporta)'],
  ];
  const colsMC = [
    {x: 46, align: 'left'},
    {x: 260, align: 'right'},
    {x: 380, align: 'right'},
    {x: W - 46, align: 'right'},
  ];
  y = drawTable(page, '1 · MATERIALES QUE APORTA EL CLIENTE', ['Componente', 'Kg totales', 'Piezas', ''], rowsMC, 40, y, colsMC, fonts);

  // Tabla 2 — Master batch
  const mb = inputs.master_batch || {};
  const rowsMB = [
    ['Botella', `${mb.botella?.pct||0}%`, kg(mb.botella?.kg), money(mb.botella?.precio_kg), money(mb.botella?.costo)],
    ['Tapa', `${mb.tapa?.pct||0}%`, kg(mb.tapa?.kg), money(mb.tapa?.precio_kg), money(mb.tapa?.costo)],
    ['Subtotal', '', '', '', money(res.subtotales?.master_batch)],
  ];
  const colsMB = [
    {x: 46, align: 'left'},
    {x: 220, align: 'right'},
    {x: 310, align: 'right'},
    {x: 410, align: 'right'},
    {x: W - 46, align: 'right'},
  ];
  y = drawTable(page, '2 · MASTER BATCH (SHARP APORTA)', ['Aplica a', '% peso', 'Kg de MB', '$/kg', 'Costo'], rowsMB, 40, y, colsMB, fonts);

  // Tabla 3 — Fabricación
  const fab = inputs.fabricacion || {};
  const rowsFab = [
    ['Soplado botella', money(fab.botella?.precio_pza), int(fab.botella?.pzas), money(fab.botella?.costo)],
    ['Inyección tapa', money(fab.tapa?.precio_pza), int(fab.tapa?.pzas), money(fab.tapa?.costo)],
    ['Subtotal', '', '', money(res.subtotales?.fabricacion)],
  ];
  const colsFab = [
    {x: 46, align: 'left'},
    {x: 260, align: 'right'},
    {x: 380, align: 'right'},
    {x: W - 46, align: 'right'},
  ];
  y = drawTable(page, '3 · FABRICACIÓN', ['Concepto', '$/pza', 'Piezas', 'Costo'], rowsFab, 40, y, colsFab, fonts);

  // Nueva página si queda poco espacio
  if (y < 200) {
    page = doc.addPage([595, 842]);
    drawHeader(page, cot, 'interno', fonts);
    y = page.getHeight() - 80;
  }

  // Tabla 4 — Tintas
  const tintas = inputs.tintas || [];
  const rowsTin = tintas.map(t => {
    const kgBase = (t.g_pza * (cot.piezas || 0) / (1 - Math.min(0.99, (t.merma||0)/100))) / 1000;
    const costoBase = kgBase * (t.precio_kg||0);
    const rows = [[
      t.nombre || 'Color',
      (t.g_pza||0).toFixed(2) + 'g',
      `${t.merma||0}%`,
      money(t.precio_kg),
      kg(kgBase),
      money(costoBase),
    ]];
    (t.aditivos||[]).forEach(a => {
      const gr = (t.g_pza * (a.pct||0) / 100) * (cot.piezas || 0);
      const kgAdit = gr / (1 - Math.min(0.99, (a.merma||0)/100)) / 1000;
      const costoAdit = kgAdit * (a.precio_kg||0);
      rows.push([
        '  ↳ ' + (a.nombre || 'Aditivo'),
        (a.pct||0).toFixed(1) + '%',
        `${a.merma||0}%`,
        money(a.precio_kg),
        kg(kgAdit),
        money(costoAdit),
      ]);
    });
    return rows;
  }).flat();
  rowsTin.push(['Subtotal', '', '', '', '', money(res.subtotales?.tintas)]);
  const colsTin = [
    {x: 46, align: 'left'},
    {x: 220, align: 'right'},
    {x: 290, align: 'right'},
    {x: 360, align: 'right'},
    {x: 440, align: 'right'},
    {x: W - 46, align: 'right'},
  ];
  y = drawTable(page, '4 · TINTAS + ADITIVOS', ['Color / componente', 'g/pza o %', 'Merma', '$/kg', 'Kg total', 'Costo'], rowsTin, 40, y, colsTin, fonts);

  // Tabla 5 — Pantallas y positivos
  const rowsPP = [
    ['Pantallas', String(inputs.pantallas?.num||0), money(inputs.pantallas?.precio_unitario), money(inputs.pantallas?.costo)],
    ['Positivos', String(inputs.positivos?.num||0), money(inputs.positivos?.precio_unitario), money(inputs.positivos?.costo)],
    ['Subtotal', '', '', money(res.subtotales?.pantallas_positivos)],
  ];
  y = drawTable(page, '5 · PANTALLAS Y POSITIVOS', ['Concepto', 'Cantidad', '$/unidad', 'Costo'], rowsPP, 40, y, colsFab, fonts);

  // Nueva página si queda poco espacio
  if (y < 200) {
    page = doc.addPage([595, 842]);
    drawHeader(page, cot, 'interno', fonts);
    y = page.getHeight() - 80;
  }

  // Tabla 6 — MO impresión + Empaque
  const rowsMOEMP = [
    ['MO impresión', money(inputs.mo_impresion?.precio_pza_por_tinta) + ' × ' + (inputs.mo_impresion?.tintas||0) + ' tintas × ' + int(inputs.mo_impresion?.pzas) + ' pzas', money(res.subtotales?.mo_impresion)],
    ['Empaque (papel + tag)', money(inputs.empaque?.precio_pza) + ' × ' + int(inputs.empaque?.pzas) + ' pzas', money(res.subtotales?.empaque)],
  ];
  const colsMOEMP = [
    {x: 46, align: 'left'},
    {x: 250, align: 'left'},
    {x: W - 46, align: 'right'},
  ];
  y = drawTable(page, '6 · MANO DE OBRA + EMPAQUE', ['Concepto', 'Fórmula', 'Costo'], rowsMOEMP, 40, y, colsMOEMP, fonts);

  // Tabla 7 — Tiempos estimados
  const tp = inputs.tiempos || {};
  const rowsTp = [
    ['Soplado botella', (tp.botella_seg||0).toFixed(1) + ' s', (tp.botella_h||0).toFixed(1) + ' h'],
    ['Inyección tapa', (tp.tapa_seg||0).toFixed(1) + ' s', (tp.tapa_h||0).toFixed(1) + ' h'],
    ['Impresión', (tp.impresion_seg||0).toFixed(1) + ' s', (tp.impresion_h||0).toFixed(1) + ' h'],
    ['TOTAL', '', (tp.total_h||0).toFixed(1) + ' h · ' + (tp.total_dias||0) + ' días'],
  ];
  const colsTp = [
    {x: 46, align: 'left'},
    {x: 300, align: 'right'},
    {x: W - 46, align: 'right'},
  ];
  y = drawTable(page, '7 · TIEMPOS ESTIMADOS', ['Operación', 'Seg/pza', 'Horas'], rowsTp, 40, y, colsTp, fonts);

  // Footer
  drawText(page, 'Documento interno — no compartir con el cliente', W/2, 30, {size: 7, font: fonts.reg, color: rgb(0.55, 0.55, 0.55), align: 'center'});
}

// ─────────────────────────────────────────────────────────────
// PDF CLIENTE — resumen limpio con solo precio
// ─────────────────────────────────────────────────────────────
async function buildPDFCliente(cot, doc, fonts) {
  const page = doc.addPage([595, 842]);
  const W = page.getWidth();
  const H = page.getHeight();

  drawHeader(page, cot, 'cliente', fonts);
  let y = H - 90;

  // Título grande "Cotización"
  drawText(page, 'Cotización', 40, y, {size: 22, font: fonts.bold});
  y -= 30;

  // Datos del pedido en 2 columnas
  const inputs = cot.inputs_json || {};
  const res = cot.resultados_json || {};

  const pairs = [
    ['Cliente', cot.cliente || '—'],
    ['Producto', cot.producto || '—'],
    ['Sub-cliente', cot.sub_cliente || '—'],
    ['Piezas', int(cot.piezas)],
    ['Colores', String(cot.colores || 0)],
    ['Entrega estimada', cot.fecha_entrega_estimada || '—'],
  ];
  const colX = [40, 300];
  for (let i = 0; i < pairs.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const [k, v] = pairs[i];
    const yy = y - row * 32;
    drawText(page, k.toUpperCase(), colX[col], yy, {size: 7, font: fonts.bold, color: rgb(0.5, 0.5, 0.5)});
    drawText(page, v, colX[col], yy - 12, {size: 11, font: fonts.reg});
  }
  y -= 32 * Math.ceil(pairs.length / 2) + 8;

  // Colores usados
  const tintas = inputs.tintas || [];
  if (tintas.length) {
    drawText(page, 'COLORES DE IMPRESIÓN', 40, y, {size: 7, font: fonts.bold, color: rgb(0.5, 0.5, 0.5)});
    y -= 14;
    tintas.forEach(t => {
      drawText(page, '· ' + (t.nombre || 'Color'), 46, y, {size: 10, font: fonts.reg});
      y -= 12;
    });
    y -= 4;
  }

  // Precio grande
  drawLine(page, 40, y, W - 40, y);
  y -= 24;
  drawRect(page, 40, y - 90, W - 80, 100, rgb(0.98, 0.94, 0.85));
  drawText(page, 'PRECIO UNITARIO', 60, y - 16, {size: 9, font: fonts.bold, color: rgb(0.55, 0.35, 0.03)});
  drawText(page, money(inputs.precio_unitario_cliente), 60, y - 45, {size: 26, font: fonts.bold, color: rgb(0.29, 0.14, 0.03)});
  drawText(page, 'por pieza · MXN', 60, y - 62, {size: 9, font: fonts.reg, color: rgb(0.4, 0.2, 0.03)});

  drawText(page, 'PRECIO TOTAL', W - 250, y - 16, {size: 9, font: fonts.bold, color: rgb(0.55, 0.35, 0.03)});
  drawText(page, money(res.precio_total), W - 250, y - 45, {size: 26, font: fonts.bold, color: rgb(0.29, 0.14, 0.03)});
  drawText(page, `${int(cot.piezas)} piezas · MXN`, W - 250, y - 62, {size: 9, font: fonts.reg, color: rgb(0.4, 0.2, 0.03)});

  y -= 110;

  // Notas: materiales que aporta el cliente
  const mc = inputs.materiales_cliente || {};
  drawText(page, 'MATERIALES QUE EL CLIENTE APORTA', 40, y, {size: 8, font: fonts.bold, color: rgb(0.5, 0.5, 0.5)});
  y -= 14;
  const lineas = [
    `· ${kg(mc.botella?.kg_total)} de resina para botella (${int(mc.botella?.pzas)} pzas)`,
    `· ${kg(mc.tapa?.kg_total)} de resina para tapa (${int(mc.tapa?.pzas)} pzas)`,
    `· ${int(mc.chupon?.pzas)} chupones`,
    `· ${int(mc.liner?.pzas)} liners`,
    `· ${int(mc.cajas?.total)} cajas de empaque`,
  ];
  lineas.forEach(l => { drawText(page, l, 46, y, {size: 9, font: fonts.reg}); y -= 12; });

  y -= 14;
  drawText(page, 'CONDICIONES', 40, y, {size: 8, font: fonts.bold, color: rgb(0.5, 0.5, 0.5)});
  y -= 14;
  const condiciones = [
    '· Cotización válida por 15 días naturales a partir de la fecha de emisión.',
    '· Precios en pesos mexicanos (MXN), sin IVA incluido.',
    '· Tiempo de entrega estimado sujeto a disponibilidad de materiales.',
    '· La fecha de entrega comienza a partir de la aprobación del arte y recepción de materiales.',
  ];
  condiciones.forEach(l => { drawText(page, l, 46, y, {size: 9, font: fonts.reg}); y -= 12; });

  // Footer
  drawText(page, 'Sharp Plastics — San Juan del Río, Querétaro', W/2, 40, {size: 8, font: fonts.reg, color: rgb(0.55, 0.55, 0.55), align: 'center'});
}

// ─────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const {id, tipo = 'interno'} = req.query;
  if (!id) return res.status(400).json({error: 'falta parámetro id'});
  if (!['interno', 'cliente'].includes(tipo)) return res.status(400).json({error: "tipo debe ser 'interno' o 'cliente'"});

  try {
    // Traer cotización
    const r = await fetch(SB_URL + '/rest/v1/cotizaciones_v2?id=eq.' + encodeURIComponent(id), {
      headers: {'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY},
    });
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return res.status(404).json({error: 'cotización no encontrada'});
    const cot = rows[0];

    // Construir PDF
    const doc = await PDFDocument.create();
    const fonts = {
      reg: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
    };

    if (tipo === 'interno') await buildPDFInterno(cot, doc, fonts);
    else await buildPDFCliente(cot, doc, fonts);

    const pdfBytes = await doc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cot.folio}-${tipo}.pdf"`);
    res.status(200).send(Buffer.from(pdfBytes));
  } catch(e) {
    console.error('Error generando PDF cotización:', e);
    res.status(500).json({error: e.message});
  }
}
