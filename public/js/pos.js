const socket = io();

// --- ESTADO GLOBAL ---
let menuGlobal = [];
let menuFiltrado = [];
let insumosGlobales = [];
let mesasGlobales = [];
let itemEditando = null;
let pedidoActual = [];

// --- PAGINACIÓN ---
let pagPOS = 1;
const ITEMS_POR_PAGINA_POS = 6; 

// ==========================================
//        CARGA INICIAL DE DATOS
// ==========================================
async function cargarDatos() {
    try {
        const [resMenu, resInsumos, resMesas] = await Promise.all([
            fetch('/api/menu'), 
            fetch('/api/insumos'),
            fetch('/api/mesas')
        ]);
        
        if(resMenu.status === 401 || resInsumos.status === 401 || resMesas.status === 401) {
            alert("Tu sesión ha expirado. Por favor, vuelve a ingresar.");
            return window.location.href = '/login.html'; 
        }

        menuGlobal = await resMenu.json();
        insumosGlobales = await resInsumos.json();
        mesasGlobales = await resMesas.json();
        
        // AQUÍ EL CAMBIO: Inicializamos filtrando los agotados
        menuFiltrado = menuGlobal.filter(p => !p.agotado);
        
        renderMenuPOS();
        renderSelectExtras();
        renderSelectMesas(); 
        cargarCuentasActivas(); 
    } catch (e) { 
        console.error("Error cargando datos:", e); 
    }
}

// ==========================================
//        RENDERIZADO DE SELECTS
// ==========================================
function renderSelectMesas() {
    const select = document.getElementById('mesa');
    if (select) {
        select.innerHTML = '<option value="">Mostrador / Para llevar</option>' + 
            mesasGlobales.map(m => `<option value="${m.nombre}">${m.nombre}</option>`).join('');
    }
}

function renderSelectExtras() {
    const extrasPermitidos = insumosGlobales.filter(i => i.es_extra === 1);
    const select = document.getElementById('select-extras');
    if (select) {
        select.innerHTML = extrasPermitidos.map(i => 
            `<option value="${i.id}" data-costo="${i.costo}">${i.nombre}</option>`
        ).join('');
    }
}

// ==========================================
//        BÚSQUEDA Y PAGINACIÓN DEL MENÚ
// ==========================================
function filtrarMenuPOS() {
    const txt = document.getElementById('buscador-pos').value.toLowerCase();
    
    // AQUÍ EL CAMBIO: Filtramos por texto Y que NO esté agotado
    menuFiltrado = menuGlobal.filter(p => 
        p.nombre.toLowerCase().includes(txt) && !p.agotado
    );
    
    pagPOS = 1; 
    renderMenuPOS();
}

function cambiarPaginaPOS(delta) {
    pagPOS += delta;
    renderMenuPOS();
}

function renderMenuPOS() {
    const totalPaginas = Math.ceil(menuFiltrado.length / ITEMS_POR_PAGINA_POS) || 1;
    const inicio = (pagPOS - 1) * ITEMS_POR_PAGINA_POS;
    const fin = inicio + ITEMS_POR_PAGINA_POS;
    const recortes = menuFiltrado.slice(inicio, fin);

    const container = document.getElementById('lista-productos');

    if (recortes.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 20px; color: var(--text-muted);">No se encontraron productos.</div>`;
    } else {
        container.innerHTML = recortes.map(prod => {
            // LÓGICA DE PRECIO FIJO
            const precioMostrar = (prod.precio_venta && prod.precio_venta > 0) ? prod.precio_venta : prod.precio;
            
            // Ya no necesitamos lógica visual de agotado aquí, porque el filtro anterior evita que lleguen a este punto.
            return `
            <div class="prod-card" onclick="abrirEditor('${prod.id}')">
                <div style="font-weight: 800; font-size: 1.05em; color: var(--text-main); line-height: 1.2;">${prod.nombre}</div>
                <div class="prod-price">$${precioMostrar}</div>
            </div>
            `;
        }).join('');
    }

    // Controles de paginación
    const pageInfo = document.getElementById('page-info-pos');
    const btnPrev = document.getElementById('btn-prev-pos');
    const btnNext = document.getElementById('btn-next-pos');
    
    if(pageInfo) pageInfo.innerText = `${pagPOS}/${totalPaginas}`;
    if(btnPrev) btnPrev.disabled = pagPOS === 1;
    if(btnNext) btnNext.disabled = pagPOS === totalPaginas;
}

