const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { calcularPrecioVenta } = require('../utils/calculos');
const { verificarTokenAPI } = require('../middlewares/auth');

// --- AUTH ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const query = await db.find({ selector: { type: 'usuario', username: username }, limit: 1 });
        const user = query.docs[0];

        if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
        
        if (bcrypt.compareSync(password, user.password)) {
            const token = jwt.sign({ id: user._id, rol: user.rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
            res.cookie('token', token, { 
                httpOnly: true, 
                secure: process.env.NODE_ENV === 'production',
                maxAge: 8 * 60 * 60 * 1000
            }); 
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Contraseña incorrecta' });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

// --- MENÚ E INSUMOS ---
router.get('/insumos', verificarTokenAPI, async (req, res) => { 
    try {
        const query = await db.find({ selector: { type: 'insumo' }, limit: 1000 });
        const insumos = query.docs.map(doc => ({ ...doc, id: doc._id })).sort((a, b) => a.nombre.localeCompare(b.nombre));
        res.json(insumos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/menu', verificarTokenAPI, async (req, res) => {
    try {
        const [queryProd, queryIns] = await Promise.all([
            db.find({ selector: { type: 'producto' }, limit: 1000 }),
            db.find({ selector: { type: 'insumo' }, limit: 1000 })
        ]);

        const insumosDict = {};
        queryIns.docs.forEach(i => insumosDict[i._id] = i);

        const menu = queryProd.docs.map(prod => {
            let costo_total = 0;
            const ingredientes = [];

            if (prod.receta && Array.isArray(prod.receta)) {
                prod.receta.forEach(r => {
                    const insumo = insumosDict[r.insumo_id];
                    if (insumo) {
                        costo_total += (insumo.costo * r.cantidad);
                        ingredientes.push({
                            id: insumo._id,
                            nombre: insumo.nombre,
                            costo: insumo.costo,
                            quitable: insumo.quitable !== undefined ? insumo.quitable : 1
                        });
                    }
                });
            }
            const precioFinal = calcularPrecioVenta(costo_total, prod.markup);
            return {
                id: prod._id, 
                nombre: prod.nombre, 
                markup: prod.markup, 
                es_cocina: prod.es_cocina,
                precio_venta: prod.precio_venta || 0, 
                costo_total, 
                precio: Math.ceil(precioFinal), 
                agotado: prod.agotado ? 1 : 0, // <-- NUEVA LÍNEA
                ingredientes
            };
        });

        res.json(menu);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ADMIN: INSUMOS ---
router.post('/admin/insumo', verificarTokenAPI, async (req, res) => { 
    try {
        const { nombre, costo, quitable, es_extra } = req.body;
        const response = await db.insert({ type: 'insumo', nombre, costo, quitable: quitable ? 1 : 0, es_extra: es_extra ? 1 : 0 });
        res.json({ id: response.id }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/admin/insumo/:id', verificarTokenAPI, async (req, res) => { 
    try {
        const { nombre, costo, quitable, es_extra } = req.body;
        const doc = await db.get(req.params.id);
        await db.insert({ ...doc, nombre, costo, quitable: quitable ? 1 : 0, es_extra: es_extra ? 1 : 0 });
        res.json({ msg: "Ok" }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/insumo/:id', verificarTokenAPI, async (req, res) => { 
    try {
        const doc = await db.get(req.params.id);
        await db.destroy(doc._id, doc._rev);
        res.json({ msg: "Eliminado" }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- ADMIN: PRODUCTOS ---
router.post('/admin/producto', verificarTokenAPI, async (req, res) => { 
    try {
        const { nombre, markup, es_cocina, precio_venta } = req.body;
        const response = await db.insert({ 
            type: 'producto', 
            nombre, 
            markup: Number(markup) || 0, 
            es_cocina, 
            precio_venta: Number(precio_venta) || 0,
            receta: [] 
        });
        res.json({ id: response.id }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/admin/producto/:id', verificarTokenAPI, async (req, res) => { 
    try {
        const { nombre, markup, es_cocina, precio_venta } = req.body;
        const doc = await db.get(req.params.id);
        await db.insert({ 
            ...doc, 
            nombre, 
            markup: Number(markup) || 0, 
            es_cocina,
            precio_venta: Number(precio_venta) || 0
        });
        res.json({ msg: "Ok" }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/producto/:id', verificarTokenAPI, async (req, res) => { 
    try {
        const doc = await db.get(req.params.id);
        await db.destroy(doc._id, doc._rev);
        res.json({ msg: "Eliminado" }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- ADMIN: RECETAS ---
router.get('/admin/receta/:producto_id', verificarTokenAPI, async (req, res) => { 
    try {
        const prod = await db.get(req.params.producto_id);
        if(!prod.receta) return res.json([]);

        const queryIns = await db.find({ selector: { type: 'insumo' }, limit: 1000 });
        const insumosDict = {};
        queryIns.docs.forEach(i => insumosDict[i._id] = i);

        const receta = prod.receta.map(r => {
            const ins = insumosDict[r.insumo_id];
            return { producto_id: prod._id, insumo_id: r.insumo_id, nombre: ins ? ins.nombre : 'Eliminado', costo: ins ? ins.costo : 0 };
        });
        res.json(receta); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/receta', verificarTokenAPI, async (req, res) => { 
    try {
        const { producto_id, insumo_id } = req.body;
        const prod = await db.get(producto_id);
        if(!prod.receta) prod.receta = [];
        prod.receta.push({ insumo_id, cantidad: 1 });
        await db.insert(prod);
        res.json({ msg: "Ok" }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/receta/:producto_id/:insumo_id', verificarTokenAPI, async (req, res) => { 
    try {
        const prod = await db.get(req.params.producto_id);
        if(prod.receta) {
            prod.receta = prod.receta.filter(r => r.insumo_id !== req.params.insumo_id);
            await db.insert(prod);
        }
        res.json({ msg: "Eliminado" }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/cocina/toggle-stock/:id', verificarTokenAPI, async (req, res) => {
    try {
        const doc = await db.get(req.params.id);
        doc.agotado = doc.agotado ? 0 : 1; // Si estaba 1 pasa a 0, y viceversa
        await db.insert(doc);
        
        req.io.emit('stock-actualizado'); // Le avisa al instante a todas las tablets
        res.json({ success: true, agotado: doc.agotado });
    } catch(e) { res.status(500).json({ error: e.message }); }
});
// --- ADMIN: GESTIÓN DE MESAS ---
router.get('/mesas', verificarTokenAPI, async (req, res) => {
    try {
        const query = await db.find({ selector: { type: 'mesa' }, limit: 1000 });
        const mesas = query.docs.map(doc => ({ ...doc, id: doc._id })).sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, {numeric: true}));
        res.json(mesas);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/mesa', verificarTokenAPI, async (req, res) => {
    try {
        const { nombre } = req.body;
        const response = await db.insert({ type: 'mesa', nombre, estado: 'libre', pedidos_activos: [] });
        res.json({ id: response.id });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/admin/mesa/:id', verificarTokenAPI, async (req, res) => {
    try {
        const { nombre } = req.body;
        const doc = await db.get(req.params.id);
        await db.insert({ ...doc, nombre });
        res.json({ msg: "Ok" });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/mesa/:id', verificarTokenAPI, async (req, res) => {
    try {
        const doc = await db.get(req.params.id);
        if (doc.estado === 'ocupada') {
            return res.status(400).json({ error: "No puedes borrar una mesa ocupada." });
        }
        await db.destroy(doc._id, doc._rev);
        res.json({ msg: "Eliminado" });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- COCINA & CAJA ---
router.get('/cocina/pendientes', verificarTokenAPI, async (req, res) => {
    try {
        const query = await db.find({ selector: { type: 'pedido', estado: 'pendiente' }, limit: 1000 });
        const pedidos = query.docs.map(p => ({
            ...p, id: p._id, items: (p.items || []).filter(item => item.es_cocina == 1)
        })).sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
        res.json(pedidos);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/pedidos/listos', verificarTokenAPI, async (req, res) => {
    try {
        const query = await db.find({ selector: { type: 'pedido', estado: 'listo_para_entregar' }, limit: 1000 });
        const pedidos = query.docs.map(p => ({ ...p, id: p._id })).sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
        res.json(pedidos);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/cocina/historial', verificarTokenAPI, async (req, res) => {
    try {
        const qListos = await db.find({ selector: { type: 'pedido', estado: 'listo_para_entregar' }, limit: 50 });
        const qTerminados = await db.find({ selector: { type: 'pedido', estado: 'terminado' }, limit: 50 });
        const qEntregados = await db.find({ selector: { type: 'pedido', estado: 'entregado' }, limit: 50 });
        
        let combinados = [...qListos.docs, ...qTerminados.docs, ...qEntregados.docs].sort((a,b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 15);
        
        const pedidos = combinados.map(p => ({
            ...p, id: p._id, items: (p.items || []).filter(item => item.es_cocina == 1)
        })).filter(p => p.items.length > 0);
        res.json(pedidos);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/cocina/terminar/:id', verificarTokenAPI, async (req, res) => {
    try {
        const doc = await db.get(req.params.id);
        doc.estado = 'listo_para_entregar';
        await db.insert(doc);
        
        res.json({ success: true });
        req.io.emit('pedido-listo-para-entregar', { ...doc, id: doc._id });
        // Emitimos la recarga para sincronizar, pero el frontend la procesará de forma limpia
        req.io.emit('pedido-cocina', { reload: true }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/pedido/entregar/:id', verificarTokenAPI, async (req, res) => {
    try {
        const doc = await db.get(req.params.id);
        doc.estado = 'entregado'; 
        await db.insert(doc);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/mesas/activas', verificarTokenAPI, async (req, res) => {
    try {
        const query = await db.find({
            selector: {
                type: 'pedido',
                estado: { "$in": ['pendiente', 'listo_para_entregar', 'entregado'] },
                mesa: { "$gt": null, "$ne": "" }
            },
            limit: 2000
        });

        const mesasCuenta = {};
        query.docs.forEach(p => {
            if (!mesasCuenta[p.mesa]) mesasCuenta[p.mesa] = { nombre: p.mesa, total: 0, items: [] };
            mesasCuenta[p.mesa].total += p.total;
            mesasCuenta[p.mesa].items.push(...p.items);
        });

        res.json(Object.values(mesasCuenta));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/mesa/cobrar/:nombre', verificarTokenAPI, async (req, res) => {
    try {
        const nombreMesa = req.params.nombre;
        
        const query = await db.find({
            selector: {
                type: 'pedido',
                mesa: nombreMesa,
                estado: { "$in": ['pendiente', 'listo_para_entregar', 'entregado'] }
            },
            limit: 1000
        });

        for (let doc of query.docs) {
            doc.estado = 'terminado'; 
            await db.insert(doc);
        }

        const queryMesa = await db.find({ selector: { type: 'mesa', nombre: nombreMesa }, limit: 1 });
        if (queryMesa.docs.length > 0) {
            const mesaDoc = queryMesa.docs[0];
            mesaDoc.estado = 'libre';
            await db.insert(mesaDoc);
        }

        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- REPORTES (Dashboard y Ventas) ---
router.get('/reportes/dashboard', verificarTokenAPI, async (req, res) => {
    try {
        const hoy = new Date().toISOString().split('T')[0];
        const query = await db.find({ selector: { type: 'pedido', estado: 'terminado' }, limit: 5000 });
        const pedidosHoy = query.docs.filter(p => p.fecha && p.fecha.startsWith(hoy));

        const totalDia = pedidosHoy.reduce((acc, p) => acc + parseFloat(p.total || 0), 0);
        const cantidadPedidos = pedidosHoy.length;

        res.json({
            total_dia: totalDia,
            cantidad_pedidos: cantidadPedidos
        });
    } catch(e) { 
        res.status(500).json({ error: e.message }); 
    }
});

router.get('/reportes/ventas', verificarTokenAPI, async (req, res) => {
    try {
        const { inicio, fin } = req.query;
        const query = await db.find({ selector: { type: 'pedido', estado: 'terminado' }, limit: 5000 });
        
        const ventasFiltradas = query.docs.filter(p => {
            if (!p.fecha) return false;
            const fechaPedido = p.fecha.split('T')[0];
            return fechaPedido >= inicio && fechaPedido <= fin;
        }).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

        res.json(ventasFiltradas);
    } catch(e) { 
        res.status(500).json({ error: e.message }); 
    }
});

module.exports = router;