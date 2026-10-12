/* NOVATEC · Lógica de la aplicación */
const LS_KEY = "mrp_system_v1";
let state = {
  usuario: null,
  usuarios: [],
  config: {horasEdicion:48, toleranciaVariacion:5},
  programaciones: [],
  historial: [],
  insumosCustom: [],
  recetasCustom: []
};

let INSUMO_MAP = {};
let filtroMes = '';
let empresaSeleccionada = '';

function rebuildInsumoMap(){
  INSUMO_MAP = {};
  INSUMOS.forEach(i => INSUMO_MAP[i[0]] = { codigo:i[0], nombre:i[1], unidad:i[2], categoria:i[3], critico:i[4]==="Si" });
}

function usuariosPorDefecto(){
  return [
    {id:'u-admin', nombre:'Administrador', usuario:'admin', password:'admin', rol:'ADMINISTRADOR', tabs:['programacion','mrp','historial','recetas','config']},
    {id:'u-nutri', nombre:'Nutricionista', usuario:'nutri', password:'nutri', rol:'NUTRICIONISTA', tabs:['programacion','mrp','historial','recetas']},
    {id:'u-compra', nombre:'Comprador', usuario:'compra', password:'compra', rol:'COMPRADOR', tabs:['mrp','historial']}
  ];
}

function cargarEstado(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){ const saved = JSON.parse(raw); state = {...state, ...saved}; }
  }catch(e){ console.warn("Error al cargar estado", e); }
  if(!state.insumosCustom) state.insumosCustom = [];
  if(!state.recetasCustom) state.recetasCustom = [];
  state.insumosCustom.forEach(ins=>{ if(!INSUMOS.find(i=>i[0]===ins[0])) INSUMOS.push(ins); });
  state.recetasCustom.forEach(rec=>{ if(!RECETAS.find(r=>r[0]===rec[0])) RECETAS.push(rec); });
  rebuildInsumoMap();

  if(!state.usuarios || !state.usuarios.length) state.usuarios = usuariosPorDefecto();
  if(state.usuario && state.usuario.id){
    const u = state.usuarios.find(x=>x.id===state.usuario.id);
    if(u) state.usuario = {...u}; else state.usuario = null;
  } else state.usuario = null;

  state.programaciones.forEach(p=>{
    if(!p.compras) p.compras = {};
    if(p.estado === 'En programación') p.estado = 'Borrador';
    if(p.estado === 'Cerrada') p.estado = 'Cerrado';
    if(p.estado === 'Cerrada manualmente') p.estado = 'Cerrado';
    if(!['Borrador','Esperando confirmación','Confirmada','Cerrado'].includes(p.estado)) p.estado = 'Borrador';
    (p.servicios||[]).forEach(s=>{
      if(!s.tipo || ['Desayuno','Almuerzo','Cena'].includes(s.tipo)){
        const rec = RECETAS.find(r=>r[0]===s.recetaCod);
        s.tipo = rec ? rec[2] : 'Plato';
      }
    });
  });
}
function guardarEstado(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch(e){ console.warn("Error al guardar", e); }
}

