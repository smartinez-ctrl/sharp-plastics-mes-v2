// api/monitor.js — página de monitoreo en tiempo real de producción
const SB_URL = 'https://ozibjgsxyzdbporcarwv.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aWJqZ3N4eXpkYnBvcmNhcnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTc5MjEsImV4cCI6MjA5Mjk3MzkyMX0.mO77vLN92En0fvn1U-FFif43CsCG_QMiVKSclBCL7-M';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).send('ID requerido');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Monitor de producción</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0d0f12;color:#fff;font-family:'DM Sans',Arial,sans-serif;min-height:100vh}
    .header{background:#111318;border-bottom:1px solid #1e2028;padding:14px 24px;display:flex;justify-content:space-between;align-items:center}
    .logo{font-size:16px;font-weight:800;letter-spacing:-.5px}
    .logo span{color:#f59e0b}
    .status-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;margin-right:6px;animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .container{max-width:600px;margin:0 auto;padding:20px 16px}
    .order-card{background:#111318;border:1px solid #1e2028;border-radius:14px;padding:16px 20px;margin-bottom:16px}
    .order-title{font-size:18px;font-weight:700;margin-bottom:4px}
    .order-meta{font-size:12px;color:#6b7280}
    .timer-card{background:#111318;border:1px solid #1e2028;border-radius:14px;padding:20px;text-align:center;margin-bottom:16px}
    .timer-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:8px}
    .timer-val{font-family:'Space Mono',monospace;font-size:48px;font-weight:700;color:#22c55e;letter-spacing:2px}
    .timer-val.paused{color:#f59e0b}
    .timer-val.stopped{color:#374151}
    .stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
    .stat-card{background:#111318;border:1px solid #1e2028;border-radius:12px;padding:16px;text-align:center}
    .stat-val{font-family:'Space Mono',monospace;font-size:32px;font-weight:700;margin-bottom:4px}
    .stat-label{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#6b7280}
    .progress-wrap{background:#1e2028;border-radius:999px;height:10px;overflow:hidden;margin-bottom:16px}
    .progress-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#22c55e,#16a34a);transition:width .5s ease}
    .progress-label{display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-bottom:6px}
    .merma-card{background:#111318;border:1px solid #1e2028;border-radius:14px;padding:16px 20px;margin-bottom:16px}
    .merma-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-bottom:10px}
    .merma-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1e2028;font-size:13px}
    .merma-row:last-child{border-bottom:none}
    .merma-val{font-family:monospace;color:#ef4444;font-weight:600}
    .colors-card{background:#111318;border:1px solid #1e2028;border-radius:14px;padding:16px 20px;margin-bottom:16px}
    .color-chip{display:inline-flex;align-items:center;gap:6px;background:#1e2028;border-radius:20px;padding:4px 10px;font-size:12px;margin:3px}
    .footer{text-align:center;padding:20px;font-size:11px;color:#374151}
    .last-update{font-size:10px;color:#374151;text-align:center;margin-bottom:8px}
    .completado-banner{background:#14532d;border:1px solid #16a34a;border-radius:12px;padding:16px;text-align:center;margin-bottom:16px}
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="header">
    <div class="logo">SHARP <span>PLASTICS</span> <span style="font-size:11px;font-weight:400;color:#6b7280;margin-left:6px">// Monitor</span></div>
    <div style="font-size:12px;color:#6b7280"><span class="status-dot" id="dot"></span><span id="status-txt">Conectando...</span></div>
  </div>
  <div class="container">
    <div id="content"><div style="text-align:center;padding:60px;color:#374151">Cargando...</div></div>
    <div class="last-update" id="last-update"></div>
  </div>
  <div class="footer">Sharp Plastics MES · Solo lectura</div>

  <script>
    const SB_URL='${SB_URL}';
    const SB_KEY='${SB_KEY}';
    const ID='${id}';
    let prevEstado=null;

    function fmt(s){
      s=Math.floor(s||0);
      const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;
      return [h,m,ss].map(x=>String(x).padStart(2,'0')).join(':');
    }

    async function load(){
      try{
        const r=await fetch(SB_URL+'/rest/v1/ordenes_produccion?id=eq.'+ID+'&select=*',{
          headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}
        });
        const rows=await r.json();
        if(!rows||!rows.length){
          document.getElementById('content').innerHTML='<div style="text-align:center;padding:60px;color:#374151">Orden no encontrada</div>';
          return;
        }
        const d=rows[0];
        render(d);
        document.getElementById('dot').style.background=d.estado==='completado'?'#6b7280':'#22c55e';
        document.getElementById('status-txt').textContent=d.estado==='completado'?'Completado':'En vivo';
        document.getElementById('last-update').textContent='Última actualización: '+new Date().toLocaleTimeString('es-MX');
      }catch(e){
        document.getElementById('dot').style.background='#ef4444';
        document.getElementById('status-txt').textContent='Sin conexión';
      }
    }

    function render(d){
      const pzas=d.piezas_total||0;
      const buenas=d.piezas_buenas||0;
      const mermaAj=d.merma_ajuste||{};
      const mermaPr=d.merma_produccion||{};
      const allMerma={...mermaAj,...mermaPr};
      const totalMerma=Object.values(mermaPr).reduce((s,v)=>s+(v||0),0);
      const avance=pzas?Math.min(100,(buenas/pzas*100)).toFixed(1):0;
      const tProd=d.tiempo_produccion_seg||0;
      const tAj=d.tiempo_ajuste_seg||0;
      const colores=(d.colores||[]);
      const completado=d.estado==='completado';
      const mermaRows=Object.entries(allMerma).filter(([,v])=>v>0)
        .map(([k,v])=>'<div class="merma-row"><span>'+k+'</span><span class="merma-val">'+v+'</span></div>').join('');

      document.getElementById('content').innerHTML=\`
        \${completado?\`<div class="completado-banner">
          <div style="font-size:24px;margin-bottom:6px">✅</div>
          <div style="font-size:16px;font-weight:700;color:#22c55e">Producción completada</div>
          <div style="font-size:13px;color:#86efac;margin-top:4px">\${buenas.toLocaleString()} piezas buenas · \${avance}% rendimiento</div>
        </div>\`:''}

        <div class="order-card">
          <div class="order-title">\${d.cliente||'—'} — \${d.producto||'—'}</div>
          <div class="order-meta">\${d.op||'—'} · \${pzas.toLocaleString()} pzas · \${d.maquina||'—'}</div>
          \${colores.length?\`<div style="margin-top:8px">\${colores.map(c=>\`<span class="color-chip">🎨 \${c.nombre}\${c.pantone?' · '+c.pantone:''}</span>\`).join('')}</div>\`:''}
        </div>

        \${!completado?\`<div class="timer-card">
          <div class="timer-label">⏱ Producción</div>
          <div class="timer-val">\${fmt(tProd)}</div>
        </div>\`:\`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
          <div class="stat-card"><div class="stat-val" style="font-size:20px;color:#f59e0b">\${fmt(tAj)}</div><div class="stat-label">Tiempo ajuste</div></div>
          <div class="stat-card"><div class="stat-val" style="font-size:20px;color:#22c55e">\${fmt(tProd)}</div><div class="stat-label">Tiempo producción</div></div>
        </div>\`}

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-val" style="color:#22c55e">\${buenas.toLocaleString()}</div>
            <div class="stat-label">Piezas buenas</div>
          </div>
          <div class="stat-card">
            <div class="stat-val" style="color:#ef4444">\${totalMerma}</div>
            <div class="stat-label">Merma</div>
          </div>
        </div>

        <div class="progress-label"><span>\${buenas.toLocaleString()} de \${pzas.toLocaleString()} pzas</span><span>\${avance}%</span></div>
        <div class="progress-wrap"><div class="progress-fill" style="width:\${avance}%"></div></div>

        \${mermaRows?\`<div class="merma-card"><div class="merma-title">Detalle de merma</div>\${mermaRows}</div>\`:''}
      \`;
    }

    load();
    setInterval(load, 8000);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
