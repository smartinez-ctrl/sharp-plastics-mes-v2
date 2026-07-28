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
// Función buildPDFInterno completamente reescrita
async function buildPDFInterno(cot, doc, fonts) {
  const inputs = cot.inputs_json || {};
  const res = cot.resultados_json || {};
  const st = res.subtotales || {};
  let page = doc.addPage([595, 842]);  // A4
  const W = page.getWidth();

  drawHeader(page, cot, 'interno', fonts);
  let y = page.getHeight() - 80;

  y = drawDatosPedido(page, cot, fonts, y);

  // Bloque grande de resumen
  drawRect(page, 40, y - 68, W - 80, 64, rgb(0.98, 0.94, 0.85));
  drawText(page, 'COSTO', 50, y - 18, {size: 8, font: fonts.bold, color: rgb(0.55, 0.35, 0.03)});
  drawText(page, money(res.costo_total), 50, y - 36, {size: 15, font: fonts.bold, color: rgb(0.55, 0.35, 0.03)});
  drawText(page, 'Costo/pza: ' + money(res.costo_unitario), 50, y - 54, {size: 8, font: fonts.reg, color: rgb(0.4, 0.2, 0.03)});

  drawText(page, 'VENTA', 210, y - 18, {size: 8, font: fonts.bold, color: rgb(0.05, 0.45, 0.15)});
  drawText(page, money(res.venta_total), 210, y - 36, {size: 15, font: fonts.bold, color: rgb(0.05, 0.45, 0.15)});
  drawText(page, 'Precio/pza: ' + money(res.precio_unitario), 210, y - 54, {size: 8, font: fonts.reg, color: rgb(0.05, 0.45, 0.15)});

  drawText(page, 'UTILIDAD', 380, y - 18, {size: 8, font: fonts.bold, color: rgb(0.05, 0.45, 0.15)});
  drawText(page, money(res.utilidad), 380, y - 36, {size: 15, font: fonts.bold, color: rgb(0.05, 0.45, 0.15)});
  drawText(page, `Margen: ${(res.margen_pct||0).toFixed(1)}%`, 380, y - 54, {size: 8, font: fonts.reg, color: rgb(0.05, 0.45, 0.15)});

  y -= 84;

  // Materiales del cliente (referencia sin costo)
  const mc = inputs.materiales_cliente || {};
  const rowsMC = [
    ['Resina botella', kg(mc.botella?.kg_total), int(mc.botella?.pzas)],
    ['Resina tapa', kg(mc.tapa?.kg_total), int(mc.tapa?.pzas)],
    ['Chupones', '—', int(mc.chupon?.pzas)],
    ['Liners', '—', int(mc.liner?.pzas)],
    ['Cajas empaque', '—', int(mc.cajas?.total) + ' cajas'],
  ];
  const colsMC = [
    {x: 46, align: 'left'},
    {x: 300, align: 'right'},
    {x: W - 46, align: 'right'},
  ];
  y = drawTable(page, '1 · MATERIALES QUE APORTA EL CLIENTE (referencia, sin costo)', ['Componente', 'Kg totales', 'Piezas'], rowsMC, 40, y, colsMC, fonts);

  // Fabricación
  const fab = inputs.fabricacion || {};
  const rowsFab = [
    ['Soplado botella', money(fab.botella?.precio_pza), int(fab.botella?.pzas), money(fab.botella?.costo), money(fab.botella?.venta_pza), money(fab.botella?.venta), money(fab.botella?.utilidad)],
    ['Inyección tapa', money(fab.tapa?.precio_pza), int(fab.tapa?.pzas), money(fab.tapa?.costo), money(fab.tapa?.venta_pza), money(fab.tapa?.venta), money(fab.tapa?.utilidad)],
    ['Subtotal', '', '', money(st.fabricacion?.costo), '', money(st.fabricacion?.venta), money(st.fabricacion?.utilidad)],
  ];
  const cols7 = [
    {x: 46, align: 'left'},
    {x: 180, align: 'right'},
    {x: 245, align: 'right'},
    {x: 315, align: 'right'},
    {x: 390, align: 'right'},
    {x: 470, align: 'right'},
    {x: W - 46, align: 'right'},
  ];
  y = drawTable(page, '2 · FABRICACIÓN', ['Concepto', '$ costo/pza', 'Piezas', 'Costo', '$ venta/pza', 'Venta', 'Utilidad'], rowsFab, 40, y, cols7, fonts);

  if (y < 220) { page = doc.addPage([595, 842]); drawHeader(page, cot, 'interno', fonts); y = page.getHeight() - 80; }

  // Tintas
  const tintas = inputs.tintas || [];
  const rowsTin = [];
  tintas.forEach(t => {
    const grTotal = (t.g_pza || 0) * (cot.piezas || 0);
    const kgTotal = grTotal / 1000;
    let costoColor = 0;
    rowsTin.push([t.nombre || 'Color', (t.g_pza || 0).toFixed(2) + ' g/pza', kg(kgTotal), '', '', '', money(t.venta || 0)]);
    (t.componentes || []).forEach(c => {
      const kgComp = kgTotal * ((c.pct || 0) / 100);
      const kgConMerma = kgComp / (1 - Math.min(0.99, (c.merma || 0) / 100));
      const costoComp = kgConMerma * (c.precio_kg || 0);
      costoColor += costoComp;
      rowsTin.push(['  · ' + (c.nombre || 'Tinta'), (c.pct || 0).toFixed(1) + '%', kg(kgConMerma), money(c.precio_kg), '', money(costoComp), '']);
    });
    (t.aditivos || []).forEach(a => {
      const kgAdit = kgTotal * ((a.pct || 0) / 100);
      const kgAditMerma = kgAdit / (1 - Math.min(0.99, (a.merma || 0) / 100));
      const costoAdit = kgAditMerma * (a.precio_kg || 0);
      costoColor += costoAdit;
      rowsTin.push(['  ↳ ' + (a.nombre || 'Aditivo'), (a.pct || 0).toFixed(1) + '%', kg(kgAditMerma), money(a.precio_kg), '', money(costoAdit), '']);
    });
    // Fila de utilidad del color
    rowsTin.push([`  → utilidad ${t.nombre}`, '', '', '', money(costoColor), '', money((t.venta || 0) - costoColor)]);
  });
  rowsTin.push(['Subtotal tintas', '', '', '', money(st.tintas?.costo), money(st.tintas?.venta), money(st.tintas?.utilidad)]);
  const colsTin = [
    {x: 46, align: 'left'},
    {x: 180, align: 'right'},
    {x: 245, align: 'right'},
    {x: 315, align: 'right'},
    {x: 390, align: 'right'},
    {x: 470, align: 'right'},
    {x: W - 46, align: 'right'},
  ];
  y = drawTable(page, '3 · TINTAS (componentes + aditivos)', ['Color / componente', '% o g/pza', 'Kg', '$/kg', 'Costo', 'Costo/venta', 'Utilidad'], rowsTin, 40, y, colsTin, fonts);

  if (y < 200) { page = doc.addPage([595, 842]); drawHeader(page, cot, 'interno', fonts); y = page.getHeight() - 80; }

  // Pantallas + positivos
  const rowsPP = [
    ['Pantallas', String(inputs.pantallas?.num||0), money(inputs.pantallas?.precio_unitario), money(inputs.pantallas?.costo), money(inputs.pantallas?.venta_unitario), money(inputs.pantallas?.venta), money(inputs.pantallas?.utilidad)],
    ['Positivos', String(inputs.positivos?.num||0), money(inputs.positivos?.precio_unitario), money(inputs.positivos?.costo), money(inputs.positivos?.venta_unitario), money(inputs.positivos?.venta), money(inputs.positivos?.utilidad)],
    ['Subtotal', '', '', money(st.pantallas_positivos?.costo), '', money(st.pantallas_positivos?.venta), money(st.pantallas_positivos?.utilidad)],
  ];
  y = drawTable(page, '4 · PANTALLAS Y POSITIVOS', ['Concepto', 'Cant.', '$ costo/u', 'Costo', '$ venta/u', 'Venta', 'Utilidad'], rowsPP, 40, y, cols7, fonts);

  // MO impresión + Empaque
  const rowsMOEMP = [
    ['MO impresión', money(inputs.mo_impresion?.precio_pza_por_tinta) + '/pza·tinta', String((inputs.mo_impresion?.tintas||0)) + ' × ' + int(inputs.mo_impresion?.pzas), money(st.mo_impresion?.costo), money(inputs.mo_impresion?.venta_pza_por_tinta) + '/pza·tinta', money(st.mo_impresion?.venta), money(st.mo_impresion?.utilidad)],
    ['Empaque (papel+tag)', money(inputs.empaque?.precio_pza) + '/pza', int(inputs.empaque?.pzas) + ' pzas', money(st.empaque?.costo), money(inputs.empaque?.venta_pza) + '/pza', money(st.empaque?.venta), money(st.empaque?.utilidad)],
  ];
  y = drawTable(page, '5 · MANO DE OBRA + EMPAQUE', ['Concepto', '$ costo', 'Cantidad', 'Costo', '$ venta', 'Venta', 'Utilidad'], rowsMOEMP, 40, y, cols7, fonts);

  // Tiempos (paralelo)
  const tp = inputs.tiempos || {};
  const rowsTp = [
    ['Soplado botella', (tp.botella_seg||0).toFixed(1) + ' s', (tp.botella_h||0).toFixed(1) + ' h'],
    ['Inyección tapa', (tp.tapa_seg||0).toFixed(1) + ' s', (tp.tapa_h||0).toFixed(1) + ' h'],
    ['Impresión', (tp.impresion_seg||0).toFixed(1) + ' s', (tp.impresion_h||0).toFixed(1) + ' h'],
    ['MÁX (paralelo)', '', (tp.total_h||0).toFixed(1) + ' h · ' + (tp.total_dias||0) + ' días'],
  ];
  const colsTp = [
    {x: 46, align: 'left'},
    {x: 300, align: 'right'},
    {x: W - 46, align: 'right'},
  ];
  y = drawTable(page, '6 · TIEMPOS (procesos en paralelo)', ['Operación', 'Seg/pza', 'Horas'], rowsTp, 40, y, colsTp, fonts);

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
  let y = H - 100;

  const inputs = cot.inputs_json || {};
  const res = cot.resultados_json || {};
  const piezas = cot.piezas || 0;

  // Título grande con nombre del producto/proyecto
  const proyecto = cot.producto || cot.sub_cliente || 'Cotización';
  drawText(page, proyecto, 40, y, {size: 22, font: fonts.bold});
  y -= 28;

  // Datos del pedido en 2 columnas compactas
  const pairs = [
    ['Cliente', cot.cliente || '—'],
    ['Sub-cliente', cot.sub_cliente || '—'],
    ['Piezas', int(piezas)],
    ['Colores', String(cot.colores || 0)],
    ['Fecha entrega estimada', cot.fecha_entrega_estimada || '—'],
    ['Folio', cot.folio || '—'],
  ];
  const colX = [40, 300];
  for (let i = 0; i < pairs.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const [k, v] = pairs[i];
    const yy = y - row * 28;
    drawText(page, k.toUpperCase(), colX[col], yy, {size: 7, font: fonts.bold, color: rgb(0.5, 0.5, 0.5)});
    drawText(page, v, colX[col], yy - 11, {size: 10.5, font: fonts.reg});
  }
  y -= 28 * Math.ceil(pairs.length / 2) + 16;

  // ── Tabla de desglose (formato imagen) ──────────────────────────────
  // Conceptos: Cap, Bottle, Inks (por color), Screens, Positives, Printing, Packing
  // Cada uno con precio unitario × cantidad = total

  const fab = inputs.fabricacion || {};
  const tintas = inputs.tintas || [];
  const st = res.subtotales || {};

  // Construir filas del desglose
  const lineas = [];

  // Tapa (Cap)
  if ((fab.tapa?.venta || 0) > 0) {
    lineas.push({
      concepto: 'Cap',
      unitario: fab.tapa.venta_pza || 0,
      cantidad: fab.tapa.pzas || 0,
      total: fab.tapa.venta || 0,
    });
  }

  // Botella (Bottle)
  if ((fab.botella?.venta || 0) > 0) {
    lineas.push({
      concepto: 'Bottle',
      unitario: fab.botella.venta_pza || 0,
      cantidad: fab.botella.pzas || 0,
      total: fab.botella.venta || 0,
    });
  }

  // Tintas (Inks) — una línea por color o consolidada
  // Para el cliente, mejor consolidar: precio_unit = suma_venta / piezas
  const tintasVentaTotal = tintas.reduce((s, t) => s + (t.venta || 0), 0);
  if (tintasVentaTotal > 0 && piezas > 0) {
    lineas.push({
      concepto: 'Inks',
      unitario: tintasVentaTotal / piezas,
      cantidad: piezas,
      total: tintasVentaTotal,
    });
  }

  // Screens (pantallas)
  const pant = inputs.pantallas || {};
  if ((pant.venta || 0) > 0) {
    lineas.push({
      concepto: 'Screens',
      unitario: pant.venta_unitario || 0,
      cantidad: pant.num || 0,
      total: pant.venta || 0,
    });
  }

  // Positives (positivos)
  const pos = inputs.positivos || {};
  if ((pos.venta || 0) > 0) {
    lineas.push({
      concepto: 'Positives',
      unitario: pos.venta_unitario || 0,
      cantidad: pos.num || 0,
      total: pos.venta || 0,
    });
  }

  // Printing (MO impresión) — precio_unit = venta / piezas (independiente del # de colores)
  const mo = inputs.mo_impresion || {};
  if ((mo.venta || 0) > 0 && piezas > 0) {
    lineas.push({
      concepto: 'Printing',
      unitario: mo.venta / piezas,
      cantidad: piezas,
      total: mo.venta || 0,
    });
  }

  // Packing (empaque)
  const emp = inputs.empaque || {};
  if ((emp.venta || 0) > 0) {
    lineas.push({
      concepto: 'Packing',
      unitario: emp.venta_pza || 0,
      cantidad: emp.pzas || 0,
      total: emp.venta || 0,
    });
  }

  // Dibujar tabla estilo imagen (fondo blanco, líneas suaves)
  const tblX = 40;
  const tblW = W - 80;
  const rowH = 22;
  const colConcepto = tblX + 12;
  const colUnitario = tblX + 220;
  const colCantidad = tblX + 340;
  const colTotal    = tblX + tblW - 12;

  // Header
  drawRect(page, tblX, y - rowH + 4, tblW, rowH, rgb(0.15, 0.15, 0.15));
  drawText(page, 'CONCEPTO', colConcepto, y - 10, {size: 9, font: fonts.bold, color: rgb(1, 1, 1)});
  drawText(page, 'PRECIO UNITARIO', colUnitario, y - 10, {size: 9, font: fonts.bold, color: rgb(1, 1, 1), align: 'right'});
  drawText(page, 'CANTIDAD', colCantidad, y - 10, {size: 9, font: fonts.bold, color: rgb(1, 1, 1), align: 'right'});
  drawText(page, 'TOTAL', colTotal, y - 10, {size: 9, font: fonts.bold, color: rgb(1, 1, 1), align: 'right'});
  y -= rowH;

  // Filas
  lineas.forEach((l, idx) => {
    // Fondo alternado sutil
    if (idx % 2 === 1) {
      drawRect(page, tblX, y - rowH + 4, tblW, rowH, rgb(0.97, 0.97, 0.97));
    }
    drawText(page, l.concepto, colConcepto, y - 10, {size: 10.5, font: fonts.reg});
    drawText(page, money(l.unitario), colUnitario, y - 10, {size: 10.5, font: fonts.reg, align: 'right'});
    drawText(page, int(l.cantidad), colCantidad, y - 10, {size: 10.5, font: fonts.reg, align: 'right'});
    drawText(page, money(l.total), colTotal, y - 10, {size: 10.5, font: fonts.bold, align: 'right'});
    drawLine(page, tblX, y - rowH + 4, tblX + tblW, y - rowH + 4, rgb(0.85, 0.85, 0.85));
    y -= rowH;
  });

  // Total grande al final
  const totalCalculado = lineas.reduce((s, l) => s + l.total, 0);
  const totalFinal = res.venta_total || totalCalculado;

  y -= 8;
  drawLine(page, tblX, y + 8, tblX + tblW, y + 8, rgb(0.15, 0.15, 0.15), 1);
  drawRect(page, tblX, y - rowH - 4, tblW, rowH + 8, rgb(0.98, 0.94, 0.85));
  drawText(page, 'TOTAL', colConcepto, y - 12, {size: 12, font: fonts.bold, color: rgb(0.29, 0.14, 0.03)});
  drawText(page, `${int(piezas)} pzas · $${(totalFinal/Math.max(1,piezas)).toFixed(2)} / pza`, colUnitario, y - 12, {size: 10, font: fonts.reg, color: rgb(0.4, 0.2, 0.03), align: 'right'});
  drawText(page, money(totalFinal), colTotal, y - 12, {size: 14, font: fonts.bold, color: rgb(0.29, 0.14, 0.03), align: 'right'});
  y -= rowH + 12;

  // Si hay override manual (precio ajustado), mostrar nota discreta
  if (res.precio_override != null && Math.abs(res.venta_total - totalCalculado) > 0.5) {
    y -= 4;
    const dif = res.venta_total - totalCalculado;
    drawText(page, `Ajuste aplicado: ${dif >= 0 ? '+' : ''}${money(dif)}`, colTotal, y, {size: 8, font: fonts.reg, color: rgb(0.55, 0.55, 0.55), align: 'right'});
    y -= 12;
  }

  // Footer discreto
  drawText(page, 'Sharp Plastics — San Juan del Río, Querétaro', W/2, 40, {size: 8, font: fonts.reg, color: rgb(0.55, 0.55, 0.55), align: 'center'});
  drawText(page, cot.folio || '', W/2, 28, {size: 7, font: fonts.reg, color: rgb(0.7, 0.7, 0.7), align: 'center'});
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
