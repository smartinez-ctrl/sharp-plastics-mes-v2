// api/_lib/pdf-generadores.js
// 4 generadores de PDF server-side usando jsPDF.
// Cada función toma `pedido` (registro de pipeline_mf) y opcionalmente `orden` (ordenes_produccion).
// Devuelve un Buffer (base64-decoded) listo para adjuntar.

import { jsPDF } from 'jspdf';

const mxn = n => '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 });
const fmtFecha = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX') : '—';
const fmtSeg = s => {
  s = parseInt(s) || 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};

// Convierte el output del PDF a Buffer Base64 para attachment de Resend
function pdfToBase64(doc) {
  // jsPDF.output('arraybuffer') devuelve ArrayBuffer; lo convertimos a Buffer y luego base64
  const ab = doc.output('arraybuffer');
  return Buffer.from(ab).toString('base64');
}

// ═══════════════════════════════════════════════════════════════
// 1) PDF CLIENTE COTIZADOR — la cotización con precios de venta
// ═══════════════════════════════════════════════════════════════
export function pdfClienteCotizador(p) {
  const doc = new jsPDF();
  const W = 210, M = 15;
  let y = 20;

  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('SHARP PLASTICS S.A. de C.V.', M, y); y += 7;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text('Ote. 10 # 9, Nuevo Parque Industrial, 76806 San Juan del Río, Qro., México', M, y); y += 12;
  doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 8;

  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
  doc.text('COTIZACIÓN DE PEDIDO', M, y); y += 10;

  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Cliente: ${p.sub_cliente || p.cliente || '—'}`, M, y); y += 6;
  doc.text(`PO: ${p.po || '—'}`, M, y);
  doc.text(`Fecha: ${fmtFecha(p.fecha_pedido)}`, M + 100, y); y += 6;
  doc.text(`Producto: Botella ${p.capacidad || '—'}ml`, M, y); y += 6;
  doc.text(`Cantidad: ${(p.piezas || 0).toLocaleString()} pzas`, M, y);
  doc.text(`Colores: ${p.colores || 0}`, M + 100, y); y += 8;

  if (p.color_botella || p.color_tapa || p.color_boquilla) {
    doc.text(`Botella: ${p.color_botella || '—'}  ·  Tapa: ${p.color_tapa || '—'}  ·  Chupón: ${p.color_boquilla || '—'}`, M, y);
    y += 8;
  }

  // Tintas
  if (Array.isArray(p.tintas_info) && p.tintas_info.length) {
    const tintas = p.tintas_info.map(t => {
      const n = (t && typeof t.nombre === 'string') ? t.nombre : '';
      const pa = (t && typeof t.pantone === 'string') ? t.pantone : '';
      return n && pa ? `${n} (${pa})` : (n || pa || '');
    }).filter(Boolean).join(' · ');
    doc.text(`Tintas: ${tintas}`, M, y); y += 8;
  }

  y += 4;
  doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 8;

  // Tabla de costos cliente (si vienen)
  if (Array.isArray(p.cotizacion_filas) && p.cotizacion_filas.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('CONCEPTO', M, y); doc.text('CANT', 100, y); doc.text('UNIT', 130, y); doc.text('SUBTOTAL', 168, y);
    y += 5;
    doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 5;
    doc.setFont('helvetica', 'normal');

    let total = 0;
    p.cotizacion_filas.forEach(f => {
      doc.text(String(f.concepto || '—').substring(0, 40), M, y);
      doc.text(String(f.cantidad || 0), 105, y);
      doc.text(mxn(f.precio_unit), 130, y);
      const sub = (f.cantidad || 0) * (f.precio_unit || 0);
      total += sub;
      doc.text(mxn(sub), 168, y);
      y += 7;
    });

    y += 3;
    doc.setFillColor(240, 240, 100);
    doc.rect(M, y - 4, W - M * 2, 9, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('TOTAL', M + 2, y);
    doc.text(mxn(p.venta_total || total), 163, y);
    y += 14;
  } else if (p.venta_total) {
    doc.setFillColor(240, 240, 100);
    doc.rect(M, y - 4, W - M * 2, 9, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('TOTAL', M + 2, y);
    doc.text(mxn(p.venta_total), 163, y);
    y += 14;
  }

  if (p.venta_total && p.piezas) {
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Precio por pieza: ${mxn(p.venta_total / p.piezas)}`, M, y);
    y += 10;
  }

  doc.setFontSize(8); doc.setTextColor(150);
  doc.text('Sharp Plastics S.A. de C.V. — Cotización generada por MES v2', M, 285);

  return pdfToBase64(doc);
}