// ==========================================
//        MODAL DE EDICIÓN DE PRODUCTO
// ==========================================
function abrirEditor(idProducto) {
    const prod = menuGlobal.find(p => p.id === idProducto);
    if (!prod) return;
    
    const precioCalculado = (prod.precio_venta && prod.precio_venta > 0) ? prod.precio_venta : prod.precio;

    itemEditando = {
        id_producto: prod.id,
        nombre: prod.nombre,
        markup: prod.markup,
        es_cocina: prod.es_cocina,
        precio_base: precioCalculado,
        precio_final: precioCalculado,
        ingredientes_base: JSON.parse(JSON.stringify(prod.ingredientes)),
        extras: []
    };
    
    document.getElementById('ep-nombre').innerText = itemEditando.nombre;
    document.getElementById('ep-precio-base').innerText = itemEditando.precio_base;
    
    renderEditorInterno();
    
    document.getElementById('modal-overlay').style.display = 'block';
    document.getElementById('editor-producto').style.display = 'block';
}

function renderEditorInterno() {
    document.getElementById('ep-lista-base').innerHTML = itemEditando.ingredientes_base.map((ing, idx) => `
        <div class="ingrediente-row ${ing.eliminado ? 'tachado' : ''}">
            <span>${ing.nombre}</span>
            ${ing.quitable === 1 ? `
                <button class="btn-action ${ing.eliminado ? 'btn-restaurar' : 'btn-quitar'}" onclick="toggleIngredienteBase(${idx})">
                    ${ing.eliminado ? 'Restaurar' : 'Quitar'}
                </button>
            ` : `
                <span style="font-size: 0.85em; color: var(--text-muted); font-style: italic;">Fijo en receta</span>
            `}
        </div>
    `).join('');
    
    document.getElementById('ep-lista-extras').innerHTML = itemEditando.extras.map((ext, idx) => `
        <div class="ingrediente-row">
            <span>+ ${ext.nombre} ($${ext.precio})</span>
            <button class="btn-action btn-quitar" onclick="removerExtra(${idx})">X</button>
        </div>
    `).join('');
    
    const spanTotal = document.getElementById('ep-subtotal');
    if (spanTotal) spanTotal.innerText = itemEditando.precio_final;

    const inputPrecio = document.getElementById('ep-subtotal-input');
    if (inputPrecio) inputPrecio.value = itemEditando.precio_final;
}

function toggleIngredienteBase(idx) {
    itemEditando.ingredientes_base[idx].eliminado = !itemEditando.ingredientes_base[idx].eliminado;
    renderEditorInterno();
}

function agregarExtra() {
    const select = document.getElementById('select-extras');
    if(!select.value) return;

    const id = select.value;
    const nombre = select.options[select.selectedIndex].text;
    const costo = parseFloat(select.options[select.selectedIndex].dataset.costo);
    
    const precioCalculado = (costo / (100 - itemEditando.markup)) * 100;
    const precioFinalExtra = Math.ceil(precioCalculado);
    
    itemEditando.extras.push({ id, nombre, precio: precioFinalExtra });
    recalcularTotalItem();
    renderEditorInterno();
}

function actualizarPrecioManual(valor) {
    const nuevoPrecio = parseFloat(valor);
    if (!isNaN(nuevoPrecio)) {
        itemEditando.precio_final = Math.ceil(nuevoPrecio);
        renderEditorInterno();
    }
}

function removerExtra(idx) {
    itemEditando.extras.splice(idx, 1);
    recalcularTotalItem();
    renderEditorInterno();
}

function recalcularTotalItem() {
    const totalExtras = itemEditando.extras.reduce((sum, ext) => sum + ext.precio, 0);
    itemEditando.precio_final = itemEditando.precio_base + totalExtras;
}

function cerrarEditor() {
    document.getElementById('modal-overlay').style.display = 'none';
    document.getElementById('editor-producto').style.display = 'none';
    itemEditando = null;
}

