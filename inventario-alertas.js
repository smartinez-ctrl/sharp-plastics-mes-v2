// ════════════════════════════════════════════════════════════════
// CÁLCULO DE ALERTAS DE INVENTARIO vs PIPELINE
// ════════════════════════════════════════════════════════════════
// Usado por produccion.html e inventario.html.
//
// Lógica:
//   1. Toma todos los pedidos del pipeline EXCEPTO los completados
//   2. Por cada pedido calcula sus requerimientos:
//      - Botella: capacidad + color botella → cantidad piezas del pedido
//      - Tapa: color tapa → piezas
//      - Chupón: color boquilla → piezas
//      - Liner, papel, liga, tag → piezas (sin color)
//   3. Suma requerimientos por producto/variante
//   4. Compara contra stock disponible (almacen + produccion)
//   5. Genera alertas:
//      - ROJA: stock_total < requerido (no alcanza)
//      - AMARILLA: stock_total >= requerido PERO stock_restante < minimo_reserva
//
// Match de colores: usa normalizarColor() para que '130 C', '130C', 'PMS 130C'
// todos matcheen contra el inventario que tiene '130C'.

// Misma función que en gestion.html — duplicada aquí para no depender
// de orden de carga de scripts. Si cambias una, cambia la otra.
function _ialNormalizar(raw){
  if(!raw) return '';
  let s = String(raw).trim();
  if(!s || s === '—' || s === '-') return '';
  const limpio = s.replace(/\b(pantone|pms)\b/gi, '').replace(/\s+/g,' ').trim();
  const pmsMatch = limpio.match(/^(.*?)\s*(\d{2,4})\s*[cC]\s*$/);
  if(pmsMatch){
    const prefix = pmsMatch[1].trim();
    const codigo = pmsMatch[2] + 'C';
    return prefix ? (prefix.toUpperCase() + ' (' + codigo + ')') : codigo;
  }
  const lower = limpio.toLowerCase();
  const estandar = {
    'black':'BLACK','negro':'BLACK','negra':'BLACK',
    'white':'WHITE','blanco':'WHITE','blanca':'WHITE',
    'clear':'CLEAR','natural':'CLEAR','transparente':'CLEAR','translucido':'CLEAR',
    'gray':'GRAY','grey':'GRAY','gris':'GRAY',
    'red':'RED','rojo':'RED','roja':'RED',
    'blue':'BLUE','azul':'BLUE',
    'green':'GREEN','verde':'GREEN',
    'yellow':'YELLOW','amarillo':'YELLOW',
    'orange':'ORANGE','naranja':'ORANGE',
    'pink':'PINK','rosa':'PINK',
    'purple':'PURPLE','morado':'PURPLE','violeta':'PURPLE',
    'brown':'BROWN','café':'BROWN','marron':'BROWN',
  };
  if(estandar[lower]) return estandar[lower];
  return limpio.toUpperCase();
}

// Calcula requerimientos de un pedido. Retorna un array de items con:
// {categoria, capacidad, color, cantidad}
function _ialRequerimientosDePedido(p){
  const piezas = parseInt(p.piezas) || 0;
  if(piezas <= 0) return [];
  const items = [];
  const capacidad = parseInt(p.capacidad) || null;
  const colorBot = _ialNormalizar(p.color_botella);
  const colorTap = _ialNormalizar(p.color_tapa);
  const colorChu = _ialNormalizar(p.color_boquilla);

  // Botella: solo si hay capacidad y color
  if(capacidad && colorBot){
    items.push({categoria:'botella', capacidad, color:colorBot, cantidad:piezas});
  }
  // Tapa
  if(colorTap){
    items.push({categoria:'tapa', capacidad:null, color:colorTap, cantidad:piezas});
  }
  // Chupón (boquilla)
  if(colorChu){
    items.push({categoria:'chupon', capacidad:null, color:colorChu, cantidad:piezas});
  }
  // Liner, papel, liga, tag: 1 por pieza, sin color/capacidad
  ['liner','papel','liga','tag'].forEach(cat=>{
    items.push({categoria:cat, capacidad:null, color:null, cantidad:piezas});
  });
  return items;
}

