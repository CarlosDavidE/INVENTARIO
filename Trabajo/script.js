/* =========================
   Inventario Integridad - script.js
   =========================
   Contiene toda la lógica (inventario, usuarios, roles, gráficos, notificaciones)
*/

// ---------- DATOS INICIALES ----------
// usuarios demo con roles y contraseñas
let usuarios = JSON.parse(localStorage.getItem("usuarios")) || [
  { usuario: "admin", clave: "admin123", rol: "admin" },
  { usuario: "user", clave: "user123", rol: "user" },
  { usuario: "user2", clave: "user2123", rol: "user" },
  { usuario: "javier", clave: "sup123", rol: "supervisor" },
  { usuario: "maria", clave: "audit123", rol: "auditor" }
];

// inventario, registros, pendientes
let inventario = JSON.parse(localStorage.getItem("inventario")) || [
  { id: 1, nombre: "Tornillos M4", cantidad: 120 },
  { id: 2, nombre: "Taladros", cantidad: 8 },
  { id: 3, nombre: "Guantes", cantidad: 4 },
  { id: 4, nombre: "Cajas", cantidad: 0 },
];
let registros = JSON.parse(localStorage.getItem("registros")) || [];
let pendientes = JSON.parse(localStorage.getItem("pendientes")) || [];

// control de id
let idCounter = inventario.length ? Math.max(...inventario.map(p => p.id)) + 1 : 1;

// estado
let usuarioActual = null;
let roleActual = null;

// charts
let chartInventory = null;
let chartMovimientos = null;

// ---------- UTILIDADES ----------

function guardarStorage() {
  localStorage.setItem("inventario", JSON.stringify(inventario));
  localStorage.setItem("registros", JSON.stringify(registros));
  localStorage.setItem("pendientes", JSON.stringify(pendientes));
  localStorage.setItem("usuarios", JSON.stringify(usuarios));
}

function toast(msg, dur = 3000) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), dur);
}

function mostrarVista(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + viewId).classList.add("active");
  // highlight nav
  document.querySelectorAll(".nav-link").forEach(n => n.classList.remove("active"));
  document.querySelector(`[data-view="${viewId}"]`)?.classList.add("active");
}

// formato fecha
function ahora() {
  return new Date().toLocaleString();
}

// crear notificación (agrega a dropdown y contador)
function pushNotif(text, level = "info") {
  const dd = document.getElementById("notifDropdown");
  const item = document.createElement("div");
  item.className = "notif-item";
  item.innerHTML = `<strong class="small">${level.toUpperCase()}</strong><div>${text}</div><small class="muted">${new Date().toLocaleTimeString()}</small>`;
  dd.prepend(item);
  actualizarNotifCount();
}

function actualizarNotifCount() {
  const n = document.querySelectorAll("#notifDropdown .notif-item").length;
  const badge = document.getElementById("notifCount");
  badge.textContent = n;
  badge.style.display = n ? "inline-block" : "none";
}

// revisar alertas (bajo stock y pendientes viejas)
function revisarAlertas() {
  // bajo stock (<5)
  const criticos = inventario.filter(i => i.cantidad > 0 && i.cantidad < 5);
  criticos.forEach(p => {
    pushNotif(`Stock bajo: ${p.nombre} (${p.cantidad})`, "warning");
  });

  const sinStock = inventario.filter(i => i.cantidad === 0);
  sinStock.forEach(p => {
    pushNotif(`Sin stock: ${p.nombre}`, "danger");
  });

  // pendientes mayores a 3 dias
  const tresDias = Date.now() - (3 * 24 * 60 * 60 * 1000);
  pendientes.forEach(p => {
    const ts = new Date(p.fecha).getTime();
    if (ts < tresDias) pushNotif(`Pendiente antiguo: ${p.usuario} -> ${p.nombre}`, "warning");
  });
}

// ---------- RENDERING ----------