function uid(){ return 'id_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function fmt(n,d=2){ if(n===null||n===undefined||isNaN(n)) return '0'; return Number(n).toLocaleString('es-PE',{minimumFractionDigits:d,maximumFractionDigits:d}); }
function fmtInt(n){ return Number(n||0).toLocaleString('es-PE'); }
function fechaISO(d){ return d.toISOString().slice(0,10); }
function fmtFecha(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function fmtFechaHora(iso){ if(!iso) return ''; const d=new Date(iso); return d.toLocaleString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function addDias(iso,n){ const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+n); return fechaISO(d); }
function getLunes(iso){ const d=new Date(iso+'T12:00:00'); const day=d.getDay(); const diff=(day===0?-6:1-day); d.setDate(d.getDate()+diff); return fechaISO(d); }
function nowISO(){ return new Date().toISOString(); }

function esAdmin(){ return state.usuario && state.usuario.rol === 'ADMINISTRADOR'; }
function esNutricionista(){ return state.usuario && state.usuario.rol === 'NUTRICIONISTA'; }
function esComprador(){ return state.usuario && state.usuario.rol === 'COMPRADOR'; }
function puedeCrear(){ return esAdmin(); }
function puedeMarcarCompras(){ return esAdmin() || esComprador(); }
function puedeConfirmar(prog){ return esNutricionista() && prog.estado === 'Esperando confirmación'; }
function puedeCerrar(prog){
  if(!prog) return false;
  if(prog.estado !== 'Confirmada') return false;
  if(!(esComprador() || esAdmin())) return false;
  return true;
}
function estaCompleto(prog){
  const insumos = consolidarInsumos(prog).filter(i=>!i.eliminado);
  if(!insumos.length) return false;
  return insumos.every(i=>prog.compras?.[i.codInsumo]?.comprado);
}
function puedeEditarProg(prog){
  if(!prog) return false;
  if(prog.estado === 'Cerrado' || prog.estado === 'Confirmada') return false;
  if(!(esAdmin() || esNutricionista())) return false;
  if(prog.estado === 'Borrador') return calcularEdicion(prog).abierta;
  if(prog.estado === 'Esperando confirmación') return true;
  return false;
}
function puedeAjustarProg(prog){
  if(!prog) return false;
  if(prog.estado === 'Cerrado') return false;
  if(prog.estado === 'Confirmada' && (esAdmin() || esComprador())) return true;
  if(esAdmin() || esNutricionista()) return puedeEditarProg(prog);
  return false;
}
function puedeVerTab(tab){
  if(!state.usuario || !state.usuario.tabs) return false;
  return state.usuario.tabs.includes(tab);
}

function vistaInicialPorRol(){
  if(state.usuario && state.usuario.rol === 'COMPRADOR') return 'mrp';
  return 'programacion';
}

/* Sidebar móvil */
function toggleSidebar(){
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  sb.classList.toggle('open');
  ov.classList.toggle('active');
}
function cerrarSidebar(){
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  sb.classList.remove('open');
  ov.classList.remove('active');
}

/* Favicon dinámico */
function setFavicon(color){
  const paletas = {
    azul: { light:'#0d6efd', dark:'#0a2d6e', arrow:'#1e88ff' },
    rojo: { light:'#dc2626', dark:'#7f1d1d', arrow:'#ef4444' }
  };
  const c = paletas[color] || paletas.azul;
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 100'>" +
    "<path fill='" + c.light + "' d='M 12 32 Q 12 18 26 18 L 44 18 L 44 76 Q 44 86 34 86 L 22 86 Q 12 86 12 76 Z'/>" +
    "<path fill='" + c.light + "' d='M 26 18 L 52 18 L 96 72 L 96 86 L 70 86 Z'/>" +
    "<path fill='" + c.dark + "' d='M 66 62 L 100 62 Q 108 62 108 70 L 108 82 Q 108 90 100 90 L 78 90 Q 66 90 66 78 Z'/>" +
    "<path fill='" + c.arrow + "' d='M 76 12 L 106 24 L 106 44 Z'/>" +
    "<rect fill='" + c.dark + "' x='84' y='46' width='22' height='32' rx='4'/></svg>";
  const link = document.getElementById('favicon');
  if(link) link.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* Imagen del rol en la barra lateral */
function pintarImagenRolSidebar(){
  const cont = document.getElementById('sidebarRoleImg');
  const img = document.getElementById('sidebarRoleImgEl');
  if(!cont || !img) return;
  cont.classList.remove('rol-admin','rol-nutri','rol-compra');
  let src = '';
  let claseRol = '';
  if(esAdmin()){ src = 'assets/img/admin.png'; claseRol = 'rol-admin'; }
  else if(esNutricionista()){ src = 'assets/img/nutri.png'; claseRol = 'rol-nutri'; }
  else if(esComprador()){ src = 'assets/img/compra.png'; claseRol = 'rol-compra'; }
  if(src){
    img.src = src;
    img.alt = state.usuario.rol;
    cont.classList.add(claseRol);
    cont.classList.remove('vacio');
  } else {
    cont.classList.add('vacio');
  }
}

function toast(titulo,msg,tipo='info'){
  const c = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast '+tipo;
  el.innerHTML = `<b>${titulo}</b><span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateX(100%)'; setTimeout(()=>el.remove(),300); },3500);
}
function abrirModal(html, opts={}){
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('modal');
  modal.className = 'modal '+(opts.size||'');
  modal.innerHTML = html;
  overlay.classList.add('active');
}
function cerrarModal(){ document.getElementById('modalOverlay').classList.remove('active'); }
document.getElementById('modalOverlay').addEventListener('click', e=>{
  if(e.target.id === 'modalOverlay') cerrarModal();
});

function getMesesDisponibles(){
  const meses = new Set();
  state.programaciones.forEach(p=>{
    if(p.fechaInicio){
      const [y,m] = p.fechaInicio.split('-');
      meses.add(`${y}-${m}`);
    }
  });
  return [...meses].sort().reverse();
}
function nombreMes(yyyymm){
  if(!yyyymm) return '';
  const [y,m] = yyyymm.split('-');
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${meses[parseInt(m)-1]} ${y}`;
}
function pintarMesFiltro(){
  const sel = document.getElementById('mesFiltro');
  if(!sel) return;
  const meses = getMesesDisponibles();
  sel.innerHTML = '<option value="">Todos los meses</option>' + meses.map(m=>`<option value="${m}" ${filtroMes===m?'selected':''}>${nombreMes(m)}</option>`).join('');
  sel.onchange = e=>{ filtroMes = e.target.value; renderListaSemanas(); };
}

function toggleUserMenu(e){
  e.stopPropagation();
  document.getElementById('userMenu').classList.toggle('open');
}
function cerrarUserMenu(){
  const menu = document.getElementById('userMenu');
  if(menu) menu.classList.remove('open');
}
document.addEventListener('click', e=>{
  if(!e.target.closest('.user-badge')) cerrarUserMenu();
});
function cerrarSesion(){
  cerrarUserMenu();
  if(!confirm('¿Cerrar sesión?')) return;
  state.usuario = null;
  progSeleccionada = null;
  currentView = 'programacion';
  guardarEstado();
  render();
}
function aplicarPermisosNav(){
  document.querySelectorAll('.nav-item').forEach(btn=>{
    const view = btn.dataset.view;
    btn.style.display = puedeVerTab(view) ? '' : 'none';
  });
}

function crearProgramacion(datos){
  const id = uid();
  const prog = {
    id,
    nombre: datos.nombre || `Semana ${state.programaciones.length+1}`,
    fechaInicio: datos.fechaInicio,
    fechaFin: addDias(datos.fechaInicio,6),
    estado: 'Borrador',
    usuario: state.usuario ? state.usuario.nombre : 'Sistema',
    fechaCreacion: nowISO(),
    fechaCierre: null,
    usuarioCierre: null,
    fechaEnvio: null,
    usuarioEnvio: null,
    servicios: [],
    ajustes: [],
    compras: {},
    historial: []
  };
  state.programaciones.push(prog);
  guardarEstado();
  return prog;
}
function getProgramacion(id){ return state.programaciones.find(p=>p.id===id); }

function calcularEdicion(prog){
  if(prog.estado === 'Cerrado') return {abierta:false, motivo:'cerrado', horasRestantes:0, texto:'CERRADO', cls:'closed'};
  if(prog.estado === 'Confirmada') return {abierta:false, motivo:'confirmada', horasRestantes:0, texto:'CONFIRMADA', cls:'confirmed'};
  if(prog.estado === 'Esperando confirmación') return {abierta:false, motivo:'esperando', horasRestantes:0, texto:'ESPERANDO CONFIRMACIÓN', cls:'waiting'};
  const primerServicio = prog.servicios.length ? prog.servicios.map(s=>s.fecha).sort()[0] : prog.fechaInicio;
  const limite = new Date(primerServicio+'T00:00:00');
  limite.setHours(limite.getHours() - state.config.horasEdicion);
  const ahora = new Date();
  const diffMs = limite - ahora;
  const horas = diffMs / 3600000;
  if(horas <= 0) return {abierta:false, motivo:'tiempo', horasRestantes:0, texto:'PLAZO VENCIDO', cls:'closed'};
  return {abierta:true, motivo:'abierta', horasRestantes:horas, texto:`${Math.floor(horas)}h ${Math.floor((horas%1)*60)}min restantes`, cls: horas<12?'closing':'open'};
}

function registrarHistorial(progId, campo, original, nuevo, motivo){
  const entry = { id: uid(), fecha: nowISO(), usuario: state.usuario.nombre, campo, original, nuevo, motivo, progId };
  state.historial.push(entry);
  const prog = getProgramacion(progId);
  if(prog) prog.historial.push(entry);
  guardarEstado();
}

function calcularBOMServicio(servicio){
  const receta = RECETAS.find(r=>r[0]===servicio.recetaCod);
  if(!receta) return [];
  const factor = servicio.personas / 100;
  return receta[3].map(([cod, cant])=>({
    codInsumo: cod, cantidad: cant * factor,
    unidad: INSUMO_MAP[cod]?.unidad || ''
  }));
}

function consolidarInsumos(prog){
  const acum = {};
  prog.servicios.forEach(s=>{
    calcularBOMServicio(s).forEach(item=>{
      if(!acum[item.codInsumo]) acum[item.codInsumo] = {codInsumo:item.codInsumo, cantidadBOM:0, cantidadFinal:0, origen:'BOM'};
      acum[item.codInsumo].cantidadBOM += item.cantidad;
    });
  });
  Object.values(acum).forEach(item=>{
    item.cantidadFinal = item.cantidadBOM;
  });
  prog.ajustes.forEach(a=>{
    if(a.tipo === 'cambio_insumo' || a.tipo === 'sustitucion'){
      if(acum[a.insumoOriginal]) acum[a.insumoOriginal].cantidadFinal -= a.cantidadOriginal;
      if(!acum[a.insumoNuevo]) acum[a.insumoNuevo] = {codInsumo:a.insumoNuevo, cantidadBOM:0, cantidadFinal:0, origen:'Ajuste'};
      acum[a.insumoNuevo].cantidadFinal += a.cantidadNueva;
      acum[a.insumoNuevo].origen = 'Ajuste';
    } else if(a.tipo === 'cambio_cantidad'){
      if(acum[a.insumoOriginal]) acum[a.insumoOriginal].cantidadFinal += (a.cantidadNueva - a.cantidadOriginal);
      if(acum[a.insumoOriginal]) acum[a.insumoOriginal].origen = 'Ajuste';
    } else if(a.tipo === 'eliminar'){
      if(acum[a.insumoOriginal]) acum[a.insumoOriginal].cantidadFinal -= a.cantidadOriginal;
      if(acum[a.insumoOriginal]) acum[a.insumoOriginal].origen = 'Ajuste';
    } else if(a.tipo === 'agregar'){
      if(!acum[a.insumoNuevo]) acum[a.insumoNuevo] = {codInsumo:a.insumoNuevo, cantidadBOM:0, cantidadFinal:0, origen:'Agregado'};
      acum[a.insumoNuevo].cantidadFinal += a.cantidadNueva;
      acum[a.insumoNuevo].origen = 'Agregado';
    }
  });
  return Object.values(acum).map(item=>{
    const info = INSUMO_MAP[item.codInsumo] || {nombre:'Desconocido', unidad:''};
    const preventivo = STOCK_PREVENTIVO[item.codInsumo] || 0;
    const cantidadFinal = item.cantidadFinal < 0 ? 0 : item.cantidadFinal;
    const reqNeto = cantidadFinal + preventivo;
    const eliminado = item.cantidadBOM > 0 && cantidadFinal === 0;
    return {...item, cantidadFinal, nombre: info.nombre, unidad: info.unidad, preventivo, reqNeto, eliminado, tieneAjuste: item.origen !== 'BOM'};
  }).sort((a,b)=>a.codInsumo.localeCompare(b.codInsumo));
}

function fmtAjuste(ajuste){
  if(ajuste === 0 || Math.abs(ajuste) < 0.0001) return '<span class="ajuste-cero">0</span>';
  if(ajuste > 0) return `<span class="ajuste-pos">+${fmt(ajuste)}</span>`;
  return `<span class="ajuste-neg">${fmt(ajuste)}</span>`;
}

const VIEWS = {
  programacion: {title:"Programación semanal", sub:"Gestiona la programación de menús y genera requerimientos MRP"},
  mrp: {title:"Requerimientos MRP", sub:"Consolidado de insumos, ajustes y requerimiento neto"},
  historial: {title:"Historial y reportes", sub:"Cambios registrados y programaciones"},
  recetas: {title:"Recetas y BOM", sub:"Administra las recetas estándar y su lista de materiales"},
  config: {title:"Configuración", sub:"Parámetros del sistema, usuarios y roles"}
};
let currentView = 'programacion';
let filtroBusqueda = '';
let progSeleccionada = null;

function render(){
  if(!state.usuario){
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.header').style.display = 'none';
    document.getElementById('content').style.padding = '0';
    renderLoginScreen();
    return;
  }
  document.querySelector('.sidebar').style.display = '';
  document.querySelector('.header').style.display = '';
  document.getElementById('content').style.padding = '';
  const content = document.getElementById('content');
  aplicarPermisosNav();
  pintarImagenRolSidebar();
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.view === currentView));
  const v = VIEWS[currentView] || VIEWS.programacion;
  document.getElementById('viewTitle').textContent = v.title;
  document.getElementById('viewSub').textContent = v.sub;
  document.getElementById('userName').textContent = state.usuario.nombre;
  document.getElementById('userRole').textContent = state.usuario.rol;
  document.getElementById('userAvatar').textContent = state.usuario.nombre.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
  document.getElementById('menuUserName').textContent = state.usuario.nombre;
  document.getElementById('menuUserRole').textContent = state.usuario.rol;
  pintarMesFiltro();
  if(!puedeVerTab(currentView)) currentView = (state.usuario.tabs && state.usuario.tabs[0]) || 'programacion';
  if(currentView === 'programacion') renderProgramacion(content);
  else if(currentView === 'recetas') renderRecetas(content);
  else if(currentView === 'mrp') renderMRP(content);
  else if(currentView === 'historial') renderHistorial(content);
  else if(currentView === 'config') renderConfig(content);
}

/* ============================================================
   LOGIN · NOVATEC
   ============================================================ */
function renderLoginScreen(){
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="login-screen" id="loginScreen">
      <div class="login-box">
        <div class="logo-wrap">
          <div class="logo-circle" id="loginLogo">
            <svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
              <path class="logo-blue" d="M 12 32 Q 12 18 26 18 L 44 18 L 44 76 Q 44 86 34 86 L 22 86 Q 12 86 12 76 Z"/>
              <path class="logo-blue" d="M 26 18 L 52 18 L 96 72 L 96 86 L 70 86 Z"/>
              <path class="logo-dark" d="M 66 62 L 100 62 Q 108 62 108 70 L 108 82 Q 108 90 100 90 L 78 90 Q 66 90 66 78 Z"/>
              <path class="logo-arrow" d="M 76 12 L 106 24 L 106 44 Z" stroke-linejoin="round"/>
              <rect class="logo-dark" x="84" y="46" width="22" height="32" rx="4"/>
            </svg>
          </div>
          <h2 id="loginTitle">NOVATEC</h2>
          <div class="subtitle" id="loginSubtitle">Diseñamos el futuro</div>
        </div>
        <div class="field">
          <label>Empresa</label>
          <select id="lgEmpresa">
            <option value="">-- Seleccionar empresa --</option>
            <option value="CEALKA">CEALKA SAC</option>
          </select>
        </div>
        <div class="field">
          <label>Usuario</label>
          <input type="text" id="lgUsuario" placeholder="Escribe tu usuario" autocomplete="off" autocapitalize="off" spellcheck="false">
        </div>
        <div class="field">
          <label>Contraseña</label>
          <input type="password" id="lgPassword" placeholder="Escribe tu contraseña" autocomplete="off">
        </div>
        <div id="lgError" class="login-error"></div>
        <button class="btn-login" id="lgEntrar">Iniciar sesión</button>
        <div class="hint">¿Olvidaste tu contraseña? <a href="#" onclick="event.preventDefault();" class="link-recuperar">Recupérala aquí</a></div>
      </div>
    </div>`;
  const screen = document.getElementById('loginScreen');
  const selEmpresa = document.getElementById('lgEmpresa');
  const inputU = document.getElementById('lgUsuario');
  const inputP = document.getElementById('lgPassword');
  const err = document.getElementById('lgError');

  setFavicon('azul');

  selEmpresa.onchange = ()=>{
    empresaSeleccionada = selEmpresa.value;
    if(empresaSeleccionada === 'CEALKA'){
      screen.classList.add('tema-cealka');
      setFavicon('rojo');
    } else {
      screen.classList.remove('tema-cealka');
      setFavicon('azul');
    }
  };

  inputU.focus();
  inputU.onkeydown = e=>{ if(e.key==='Enter') inputP.focus(); };
  inputP.onkeydown = e=>{ if(e.key==='Enter') document.getElementById('lgEntrar').click(); };

  document.getElementById('lgEntrar').onclick = ()=>{
    if(!selEmpresa.value){
      err.style.display='flex'; err.innerHTML = '⚠️ Selecciona una empresa para continuar';
      return;
    }
    const user = inputU.value.trim().toLowerCase();
    const pwd = inputP.value;
    const u = state.usuarios.find(x=>x.usuario===user);
    if(!user || !pwd){ err.style.display='flex'; err.innerHTML = '⚠️ Escribe usuario y contraseña'; return; }
    if(!u || u.password !== pwd){
      err.style.display='flex'; err.innerHTML = '⚠️ Usuario o contraseña incorrectos';
      inputP.value = ''; inputP.focus(); return;
    }
    state.usuario = {...u};
    progSeleccionada = null;
    currentView = vistaInicialPorRol();
    if(!puedeVerTab(currentView)) currentView = (u.tabs && u.tabs[0]) || 'programacion';
    guardarEstado();
    render();
    toast('Bienvenido', u.nombre, 'success');
  };
}

document.getElementById('nav').addEventListener('click', e=>{
  const btn = e.target.closest('.nav-item');
  if(!btn) return;
  if(!puedeVerTab(btn.dataset.view)) return;
  currentView = btn.dataset.view;
  progSeleccionada = null;
  render();
  cerrarSidebar();
});

/* ============ PROGRAMACIÓN ============ */
function renderProgramacion(content){
  if(progSeleccionada){
    const prog = getProgramacion(progSeleccionada);
    if(prog){ renderDetalleSemana(content, prog); return; }
  }
  const totales = calcularTotalesGlobales();
  content.innerHTML = `
    <div class="stats-grid">
      ${statCard('📅','Programaciones', state.programaciones.length, 'Semanas registradas','#fee2e2')}
      ${statCard('🍽️','Servicios totales', totales.servicios, 'En todas las semanas','#dcfce7')}
      ${statCard('👥','Raciones', fmtInt(totales.raciones), 'Personas atendidas','#fef3c7')}
      ${!esNutricionista()?statCard('📦','Insumos', totales.insumos, 'Insumos distintos requeridos','#cffafe'):''}
      ${!esNutricionista()?statCard('⚠️','Ajustes excepcionales', totales.ajustes, 'Cambios sobre BOM','#fee2e2'):''}
    </div>
    <div class="filter-bar">
      <input type="text" class="form-control" id="buscarProg" placeholder="🔍 Buscar semana..." value="${filtroBusqueda}">
      <select class="form-control" id="filtroEstado">
        <option value="">Todos los estados</option>
        ${!esNutricionista()?`<option value="Borrador">🟡 Borrador</option>`:''}
        <option value="Esperando confirmación">🔵 Esperando confirmación</option>
        <option value="Confirmada">🟢 Confirmada</option>
        <option value="Cerrado">🔴 Cerrado</option>
      </select>
      ${puedeCrear()?`<button class="btn btn-primary" id="btnNuevaProg">+ Nueva programación</button>`:''}
    </div>
    <div id="listaSemanas"></div>`;
  const btnNueva = document.getElementById('btnNuevaProg');
  if(btnNueva) btnNueva.onclick = abrirModalNuevaProg;
  document.getElementById('buscarProg').oninput = e=>{ filtroBusqueda = e.target.value; renderListaSemanas(); };
  document.getElementById('filtroEstado').onchange = renderListaSemanas;
  renderListaSemanas();
}
function statCard(icon, label, value, sub, color){
  return `<div class="stat-card">
    <div class="stat-icon" style="background:${color}">${icon}</div>
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    <div class="stat-sub">${sub}</div>
  </div>`;
}
function calcularTotalesGlobales(){
  let servicios=0, raciones=0, ajustes=0;
  const insumosSet = new Set();
  state.programaciones.forEach(p=>{
    servicios += p.servicios.length;
    p.servicios.forEach(s=>raciones += Number(s.personas)||0);
    ajustes += p.ajustes.length;
    consolidarInsumos(p).forEach(i=>insumosSet.add(i.codInsumo));
  });
  return {servicios, raciones, insumos:insumosSet.size, ajustes};
}
function renderListaSemanas(){
  const cont = document.getElementById('listaSemanas');
  if(!cont) return;
  let progs = [...state.programaciones].sort((a,b)=>b.fechaInicio.localeCompare(a.fechaInicio));
  if(esNutricionista()) progs = progs.filter(p=>p.estado !== 'Borrador');
  if(filtroMes) progs = progs.filter(p=>p.fechaInicio && p.fechaInicio.startsWith(filtroMes));
  const q = filtroBusqueda.toLowerCase();
  if(q) progs = progs.filter(p=>p.nombre.toLowerCase().includes(q) || p.fechaInicio.includes(q));
  const est = document.getElementById('filtroEstado')?.value;
  if(est) progs = progs.filter(p=>p.estado===est);
  if(!progs.length){
    const mesTxt = filtroMes ? ` de <b>${nombreMes(filtroMes)}</b>` : '';
    const txtExtra = esNutricionista() ? 'No hay programaciones visibles para tu rol.' : 'Crea una nueva programación semanal para comenzar.';
    cont.innerHTML = `<div class="empty-state"><div class="icon">📅</div><h3>No hay programaciones${mesTxt}</h3><p>${txtExtra}</p></div>`;
    return;
  }
  cont.innerHTML = `<div class="week-grid">${progs.map(p=>renderTarjetaSemana(p)).join('')}</div>`;
  cont.querySelectorAll('[data-accion]').forEach(el=>{
    el.onclick = ()=>{
      const accion = el.dataset.accion;
      const id = el.dataset.id;
      if(accion==='ver'){ progSeleccionada = id; render(); }
      else if(accion==='duplicar') duplicarProgramacion(id);
      else if(accion==='enviar') abrirModalEnviar(id);
      else if(accion==='confirmar') abrirModalConfirmar(id);
      else if(accion==='reabrir') abrirModalReabrir(id);
      else if(accion==='eliminar') eliminarProgramacion(id);
      else if(accion==='exportar') exportarXLSX(id);
    };
  });
}
function renderTarjetaSemana(p){
  const totalServ = p.servicios.length;
  const totalRac = p.servicios.reduce((a,s)=>a+(Number(s.personas)||0),0);
  const insumos = consolidarInsumos(p).length;
  const dias = new Set(p.servicios.map(s=>s.fecha)).size;
  const ed = calcularEdicion(p);
  const comprados = consolidarInsumos(p).filter(i=>!i.eliminado && p.compras?.[i.codInsumo]?.comprado).length;
  return `<div class="week-card">
    <div class="week-card-header">
      <div>
        <h3>${p.nombre}</h3>
        <div class="range">${fmtFecha(p.fechaInicio)} – ${fmtFecha(p.fechaFin)}</div>
      </div>
      ${badgeEstado(p.estado)}
    </div>
    <div class="week-card-body">
      <div class="week-metrics">
        <div class="week-metric"><div class="label">Días</div><div class="value">${dias}</div></div>
        <div class="week-metric"><div class="label">Servicios</div><div class="value">${totalServ}</div></div>
        <div class="week-metric"><div class="label">Raciones</div><div class="value">${fmtInt(totalRac)}</div></div>
        <div class="week-metric"><div class="label">Insumos</div><div class="value">${insumos}</div></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <span class="countdown ${ed.cls}">${ed.cls==='closed'?'🔒':ed.cls==='waiting'?'⏳':ed.cls==='confirmed'?'✅':'⏱'} ${ed.texto}</span>
        ${!esNutricionista() && p.ajustes.length?`<span class="badge badge-adjust">⚠ ${p.ajustes.length} ajuste(s)</span>`:''}
        ${!esNutricionista() && comprados?`<span class="badge badge-confirmed">✓ ${comprados} comprado(s)</span>`:''}
      </div>
    </div>
    <div class="week-card-footer">
      <button class="btn btn-primary btn-sm" data-accion="ver" data-id="${p.id}">Ver programación</button>
      ${puedeEditarProg(p) && p.estado==='Borrador' && !esNutricionista()?`<button class="btn btn-secondary btn-sm" data-accion="duplicar" data-id="${p.id}">Duplicar</button>`:''}
      ${esAdmin() && p.estado==='Borrador'?`<button class="btn btn-info btn-sm" data-accion="enviar" data-id="${p.id}">📨 Enviar a nutricionista</button>`:''}
      ${puedeConfirmar(p)?`<button class="btn btn-success btn-sm" data-accion="confirmar" data-id="${p.id}">✓ Confirmar</button>`:''}
      ${(esAdmin() && (p.estado==='Confirmada' || p.estado==='Cerrado'))?`<button class="btn btn-warning btn-sm" data-accion="reabrir" data-id="${p.id}">🔓 Reabrir</button>`:''}
      ${!esNutricionista()?`<button class="btn btn-ghost btn-sm" data-accion="exportar" data-id="${p.id}">📊 Excel</button>`:''}
      ${esAdmin()?`<button class="btn btn-ghost btn-sm" data-accion="eliminar" data-id="${p.id}" style="color:var(--danger)">Eliminar</button>`:''}
    </div>
  </div>`;
}
function badgeEstado(estado){
  const map = {
    'Borrador':'<span class="badge badge-draft">🟡 Borrador</span>',
    'Esperando confirmación':'<span class="badge badge-waiting">🔵 Esperando confirmación</span>',
    'Confirmada':'<span class="badge badge-confirmed">🟢 Confirmada</span>',
    'Cerrado':'<span class="badge badge-closed">🔴 Cerrado</span>'
  };
  return map[estado]||map['Borrador'];
}
function abrirModalNuevaProg(){
  const hoy = new Date();
  const lunes = getLunes(fechaISO(hoy));
  abrirModal(`<div class="modal-header"><h3>Nueva programación semanal</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Nombre de la semana</label><input type="text" class="form-control" id="npNombre" value="Semana ${state.programaciones.length+1}"></div>
    <div class="form-row">
      <div class="form-group"><label>Fecha de inicio (lunes)</label><input type="date" class="form-control" id="npFecha" value="${lunes}"></div>
      <div class="form-group"><label>Fecha de fin</label><input type="date" class="form-control" id="npFechaFin" value="${addDias(lunes,6)}" disabled></div>
    </div>
    <div class="alert alert-red">💡 La edición estará disponible hasta <b>${state.config.horasEdicion} horas antes</b> del inicio del primer servicio.</div>
  </div>
  <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button><button class="btn btn-primary" id="npCrear">Crear programación</button></div>`);
  document.getElementById('npFecha').onchange = e=>{ document.getElementById('npFechaFin').value = addDias(e.target.value,6); };
  document.getElementById('npCrear').onclick = ()=>{
    const nombre = document.getElementById('npNombre').value.trim() || `Semana ${state.programaciones.length+1}`;
    const fecha = document.getElementById('npFecha').value;
    if(!fecha){ toast('Error','Selecciona una fecha','error'); return; }
    const p = crearProgramacion({nombre, fechaInicio:fecha});
    registrarHistorial(p.id, 'Creación', '-', nombre, 'Nueva programación');
    cerrarModal(); progSeleccionada = p.id; render();
    toast('Programación creada','Agrega servicios a cada día','success');
  };
}

function renderDetalleSemana(content, prog){
  const ed = calcularEdicion(prog);
  const insumos = consolidarInsumos(prog);
  const totalRac = prog.servicios.reduce((a,s)=>a+(Number(s.personas)||0),0);
  const insumosCompra = insumos.filter(i=>!i.eliminado);
  const comprados = insumosCompra.filter(i=>prog.compras?.[i.codInsumo]?.comprado).length;
  const dias = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const fechas = {};
  for(let i=0;i<7;i++){ const f = addDias(prog.fechaInicio, i); fechas[i] = {fecha:f, dia:dias[i]}; }
  const puedeEditarAhora = puedeEditarProg(prog);
  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px">
      <div>
        <button class="btn btn-ghost btn-sm" id="btnVolver">← Volver</button>
        <h3 style="font-size:18px;margin-top:6px">${prog.nombre} <span style="font-weight:400;color:var(--gray-500);font-size:13px">· ${fmtFecha(prog.fechaInicio)} – ${fmtFecha(prog.fechaFin)}</span></h3>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="countdown ${ed.cls}">${ed.cls==='closed'?'🔒':ed.cls==='waiting'?'⏳':ed.cls==='confirmed'?'✅':'⏱'} ${ed.texto}</span>
        ${badgeEstado(prog.estado)}
      </div>
    </div>
    ${prog.estado==='Esperando confirmación'?`<div class="alert alert-info" style="align-items:center">
      ⏳ <div style="flex:1"><b>Esperando confirmación de la nutricionista.</b> 
      ${esNutricionista() ? 'Puedes <b>editar los platos</b> si algún menú no es adecuado y luego confirmar.' : 'La nutricionista puede editar los platos antes de confirmar.'}</div>
      ${esNutricionista()?`<button class="btn btn-success btn-sm" id="btnConfirmarTop">✓ Confirmar ahora</button>`:''}
      ${esAdmin()?`<button class="btn btn-warning btn-sm" id="btnReabrirTop">🔓 Reabrir a borrador</button>`:''}
    </div>`:''}
    ${prog.estado==='Confirmada'?`<div class="alert alert-success" style="align-items:center">
      ✅ <div style="flex:1"><b>Programación confirmada por la nutricionista.</b> El comprador debe marcar todas las compras en <b>Requerimientos MRP</b> para poder cerrar la programación.</div>
      ${(esComprador() || esAdmin())?`<button class="btn btn-success btn-sm" id="btnIrMRP">Ir a MRP →</button>`:''}
      ${esAdmin()?`<button class="btn btn-warning btn-sm" id="btnReabrirTop">🔓 Reabrir</button>`:''}
    </div>`:''}
    ${prog.estado==='Cerrado'?`<div class="alert alert-danger" style="align-items:center">
      🔒 <div style="flex:1"><b>Programación cerrada.</b> Se completaron todas las compras.</div>
      ${esAdmin()?`<button class="btn btn-warning btn-sm" id="btnReabrirTop">🔓 Reabrir programación</button>`:''}
    </div>`:''}
    <div class="stats-grid">
      ${statCard('🍽️','Servicios', prog.servicios.length, 'En la semana','#fee2e2')}
      ${statCard('👥','Raciones', fmtInt(totalRac), 'Total planificado','#dcfce7')}
      ${statCard('📦','Insumos', insumos.length, 'Consolidados','#fef3c7')}
      ${statCard('✓','Comprados', `${comprados}/${insumosCompra.length}`, 'Marcados como adquiridos','#dcfce7')}
    </div>
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <h3>Calendario semanal</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${esAdmin() && prog.estado==='Borrador'?`<button class="btn btn-info btn-sm" id="btnEnviarProg">📨 Enviar a nutricionista</button>`:''}
          ${esNutricionista() && prog.estado==='Esperando confirmación'?`<button class="btn btn-success btn-sm" id="btnConfirmarProg">✓ Confirmar programación</button>`:''}
          ${esAdmin() && (prog.estado==='Confirmada' || prog.estado==='Cerrado')?`<button class="btn btn-warning btn-sm" id="btnReabrirProg2">🔓 Reabrir</button>`:''}
          ${!esNutricionista()?`<button class="btn btn-primary btn-sm" id="btnVerInsumos">📦 Ver insumos requeridos</button>`:''}
          ${!esNutricionista()?`<button class="btn btn-secondary btn-sm" id="btnExportarXLSX">📊 Exportar Excel</button>`:''}
          ${!esNutricionista()?`<button class="btn btn-secondary btn-sm" id="btnVerHistorial">📋 Ver historial</button>`:''}
        </div>
      </div>
      <div class="card-body">
        <div class="calendar">${Object.values(fechas).map(f=>renderDiaCalendario(prog, f)).join('')}</div>
      </div>
    </div>`;
  document.getElementById('btnVolver').onclick = ()=>{ progSeleccionada = null; render(); };
  const bi = document.getElementById('btnVerInsumos'); if(bi) bi.onclick = ()=>abrirModalInsumos(prog);
  const bh = document.getElementById('btnVerHistorial'); if(bh) bh.onclick = ()=>abrirModalHistorial(prog);
  const bx = document.getElementById('btnExportarXLSX'); if(bx) bx.onclick = ()=>exportarXLSX(prog.id);
  const e1 = document.getElementById('btnEnviarProg'); if(e1) e1.onclick = ()=>abrirModalEnviar(prog.id);
  const c1 = document.getElementById('btnConfirmarProg'); if(c1) c1.onclick = ()=>abrirModalConfirmar(prog.id);
  const c2 = document.getElementById('btnConfirmarTop'); if(c2) c2.onclick = ()=>abrirModalConfirmar(prog.id);
  const r1 = document.getElementById('btnReabrirProg2'); if(r1) r1.onclick = ()=>abrirModalReabrir(prog.id);
  const r2 = document.getElementById('btnReabrirTop'); if(r2) r2.onclick = ()=>abrirModalReabrir(prog.id);
  const im = document.getElementById('btnIrMRP'); if(im) im.onclick = ()=>{ currentView='mrp'; progSeleccionada = null; render(); };
  content.querySelectorAll('[data-servicio]').forEach(el=>{ el.onclick = ()=>abrirModalServicio(prog, el.dataset.servicio); });
  content.querySelectorAll('[data-add-dia]').forEach(el=>{ el.onclick = ()=>abrirModalServicio(prog, null, el.dataset.addDia); });
  if(!puedeEditarAhora){
    content.querySelectorAll('[data-add-dia]').forEach(el=>{ el.style.pointerEvents='none'; el.style.opacity='.5'; });
  }
}
function renderDiaCalendario(prog, f){
  const servicios = prog.servicios.filter(s=>s.fecha===f.fecha);
  return `<div class="cal-day">
    <div class="cal-day-header"><div class="name">${f.dia}</div><div class="date">${f.fecha.slice(8,10)}/${f.fecha.slice(5,7)}</div></div>
    <div class="cal-day-body">
      ${servicios.map(s=>`<div class="service-chip" data-servicio="${s.id}">
        <div class="type">${s.tipo}</div>
        <div class="menu">${s.recetaNombre}</div>
        <div class="qty">👥 ${fmtInt(s.personas)} personas</div>
      </div>`).join('')}
      ${servicios.length===0?`<div style="text-align:center;color:var(--gray-400);font-size:11.5px;padding:8px">Sin servicios</div>`:''}
    </div>
    <div class="cal-day-add" data-add-dia="${f.fecha}">+ Agregar servicio</div>
  </div>`;
}
function abrirModalServicio(prog, servicioId, fechaDefault){
  if(!puedeEditarProg(prog)){
    if(prog.estado === 'Cerrado' || prog.estado === 'Confirmada') toast('Programación bloqueada','Reábrela como administrador','error');
    else toast('Sin permiso','Tu rol no puede editar','error');
    return;
  }
  const s = servicioId ? prog.servicios.find(x=>x.id===servicioId) : null;
  const fecha = s ? s.fecha : (fechaDefault || prog.fechaInicio);
  const tipos = ['Plato','Postre','Fruta','Bebida'];
  const tipoActual = s ? s.tipo : 'Plato';
  abrirModal(`<div class="modal-header"><h3>${s?'Editar servicio':'Nuevo servicio'}</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-row">
      <div class="form-group"><label>Tipo de servicio</label>
        <select class="form-control" id="svTipo">${tipos.map(t=>`<option value="${t}" ${tipoActual===t?'selected':''}>${t}</option>`).join('')}</select>
        <div class="form-hint">Filtra las recetas disponibles.</div>
      </div>
      <div class="form-group"><label>Fecha</label><input type="date" class="form-control" id="svFecha" value="${fecha}"></div>
    </div>
    <div class="form-group"><label>Receta / Menú</label>
      <select class="form-control" id="svReceta"></select>
      <div class="form-hint">Solo aparecen las recetas del tipo seleccionado.</div>
    </div>
    <div class="form-group"><label>Número de personas</label><input type="number" class="form-control" id="svPersonas" min="1" value="${s?s.personas:100}"></div>
    <div class="form-group"><label>Observaciones</label><textarea class="form-control" id="svObs" placeholder="Opcional...">${s?s.observaciones||'':''}</textarea></div>
    <div id="svBOMInfo"></div>
  </div>
  <div class="modal-footer">
    ${s?`<button class="btn btn-danger" id="svEliminar">Eliminar</button>`:''}
    <button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
    <button class="btn btn-primary" id="svGuardar">Guardar servicio</button>
  </div>`);
  const pintarRecetas = (tipo, codigoSel)=>{
    const lista = RECETAS.filter(r=>r[2]===tipo);
    const sel = document.getElementById('svReceta');
    if(!lista.length){ sel.innerHTML = '<option value="">Sin recetas de este tipo</option>'; return; }
    sel.innerHTML = lista.map(r=>`<option value="${r[0]}" ${r[0]===codigoSel?'selected':''}>${r[0]} · ${r[1]}</option>`).join('');
  };
  const actualizarBOM = ()=>{
    const cod = document.getElementById('svReceta').value;
    const personas = Number(document.getElementById('svPersonas').value)||0;
    const r = RECETAS.find(x=>x[0]===cod);
    if(!r){ document.getElementById('svBOMInfo').innerHTML = ''; return; }
    const factor = personas/100;
    const filas = r[3].map(([c,cant])=>{
      const info = INSUMO_MAP[c]||{nombre:c,unidad:''};
      return `<tr><td class="mono">${c}</td><td>${info.nombre}</td><td>${info.unidad}</td><td class="text-right">${fmt(cant*factor)}</td></tr>`;
    }).join('');
    document.getElementById('svBOMInfo').innerHTML = `<div class="info-box" style="margin-top:8px">
      <b>BOM calculado</b> · Lote base: 100 raciones · Factor: ${fmt(factor,3)}
      <div class="table-wrap" style="margin-top:8px;max-height:200px;overflow-y:auto">
      <table><thead><tr><th>Código</th><th>Insumo</th><th>Und</th><th class="text-right">Cantidad</th></tr></thead><tbody>${filas}</tbody></table></div></div>`;
  };
  document.getElementById('svTipo').onchange = e=>{ pintarRecetas(e.target.value, null); actualizarBOM(); };
  document.getElementById('svReceta').onchange = actualizarBOM;
  document.getElementById('svPersonas').oninput = actualizarBOM;
  pintarRecetas(tipoActual, s?s.recetaCod:null);
  actualizarBOM();
  document.getElementById('svGuardar').onclick = ()=>{
    const tipo = document.getElementById('svTipo').value;
    const recetaCod = document.getElementById('svReceta').value;
    if(!recetaCod){ toast('Error','No hay receta seleccionada','error'); return; }
    const recetaNombre = RECETAS.find(r=>r[0]===recetaCod)?.[1]||'';
    const personas = Number(document.getElementById('svPersonas').value)||0;
    const obs = document.getElementById('svObs').value;
    const fechaN = document.getElementById('svFecha').value;
    if(!fechaN){ toast('Error','Selecciona una fecha','error'); return; }
    if(personas<=0){ toast('Error','Ingresa personas válidas','error'); return; }
    if(s){
      const orig = {...s};
      s.fecha = fechaN; s.tipo = tipo; s.recetaCod = recetaCod; s.recetaNombre = recetaNombre; s.personas = personas; s.observaciones = obs;
      registrarHistorial(prog.id, 'Servicio editado', `${orig.recetaNombre} · ${orig.personas}p`, `${recetaNombre} · ${personas}p`, 'Edición de servicio');
    } else {
      prog.servicios.push({id:uid(), fecha:fechaN, tipo, recetaCod, recetaNombre, personas, observaciones:obs});
      registrarHistorial(prog.id, 'Servicio agregado', '-', `${recetaNombre} · ${personas}p`, 'Nuevo servicio');
    }
    guardarEstado(); cerrarModal(); render();
    toast('Servicio guardado','El BOM se ha recalculado','success');
  };
  const btnElim = document.getElementById('svEliminar');
  if(btnElim) btnElim.onclick = ()=>{
    if(!confirm('¿Eliminar este servicio?')) return;
    prog.servicios = prog.servicios.filter(x=>x.id!==s.id);
    registrarHistorial(prog.id, 'Servicio eliminado', s.recetaNombre, '-', 'Eliminación de servicio');
    guardarEstado(); cerrarModal(); render();
    toast('Servicio eliminado','','warning');
  };
}

function abrirModalInsumos(prog){
  const insumos = consolidarInsumos(prog);
  const editable = puedeAjustarProg(prog);
  const filas = insumos.map(i=>{
    const ajuste = i.cantidadFinal - i.cantidadBOM;
    const badge = i.eliminado
      ? '<span class="badge badge-eliminado">🗑 Eliminado</span>'
      : (i.origen==='BOM'?'<span class="badge badge-bom">🟢 BOM</span>':i.origen==='Ajuste'?'<span class="badge badge-adjust">🟡 Ajuste</span>':'<span class="badge badge-added">🔵 Agregado</span>');
    return `<tr class="${i.eliminado?'eliminado-row':''}">
      <td class="mono">${i.codInsumo}</td><td class="cell-name">${i.nombre}</td><td>${i.unidad}</td>
      <td class="text-right">${fmt(i.cantidadBOM)}</td>
      <td class="text-right">${fmtAjuste(ajuste)}</td>
      <td class="text-right"><b>${fmt(i.cantidadFinal)}</b></td>
      <td class="text-right">${i.preventivo>0?fmt(i.preventivo):'-'}</td>
      <td class="text-right"><b>${fmt(i.reqNeto)}</b></td>
      <td>${badge}</td>
      <td>${editable?`<button class="btn btn-xs btn-secondary" data-ajustar="${i.codInsumo}">Ajustar</button>`:'<span class="badge badge-closed">🔒</span>'}</td>
    </tr>`;
  }).join('');
  abrirModal(`<div class="modal-header"><h3>Insumos requeridos · ${prog.nombre}</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
  <div class="modal-body">
    <div class="alert alert-red">💡 <b>Requerimiento final</b> = BOM + ajustes · <b>Requerimiento neto</b> = final + stock preventivo.</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Código</th><th>Insumo</th><th>Und</th><th class="text-right">BOM</th><th class="text-right">Ajuste</th><th class="text-right">Final</th><th class="text-right">Stock prev.</th><th class="text-right">Req. neto</th><th>Origen</th><th>Acción</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="10" class="text-center">Sin insumos</td></tr>'}</tbody>
    </table></div>
  </div>
  <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal()">Cerrar</button></div>`, {size:'modal-xl'});
  document.querySelectorAll('[data-ajustar]').forEach(el=>{
    el.onclick = ()=>{ cerrarModal(); abrirModalAjuste(prog, el.dataset.ajustar); };
  });
}

/* ============================================================
   AJUSTE DE REQUERIMIENTO
   ============================================================ */
function abrirModalAjuste(prog, codInsumo){
  if(!puedeAjustarProg(prog)){ toast('Sin permiso','No puedes ajustar en este estado','error'); return; }
  const insumos = consolidarInsumos(prog);
  const item = insumos.find(i=>i.codInsumo===codInsumo);
  if(!item){ toast('Error','Insumo no encontrado','error'); return; }

  const cantidadActual = item.cantidadFinal;
  const cantidadBOM = item.cantidadBOM;
  const yaAjustado = Math.abs(cantidadActual - cantidadBOM) > 0.0001 || item.origen !== 'BOM';

  const optsInsumos = INSUMOS.map(i=>`<option value="${i[0]}" ${i[0]===codInsumo?'selected':''}>${i[0]} · ${i[1]} (${i[2]})</option>`).join('');

  abrirModal(`<div class="modal-header"><h3>Ajustar requerimiento</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
  <div class="modal-body">
    <div class="alert alert-warning">⚠️ Este ajuste <b>solo afecta esta programación</b>. El BOM maestro no se modificará.</div>
    <div class="info-box" style="margin-bottom:14px">
      <b>Insumo:</b> ${item.nombre} (${item.codInsumo})<br>
      <b>Cantidad BOM original:</b> ${fmt(cantidadBOM)} ${item.unidad}<br>
      ${yaAjustado ? `<b style="color:var(--warning)">Cantidad actual ajustada:</b> ${fmt(cantidadActual)} ${item.unidad}` : ''}
    </div>
    <div class="form-group"><label>Tipo de ajuste</label>
      <select class="form-control" id="ajTipo">
        <option value="cambio_insumo">Cambio de insumo</option>
        <option value="cambio_cantidad">Cambio de cantidad</option>
        <option value="eliminar">Eliminación puntual</option>
      </select>
    </div>
    <div id="ajCamposDinamicos"></div>
    <div class="form-group" style="margin-top:14px"><label>Motivo <span style="color:var(--danger)">*</span></label><textarea class="form-control" id="ajMotivo" placeholder="Ej: Incremento de precio, disponibilidad de insumos..."></textarea><div class="form-hint">Obligatorio para auditoría.</div></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
    <button class="btn btn-warning" id="ajGuardar">Confirmar ajuste</button>
  </div>`);

  const renderCampos = ()=>{
    const tipo = document.getElementById('ajTipo').value;
    const cont = document.getElementById('ajCamposDinamicos');
    if(tipo === 'cambio_cantidad'){
      cont.innerHTML = `
        <div class="form-row">
          <div class="form-group"><label>Insumo original</label><input type="text" class="form-control" value="${item.nombre} (${item.codInsumo})" disabled></div>
          <div class="form-group"><label>Cantidad actual</label><input type="text" class="form-control" value="${fmt(cantidadActual)} ${item.unidad}" disabled></div>
        </div>
        <div class="form-group"><label>Nueva cantidad</label>
          <input type="number" step="0.01" class="form-control" id="ajCantidad" value="${fmt(cantidadActual,2)}">
        </div>`;
    } else if(tipo === 'eliminar'){
      cont.innerHTML = `
        <div class="form-row">
          <div class="form-group"><label>Insumo original</label><input type="text" class="form-control" value="${item.nombre} (${item.codInsumo})" disabled></div>
          <div class="form-group"><label>Cantidad a eliminar</label><input type="text" class="form-control" value="${fmt(cantidadActual)} ${item.unidad}" disabled></div>
        </div>
        <div class="alert alert-danger" style="margin:0">
          🗑 Se eliminará <b>${fmt(cantidadActual)} ${item.unidad}</b> de <b>${item.nombre}</b> de esta programación.
        </div>`;
    } else {
      cont.innerHTML = `
        <div class="form-row">
          <div class="form-group"><label>Insumo original</label><input type="text" class="form-control" value="${item.nombre} (${item.codInsumo})" disabled></div>
          <div class="form-group"><label>Cantidad actual</label><input type="text" class="form-control" value="${fmt(cantidadActual)} ${item.unidad}" disabled></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Nuevo insumo</label><select class="form-control" id="ajNuevo">${optsInsumos}</select></div>
          <div class="form-group"><label>Nueva cantidad</label><input type="number" step="0.01" class="form-control" id="ajCantidad" value="${fmt(cantidadActual,2)}"></div>
        </div>`;
    }
  };

  document.getElementById('ajTipo').onchange = renderCampos;
  renderCampos();

  document.getElementById('ajGuardar').onclick = ()=>{
    const tipo = document.getElementById('ajTipo').value;
    const motivo = document.getElementById('ajMotivo').value.trim();
    if(!motivo){ toast('Error','El motivo es obligatorio','error'); return; }

    let ajuste, descNuevo;
    if(tipo === 'cambio_cantidad'){
      const cant = Number(document.getElementById('ajCantidad').value)||0;
      ajuste = { id: uid(), tipo, insumoOriginal: codInsumo, insumoNuevo: codInsumo, cantidadOriginal: cantidadActual, cantidadNueva: cant, motivo, fecha: nowISO(), usuario: state.usuario.nombre };
      descNuevo = `${item.nombre} ${fmt(cant)}`;
    } else if(tipo === 'eliminar'){
      ajuste = { id: uid(), tipo, insumoOriginal: codInsumo, insumoNuevo: codInsumo, cantidadOriginal: cantidadActual, cantidadNueva: 0, motivo, fecha: nowISO(), usuario: state.usuario.nombre };
      descNuevo = `Eliminado: ${item.nombre}`;
    } else {
      const nuevo = document.getElementById('ajNuevo').value;
      const cant = Number(document.getElementById('ajCantidad').value)||0;
      ajuste = { id: uid(), tipo, insumoOriginal: codInsumo, insumoNuevo: nuevo, cantidadOriginal: cantidadActual, cantidadNueva: cant, motivo, fecha: nowISO(), usuario: state.usuario.nombre };
      descNuevo = `${INSUMO_MAP[nuevo]?.nombre||nuevo} ${fmt(cant)}`;
    }

    prog.ajustes.push(ajuste);
    registrarHistorial(prog.id, 'Ajuste excepcional', `${item.nombre} ${fmt(cantidadActual)}`, descNuevo, motivo);
    guardarEstado(); cerrarModal(); render();
    toast('Ajuste registrado','BOM maestro intacto','success');
  };
}

/* ============================================================
   AGREGAR INSUMO EXTRA
   ============================================================ */
function abrirModalAgregarInsumoExtra(prog){
  if(!puedeAjustarProg(prog)){ toast('Sin permiso','No puedes ajustar en este estado','error'); return; }
  const optsInsumos = INSUMOS.map(i=>`<option value="${i[0]}">${i[0]} · ${i[1]} (${i[2]})</option>`).join('');
  abrirModal(`<div class="modal-header"><h3>➕ Agregar insumo extra</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
  <div class="modal-body">
    <div class="alert alert-info">💡 Agrega un insumo que <b>no forma parte del BOM</b> de esta programación. Solo afecta a esta semana.</div>
    <div class="form-row">
      <div class="form-group"><label>Insumo</label><select class="form-control" id="exInsumo">${optsInsumos}</select></div>
      <div class="form-group"><label>Cantidad</label><input type="number" step="0.01" class="form-control" id="exCantidad" value="1"></div>
    </div>
    <div class="form-group"><label>Motivo <span style="color:var(--danger)">*</span></label><textarea class="form-control" id="exMotivo" placeholder="Ej: Actividad especial, imprevisto..."></textarea></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
    <button class="btn btn-primary" id="exGuardar">Agregar insumo</button>
  </div>`);
  document.getElementById('exGuardar').onclick = ()=>{
    const cod = document.getElementById('exInsumo').value;
    const cant = Number(document.getElementById('exCantidad').value)||0;
    const motivo = document.getElementById('exMotivo').value.trim();
    if(!motivo){ toast('Error','El motivo es obligatorio','error'); return; }
    if(cant <= 0){ toast('Error','La cantidad debe ser mayor a 0','error'); return; }
    const ajuste = { id: uid(), tipo: 'agregar', insumoOriginal: cod, insumoNuevo: cod, cantidadOriginal: 0, cantidadNueva: cant, motivo, fecha: nowISO(), usuario: state.usuario.nombre };
    prog.ajustes.push(ajuste);
    registrarHistorial(prog.id, 'Insumo extra agregado', '-', `${INSUMO_MAP[cod]?.nombre||cod} ${fmt(cant)}`, motivo);
    guardarEstado(); cerrarModal(); render();
    toast('Insumo agregado','Solo afecta a esta programación','success');
  };
}

function abrirModalHistorial(prog){
  const filas = prog.historial.length ? prog.historial.map(h=>`<tr>
    <td>${fmtFechaHora(h.fecha)}</td><td>${h.usuario}</td><td>${h.campo}</td><td>${h.original}</td><td>${h.nuevo}</td><td>${h.motivo||'-'}</td>
  </tr>`).join('') : '<tr><td colspan="6" class="text-center">Sin cambios</td></tr>';
  abrirModal(`<div class="modal-header"><h3>Historial · ${prog.nombre}</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
  <div class="modal-body"><div class="table-wrap"><table>
    <thead><tr><th>Fecha</th><th>Usuario</th><th>Campo</th><th>Original</th><th>Nuevo</th><th>Motivo</th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div></div>
  <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal()">Cerrar</button></div>`, {size:'modal-xl'});
}

function abrirModalEnviar(id){
  const prog = getProgramacion(id);
  if(!prog) return;
  if(!esAdmin()){ toast('Sin permiso','','error'); return; }
  if(prog.estado !== 'Borrador'){ toast('Estado inválido','','warning'); return; }
  abrirModal(`<div class="modal-header"><h3>Enviar a nutricionista</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
  <div class="modal-body">
    <div class="alert alert-info">📨 Pasará a <b>"Esperando confirmación"</b>. La nutricionista podrá editar los platos y luego confirmar.</div>
    <div class="info-box" style="margin-bottom:14px"><b>${prog.nombre}</b> · ${fmtFecha(prog.fechaInicio)} – ${fmtFecha(prog.fechaFin)}</div>
    <div class="form-group"><label>Observaciones</label><textarea class="form-control" id="envObs" placeholder="Opcional"></textarea></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
    <button class="btn btn-info" id="envConfirmar">📨 Enviar ahora</button>
  </div>`);
  document.getElementById('envConfirmar').onclick = ()=>{
    const obs = document.getElementById('envObs').value.trim();
    prog.estado = 'Esperando confirmación';
    prog.fechaEnvio = nowISO();
    prog.usuarioEnvio = state.usuario.nombre;
    registrarHistorial(prog.id, 'Envío', 'Borrador', 'Esperando confirmación', obs || 'Enviado');
    guardarEstado(); cerrarModal(); render();
    toast('Enviado','Esperando confirmación','success');
  };
}

function abrirModalConfirmar(id){
  const prog = getProgramacion(id);
  if(!prog) return;
  if(!esNutricionista()){ toast('Sin permiso','','error'); return; }
  if(prog.estado !== 'Esperando confirmación'){ toast('Estado inválido','','warning'); return; }
  abrirModal(`<div class="modal-header"><h3>Confirmar programación</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
  <div class="modal-body">
    <div class="alert alert-success">✓ Al confirmar, la programación pasará a estado <b>"Confirmada"</b>. El comprador podrá verla en <b>Requerimientos MRP</b> y marcarla como comprada.</div>
    <div class="info-box" style="margin-bottom:14px"><b>${prog.nombre}</b></div>
    <div class="form-group"><label>Observaciones</label><textarea class="form-control" id="confObs" placeholder="Opcional"></textarea></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
    <button class="btn btn-success" id="confConfirmar">✓ Confirmar programación</button>
  </div>`);
  document.getElementById('confConfirmar').onclick = ()=>{
    const obs = document.getElementById('confObs').value.trim();
    prog.estado = 'Confirmada';
    prog.fechaConfirmacion = nowISO();
    prog.usuarioConfirmacion = state.usuario.nombre;
    registrarHistorial(prog.id, 'Confirmación', 'Esperando confirmación', 'Confirmada', obs || 'Confirmada por nutricionista');
    guardarEstado(); cerrarModal(); render();
    toast('Programación confirmada','El comprador debe cerrarla desde MRP','success');
  };
}

function abrirModalCerrarProgramacion(id){
  const prog = getProgramacion(id);
  if(!prog) return;
  if(!puedeCerrar(prog)){ toast('Sin permiso','','error'); return; }
  if(!estaCompleto(prog)){ toast('Aún no está completo','Marca todos los insumos como comprados primero','warning'); return; }
  abrirModal(`<div class="modal-header"><h3>Cerrar programación</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
  <div class="modal-body">
    <div class="alert alert-success">🔒 Todos los insumos han sido comprados. Al cerrar, la programación quedará bloqueada definitivamente.</div>
    <div class="info-box" style="margin-bottom:14px"><b>${prog.nombre}</b> · ${fmtFecha(prog.fechaInicio)} – ${fmtFecha(prog.fechaFin)}</div>
    <div class="form-group"><label>Observaciones (opcional)</label><textarea class="form-control" id="cerObs" placeholder="Opcional"></textarea></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
    <button class="btn btn-danger" id="cerConfirmar">🔒 Confirmar cierre</button>
  </div>`);
  document.getElementById('cerConfirmar').onclick = ()=>{
    const obs = document.getElementById('cerObs').value.trim();
    prog.estado = 'Cerrado';
    prog.fechaCierre = nowISO();
    prog.usuarioCierre = state.usuario.nombre;
    registrarHistorial(prog.id, 'Cierre', 'Confirmada', 'Cerrado', obs || 'Cerrada por comprador al completar todas las compras');
    guardarEstado(); cerrarModal(); render();
    toast('Programación cerrada','Todas las compras completadas','success');
  };
}

function abrirModalReabrir(id){
  const prog = getProgramacion(id);
  if(!prog) return;
  if(!esAdmin()){ toast('Sin permiso','','error'); return; }
  if(prog.estado === 'Borrador'){ toast('Ya está abierta','','warning'); return; }
  abrirModal(`<div class="modal-header"><h3>Reabrir programación</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
  <div class="modal-body">
    <div class="alert alert-warning">⚠️ Volverá a estado <b>Borrador</b>.</div>
    <div class="info-box" style="margin-bottom:14px">Estado actual: <b>${prog.estado}</b></div>
    <div class="form-group"><label>Motivo <span style="color:var(--danger)">*</span></label><textarea class="form-control" id="rbMotivo" placeholder="Ej: Corrección de cantidades"></textarea></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
    <button class="btn btn-warning" id="rbConfirmar">🔓 Reabrir</button>
  </div>`);
  document.getElementById('rbConfirmar').onclick = ()=>{
    const motivo = document.getElementById('rbMotivo').value.trim();
    if(!motivo){ toast('Error','Motivo obligatorio','error'); return; }
    const estadoAnterior = prog.estado;
    prog.estado = 'Borrador';
    prog.fechaReapertura = nowISO();
    prog.usuarioReapertura = state.usuario.nombre;
    prog.motivoReapertura = motivo;
    registrarHistorial(prog.id, 'Reapertura', estadoAnterior, 'Borrador', motivo);
    guardarEstado(); cerrarModal(); render();
    toast('Reabierta','Ahora en Borrador','success');
  };
}
function duplicarProgramacion(id){
  const orig = getProgramacion(id);
  if(!orig) return;
  if(!esAdmin()){ toast('Sin permiso','','error'); return; }
  if(!confirm('¿Duplicar?')) return;
  const nuevo = JSON.parse(JSON.stringify(orig));
  nuevo.id = uid();
  nuevo.nombre = orig.nombre + ' (copia)';
  nuevo.fechaInicio = addDias(orig.fechaInicio, 7);
  nuevo.fechaFin = addDias(orig.fechaFin, 7);
  nuevo.estado = 'Borrador';
  nuevo.fechaCreacion = nowISO();
  nuevo.fechaCierre = null;
  nuevo.historial = [];
  nuevo.compras = {};
  nuevo.servicios = nuevo.servicios.map(s=>{ const ns = {...s}; ns.id = uid(); ns.fecha = addDias(s.fecha, 7); return ns; });
  nuevo.ajustes = nuevo.ajustes.map(a=>{ const na = {...a}; na.id = uid(); return na; });
  state.programaciones.push(nuevo);
  registrarHistorial(nuevo.id, 'Duplicación', orig.nombre, nuevo.nombre, 'Copia');
  guardarEstado(); render();
  toast('Duplicada','','success');
}
function eliminarProgramacion(id){
  if(!esAdmin()){ toast('Sin permiso','','error'); return; }
  if(!confirm('¿Eliminar?')) return;
  state.programaciones = state.programaciones.filter(p=>p.id!==id);
  guardarEstado(); render();
  toast('Eliminada','','warning');
}

function exportarXLSX(id){
  const prog = getProgramacion(id);
  if(!prog) return;
  if(typeof XLSX === 'undefined'){ toast('Error','XLSX no disponible','error'); return; }
  const insumos = consolidarInsumos(prog);
  const dataReq = [['Código','Insumo','Unidad','Req. BOM','Ajuste','Req. Final','Stock preventivo','Req. Neto','Origen','Comprado']];
  insumos.forEach(i=>{
    const comprado = prog.compras?.[i.codInsumo]?.comprado ? 'Sí' : 'No';
    const origen = i.eliminado ? 'Eliminado' : i.origen;
    dataReq.push([i.codInsumo, i.nombre, i.unidad, Number(i.cantidadBOM.toFixed(4)), Number((i.cantidadFinal-i.cantidadBOM).toFixed(4)), Number(i.cantidadFinal.toFixed(4)), Number(i.preventivo.toFixed(4)), Number(i.reqNeto.toFixed(4)), origen, comprado]);
  });
  const dataServ = [['Fecha','Día','Tipo','Código','Receta','Personas','Observaciones']];
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  prog.servicios.slice().sort((a,b)=>a.fecha.localeCompare(b.fecha)).forEach(s=>{
    const dia = dias[new Date(s.fecha+'T12:00:00').getDay()];
    dataServ.push([s.fecha, dia, s.tipo, s.recetaCod, s.recetaNombre, Number(s.personas), s.observaciones||'']);
  });
  const wb = XLSX.utils.book_new();
  const wsReq = XLSX.utils.aoa_to_sheet(dataReq);
  const wsServ = XLSX.utils.aoa_to_sheet(dataServ);
  wsReq['!cols'] = [{wch:10},{wch:32},{wch:7},{wch:11},{wch:10},{wch:12},{wch:14},{wch:11},{wch:11},{wch:10}];
  wsServ['!cols'] = [{wch:11},{wch:10},{wch:9},{wch:12},{wch:40},{wch:9},{wch:40}];
  XLSX.utils.book_append_sheet(wb, wsReq, 'Requerimientos');
  XLSX.utils.book_append_sheet(wb, wsServ, 'Servicios');
  XLSX.writeFile(wb, `MRP_${prog.nombre.replace(/\s+/g,'_')}_${fechaISO(new Date())}.xlsx`);
  toast('Exportado','Excel generado','success');
}

function renderRecetas(content){
  const editable = esAdmin() || esNutricionista();
  content.innerHTML = `
    <div class="filter-bar">
      <input type="text" class="form-control" id="buscarReceta" placeholder="🔍 Buscar receta..." style="min-width:220px">
      <select class="form-control" id="filtroTipo">
        <option value="">Todos los tipos</option>
        <option value="Plato">Platos</option>
        <option value="Postre">Postres</option>
        <option value="Fruta">Frutas</option>
        <option value="Bebida">Bebidas</option>
      </select>
      ${editable?`<button class="btn btn-secondary" id="btnNuevoInsumo">+ Nuevo insumo</button>`:''}
      ${editable?`<button class="btn btn-primary" id="btnNuevaReceta">+ Nueva receta</button>`:''}
    </div>
    <div class="card">
      <div class="card-header"><h3>Listado de recetas y BOM</h3></div>
      <div class="card-body">
        <div class="table-wrap"><table>
          <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th class="text-right">Insumos</th><th>Acción</th></tr></thead>
          <tbody id="tbRecetas"></tbody>
        </table></div>
      </div>
    </div>`;
  const pintar = ()=>{
    const q = (document.getElementById('buscarReceta')?.value||'').toLowerCase();
    const tipo = document.getElementById('filtroTipo')?.value||'';
    let lista = [...RECETAS];
    if(q) lista = lista.filter(r=>r[0].toLowerCase().includes(q) || r[1].toLowerCase().includes(q));
    if(tipo) lista = lista.filter(r=>r[2]===tipo);
    document.getElementById('tbRecetas').innerHTML = lista.map(r=>`<tr>
      <td class="mono">${r[0]}</td><td class="cell-name">${r[1]}</td><td>${r[2]}</td>
      <td class="text-right">${r[3].length}</td>
      <td><button class="btn btn-xs btn-secondary" data-ver-receta="${r[0]}">Ver BOM</button></td>
    </tr>`).join('') || '<tr><td colspan="5" class="text-center">Sin resultados</td></tr>';
    bindVerReceta();
  };
  document.getElementById('buscarReceta').oninput = pintar;
  document.getElementById('filtroTipo').onchange = pintar;
  const btnI = document.getElementById('btnNuevoInsumo'); if(btnI) btnI.onclick = abrirModalNuevoInsumo;
  const btnR = document.getElementById('btnNuevaReceta'); if(btnR) btnR.onclick = abrirModalNuevaReceta;
  pintar();
}
function bindVerReceta(){
  document.querySelectorAll('[data-ver-receta]').forEach(el=>{
    el.onclick = ()=>{
      const rec = RECETAS.find(r=>r[0]===el.dataset.verReceta);
      if(!rec) return;
      const filas = rec[3].map(([c,cant])=>{
        const info = INSUMO_MAP[c]||{nombre:c,unidad:''};
        return `<tr><td class="mono">${c}</td><td>${info.nombre}</td><td>${info.unidad}</td><td>${info.categoria||''}</td><td class="text-right">${fmt(cant)}</td></tr>`;
      }).join('');
      abrirModal(`<div class="modal-header"><h3>BOM · ${rec[0]} ${rec[1]}</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
      <div class="modal-body">
        <div class="info-box" style="margin-bottom:14px"><b>Lote base:</b> 100 raciones · <b>Tipo:</b> ${rec[2]}</div>
        <div class="table-wrap"><table><thead><tr><th>Código</th><th>Insumo</th><th>Und</th><th>Categoría</th><th class="text-right">Cantidad</th></tr></thead><tbody>${filas}</tbody></table></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal()">Cerrar</button></div>`, {size:'modal-lg'});
    };
  });
}
function abrirModalNuevoInsumo(){
  if(!(esAdmin() || esNutricionista())){ toast('Sin permiso','','error'); return; }
  const codigoSugerido = 'INS-' + String(Math.max(0,...INSUMOS.map(i=>parseInt(i[0].replace(/\D/g,''))).filter(n=>!isNaN(n)))+1).padStart(3,'0');
  abrirModal(`<div class="modal-header"><h3>Nuevo insumo</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-row">
      <div class="form-group"><label>Código</label><input type="text" class="form-control" id="niCodigo" value="${codigoSugerido}"></div>
      <div class="form-group"><label>Unidad</label><select class="form-control" id="niUnidad">${UNIDADES.map(u=>`<option>${u}</option>`).join('')}</select></div>
    </div>
    <div class="form-group"><label>Nombre</label><input type="text" class="form-control" id="niNombre" placeholder="Ej: Papa amarilla"></div>
    <div class="form-row">
      <div class="form-group"><label>Categoría</label><select class="form-control" id="niCategoria">${CATEGORIAS.map(c=>`<option>${c}</option>`).join('')}</select></div>
      <div class="form-group"><label>¿Crítico?</label><select class="form-control" id="niCritico"><option>No</option><option>Si</option></select></div>
    </div>
  </div>
  <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button><button class="btn btn-primary" id="niGuardar">Guardar</button></div>`);
  document.getElementById('niGuardar').onclick = ()=>{
    const codigo = document.getElementById('niCodigo').value.trim().toUpperCase();
    const nombre = document.getElementById('niNombre').value.trim();
    if(!codigo || !nombre){ toast('Error','Código y nombre obligatorios','error'); return; }
    if(INSUMOS.find(i=>i[0]===codigo)){ toast('Error','Código ya existe','error'); return; }
    const nuevo = [codigo, nombre, document.getElementById('niUnidad').value, document.getElementById('niCategoria').value, document.getElementById('niCritico').value];
    INSUMOS.push(nuevo); state.insumosCustom.push(nuevo); rebuildInsumoMap();
    guardarEstado(); cerrarModal(); render();
    toast('Insumo agregado', nombre, 'success');
  };
}
let ingredientesTemp = [];
function abrirModalNuevaReceta(){
  if(!(esAdmin() || esNutricionista())){ toast('Sin permiso','','error'); return; }
  ingredientesTemp = [];
  const prefijos = {Plato:'PL-', Postre:'PO-', Fruta:'FR-', Bebida:'BE-'};
  const sugerido = 'PL-' + String(Math.max(0,...RECETAS.filter(r=>r[0].startsWith('PL-')).map(r=>parseInt(r[0].replace(/\D/g,''))).filter(n=>!isNaN(n)))+1).padStart(2,'0');
  abrirModal(`<div class="modal-header"><h3>Nueva receta</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-row">
      <div class="form-group"><label>Código</label><input type="text" class="form-control" id="nrCodigo" value="${sugerido}"></div>
      <div class="form-group"><label>Tipo</label>
        <select class="form-control" id="nrTipo"><option value="Plato">Plato</option><option value="Postre">Postre</option><option value="Fruta">Fruta</option><option value="Bebida">Bebida</option></select>
      </div>
    </div>
    <div class="form-group"><label>Nombre</label><input type="text" class="form-control" id="nrNombre" placeholder="Ej: Cabrito con yuca"></div>
    <div class="form-group">
      <label>Insumos (lote base 100 raciones)</label>
      <div id="nrIngredientes"></div>
      <button class="btn btn-secondary btn-sm" id="nrAddIng" style="margin-top:8px">+ Agregar insumo</button>
    </div>
  </div>
  <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button><button class="btn btn-primary" id="nrGuardar">Guardar</button></div>`);
  const pintarIngredientes = ()=>{
    const cont = document.getElementById('nrIngredientes');
    if(!ingredientesTemp.length){ cont.innerHTML = '<div style="color:var(--gray-400);font-size:12.5px;padding:10px;text-align:center;background:var(--gray-50);border-radius:8px">Sin insumos</div>'; return; }
    cont.innerHTML = ingredientesTemp.map((ing, idx)=>{
      const opts = INSUMOS.map(i=>`<option value="${i[0]}" ${i[0]===ing.codigo?'selected':''}>${i[0]} · ${i[1]} (${i[2]})</option>`).join('');
      return `<div class="ing-row" data-idx="${idx}">
        <select class="form-control" data-role="insumo">${opts}</select>
        <input type="number" step="0.01" min="0" class="form-control" data-role="cantidad" value="${ing.cantidad}">
        <button class="btn-remove" data-role="remove">✕</button>
      </div>`;
    }).join('');
    cont.querySelectorAll('.ing-row').forEach(row=>{
      const idx = Number(row.dataset.idx);
      row.querySelector('[data-role="insumo"]').onchange = e=>{ ingredientesTemp[idx].codigo = e.target.value; };
      row.querySelector('[data-role="cantidad"]').oninput = e=>{ ingredientesTemp[idx].cantidad = Number(e.target.value)||0; };
      row.querySelector('[data-role="remove"]').onclick = ()=>{ ingredientesTemp.splice(idx,1); pintarIngredientes(); };
    });
  };
  document.getElementById('nrAddIng').onclick = ()=>{ ingredientesTemp.push({codigo: INSUMOS[0][0], cantidad: 1}); pintarIngredientes(); };
  document.getElementById('nrTipo').onchange = e=>{ document.getElementById('nrCodigo').value = prefijos[e.target.value] + String(Math.max(0,...RECETAS.filter(r=>r[0].startsWith(prefijos[e.target.value])).map(r=>parseInt(r[0].replace(/\D/g,''))).filter(n=>!isNaN(n)))+1).padStart(2,'0'); };
  pintarIngredientes();
  document.getElementById('nrGuardar').onclick = ()=>{
    const codigo = document.getElementById('nrCodigo').value.trim().toUpperCase();
    const nombre = document.getElementById('nrNombre').value.trim();
    const tipo = document.getElementById('nrTipo').value;
    if(!codigo || !nombre){ toast('Error','Código y nombre obligatorios','error'); return; }
    if(RECETAS.find(r=>r[0]===codigo)){ toast('Error','Código ya existe','error'); return; }
    if(!ingredientesTemp.length){ toast('Error','Agrega insumos','error'); return; }
    const nueva = [codigo, nombre, tipo, ingredientesTemp.map(i=>[i.codigo, i.cantidad])];
    RECETAS.push(nueva); state.recetasCustom.push(nueva);
    guardarEstado(); cerrarModal(); render();
    toast('Receta agregada', nombre, 'success');
  };
}

function renderMRP(content){
  let progs = state.programaciones;
  if(esComprador() || esAdmin()) progs = progs.filter(p=>p.estado === 'Confirmada' || p.estado === 'Cerrado');
  if(!progs.length){
    const msg = (esComprador() || esAdmin())
      ? 'Las programaciones aparecerán aquí una vez que la nutricionista las confirme.'
      : 'Aún no hay programaciones registradas.';
    content.innerHTML = `<div class="empty-state"><div class="icon">📦</div><h3>Sin programaciones disponibles</h3><p>${msg}</p></div>`;
    return;
  }
  let progId = progSeleccionada && progs.find(p=>p.id===progSeleccionada) ? progSeleccionada : progs[0].id;
  const prog = getProgramacion(progId);
  const insumos = consolidarInsumos(prog);
  const insumosCompra = insumos.filter(i=>!i.eliminado);
  const totalFinal = insumos.reduce((a,i)=>a+i.cantidadFinal,0);
  const totalPreventivo = insumos.reduce((a,i)=>a+i.preventivo,0);
  const totalNeto = insumos.reduce((a,i)=>a+i.reqNeto,0);
  const comprados = insumosCompra.filter(i=>prog.compras?.[i.codInsumo]?.comprado).length;
  const puedeComprar = puedeMarcarCompras();
  const completo = estaCompleto(prog);
  const puedeAjustarAhora = puedeAjustarProg(prog);

  let barraConfirmada = '';
  if(prog.estado === 'Confirmada'){
    const faltaCompra = insumosCompra.length - comprados;
    if(esComprador() || esAdmin()){
      if(completo){
        barraConfirmada = `<div class="alert alert-success" style="align-items:center;gap:14px">
          ✅ <div style="flex:1"><b>¡Todos los insumos han sido comprados!</b> Puedes cerrar la programación para bloquearla definitivamente.</div>
          <button class="btn btn-danger btn-sm" id="mrpCerrarProg">🔒 Cerrar programación</button>
        </div>`;
      } else {
        barraConfirmada = `<div class="alert alert-info" style="align-items:center;gap:14px">
          🛒 <div style="flex:1"><b>Programación confirmada por la nutricionista.</b> Marca los insumos conforme los vayas comprando. Faltan <b>${faltaCompra}</b> de ${insumosCompra.length}. Cuando todos estén marcados, aparecerá el botón para cerrar.</div>
        </div>`;
      }
    }
  }
  if(prog.estado === 'Cerrado'){
    barraConfirmada = `<div class="alert alert-danger" style="align-items:center">
      🔒 <div style="flex:1"><b>Programación cerrada.</b> Todas las compras fueron completadas. ${esAdmin()?'El administrador puede reabrirla si es necesario.':''}</div>
      ${esAdmin()?`<button class="btn btn-warning btn-sm" id="mrpReabrirProg">🔓 Reabrir</button>`:''}
    </div>`;
  }

  content.innerHTML = `
    <div class="filter-bar">
      <select class="form-control" id="mrpProg" style="min-width:280px">
        ${progs.map(p=>`<option value="${p.id}" ${p.id===progId?'selected':''}>${p.nombre} · ${fmtFecha(p.fechaInicio)} · ${p.estado}</option>`).join('')}
      </select>
      ${puedeComprar && prog.estado !== 'Cerrado' ? `<button class="btn btn-secondary" id="mrpMarcarTodos">✓ Marcar todos</button>` : ''}
      ${puedeComprar && prog.estado !== 'Cerrado' ? `<button class="btn btn-secondary" id="mrpDesmarcarTodos">✗ Desmarcar todos</button>` : ''}
      ${puedeAjustarAhora ? `<button class="btn btn-info" id="mrpAgregarExtra">➕ Agregar insumo extra</button>` : ''}
      ${!esComprador() ? `<button class="btn btn-secondary" id="mrpExportar">📊 Exportar Excel</button>` : ''}
    </div>
    ${barraConfirmada}
    <div class="stats-grid">
      ${statCard('✅','Requerimiento final', fmt(totalFinal), 'BOM + ajustes','#dcfce7')}
      ${statCard('➕','Stock preventivo', fmt(totalPreventivo), 'Adicional','#fecaca')}
      ${statCard('📦','Requerimiento neto', fmt(totalNeto), 'Final + preventivo','#fef3c7')}
      ${statCard('🛒','Compras', `${comprados}/${insumosCompra.length}`, 'Marcados (sin eliminados)','#dcfce7')}
    </div>
    <div class="card">
      <div class="card-header"><h3>Requerimientos MRP · ${prog.nombre}</h3>
        <span class="countdown ${calcularEdicion(prog).cls}">${calcularEdicion(prog).texto}</span>
      </div>
      <div class="card-body">
        <div class="table-wrap"><table>
          <thead><tr>
            <th style="width:50px" class="text-center">✓</th>
            <th>Código</th><th>Insumo</th><th>Und</th>
            <th class="text-right">Req. BOM</th><th class="text-right">Ajuste</th><th class="text-right">Req. Final</th>
            <th class="text-right">Stock preventivo</th><th class="text-right">Req. Neto</th>
            <th>Origen</th>
            ${puedeAjustarAhora?`<th>Acción</th>`:''}
          </tr></thead>
          <tbody>${insumos.map(i=>{
            const ajuste = i.cantidadFinal - i.cantidadBOM;
            const badge = i.eliminado
              ? '<span class="badge badge-eliminado">🗑 Eliminado</span>'
              : (i.origen==='BOM'?'<span class="badge badge-bom">🟢 BOM</span>':i.origen==='Ajuste'?'<span class="badge badge-adjust">🟡 Ajuste</span>':'<span class="badge badge-added">🔵 Agregado</span>');
            const comprado = prog.compras?.[i.codInsumo]?.comprado;
            const preventivoCell = i.preventivo>0?`<span class="badge badge-extra">+${fmt(i.preventivo)}</span>`:'-';
            const celdaCheck = i.eliminado
              ? '<span class="check-eliminado" title="Insumo eliminado — no requiere compra">—</span>'
              : `<input type="checkbox" class="check-comprar" data-comprar="${i.codInsumo}" ${comprado?'checked':''} ${!puedeComprar || prog.estado === 'Cerrado'?'disabled':''}>`;
            return `<tr class="${comprado&&!i.eliminado?'comprado':''} ${i.eliminado?'eliminado-row':''}">
              <td class="text-center">${celdaCheck}</td>
              <td class="mono">${i.codInsumo}</td><td class="cell-name">${i.nombre}</td><td>${i.unidad}</td>
              <td class="text-right">${fmt(i.cantidadBOM)}</td>
              <td class="text-right">${fmtAjuste(ajuste)}</td>
              <td class="text-right"><b>${fmt(i.cantidadFinal)}</b></td>
              <td class="text-right">${preventivoCell}</td>
              <td class="text-right" style="color:var(--primary);font-weight:700">${fmt(i.reqNeto)}</td>
              <td>${badge}</td>
              ${puedeAjustarAhora?`<td><button class="btn btn-xs btn-secondary" data-ajustar-mrp="${i.codInsumo}">Ajustar</button></td>`:''}
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>
    </div>`;
  document.getElementById('mrpProg').onchange = e=>{ progSeleccionada = e.target.value; render(); };
  const mrpExp = document.getElementById('mrpExportar');
  if(mrpExp) mrpExp.onclick = ()=>exportarXLSX(progId);
  const btnExtra = document.getElementById('mrpAgregarExtra');
  if(btnExtra) btnExtra.onclick = ()=>abrirModalAgregarInsumoExtra(prog);
  const m1 = document.getElementById('mrpMarcarTodos');
  if(m1) m1.onclick = ()=>{
    if(!confirm('¿Marcar TODOS?')) return;
    prog.compras = prog.compras || {};
    insumosCompra.forEach(i=>{ prog.compras[i.codInsumo] = {comprado:true, fecha:nowISO(), usuario:state.usuario.nombre}; });
    guardarEstado(); render();
    toast('Compras registradas','','success');
  };
  const m2 = document.getElementById('mrpDesmarcarTodos');
  if(m2) m2.onclick = ()=>{
    if(!confirm('¿Desmarcar TODOS?')) return;
    prog.compras = {};
    guardarEstado(); render();
    toast('Compras reiniciadas','','warning');
  };
  const btnCerrar = document.getElementById('mrpCerrarProg');
  if(btnCerrar) btnCerrar.onclick = ()=>abrirModalCerrarProgramacion(progId);
  const btnReabrir = document.getElementById('mrpReabrirProg');
  if(btnReabrir) btnReabrir.onclick = ()=>abrirModalReabrir(progId);
  content.querySelectorAll('[data-comprar]').forEach(cb=>{
    if(cb.disabled) return;
    cb.onchange = ()=>{
      const cod = cb.dataset.comprar;
      prog.compras = prog.compras || {};
      if(cb.checked){
        prog.compras[cod] = {comprado:true, fecha:nowISO(), usuario:state.usuario.nombre};
        registrarHistorial(prog.id, 'Compra registrada', '-', `${INSUMO_MAP[cod]?.nombre||cod}`, 'Marcado');
      } else {
        delete prog.compras[cod];
        registrarHistorial(prog.id, 'Compra eliminada', `${INSUMO_MAP[cod]?.nombre||cod}`, '-', 'Desmarcado');
      }
      guardarEstado();
      render();
    };
  });
  content.querySelectorAll('[data-ajustar-mrp]').forEach(el=>{
    el.onclick = ()=>abrirModalAjuste(prog, el.dataset.ajustarMrp);
  });
}

function renderHistorial(content){
  const historial = [...state.historial].sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const progs = [...state.programaciones].sort((a,b)=>b.fechaInicio.localeCompare(a.fechaInicio));
  content.innerHTML = `
    <div class="stats-grid">
      ${statCard('📋','Cambios', state.historial.length, 'En el sistema','#fee2e2')}
      ${statCard('📅','Programaciones', state.programaciones.length, 'Semanas','#dcfce7')}
      ${statCard('⚠️','Ajustes', state.programaciones.reduce((a,p)=>a+p.ajustes.length,0), 'Sobre BOM','#fef3c7')}
    </div>
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>Cambios registrados</h3></div>
      <div class="card-body">
        <div class="table-wrap"><table>
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Campo</th><th>Original</th><th>Nuevo</th><th>Motivo</th></tr></thead>
          <tbody>${historial.length?historial.map(h=>`<tr>
            <td>${fmtFechaHora(h.fecha)}</td><td>${h.usuario}</td><td>${h.campo}</td><td>${h.original}</td><td>${h.nuevo}</td><td>${h.motivo||'-'}</td>
          </tr>`).join(''):'<tr><td colspan="6" class="text-center">Sin cambios</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>Programaciones</h3></div>
      <div class="card-body">
        <div class="table-wrap"><table>
          <thead><tr><th>Semana</th><th>Rango</th><th>Estado</th><th class="text-right">Servicios</th><th class="text-right">Raciones</th><th class="text-right">Ajustes</th><th>Creada</th><th>Acción</th></tr></thead>
          <tbody>${progs.length?progs.map(p=>{
            const totalRac = p.servicios.reduce((a,s)=>a+(Number(s.personas)||0),0);
            return `<tr>
              <td><b>${p.nombre}</b></td>
              <td>${fmtFecha(p.fechaInicio)} – ${fmtFecha(p.fechaFin)}</td>
              <td>${badgeEstado(p.estado)}</td>
              <td class="text-right">${p.servicios.length}</td>
              <td class="text-right">${fmtInt(totalRac)}</td>
              <td class="text-right">${p.ajustes.length}</td>
              <td>${fmtFechaHora(p.fechaCreacion)}</td>
              <td><button class="btn btn-xs btn-secondary" data-ir-prog="${p.id}">Ver</button></td>
            </tr>`;
          }).join(''):'<tr><td colspan="8" class="text-center">Sin programaciones</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>`;
  content.querySelectorAll('[data-ir-prog]').forEach(el=>{
    el.onclick = ()=>{ progSeleccionada = el.dataset.irProg; currentView = 'programacion'; render(); };
  });
}

function renderConfig(content){
  const esAdminUser = esAdmin();
  content.innerHTML = `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>Parámetros del sistema</h3></div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group"><label>Tiempo máximo de edición (horas)</label>
            <input type="number" class="form-control" id="cfgHoras" value="${state.config.horasEdicion}" min="1" max="720" ${!esAdminUser?'disabled':''}>
          </div>
          <div class="form-group"><label>Tolerancia de variación (%)</label>
            <input type="number" class="form-control" id="cfgTol" value="${state.config.toleranciaVariacion}" min="0" max="100" ${!esAdminUser?'disabled':''}>
          </div>
        </div>
        ${esAdminUser?`<button class="btn btn-primary" id="cfgGuardar">Guardar configuración</button>`:'<div class="alert alert-warning">Solo el administrador puede modificar.</div>'}
      </div>
    </div>
    ${esAdminUser ? renderSeccionUsuarios() : ''}
    <div class="card">
      <div class="card-header"><h3>Datos del sistema</h3></div>
      <div class="card-body">
        <div class="info-box" style="margin-bottom:14px">
          <b>${INSUMOS.length}</b> insumos · <b>${RECETAS.length}</b> recetas · <b>${state.programaciones.length}</b> programaciones · <b>${state.usuarios.length}</b> usuarios
        </div>
        ${esAdminUser?`<button class="btn btn-danger" id="cfgReset">🗑 Reiniciar todos los datos</button>`:''}
      </div>
    </div>`;
  const g = document.getElementById('cfgGuardar');
  if(g) g.onclick = ()=>{
    state.config.horasEdicion = Number(document.getElementById('cfgHoras').value)||48;
    state.config.toleranciaVariacion = Number(document.getElementById('cfgTol').value)||5;
    guardarEstado(); render(); toast('Configuración guardada','','success');
  };
  const r = document.getElementById('cfgReset');
  if(r) r.onclick = ()=>{
    if(!confirm('¿Eliminar TODOS los datos?')) return;
    localStorage.removeItem(LS_KEY); location.reload();
  };
  content.querySelectorAll('[data-editar-usuario]').forEach(el=>{
    el.onclick = ()=>abrirModalEditarUsuario(el.dataset.editarUsuario);
  });
  content.querySelectorAll('[data-eliminar-usuario]').forEach(el=>{
    el.onclick = ()=>eliminarUsuario(el.dataset.eliminarUsuario);
  });
  const btnNuevo = document.getElementById('btnNuevoUsuario');
  if(btnNuevo) btnNuevo.onclick = ()=>abrirModalNuevoUsuario();
}

function renderSeccionUsuarios(){
  const usuarios = state.usuarios || [];
  return `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <h3>Gestión de usuarios</h3>
        <button class="btn btn-primary btn-sm" id="btnNuevoUsuario">+ Nuevo usuario</button>
      </div>
      <div class="card-body">
        ${usuarios.map(u=>`
          <div class="user-card">
            <div class="info">
              <h4>${u.nombre} <span class="role-tag">${u.rol}</span></h4>
              <div class="sub">Usuario: <b>${u.usuario}</b> · Contraseña: <b>${'•'.repeat(u.password.length)}</b></div>
              <div class="tabs">
                ${(u.tabs||[]).map(t=>{
                  const map = {programacion:'📅 Programación', mrp:'📦 MRP', historial:'📊 Historial', recetas:'🍲 Recetas', config:'⚙️ Config'};
                  return `<span class="tab-badge">${map[t]||t}</span>`;
                }).join('')}
              </div>
            </div>
            <div class="actions">
              <button class="btn btn-xs btn-secondary" data-editar-usuario="${u.id}">✏️ Editar</button>
              ${u.rol !== 'ADMINISTRADOR' ? `<button class="btn btn-xs btn-ghost" style="color:var(--danger)" data-eliminar-usuario="${u.id}">🗑 Eliminar</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function abrirModalNuevoUsuario(){ abrirModalUsuario(null); }
function abrirModalEditarUsuario(id){
  const u = state.usuarios.find(x=>x.id===id);
  if(u) abrirModalUsuario(u);
}
function abrirModalUsuario(usuario){
  const esNuevo = !usuario;
  const esAdminEditando = !esNuevo && usuario.rol === 'ADMINISTRADOR';
  const u = usuario || {nombre:'', usuario:'', password:'', rol:'NUTRICIONISTA', tabs:['programacion','mrp','historial','recetas']};
  const tabsActuales = u.tabs || [];
  abrirModal(`<div class="modal-header"><h3>${esNuevo?'Nuevo usuario':'Editar usuario'}</h3><button class="modal-close" onclick="cerrarModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Nombre completo</label>
      <input type="text" class="form-control" id="usNombre" value="${u.nombre}" placeholder="Ej: María López">
    </div>
    <div class="form-row">
      <div class="form-group"><label>Usuario</label>
        <input type="text" class="form-control" id="usUsuario" value="${u.usuario}" placeholder="Ej: mlopez" ${esAdminEditando?'disabled':''}>
      </div>
      <div class="form-group"><label>Contraseña</label>
        <input type="text" class="form-control" id="usPassword" value="${u.password}" placeholder="Contraseña">
      </div>
    </div>
    <div class="form-group"><label>Rol</label>
      <select class="form-control" id="usRol" ${esAdminEditando?'disabled':''}>
        <option value="ADMINISTRADOR" ${u.rol==='ADMINISTRADOR'?'selected':''}>ADMINISTRADOR</option>
        <option value="NUTRICIONISTA" ${u.rol==='NUTRICIONISTA'?'selected':''}>NUTRICIONISTA</option>
        <option value="COMPRADOR" ${u.rol==='COMPRADOR'?'selected':''}>COMPRADOR</option>
      </select>
    </div>
    <div class="form-group">
      <label>Pestañas permitidas</label>
      <div class="tabs-check">
        ${TABS_DISPONIBLES.map(t=>`
          <label class="${tabsActuales.includes(t.key)?'checked':''}">
            <input type="checkbox" data-tab="${t.key}" ${tabsActuales.includes(t.key)?'checked':''}>
            <span>${t.label}</span>
          </label>
        `).join('')}
      </div>
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
    <button class="btn btn-primary" id="usGuardar">Guardar</button>
  </div>`, {size:'modal-lg'});
  document.querySelectorAll('.tabs-check input[type="checkbox"]').forEach(cb=>{
    const actualizar = ()=>{ cb.closest('label').classList.toggle('checked', cb.checked); };
    cb.onchange = actualizar;
    actualizar();
  });
  document.getElementById('usGuardar').onclick = ()=>{
    const nombre = document.getElementById('usNombre').value.trim();
    const user = document.getElementById('usUsuario').value.trim().toLowerCase();
    const pass = document.getElementById('usPassword').value;
    const rol = document.getElementById('usRol').value;
    const tabs = [...document.querySelectorAll('[data-tab]:checked')].map(c=>c.dataset.tab);
    if(!nombre || !user || !pass){ toast('Error','Todos los campos son obligatorios','error'); return; }
    if(!tabs.length){ toast('Error','Selecciona al menos una pestaña','error'); return; }
    if(state.usuarios.find(x=>x.usuario===user && (!usuario || x.id !== usuario.id))){
      toast('Error','Ese nombre de usuario ya existe','error'); return;
    }
    if(esNuevo){
      state.usuarios.push({id:uid(), nombre, usuario:user, password:pass, rol, tabs});
    } else {
      usuario.nombre = nombre;
      if(usuario.rol !== 'ADMINISTRADOR'){
        usuario.usuario = user;
        usuario.rol = rol;
      }
      usuario.password = pass;
      usuario.tabs = tabs;
      if(state.usuario && state.usuario.id === usuario.id){
        state.usuario = {...usuario};
      }
    }
    guardarEstado();
    cerrarModal();
    render();
    toast('Usuario guardado','','success');
  };
}
function eliminarUsuario(id){
  const u = state.usuarios.find(x=>x.id===id);
  if(!u) return;
  if(u.rol === 'ADMINISTRADOR'){ toast('Error','No puedes eliminar al administrador','error'); return; }
  if(!confirm(`¿Eliminar al usuario "${u.nombre}"?`)) return;
  state.usuarios = state.usuarios.filter(x=>x.id!==id);
  guardarEstado();
  render();
  toast('Usuario eliminado','','warning');
}

cargarEstado();
if(state.programaciones.length === 0){
  const hoy = new Date();
  const lunes = getLunes(fechaISO(hoy));
  const p = crearProgramacion({nombre:'Semana de ejemplo', fechaInicio:lunes});
  p.usuario = 'Sistema';
  const serviciosEjemplo = [
    {fecha:lunes, recetaCod:'PL-001', personas:140},
    {fecha:lunes, recetaCod:'PO-01', personas:120},
    {fecha:addDias(lunes,1), recetaCod:'PL-014', personas:150},
    {fecha:addDias(lunes,2), recetaCod:'PL-008', personas:130},
    {fecha:addDias(lunes,3), recetaCod:'BE-01', personas:130},
  ];
  serviciosEjemplo.forEach(s=>{
    const rec = RECETAS.find(r=>r[0]===s.recetaCod);
    if(rec) p.servicios.push({id:uid(), fecha:s.fecha, tipo:rec[2], recetaCod:s.recetaCod, recetaNombre:rec[1], personas:s.personas, observaciones:''});
  });
  guardarEstado();
}
progSeleccionada = null;
if(state.usuario) currentView = vistaInicialPorRol();
render();
