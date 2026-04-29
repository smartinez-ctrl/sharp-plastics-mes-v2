import { jsPDF } from 'jspdf';

// Función helper para generar PDF como base64
function generarPDFCliente(p) {
  // p = datos del pedido
  const doc = new jsPDF();
  const W = 210, M = 15;
  let y = 20;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('SHARP PLASTICS S.A. de C.V.', M, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Ote. 10 # 9, Nuevo Parque Industrial, 76806 San Juan del Río, Qro., México', M, y);
  y += 12;

  // Línea separadora
  doc.setDrawColor(200);
  doc.line(M, y, W - M, y);
  y += 8;

  // Título
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('COTIZACIÓN DE PEDIDO', M, y);
  y += 10;

  // Datos del pedido
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(p.cliente || 'MountainFlow', M + 25, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('Sub-cliente:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(p.sub_cliente || '—', M + 25, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('PO #:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(p.po || '—', M + 25, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('Capacidad:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${p.capacidad || '—'}ml`, M + 25, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('Piezas:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${p.piezas || 0}`, M + 25, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('Colores:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${p.colores || 0}`, M + 25, y);
  y += 6;

  if (p.fecha_entrega) {
    doc.setFont('helvetica', 'bold');
    doc.text('Fecha entrega:', M, y);
    doc.setFont('helvetica', 'normal');
    doc.text(p.fecha_entrega, M + 35, y);
    y += 6;
  }

  if (p.direccion_envio) {
    doc.setFont('helvetica', 'bold');
    doc.text('Envío a:', M, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(p.direccion_envio, 130);
    doc.text(lines, M + 20, y);
    y += lines.length * 5;
  }

  if (p.notas) {
    doc.setFont('helvetica', 'bold');
    doc.text('Packaging:', M, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(p.notas, 130);
    doc.text(lines, M + 25, y);
    y += lines.length * 5;
  }

  y += 6;
  doc.setDrawColor(200);
  doc.line(M, y, W - M, y);
  y += 8;

  // Tabla de precios de venta
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DESGLOSE DE PRECIO', M, y);
  y += 8;

  // Encabezado tabla
  doc.setFillColor(40, 40, 40);
  doc.rect(M, y - 4, W - M * 2, 8, 'F');
  doc.setTextColor(255);
  doc.setFontSize(9);
  doc.text('Concepto', M + 2, y);
  doc.text('Cantidad', 100, y);
  doc.text('Precio Unit.', 130, y);
  doc.text('Subtotal', 168, y);
  y += 8;
  doc.setTextColor(0);

  const mxn = (n) => '$' + (parseFloat(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const filas = p.filas_venta || [];
  let total = 0;
  let fill = false;

  filas.forEach(f => {
    if (fill) {
      doc.setFillColor(245, 245, 245);
      doc.rect(M, y - 4, W - M * 2, 7, 'F');
    }
    fill = !fill;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(f.concepto, M + 2, y);
    doc.text(String(f.cantidad), 102, y);
    doc.text(mxn(f.precio_unit), 130, y);
    const sub = (f.cantidad || 0) * (f.precio_unit || 0);
    total += sub;
    doc.text(mxn(sub), 168, y);
    y += 7;
  });

  // Total
  y += 3;
  doc.setFillColor(240, 240, 100);
  doc.rect(M, y - 4, W - M * 2, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL', M + 2, y);
  doc.text(mxn(p.venta_total || total), 163, y);
  y += 14;

  // Precio unitario
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Precio por pieza: ${mxn((p.venta_total || total) / (p.piezas || 1))}`, M, y);
  y += 14;

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Sharp Plastics S.A. de C.V. — Documento generado por MES v2', M, 285);

  return doc.output('datauristring');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { pedido, tipo } = req.body;
    if (!pedido) return res.status(400).json({ error: 'Faltan datos del pedido' });
    // tipo: 'cliente' o 'interno'
    const dataUri = tipo === 'cliente'
      ? generarPDFCliente(pedido)
      : generarPDFCliente(pedido); // por ahora mismo, después diferenciamos
    return res.status(200).json({ pdf: dataUri });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