function renderInventario() {
  const tbody = document.getElementById("tabla");
  tbody.innerHTML = "";
  inventario.forEach(item => {
    const tr = document.createElement("tr");
    const lowClass = item.cantidad === 0 ? 'badge-zero' : (item.cantidad < 5 ? 'badge-low' : 'badge-normal');
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.nombre}</td>
      <td><span class="${lowClass}">${item.cantidad}</span></td>
      <td>
        <button class="btn ghost small" onclick="abrirQuickAdd(${item.id})">+ / -</button>
        <button class="btn ghost small" onclick="eliminarProducto(${item.id})">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  actualizarDashboard();
  actualizarCharts();
}

function renderRegistros() {
  const t = document.getElementById("tablaRegistros");
  t.innerHTML = "";
  registros.slice().reverse().forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.usuario}</td><td>${r.nombre}</td><td>${r.cantidad}</td><td>${r.accion}</td><td>${new Date(r.fecha).toLocaleString()}</td>`;
    t.appendChild(tr);
  });
}

function renderPendientes() {
  const t = document.getElementById("tablaPendientes");
  t.innerHTML = "";
  pendientes.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.usuario}</td><td>${p.nombre}</td><td>${p.cantidad}</td><td>${p.accion}</td><td>${new Date(p.fecha).toLocaleString()}</td>
      <td>
        <button class="btn success small" onclick="aprobar(${idx})">Aceptar</button>
        <button class="btn danger small" onclick="rechazar(${idx})">Rechazar</button>
      </td>`;
    t.appendChild(tr);
  });
}

