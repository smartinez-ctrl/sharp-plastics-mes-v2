// api/monitor.js — Monitor en tiempo real usando pipeline_id
const SB_URL = 'https://ozibjgsxyzdbporcarwv.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aWJqZ3N4eXpkYnBvcmNhcnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTc5MjEsImV4cCI6MjA5Mjk3MzkyMX0.mO77vLN92En0fvn1U-FFif43CsCG_QMiVKSclBCL7-M';

function fmt(s) {
  s = Math.floor(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return [h, m, ss].map(x => String(x).padStart(2, '0')).join(':');
}

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).send('ID requerido');

  const sbH = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

  // Buscar orden de producción con este pipeline_id
  const r1 = await fetch(SB_URL + '/rest/v1/ordenes_produccion?pipeline_id=eq.' + id + '&order=created_at.desc&limit=1&select=*', { headers: sbH });
  const ordenes = await r1.json();
  const orden = ordenes && ordenes[0] ? ordenes[0] : null;

  // Buscar datos del pipeline
  const r2 = await fetch(SB_URL + '/rest/v1/pipeline_mf?id=eq.' + id + '&select=*', { headers: sbH });
  const pipes = await r2.json();
  const pipe = pipes && pipes[0] ? pipes[0] : null;

  if (!pipe && !orden) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(404).send('<html><body style="background:#0d0f12;color:#fff;font-family:Arial;text-align:center;padding:60px">Orden no encontrada</body></html>');
  }

  // Datos unificados
  const pzas = orden ? (orden.piezas_total || 0) : (pipe ? (pipe.piezas || 0) : 0);
  const cliente = orden ? (orden.cliente || '—') : (pipe ? (pipe.sub_cliente || pipe.cliente || '—') : '—');
  const op = orden ? (orden.op || '—') : (pipe ? (pipe.po || '—') : '—');
  const producto = orden ? (orden.producto || '—') : (pipe ? (pipe.capacidad ? pipe.capacidad + 'ml' : '—') : '—');
  const maquina = orden ? (orden.maquina || '') : '';
  const colores = orden ? (orden.colores || []) : (pipe ? (pipe.tintas_info || []) : []);
  const buenas = orden ? (orden.piezas_buenas || 0) : 0;
  const mermaPr = orden ? (orden.merma_produccion || {}) : {};
  const totalMerma = Object.values(mermaPr).reduce((s, v) => s + (v || 0), 0);
  const totalMermaM = Object.values(mermaPr).reduce((s,v)=>s+(v||0),0);
  const avance = (buenas + totalMermaM) > 0 ? ((buenas / (buenas + totalMermaM)) * 100).toFixed(1) : 0;
  const tProd = orden ? (orden.tiempo_produccion_seg || 0) : 0;
  const tAj = orden ? (orden.tiempo_ajuste_seg || 0) : 0;
  const estado = orden ? (orden.estado || 'ajuste') : 'ajuste';
  const done = estado === 'completado';
  const enProd = estado === 'produccion';
  const ts = new Date().toLocaleTimeString('es-MX');

  const statusColor = done ? '#6b7280' : enProd ? '#22c55e' : '#f59e0b';
  const statusText = done ? 'Completado' : enProd ? 'En producción' : 'En ajuste';

  const coloresHTML = colores.map(c =>
    '<span style="display:inline-block;background:#1e2028;border-radius:16px;padding:3px 10px;font-size:11px;margin:2px">🎨 ' +
    (c.nombre || c.pantone || '') + (c.pantone && c.nombre ? ' · ' + c.pantone : '') + '</span>'
  ).join('');

  const mermaRows = Object.entries(mermaPr).filter(([, v]) => v > 0).map(([k, v]) =>
    '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1e2028;font-size:12px">' +
    '<span>' + k + '</span><span style="color:#ef4444;font-family:monospace;font-weight:600">' + v + '</span></div>'
  ).join('');

  const CSS = [
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{background:#0d0f12;color:#fff;font-family:Arial,sans-serif;min-height:100vh}',
    '.hdr{background:#111318;border-bottom:1px solid #1e2028;padding:12px 20px;display:flex;justify-content:space-between;align-items:center}',
    '.wrap{max-width:560px;margin:0 auto;padding:16px}',
    '.card{background:#111318;border:1px solid #1e2028;border-radius:12px;padding:14px 18px;margin-bottom:12px}',
    '.mono{font-family:"Space Mono",monospace}',
    '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}',
    '.stat{background:#111318;border:1px solid #1e2028;border-radius:12px;padding:14px;text-align:center}',
    '.prog-wrap{background:#1e2028;border-radius:999px;height:8px;overflow:hidden;margin-bottom:12px}',
    '.prog-fill{height:100%;background:linear-gradient(90deg,#22c55e,#16a34a)}',
    '.prog-label{display:flex;justify-content:space-between;font-size:10px;color:#6b7280;margin-bottom:4px}',
    '.ts{font-size:9px;color:#374151;text-align:center;padding:8px}',
  ].join('');

  let body = '';

  // Banner completado
  if (done) {
    body += '<div style="background:#14532d;border:1px solid #16a34a;border-radius:10px;padding:12px;text-align:center;margin-bottom:12px">' +
      '<div style="font-size:22px;margin-bottom:4px">✅</div>' +
      '<div style="font-weight:700;color:#22c55e">Completado — ' + buenas.toLocaleString() + ' pzas · ' + avance + '%</div>' +
      '</div>';
  }

  // Banner ajuste
  if (!orden) {
    body += '<div style="background:#1c1a0a;border:1px solid #f59e0b55;border-radius:10px;padding:10px;text-align:center;margin-bottom:12px;color:#f59e0b;font-size:12px">⚙️ Ajuste en proceso — producción no ha iniciado</div>';
  }

  // Info del pedido
  body += '<div class="card">' +
    '<div style="font-size:17px;font-weight:700;margin-bottom:3px">' + cliente + ' — ' + producto + '</div>' +
    '<div style="font-size:11px;color:#6b7280;margin-bottom:' + (coloresHTML ? '8px' : '0') + '">' +
    op + ' · ' + pzas.toLocaleString() + ' pzas' + (maquina ? ' · ' + maquina : '') + '</div>' +
    (coloresHTML ? '<div>' + coloresHTML + '</div>' : '') +
    '</div>';

  // Cronómetro
  if (orden && !done) {
    body += '<div class="card" style="text-align:center">' +
      '<div style="font-size:10px;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em">⏱ Producción</div>' +
      '<div class="mono" style="font-size:44px;font-weight:700;color:#22c55e">' + fmt(tProd) + '</div>' +
      '</div>';
  } else if (done) {
    body += '<div class="grid2">' +
      '<div class="stat"><div class="mono" style="font-size:20px;font-weight:700;color:#f59e0b;margin-bottom:3px">' + fmt(tAj) + '</div>' +
      '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">Ajuste</div></div>' +
      '<div class="stat"><div class="mono" style="font-size:20px;font-weight:700;color:#22c55e;margin-bottom:3px">' + fmt(tProd) + '</div>' +
      '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">Producción</div></div>' +
      '</div>';
  }

  // Stats piezas
  if (orden) {
    body += '<div class="grid2">' +
      '<div class="stat"><div class="mono" style="font-size:30px;font-weight:700;color:#22c55e;margin-bottom:3px">' + buenas.toLocaleString() + '</div>' +
      '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">Piezas buenas</div></div>' +
      '<div class="stat"><div class="mono" style="font-size:30px;font-weight:700;color:#ef4444;margin-bottom:3px">' + totalMerma + '</div>' +
      '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">Merma</div></div>' +
      '</div>' +
      '<div class="prog-label"><span>' + buenas.toLocaleString() + ' de ' + pzas.toLocaleString() + ' pzas</span><span>' + avance + '%</span></div>' +
      '<div class="prog-wrap"><div class="prog-fill" style="width:' + avance + '%"></div></div>';

    if (mermaRows) {
      body += '<div class="card"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-bottom:8px">Merma por causa</div>' + mermaRows + '</div>';
    }
  }

  body += '<div class="ts">Actualizado: ' + ts + ' · Se recarga cada 8s</div>';

  const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="refresh" content="8">' +
    '<title>Monitor · ' + op + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&display=swap" rel="stylesheet">' +
    '<style>' + CSS + '</style></head><body>' +
    '<div class="hdr">' +
    '<div style="font-size:15px;font-weight:800">SHARP <span style="color:#f59e0b">PLASTICS</span>' +
    '<span style="font-size:10px;font-weight:400;color:#4b5563;margin-left:4px">// Monitor</span></div>' +
    '<div style="font-size:11px"><span style="width:8px;height:8px;border-radius:50%;background:' + statusColor + ';display:inline-block;margin-right:5px"></span>' + statusText + '</div>' +
    '</div>' +
    '<div class="wrap">' + body + '</div>' +
    '</body></html>';

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
