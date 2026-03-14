const socket = io();
let menu = [];
let insumosGlobales = [];
let itemEditando = null;
let pedidoActual = [];

// ==========================================
//        CARGA INICIAL DE DATOS
// ==========================================
async function cargarDatos() {
    try {
        const [resMenu, resInsumos] = await Promise.all([fetch('/api/menu'), fetch('/api/insumos')]);
        
        // Si cualquiera de las dos responde 401 (No autorizado), la sesión caducó
        if(resMenu.status === 401 || resInsumos.status === 401) {
            alert("Tu sesión ha expirado. Por favor, vuelve a ingresar.");
            return window.location.href = '/login.html'; 
        }

        menu = await resMenu.json();
        insumosGlobales = await resInsumos.json();
        
        renderMenu();
        renderSelectExtras();
    } catch (e) { 
        console.error("Error cargando datos:", e); 
    }
}
function renderMenu() {
    document.getElementById('lista-productos').innerHTML = menu.map((prod, index) => `
        <div class="prod-card" onclick="abrirEditor(${index})">
            <div style="font-weight: 700; font-size: 1.1em; color: var(--text-main); line-height: 1.2;">${prod.nombre}</div>
            <div class="prod-price">$${prod.precio}</div>
        </div>
    `).join('');
}

function renderSelectExtras() {
    // AHORA SOLO MOSTRAMOS LOS QUE TIENEN "es_extra === 1"
    const extrasPermitidos = insumosGlobales.filter(i => i.es_extra === 1);
    
    document.getElementById('select-extras').innerHTML = extrasPermitidos.map(i => 
        `<option value="${i.id}" data-costo="${i.costo}">${i.nombre}</option>`
    ).join('');
}

// ==========================================
//        MODAL DE EDICIÓN DE PRODUCTO
// ==========================================
function abrirEditor(index) {
    const prod = menu[index];
    // Clonamos el producto para no alterar el menú original
    itemEditando = {
        id_producto: prod.id,
        nombre: prod.nombre,
        markup: prod.markup,
        es_cocina: prod.es_cocina,
        precio_base: prod.precio,
        precio_final: prod.precio,
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
    // Render ingredientes base
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
    
    // Render extras (se mantiene igual)
    document.getElementById('ep-lista-extras').innerHTML = itemEditando.extras.map((ext, idx) => `
        <div class="ingrediente-row">
            <span>+ ${ext.nombre} ($${ext.precio})</span>
            <button class="btn-action btn-quitar" onclick="removerExtra(${idx})">X</button>
        </div>
    `).join('');
    
    document.getElementById('ep-subtotal').innerText = itemEditando.precio_final;
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
    
    // Calcula el precio de venta del extra usando el markup del producto
    const precioCalculado = (costo / (100 - itemEditando.markup)) * 100;
    const precioFinalExtra = Math.ceil(precioCalculado);
    
    itemEditando.extras.push({ id, nombre, precio: precioFinalExtra });
    recalcularTotalItem();
    renderEditorInterno();
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
        
        // 1. Mostrar TODOS los ingredientes base
        if (p.ingredientes_base) {
            p.ingredientes_base.forEach(i => { 
                if(i.eliminado) {
                    htmlDetalles.push(`<span class="sin-ing">SIN ${i.nombre}</span>`); 
                } else {
                    htmlDetalles.push(`<span style="color: var(--text-muted)">${i.nombre}</span>`); 
                }
            });
        }
        
        // 2. Mostrar los extras
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
    
    if (!mesa && !cliente) { alert("⚠️ Ingresa Mesa o Cliente para identificar el pedido."); return; }
    if (pedidoActual.length === 0) { alert("⚠️ Comanda vacía."); return; }
    
    const payload = { 
        mesa, 
        cliente, 
        items: pedidoActual, 
        total: parseFloat(document.getElementById('total-general').innerText) 
    };
    
    socket.emit('nuevo-pedido', payload);
    
    // Resetear formulario
    pedidoActual = [];
    document.getElementById('mesa').value = "";
    document.getElementById('cliente').value = "";
    renderPedidoActual();
    actualizarTotalGeneral();
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
    zona.style.display = 'block';

    let itemsHTML = '';
    if (pedido.items && pedido.items.length > 0) {
        itemsHTML = pedido.items.map(item => {
            let mods = [];
            
            // Listar todos los ingredientes base en la tarjeta
            if(item.ingredientes_base) {
                item.ingredientes_base.forEach(i => { 
                    if(i.eliminado) {
                        mods.push(`<span style="color:var(--danger); text-decoration: line-through;">SIN ${i.nombre}</span>`); 
                    } else {
                        mods.push(`<span>${i.nombre}</span>`); 
                    }
                });
            }
            
            // Listar extras
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
            <button class="btn-primary" style="background:var(--success); padding: 8px 12px; font-size: 0.9em;" onclick="confirmarEntrega(${pedido.id})">✅ ENTREGADO</button>
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
                }, 300);
            }
        });
}

// Logout
async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
}

// Iniciar app
cargarDatos();