function renderUltimosMovimientos() {
  const t = document.getElementById("tablaUltimos");
  t.innerHTML = "";
  registros.slice(-8).reverse().forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.usuario}</td><td>${r.nombre}</td><td>${r.cantidad}</td><td>${r.accion}</td><td>${new Date(r.fecha).toLocaleString()}</td>`;
    t.appendChild(tr);
  });
}

function renderUsuarios() {
  const tbody = document.getElementById("tablaUsuarios");
  tbody.innerHTML = "";
  usuarios.forEach((u, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${u.usuario}</td><td>${u.rol}</td>
      <td>
        <button class="btn ghost small" onclick="editarUsuario(${i})">Editar</button>
        <button class="btn danger small" onclick="borrarUsuario(${i})">Borrar</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ---------- DASHBOARD / KPI ----------

function actualizarDashboard() {
  document.getElementById("kpiProductos").textContent = inventario.length;
  document.getElementById("kpiMovimientos").textContent = registros.length;
  document.getElementById("kpiPendientes").textContent = pendientes.length;
  const bajo = inventario.filter(i => i.cantidad > 0 && i.cantidad < 5).length;
  document.getElementById("kpiBajoStock").textContent = bajo;
  renderUltimosMovimientos();
}

function actualizarCharts() {
  // Inventory chart (bar)
  const ctxInv = document.getElementById("chartInventory").getContext("2d");
  const labels = inventario.map(i => i.nombre);
  const data = inventario.map(i => i.cantidad);
  if (chartInventory) chartInventory.destroy();
  chartInventory = new Chart(ctxInv, {
    type: "bar",
    data: { labels, datasets: [{ label: "Cantidad", data, borderRadius:6 }] },
    options: { responsive:true, plugins:{legend:{display:false}} }
  });

  // Movements chart (last 14 days)
  const ctxMov = document.getElementById("chartMovimientos").getContext("2d");
  // agrupación simple por día
  const últimos14 = Array.from({length:14}).map((_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-13+i);
    return d;
  });
  const labelsMov = últimos14.map(d=>d.toLocaleDateString());
  const counts = labelsMov.map(lbl => registros.filter(r => {
    const dd = new Date(r.fecha).toLocaleDateString();
    return dd === lbl;
  }).length);
  if (chartMovimientos) chartMovimientos.destroy();
  chartMovimientos = new Chart(ctxMov, {
    type: "line",
    data: { labels: labelsMov, datasets: [{ label: "Movimientos/día", data: counts, fill:true, tension:0.3 }] },
    options: { responsive:true, plugins:{legend:{display:false}} }
  });
}

// ---------- MOVIMIENTOS ----------

function validarCantidad(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0;
}

document.getElementById("formMovimiento").addEventListener("submit", function(e){
  e.preventDefault();
  const nombre = document.getElementById("nombre").value.trim();
  const cantidad = Number(document.getElementById("cantidad").value);
  const accion = document.getElementById("accion").value;

  if (!validarCantidad(cantidad)) { toast("Cantidad inválida"); return; }
  if (!nombre) { toast("Escriba el nombre del producto"); return; }

  const movimiento = { usuario: usuarioActual, nombre, cantidad, accion, fecha: new Date().toISOString() };

  if (roleActual === "admin" || roleActual === "supervisor") {
    aplicarMovimiento(movimiento);
    toast("Movimiento aplicado");
  } else {
    // validar retiro
    if (accion === "Retirar") {
      const prod = inventario.find(p => p.nombre.toLowerCase() === nombre.toLowerCase());
      if (!prod) { toast("No existe el producto para retirar"); return; }
      if (prod.cantidad < cantidad) { toast("No hay suficiente stock"); return; }
    }
    pendientes.push(movimiento);
    guardarStorage();
    renderPendientes();
    toast("Movimiento enviado para aprobación");
    pushNotif(`Nuevo pendiente por ${usuarioActual}: ${nombre} (${cantidad})`, "info");
  }

  // limpiar form
  document.getElementById("formMovimiento").reset();
  renderInventario(); renderRegistros(); renderPendientes();
});

function aplicarMovimiento(mov) {
  const productoExistente = inventario.find(it => it.nombre.toLowerCase() === mov.nombre.toLowerCase());
  if (mov.accion === "Agregar") {
    if (productoExistente) productoExistente.cantidad += mov.cantidad;
    else { inventario.push({ id: idCounter++, nombre: mov.nombre, cantidad: mov.cantidad }); }
  } else {
    if (productoExistente && productoExistente.cantidad >= mov.cantidad) {
      productoExistente.cantidad -= mov.cantidad;
    } else {
      toast("No se puede retirar más de lo disponible");
      return;
    }
  }
  registros.push(mov);
  guardarStorage();
  actualizarDashboard();
  pushNotif(`${mov.accion} aplicado: ${mov.nombre} (${mov.cantidad})`, "success");
}

// aprobar / rechazar pendientes
function aprobar(index) {
  const mov = pendientes[index];
  aplicarMovimiento(mov);
  pendientes.splice(index,1);
  guardarStorage();
  renderPendientes();
  renderInventario();
  renderRegistros();
}
function rechazar(index) {
  const mov = pendientes[index];
  pendientes.splice(index,1);
  guardarStorage();
  renderPendientes();
  pushNotif(`Pendiente rechazado: ${mov.nombre}`, "info");
}

// quick add (abrir prompt para ajustar cantidad)
function abrirQuickAdd(id) {
  const prod = inventario.find(p => p.id === id);
  if (!prod) return;
  const txt = prompt(`Ajuste para ${prod.nombre} (usar +n o -n, por ejemplo +5 o -3):`, "+0");
  if (!txt) return;
  const m = /^([+-])\s*(\d+)$/.exec(txt.trim());
  if (!m) { toast("Formato inválido"); return; }
  const sign = m[1], val = Number(m[2]);
  if (sign === "+") {
    aplicarMovimiento({ usuario: usuarioActual, nombre: prod.nombre, cantidad: val, accion: "Agregar", fecha: new Date().toISOString() });
  } else {
    aplicarMovimiento({ usuario: usuarioActual, nombre: prod.nombre, cantidad: val, accion: "Retirar", fecha: new Date().toISOString() });
  }
  renderInventario(); renderRegistros();
}

// eliminar producto (admin)
function eliminarProducto(id) {
  if (roleActual !== "admin") { toast("Solo administradores pueden eliminar productos"); return; }
  if (!confirm("Eliminar producto del inventario?")) return;
  inventario = inventario.filter(p => p.id !== id);
  guardarStorage(); renderInventario(); toast("Producto eliminado");
}

// ---------- USUARIOS ----------

document.getElementById("btnNuevoUsuario").addEventListener("click", () => abrirModalUsuario());

function abrirModalUsuario(idx = null) {
  document.getElementById("modalUsuario").classList.remove("hidden");
  const title = document.getElementById("modalTitle");
  title.textContent = idx === null ? "Nuevo usuario" : "Editar usuario";
  // si editar: cargar datos
  if (idx !== null) {
    const u = usuarios[idx];
    document.getElementById("u_nombre").value = u.usuario;
    document.getElementById("u_clave").value = u.clave;
    document.getElementById("u_rol").value = u.rol;
    document.getElementById("usuarioForm").dataset.editIndex = idx;
  } else {
    document.getElementById("u_nombre").value = "";
    document.getElementById("u_clave").value = "";
    document.getElementById("u_rol").value = "user";
    delete document.getElementById("usuarioForm").dataset.editIndex;
  }
}
document.getElementById("modalCancel").addEventListener("click", () => document.getElementById("modalUsuario").classList.add("hidden"));

document.getElementById("usuarioForm").addEventListener("submit", function(e){
  e.preventDefault();
  const name = document.getElementById("u_nombre").value.trim();
  const clave = document.getElementById("u_clave").value.trim();
  const rol = document.getElementById("u_rol").value;
  if (!name) { toast("Usuario requerido"); return; }
  const editIndex = this.dataset.editIndex;
  if (editIndex !== undefined) {
    usuarios[editIndex].usuario = name;
    if (clave) usuarios[editIndex].clave = clave;
    usuarios[editIndex].rol = rol;
    toast("Usuario actualizado");
  } else {
    if (usuarios.some(u => u.usuario === name)) { toast("Usuario ya existe"); return; }
    usuarios.push({ usuario: name, clave: clave || "123456", rol });
    toast("Usuario creado");
  }
  guardarStorage();
  renderUsuarios();
  document.getElementById("modalUsuario").classList.add("hidden");
});

function editarUsuario(i) { abrirModalUsuario(i); }
function borrarUsuario(i) {
  if (!confirm("Eliminar usuario?")) return;
  usuarios.splice(i,1);
  guardarStorage();
  renderUsuarios();
  toast("Usuario eliminado");
}

// ---------- LOGIN / SESION ----------

document.getElementById("loginForm").addEventListener("submit", function(e){
  e.preventDefault();
  const u = document.getElementById("usuario").value.trim();
  const p = document.getElementById("clave").value;
  const found = usuarios.find(x => x.usuario === u && x.clave === p);
  if (!found) { alert("Credenciales incorrectas"); return; }
  usuarioActual = found.usuario; roleActual = found.rol;
  iniciarSesion();
});

document.getElementById("demoFill").addEventListener("click", () => {
  document.getElementById("usuario").value = "admin";
  document.getElementById("clave").value = "admin123";
});

document.getElementById("logout").addEventListener("click", cerrarSesion);

function iniciarSesion() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("app").style.display = "flex";
  document.getElementById("topUser").textContent = `${usuarioActual} · ${roleActual}`;
  // mostrar menús por rol
  document.getElementById("navPendientes").style.display = (roleActual === "admin" || roleActual === "supervisor") ? "" : "none";
  document.getElementById("navRegistros").style.display = (roleActual === "admin" || roleActual === "supervisor") ? "" : "none";
  document.getElementById("navUsuarios").style.display = (roleActual === "admin") ? "" : "none";
  // render inicial
  renderInventario(); renderRegistros(); renderPendientes(); renderUsuarios();
  revisarAlertas();
  actualizarNotifCount();
  actualizarCharts();
}

function cerrarSesion() {
  usuarioActual = null; roleActual = null;
  document.getElementById("app").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
}

// ---------- EVENTOS UI ----------

// navegación
document.querySelectorAll(".nav-link").forEach(btn => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    mostrarVista(view);
  });
});

// búsqueda global
document.getElementById("globalSearch").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  // filtrar en inventario
  document.querySelectorAll("#tabla tr").forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none";
  });
});

// buscar inventario
document.getElementById("buscarInventario").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll("#tabla tr").forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none";
  });
});

// filtro stock
document.getElementById("filtrarStock").addEventListener("change", (e) => {
  const v = e.target.value;
  document.querySelectorAll("#tabla tr").forEach(tr => {
    const qty = Number(tr.querySelector("td:nth-child(3) .badge-normal, td:nth-child(3) .badge-low, td:nth-child(3) .badge-zero")?.textContent || 0);
    if (v === "all") tr.style.display = "";
    else if (v === "low") tr.style.display = (qty > 0 && qty < 5) ? "" : "none";
    else if (v === "zero") tr.style.display = (qty === 0) ? "" : "none";
  });
});

// ordenar columnas (simple toggle asc/desc)
document.querySelectorAll("#tablaInventario thead th[data-col]").forEach(th => {
  th.addEventListener("click", () => {
    const col = th.dataset.col;
    const asc = th.dataset.asc !== "true";
    inventario.sort((a,b) => {
      if (typeof a[col] === "string") return asc ? a[col].localeCompare(b[col]) : b[col].localeCompare(a[col]);
      return asc ? a[col] - b[col] : b[col] - a[col];
    });
    document.querySelectorAll("#tablaInventario thead th").forEach(t=> delete t.dataset.asc);
    th.dataset.asc = asc;
    renderInventario();
  });
});

// notificaciones
const bell = document.getElementById("bell");
const notifDropdown = document.getElementById("notifDropdown");

bell.addEventListener("click", (e) => {
  e.stopPropagation(); // evita que cierre al hacer clic en la campana
  notifDropdown.classList.toggle("hidden");
});

// cerrar si clic fuera del dropdown
document.addEventListener("click", (e) => {
  if (!notifDropdown.contains(e.target) && !bell.contains(e.target)) {
    notifDropdown.classList.add("hidden");
  }
});


// modal close outside click
document.getElementById("modalUsuario").addEventListener("click", (e)=>{
  if (e.target === e.currentTarget) document.getElementById("modalUsuario").classList.add("hidden");
});

// theme toggle
document.getElementById("toggleTheme").addEventListener("change", function(){
  if (this.checked) document.documentElement.style.setProperty('--bg','#0f1724');
  else document.documentElement.style.setProperty('--bg','#eef3f7');
});

// iniciar graficos con datos si ya hay sesión
window.addEventListener("load", () => {
  // conservar sesión si ya existe en storage? (no implementado por seguridad)
  actualizarNotifCount();
  // estilos de badges
  const style = document.createElement('style');
  style.innerHTML = `
    .badge-normal{display:inline-block;padding:6px 8px;border-radius:8px;background:#eef9f3;color:#08643f;font-weight:700}
    .badge-low{display:inline-block;padding:6px 8px;border-radius:8px;background:#fff7e6;color:#b36b00;font-weight:700}
    .badge-zero{display:inline-block;padding:6px 8px;border-radius:8px;background:#ffecec;color:#a11b1b;font-weight:700}
    .notif-item{padding:8px;border-bottom:1px solid rgba(0,0,0,0.04)}
  `;
  document.head.appendChild(style);
});

/* ========== Extras para compatibilidad con botones inline (desde HTML) ========== */
/* Las funciones siguientes se declaran globalmente para que onclick inline funcione */
window.aprobar = aprobar;
window.rechazar = rechazar;
window.eliminarProducto = eliminarProducto;
window.abrirQuickAdd = abrirQuickAdd;
window.editarUsuario = editarUsuario;
window.borrarUsuario = borrarUsuario;



/* ===========================
   FIN del script
   =========================== */