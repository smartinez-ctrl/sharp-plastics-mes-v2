// ════════════════════════════════════════════════════════════════
// UTILS COMPARTIDOS PARA INVENTARIO Y PRODUCCIÓN
// ════════════════════════════════════════════════════════════════

// Descarga datos como archivo .csv que Excel/Numbers/Google Sheets abren.
// rows: array de objetos. headers: opcional, array de {key, label}.
function exportarCSV(rows, headers, filename){
  if(!rows || !rows.length){
    alert('Nada que exportar');
    return;
  }
  // Si no se pasan headers, inferirlos de las keys del primer objeto
  if(!headers){
    headers = Object.keys(rows[0]).map(k=>({key:k, label:k}));
  }
  const escape = (v)=>{
    if(v===null||v===undefined)return '';
    let s = String(v);
    // Si tiene coma, comilla o newline → envolver en comillas y escapar comillas internas
    if(/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g,'""') + '"';
    return s;
  };
  const lines = [];
  lines.push(headers.map(h=>escape(h.label||h.key)).join(','));
  rows.forEach(r=>{
    lines.push(headers.map(h=>escape(r[h.key])).join(','));
  });
  // BOM para que Excel reconozca UTF-8 (acentos)
  const blob = new Blob(['\ufeff'+lines.join('\r\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (filename||'export') + '.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// Filtra un array por query buscando en los campos dados (lista de strings).
// Es case-insensitive y matchea cualquier substring.
function filtrarPorQuery(arr, query, campos){
  if(!query)return arr;
  const q = String(query).toLowerCase().trim();
  if(!q)return arr;
  return arr.filter(item=>{
    for(const c of campos){
      const v = item[c];
      if(v==null)continue;
      if(String(v).toLowerCase().includes(q))return true;
    }
    return false;
  });
}

// Ordena un array por campo. dirAsc=true para ascendente, false para descendente.
// Maneja números y strings.
function ordenarPorCampo(arr, campo, dirAsc){
  const copia = arr.slice();
  copia.sort((a,b)=>{
    const va = a[campo], vb = b[campo];
    // null/undefined al final siempre
    if(va==null && vb==null)return 0;
    if(va==null)return 1;
    if(vb==null)return -1;
    // números
    const na = parseFloat(va), nb = parseFloat(vb);
    if(!isNaN(na) && !isNaN(nb)){
      return dirAsc ? na-nb : nb-na;
    }
    // strings
    const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase();
    if(sa < sb)return dirAsc ? -1 : 1;
    if(sa > sb)return dirAsc ? 1 : -1;
    return 0;
  });
  return copia;
}

// Helper para crear input de búsqueda con estilo consistente
function htmlBuscador(id, placeholder){
  return `<input type="text" id="${id}" placeholder="${placeholder||'🔍 Buscar...'}" 
    style="width:100%;max-width:380px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;font-family:inherit;outline:none">`;
}

// Helper: header de tabla ordenable. Devuelve string con click handler.
// Recibe id de tabla, key del campo, label visible, callback que recibe (campo, asc)
function thOrdenable(campo, label, currentSort, onSort){
  const isActive = currentSort && currentSort.campo === campo;
  const arrow = isActive ? (currentSort.asc ? ' ↑' : ' ↓') : '';
  const color = isActive ? 'var(--amber)' : 'var(--text2)';
  return `<th onclick="${onSort}('${campo}')" style="cursor:pointer;user-select:none;color:${color}">${label}${arrow}</th>`;
}

window.exportarCSV = exportarCSV;
window.filtrarPorQuery = filtrarPorQuery;
window.ordenarPorCampo = ordenarPorCampo;
window.htmlBuscador = htmlBuscador;
window.thOrdenable = thOrdenable;