// ═══════════════════════════════════════════════════════════════
// 2) PDF INTERNO COTIZADOR — costos internos del pipe
// ═══════════════════════════════════════════════════════════════
export function pdfInternoCotizador(p, tarifas) {
  const doc = new jsPDF();
  const W = 210, M = 15;
  let y = 20;

  const piezas = p.piezas || 0;
  const cap = p.capacidad || 0;
  const colores = p.colores || 0;
  const tf = tarifas || {};
  const costBot = cap === 500 ? (tf.costo_botella_500ml || 2.96)
    : cap === 700 ? (tf.costo_botella_700ml || 3.22)
    : (tf.costo_botella_600ml || 2.77);
  const costTap = tf.costo_tapa || 3.37;
  const costPant = tf.costo_pantalla || 356.52;
  const costPos = tf.costo_positivo || 115;
  const tfP = tf.papel_empaque_por_pieza || 0.15;
  const tfT = tf.tag_etiqueta_por_pieza || 0.15;

  // Costo de tintas estimado
  let costoTintas = 0;
  (p.formula_tintas || []).forEach(col => {
    const tgComp = (col.componentes || []).reduce((s, x) => s + (parseFloat(x.gramos) || 0), 0);
    (col.componentes || []).forEach(x => {
      const pk = parseFloat(x.precio_kg || x.precio) || 0;
      costoTintas += ((parseFloat(x.gramos) || 0) / 1000) * pk;
    });
    (col.aditivos || []).forEach(a => {
      const pk = parseFloat(a.precio_kg || a.precio) || 0;
      const pct = parseFloat(a.pct) || 0;
      const gr = pct > 0 ? (pct / 100 * tgComp) : (parseFloat(a.gramos) || 0);
      costoTintas += (gr / 1000) * pk;
    });
  });

  const moHoras = p.mo_horas || 0;
  const moTarifa = p.mo_tarifa || 70;
  const costoMO = moHoras * moTarifa;

  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
  doc.text('COSTO INTERNO — REPORTE PRODUCCIÓN', M, y); y += 7;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text(`${p.sub_cliente || p.cliente || '—'}  ·  PO ${p.po || '—'}  ·  ${piezas.toLocaleString()} pzas ${cap}ml  ·  ${colores} colores`, M, y); y += 8;
  doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 8;

  // Tabla
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
  doc.text('CONCEPTO', M, y); doc.text('CANT', 105, y); doc.text('UNIT', 135, y); doc.text('SUBTOTAL', 168, y);
  y += 4; doc.setDrawColor(220); doc.line(M, y, W - M, y); y += 5;
  doc.setFont('helvetica', 'normal');

  const filas = [
    ['Botellas ' + cap + 'ml', piezas, costBot, piezas * costBot],
    ['Tapas', piezas, costTap, piezas * costTap],
    ['Tintas e insumos (estimado)', 1, costoTintas, costoTintas],
    [`Pantallas (${colores}× ${mxn(costPant)})`, colores, costPant, colores * costPant],
    [`Positivos (${colores}× ${mxn(costPos)})`, colores, costPos, colores * costPos],
    ['Empaque', piezas, tfP + tfT, piezas * (tfP + tfT)],
  ];

  // Merma si existe
  const mermaQty = parseFloat(p.merma_bot_qty) || 0;
  const mermaUnit = parseFloat(p.merma_bot_unit) || costBot;
  if (mermaQty > 0) filas.push(['Merma botellas (ajuste+prod)', mermaQty, mermaUnit, mermaQty * mermaUnit, true]);
  const mermaTinta = parseFloat(p.merma_tin_unit) || 0;
  if (mermaTinta > 0) filas.push(['Merma tintas (sobrantes)', 1, mermaTinta, mermaTinta, true]);

  filas.push([`Mano de obra (${moHoras}h × ${mxn(moTarifa)})`, 1, costoMO, costoMO]);

  let total = 0;
  filas.forEach(([c, q, u, s, esMerma]) => {
    if (esMerma) {
      doc.setFillColor(254, 226, 226);
      doc.rect(M, y - 4, W - M * 2, 7, 'F');
    }
    doc.text(String(c).substring(0, 40), M, y);
    doc.text(String(q), 105, y);
    doc.text(mxn(u), 135, y);
    doc.text(mxn(s), 168, y);
    total += s;
    y += 7;
    if (y > 270) { doc.addPage(); y = 20; }
  });

  y += 3;
  doc.setFillColor(254, 242, 242); doc.rect(M, y - 4, W - M * 2, 9, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('TOTAL COSTO INTERNO', M + 2, y);
  doc.text(mxn(total), 163, y);
  y += 12;

  if (p.venta_total) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const margen = ((p.venta_total - total) / p.venta_total) * 100;
    doc.text(`Venta: ${mxn(p.venta_total)}  ·  Utilidad: ${mxn(p.venta_total - total)}  ·  Margen: ${margen.toFixed(1)}%`, M, y);
    y += 8;
  }

  // Fórmula de tintas (con gramos preparados si hay orden)
  doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('FÓRMULA DE TINTAS', M, y); y += 7;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');

  (p.formula_tintas || []).forEach((col, ci) => {
    if (y > 260) { doc.addPage(); y = 20; }
    const ti = (p.tintas_info || [])[ci] || {};
    doc.setFont('helvetica', 'bold');
    doc.text(`${ti.nombre || col.nombre || 'Color ' + (ci + 1)}${ti.pantone ? ' · ' + ti.pantone : ''}`, M, y);
    y += 5;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    (col.componentes || []).forEach(x => {
      if (y > 275) { doc.addPage(); y = 20; }
      const pk = parseFloat(x.precio_kg || x.precio) || 0;
      const sub = ((parseFloat(x.gramos) || 0) / 1000) * pk;
      doc.text(`  ${(x.nombre || '').substring(0, 35)}`, M, y);
      doc.text(`${x.gramos || 0}g`, 110, y);
      doc.text(mxn(pk), 140, y);
      doc.text(mxn(sub), 175, y);
      y += 4.5;
    });
    (col.aditivos || []).forEach(a => {
      if (y > 275) { doc.addPage(); y = 20; }
      const pk = parseFloat(a.precio_kg || a.precio) || 0;
      const tgComp = (col.componentes || []).reduce((s, x) => s + (parseFloat(x.gramos) || 0), 0);
      const pct = parseFloat(a.pct) || 0;
      const gr = pct > 0 ? (pct / 100 * tgComp) : (parseFloat(a.gramos) || 0);
      const sub = (gr / 1000) * pk;
      doc.text(`  ↳ ${(a.nombre || 'Aditivo').substring(0, 30)}${pct ? ' (' + pct + '%)' : ''}`, M, y);
      doc.text(`${gr.toFixed(2).replace(/\.?0+$/, '')}g`, 110, y);
      doc.text(mxn(pk), 140, y);
      doc.text(mxn(sub), 175, y);
      y += 4.5;
    });
    doc.setTextColor(0);
    y += 2;
  });

  doc.setFontSize(8); doc.setTextColor(150);
  doc.text('Sharp Plastics S.A. de C.V. — Reporte interno generado por MES v2', M, 290);

  return pdfToBase64(doc);
}