// ==========================================
//        CARRITO / COMANDA ACTUAL
// ==========================================
function confirmarItem() {
    pedidoActual.push(itemEditando);
    renderPedidoActual();
    actualizarTotalGeneral();
    cerrarEditor();
}

function renderPedidoActual() {
    const container = document.getElementById('lista-pedido');
    if(pedidoActual.length === 0) { 
        container.innerHTML = '<div style="text-align:center; color: var(--text-muted); margin-top: 50px;">Comanda vacía</div>'; 
        return; 
    }
    
    container.innerHTML = pedidoActual.map((p, index) => {
        let htmlDetalles = [];
        
        if (p.ingredientes_base) {
            p.ingredientes_base.forEach(i => { 
                if(i.eliminado) {
                    htmlDetalles.push(`<span class="sin-ing">SIN ${i.nombre}</span>`); 
                } else {
                    htmlDetalles.push(`<span style="color: var(--text-muted)">${i.nombre}</span>`); 
                }
            });
        }
        
        if (p.extras) {
            p.extras.forEach(e => { 
                htmlDetalles.push(`<span class="con-ing">+ ${e.nombre}</span>`); 
            });
        }
        
        return `
            <div class="cart-item">
                <div class="cart-item-header">
                    <span>${p.nombre}</span>
                    <span>$${p.precio_final}</span>
                </div>
                <div class="detalles-item" style="line-height: 1.4; margin-top: 5px;">
                    ${htmlDetalles.join(' • ')}
                </div>
                <div style="text-align:right; margin-top:8px;">
                    <span class="btn-remove-item" onclick="eliminarDelPedido(${index})">Eliminar</span>
                </div>
            </div>
        `;
    }).join('');
}

function eliminarDelPedido(index) {
    pedidoActual.splice(index, 1);
    renderPedidoActual();
    actualizarTotalGeneral();
}

function actualizarTotalGeneral() {
    const total = pedidoActual.reduce((acc, item) => acc + item.precio_final, 0);
    document.getElementById('total-general').innerText = total;
}

function enviarPedido() {
    const mesa = document.getElementById('mesa').value.trim();
    const cliente = document.getElementById('cliente').value.trim();
    
    if (!mesa && !cliente) { alert("⚠️ Ingresa Cliente para pedidos de mostrador, o selecciona una Mesa."); return; }
    if (pedidoActual.length === 0) { alert("⚠️ Comanda vacía."); return; }
    
    const payload = { 
        mesa, 
        cliente, 
        items: pedidoActual, 
        total: parseFloat(document.getElementById('total-general').innerText) 
    };
    
    socket.emit('nuevo-pedido', payload);
    
    pedidoActual = [];
    document.getElementById('mesa').value = "";
    document.getElementById('cliente').value = "";
    
    const buscador = document.getElementById('buscador-pos');
    if(buscador) buscador.value = "";
    filtrarMenuPOS(); 
    
    renderPedidoActual();
    actualizarTotalGeneral();

    if(mesa) setTimeout(cargarCuentasActivas, 500);
}

// ==========================================
//     GESTIÓN DE ENTREGAS (LISTOS DE COCINA)
// ==========================================
fetch('/api/pedidos/listos').then(r => r.json()).then(lista => lista.forEach(agregarTarjetaEntrega));

socket.on('pedido-listo-para-entregar', (pedido) => {
    agregarTarjetaEntrega(pedido);
});