// Función principal: dada la data del pipeline y del inventario, calcula
// los requerimientos totales y genera alertas.
// Recibe:
//   - pedidos: array de pipeline_mf (excluir completados antes de pasar)
//   - productos: array de inventario_productos
//   - variantes: array de inventario_variantes
//   - stock: array de inventario_stock
// Retorna:
//   {
//     requerimientos: [{producto_id, variante_id, producto_nombre, variante_nombre, requerido, stock_total, stock_almacen, stock_produccion, minimo, alerta}]
//     resumen: {pedidos_pendientes, alertas_rojas, alertas_amarillas, sin_match}
//     sinMatch: [{pedido_po, categoria, color}] — items del pipeline que no encontraron variante
//   }
function calcularAlertasInventario({pedidos, productos, variantes, stock}){
  // Acumulador: map de "producto_id|variante_id" → cantidad requerida
  const req = new Map();
  // Items del pipeline que no matchearon con catálogo
  const sinMatch = [];
  // Para depurar/UI: lista de pedidos que contribuyen a cada item
  const contribuciones = new Map(); // key → [{po, sub_cliente, cantidad}]

  pedidos.forEach(p=>{
    const items = _ialRequerimientosDePedido(p);
    items.forEach(it=>{
      // Encontrar producto en catálogo
      let prod = null;
      if(it.categoria === 'botella'){
        prod = productos.find(x => x.categoria==='botella' && x.capacidad === it.capacidad);
      } else if(it.categoria === 'tapa'){
        prod = productos.find(x => x.categoria==='tapa');
      } else if(it.categoria === 'chupon'){
        prod = productos.find(x => x.categoria==='chupon');
      } else if(it.categoria === 'liner'){
        prod = productos.find(x => x.categoria==='liner');
      } else if(it.categoria === 'papel'){
        prod = productos.find(x => x.categoria==='papel');
      } else if(it.categoria === 'liga'){
        prod = productos.find(x => x.categoria==='liga');
      } else if(it.categoria === 'tag'){
        prod = productos.find(x => x.categoria==='tag');
      }
      if(!prod){
        sinMatch.push({pedido_po:p.po, categoria:it.categoria, color:it.color, capacidad:it.capacidad, motivo:'Producto no encontrado'});
        return;
      }
      let varId = null;
      if(prod.tiene_variantes){
        if(!it.color){
          sinMatch.push({pedido_po:p.po, categoria:it.categoria, color:'(sin color)', capacidad:it.capacidad, motivo:'Pedido sin color especificado'});
          return;
        }
        const v = variantes.find(v => v.producto_id===prod.id && _ialNormalizar(v.nombre)===_ialNormalizar(it.color));
        if(!v){
          sinMatch.push({pedido_po:p.po, categoria:it.categoria, color:it.color, capacidad:it.capacidad, motivo:'Color no existe en catálogo'});
          return;
        }
        varId = v.id;
      }
      const key = prod.id + '|' + (varId || '');
      req.set(key, (req.get(key)||0) + it.cantidad);
      if(!contribuciones.has(key)) contribuciones.set(key, []);
      contribuciones.get(key).push({
        po: p.po,
        sub_cliente: p.sub_cliente || p.cliente,
        estado: p.estado,
        cantidad: it.cantidad,
      });
    });
  });

  // Ahora construir la lista de requerimientos con stock y alertas
  const requerimientos = [];

  // PASO A: items que SÍ tienen requerimientos de pedidos pendientes
  req.forEach((cantidadReq, key)=>{
    const [prodId, varIdRaw] = key.split('|');
    const varId = varIdRaw || null;
    const prod = productos.find(p=>p.id===prodId);
    const variante = varId ? variantes.find(v=>v.id===varId) : null;
    const stkAlm = stock.find(s=>s.producto_id===prodId && (s.variante_id||null)===varId && s.ubicacion==='almacen');
    const stkProd = stock.find(s=>s.producto_id===prodId && (s.variante_id||null)===varId && s.ubicacion==='produccion');
    const cantAlm = parseFloat(stkAlm?.cantidad) || 0;
    const cantProd = parseFloat(stkProd?.cantidad) || 0;
    const total = cantAlm + cantProd;
    // Mínimo: prioridad a variante, luego al producto
    const minimo = (variante?.minimo_reserva || prod?.minimo_reserva || 0);
    const restanteDespuesPedidos = total - cantidadReq;
    let alerta = null;
    if(total < cantidadReq){
      alerta = 'roja';
    } else if(minimo > 0 && restanteDespuesPedidos < minimo){
      alerta = 'amarilla';
    }
    requerimientos.push({
      producto_id: prodId,
      variante_id: varId,
      producto_nombre: prod?.nombre || '?',
      producto_categoria: prod?.categoria,
      variante_nombre: variante?.nombre || null,
      requerido: cantidadReq,
      stock_almacen: cantAlm,
      stock_produccion: cantProd,
      stock_total: total,
      restante_despues_pedidos: restanteDespuesPedidos,
      minimo: minimo,
      alerta: alerta,
      contribuciones: contribuciones.get(key) || [],
    });
  });

  // PASO B: items SIN requerimientos de pedidos pendientes pero CON minimo_reserva > 0
  // Si stock_total < minimo → alerta amarilla (bajo mínimo absoluto)
  // Si stock_total == 0 y minimo > 0 → alerta roja (sin stock crítico)
  productos.forEach(prod=>{
    if(prod.tiene_variantes){
      const vars = variantes.filter(v=>v.producto_id===prod.id);
      vars.forEach(v=>{
        const minimo = v.minimo_reserva || prod.minimo_reserva || 0;
        if(minimo <= 0) return;
        const key = prod.id + '|' + v.id;
        if(req.has(key)) return; // ya cubierto en PASO A
        const stkAlm = stock.find(s=>s.producto_id===prod.id && s.variante_id===v.id && s.ubicacion==='almacen');
        const stkProd = stock.find(s=>s.producto_id===prod.id && s.variante_id===v.id && s.ubicacion==='produccion');
        const cantAlm = parseFloat(stkAlm?.cantidad) || 0;
        const cantProd = parseFloat(stkProd?.cantidad) || 0;
        const total = cantAlm + cantProd;
        if(total >= minimo) return; // OK, no hay alerta
        const alerta = (total === 0) ? 'roja' : 'amarilla';
        requerimientos.push({
          producto_id: prod.id,
          variante_id: v.id,
          producto_nombre: prod.nombre,
          producto_categoria: prod.categoria,
          variante_nombre: v.nombre,
          requerido: 0, // no hay pedidos pendientes
          stock_almacen: cantAlm,
          stock_produccion: cantProd,
          stock_total: total,
          restante_despues_pedidos: total,
          minimo: minimo,
          alerta: alerta,
          contribuciones: [],
        });
      });
    } else {
      const minimo = prod.minimo_reserva || 0;
      if(minimo <= 0) return;
      const key = prod.id + '|';
      if(req.has(key)) return;
      const stkAlm = stock.find(s=>s.producto_id===prod.id && !s.variante_id && s.ubicacion==='almacen');
      const stkProd = stock.find(s=>s.producto_id===prod.id && !s.variante_id && s.ubicacion==='produccion');
      const cantAlm = parseFloat(stkAlm?.cantidad) || 0;
      const cantProd = parseFloat(stkProd?.cantidad) || 0;
      const total = cantAlm + cantProd;
      if(total >= minimo) return;
      const alerta = (total === 0) ? 'roja' : 'amarilla';
      requerimientos.push({
        producto_id: prod.id,
        variante_id: null,
        producto_nombre: prod.nombre,
        producto_categoria: prod.categoria,
        variante_nombre: null,
        requerido: 0,
        stock_almacen: cantAlm,
        stock_produccion: cantProd,
        stock_total: total,
        restante_despues_pedidos: total,
        minimo: minimo,
        alerta: alerta,
        contribuciones: [],
      });
    }
  });

  // Ordenar: alertas rojas primero, después amarillas, después el resto
  requerimientos.sort((a,b)=>{
    const ordA = a.alerta==='roja' ? 0 : a.alerta==='amarilla' ? 1 : 2;
    const ordB = b.alerta==='roja' ? 0 : b.alerta==='amarilla' ? 1 : 2;
    if(ordA !== ordB) return ordA - ordB;
    return (b.requerido||0) - (a.requerido||0);
  });

  return {
    requerimientos,
    sinMatch,
    resumen: {
      pedidos_pendientes: pedidos.length,
      alertas_rojas: requerimientos.filter(r=>r.alerta==='roja').length,
      alertas_amarillas: requerimientos.filter(r=>r.alerta==='amarilla').length,
      items_sin_match: sinMatch.length,
    },
  };
}

// Exportar al global para que las páginas la usen
window.calcularAlertasInventario = calcularAlertasInventario;