// ═══════════════════════════════════════════════════════════════
// 3) PDF CLIENTE CIERRE — resumen de aprobación de QA
// ═══════════════════════════════════════════════════════════════
export function pdfClienteCierre(p, orden) {
  const doc = new jsPDF();
  const W = 210, M = 15;
  let y = 20;

  doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
  doc.text('SHARP PLASTICS S.A. de C.V.', M, y); y += 7;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text('Reporte de Aprobación de Calidad', M, y); y += 12;
  doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 10;

  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
  doc.text('ORDEN APROBADA', M, y); y += 10;

  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Cliente: ${p.sub_cliente || p.cliente || '—'}`, M, y); y += 6;
  doc.text(`PO: ${p.po || '—'}`, M, y);
  doc.text(`Fecha: ${fmtFecha(new Date().toISOString().split('T')[0])}`, M + 100, y); y += 6;
  doc.text(`Producto: Botella ${p.capacidad || '—'}ml`, M, y); y += 6;
  doc.text(`Piezas pedidas: ${(p.piezas || 0).toLocaleString()}`, M, y);
  doc.text(`Piezas buenas: ${((orden && orden.piezas_buenas) || 0).toLocaleString()}`, M + 100, y); y += 8;

  // QA
  if (orden) {
    y += 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('PRUEBAS DE CALIDAD', M, y); y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`Crosshatch: ${orden.crosshatch || '—'}`, M, y); y += 6;
    doc.text(`Prueba de agua: ${orden.prueba_agua || '—'}`, M, y); y += 8;
  }

  if (orden && orden.observaciones) {
    doc.setFont('helvetica', 'bold');
    doc.text('Observaciones:', M, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    const lineas = doc.splitTextToSize(String(orden.observaciones).substring(0, 500), W - M * 2);
    doc.text(lineas, M, y);
    y += lineas.length * 5 + 4;
    doc.setTextColor(0);
  }

  // Firma
  y += 8;
  doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 8;
  doc.setFontSize(10);
  doc.text('Firma de aprobación:', M, y); y += 12;
  doc.line(M, y, M + 80, y); y += 5;
  doc.setFontSize(9); doc.setTextColor(100);
  doc.text(orden && orden.firma ? orden.firma : 'Pendiente de firma', M, y);

  doc.setFontSize(8); doc.setTextColor(150);
  doc.text('Sharp Plastics S.A. de C.V. — Reporte de QA generado por MES v2', M, 285);

  return pdfToBase64(doc);
}

// ═══════════════════════════════════════════════════════════════
// 4) PDF INTERNO CIERRE — reporte de producción con tiempos, consumo, merma
// ═══════════════════════════════════════════════════════════════
export function pdfInternoCierre(p, orden) {
  const doc = new jsPDF();
  const W = 210, M = 15;
  let y = 20;

  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
  doc.text('REPORTE DE PRODUCCIÓN — INTERNO', M, y); y += 7;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text(`${p.sub_cliente || p.cliente || '—'}  ·  PO ${p.po || '—'}`, M, y); y += 5;
  doc.text(`${(p.piezas || 0).toLocaleString()} pzas pedidas  ·  ${p.capacidad || '—'}ml  ·  ${p.colores || 0} colores`, M, y); y += 8;
  doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 8;

  if (!orden) {
    doc.setFontSize(11); doc.setTextColor(180, 30, 30);
    doc.text('⚠ No hay datos de producción capturados aún.', M, y);
    return pdfToBase64(doc);
  }

  // Tiempos
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0);
  doc.text('TIEMPOS', M, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Ajuste: ${fmtSeg(orden.tiempo_ajuste_seg)}`, M, y);
  doc.text(`Producción: ${fmtSeg(orden.tiempo_produccion_seg)}`, M + 70, y); y += 6;
  doc.text(`Total: ${fmtSeg((orden.tiempo_ajuste_seg || 0) + (orden.tiempo_produccion_seg || 0))}`, M, y);
  if (orden.reajustes) doc.text(`Reajustes: ${orden.reajustes}`, M + 70, y);
  y += 8;

  // Producción
  const buenas = orden.piezas_buenas || 0;
  const mermaTotal = (() => {
    const aj = Object.values(orden.merma_ajuste || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const pr = Object.values(orden.merma_produccion || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    return aj + pr;
  })();
  const total = buenas + mermaTotal;
  const rend = total > 0 ? ((buenas / total) * 100).toFixed(1) : '—';

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('PRODUCCIÓN', M, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Buenas: ${buenas.toLocaleString()}  ·  Merma: ${mermaTotal.toLocaleString()}  ·  Rendimiento: ${rend}%`, M, y); y += 8;

  // Merma detallada
  const mermaAj = orden.merma_ajuste || {};
  const mermaPr = orden.merma_produccion || {};
  const allKeys = new Set([...Object.keys(mermaAj), ...Object.keys(mermaPr)]);
  if (allKeys.size) {
    doc.setFont('helvetica', 'bold'); doc.text('Detalle merma:', M, y); y += 5;
    doc.setFont('helvetica', 'normal');
    Array.from(allKeys).forEach(k => {
      const aj = parseFloat(mermaAj[k]) || 0;
      const pr = parseFloat(mermaPr[k]) || 0;
      if (aj > 0 || pr > 0) {
        doc.text(`  ${k}:  ajuste ${aj}  +  prod ${pr}  =  ${aj + pr}`, M, y);
        y += 5;
        if (y > 270) { doc.addPage(); y = 20; }
      }
    });
    y += 4;
  }

  // Consumo real de tintas
  const consumo = orden.consumo_real_tintas || [];
  if (consumo.length) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('CONSUMO REAL DE TINTAS', M, y); y += 6;
    doc.setFontSize(9);
    doc.text('Color', M, y); doc.text('Preparado', 75, y); doc.text('Sobrante', 110, y); doc.text('Consumido', 140, y); doc.text('Merma', 175, y); y += 5;
    doc.setFont('helvetica', 'normal');
    consumo.forEach((cr, i) => {
      const ti = (p.tintas_info || [])[i] || {};
      const nom = ti.nombre || ti.pantone || `Color ${i + 1}`;
      const prep = parseFloat(cr.gramos_usados) || 0;
      const sobr = parseFloat(cr.gramos_sobrante) || 0;
      const cons = prep - sobr;
      doc.text(nom.substring(0, 25), M, y);
      doc.text(`${prep}g`, 75, y);
      doc.text(`${sobr}g`, 110, y);
      doc.text(`${cons.toFixed(1)}g`, 140, y);
      doc.text(`${sobr}g`, 175, y);
      y += 4.5;
      if (y > 275) { doc.addPage(); y = 20; }
    });
    y += 4;
  }

  // Tiempos muertos
  const tm = orden.tiempos_muertos || {};
  const tmKeys = Object.keys(tm).filter(k => parseInt(tm[k]) > 0);
  if (tmKeys.length) {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('TIEMPOS MUERTOS', M, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    tmKeys.forEach(k => {
      doc.text(`  ${k}: ${tm[k]} min`, M, y); y += 5;
    });
    y += 4;
  }

  // Personal
  if (orden.ajustadores || orden.operadores) {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('PERSONAL', M, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    if (Array.isArray(orden.ajustadores)) doc.text(`Ajustadores: ${orden.ajustadores.join(', ')}`, M, y), y += 5;
    if (Array.isArray(orden.operadores)) doc.text(`Operadores: ${orden.operadores.join(', ')}`, M, y), y += 5;
  }

  // Fotos URL como referencia
  if (Array.isArray(orden.foto_urls) && orden.foto_urls.length) {
    y += 4;
    doc.setFontSize(8); doc.setTextColor(80);
    doc.text(`📷 ${orden.foto_urls.length} foto(s) de producción disponibles en el portal MES.`, M, y);
  }

  doc.setFontSize(8); doc.setTextColor(150);
  doc.text('Sharp Plastics S.A. de C.V. — Reporte interno generado por MES v2', M, 290);

  return pdfToBase64(doc);
}