function agregarTarjetaEntrega(pedido) {
    const zona = document.getElementById('zona-entregas');
    const contenedor = document.getElementById('lista-entregas');
    if (zona) zona.style.display = 'block';

    let itemsHTML = '';
    if (pedido.items && pedido.items.length > 0) {
        itemsHTML = pedido.items.map(item => {
            let mods = [];
            
            if(item.ingredientes_base) {
                item.ingredientes_base.forEach(i => { 
                    if(i.eliminado) {
                        mods.push(`<span style="color:var(--danger); text-decoration: line-through;">SIN ${i.nombre}</span>`); 
                    } else {
                        mods.push(`<span>${i.nombre}</span>`); 
                    }
                });
            }
            
            if(item.extras) {
                item.extras.forEach(e => mods.push(`<strong style="color:var(--success)">+${e.nombre}</strong>`));
            }
            
            return `
                <div style="margin-bottom: 8px; border-bottom: 1px dashed var(--border); padding-bottom: 8px;">
                    <strong style="font-size: 1.05em; color: var(--text-main); display:block; margin-bottom: 3px;">1x ${item.nombre}</strong>
                    <div style="color:var(--text-muted); font-size: 0.85em; line-height: 1.3;">
                        ${mods.length > 0 ? mods.join(', ') : 'Sin ingredientes detallados'}
                    </div>
                </div>`;
        }).join('');
    }

    const div = document.createElement('div');
    div.className = 'card-entrega';
    div.id = `entrega-${pedido.id}`;
    div.innerHTML = `
        <div style="font-weight: 800; border-bottom: 1px solid var(--border); padding-bottom: 5px; margin-bottom: 10px;">
            ${pedido.mesa ? `Mesa ${pedido.mesa}` : 'Para Llevar'}
            <span style="font-weight:normal; font-size:0.9em; display:block; color:var(--text-muted);">${pedido.cliente || ''}</span>
        </div>
        <div style="font-size: 0.9em; max-height: 150px; overflow-y: auto; margin-bottom: 15px;">
            ${itemsHTML}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="font-size:1.2em;">$${pedido.total}</strong>
            <button class="btn-primary" style="background:var(--success); padding: 8px 12px; font-size: 0.9em;" onclick="confirmarEntrega('${pedido.id}')">✅ ENTREGADO</button>
        </div>
    `;
    contenedor.appendChild(div);
}

function confirmarEntrega(id) {
    fetch(`/api/pedido/entregar/${id}`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if(data.success) {
                const card = document.getElementById(`entrega-${id}`);
                card.style.opacity = '0';
                setTimeout(() => {
                    card.remove();
                    if(document.getElementById('lista-entregas').children.length === 0) {
                        document.getElementById('zona-entregas').style.display = 'none';
                    }
                    cargarCuentasActivas();
                }, 300);
            }
        });
}

// ==========================================
//     GESTIÓN DE CUENTAS (MESAS ABIERTAS)
// ==========================================
function cargarCuentasActivas() {
    fetch('/api/mesas/activas')
        .then(r => r.json())
        .then(cuentas => {
            const zona = document.getElementById('zona-cuentas');
            const contenedor = document.getElementById('lista-cuentas');
            
            if (!zona || !contenedor) return;

            if (cuentas.length === 0) {
                zona.style.display = 'none';
                return;
            }
            
            zona.style.display = 'block';
            contenedor.innerHTML = cuentas.map(c => `
                <div class="card-entrega" style="border-left-color: var(--primary);">
                    <div style="font-weight: 800; border-bottom: 1px solid var(--border); padding-bottom: 5px; margin-bottom: 10px; font-size: 1.1em;">
                        Mesa ${c.nombre}
                    </div>
                    <div style="color: var(--text-muted); font-size: 0.9em; margin-bottom: 15px;">
                        ${c.items.length} productos en la cuenta
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="font-size:1.3em;">$${c.total}</strong>
                        <button class="btn-primary" style="padding: 8px 12px; font-size: 0.9em;" onclick="cobrarMesa('${c.nombre}')">💳 COBRAR</button>
                    </div>
                </div>
            `).join('');
        })
        .catch(err => console.error("Error cargando cuentas:", err));
}

function cobrarMesa(nombreMesa) {
    if(!confirm(`¿Cerrar la cuenta de la Mesa ${nombreMesa} y registrar el cobro?`)) return;
    
    fetch(`/api/mesa/cobrar/${encodeURIComponent(nombreMesa)}`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if(data.success) {
                cargarCuentasActivas();
                alert(`✅ Mesa ${nombreMesa} cobrada correctamente.`);
            }
        });
}

// ==========================================
//     WEBSOCKETS GLOBALES (ESCUCHADORES)
// ==========================================

socket.on('pedido-cocina', () => {
    setTimeout(cargarCuentasActivas, 500); 
});

socket.on('stock-actualizado', () => {
    fetch('/api/menu').then(r => r.json()).then(nuevoMenu => {
        menuGlobal = nuevoMenu;
        filtrarMenuPOS(); 
    });
});

// Logout
async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
}

// Iniciar app
cargarDatos();