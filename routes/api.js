const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { calcularPrecioVenta } = require('../utils/calculos');
const { verificarTokenAPI } = require('../middlewares/auth');

// --- AUTH ---
// --- AUTH ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const query = await db.find({ selector: { type: 'usuario', username: username } });
        const user = query.docs[0];

        if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
        
        if (bcrypt.compareSync(password, user.password)) {
            // 1. El Token interno dura exactamente 8 horas
            const token = jwt.sign({ id: user._id, rol: user.rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
            
            // 2. La Cookie del navegador se destruye exactamente a las 8 horas
            res.cookie('token', token, { 
                httpOnly: true, 
                secure: process.env.NODE_ENV === 'production',
                maxAge: 8 * 60 * 60 * 1000 // 8 horas en milisegundos
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

// --- MENÚ E INSUMOS (Público autenticado) ---
router.get('/insumos', verificarTokenAPI, async (req, res) => { 
    try {
        const query = await db.find({ selector: { type: 'insumo' } });
        const insumos = query.docs.map(doc => ({ ...doc, id: doc._id })).sort((a, b) => a.nombre.localeCompare(b.nombre));
        res.json(insumos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/menu', verificarTokenAPI, async (req, res) => {
    try {
        const [queryProd, queryIns] = await Promise.all([
            db.find({ selector: { type: 'producto' } }),
            db.find({ selector: { type: 'insumo' } })
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
                id: prod._id, nombre: prod.nombre, markup: prod.markup, es_cocina: prod.es_cocina,
                costo_total, precio: Math.ceil(precioFinal), ingredientes
            };
        });

        res.json(menu);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ADMIN ---
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

router.post('/admin/producto', verificarTokenAPI, async (req, res) => { 
    try {
        const { nombre, markup, es_cocina } = req.body;
        const response = await db.insert({ type: 'producto', nombre, markup, es_cocina, receta: [] });
        res.json({ id: response.id }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/admin/producto/:id', verificarTokenAPI, async (req, res) => { 
    try {
        const { nombre, markup, es_cocina } = req.body;
        const doc = await db.get(req.params.id);
        await db.insert({ ...doc, nombre, markup, es_cocina });
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

// ADMIN: Recetas
router.get('/admin/receta/:producto_id', verificarTokenAPI, async (req, res) => { 
    try {
        const prod = await db.get(req.params.producto_id);
        if(!prod.receta) return res.json([]);

        const queryIns = await db.find({ selector: { type: 'insumo' } });
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

// --- COCINA & CAJA ---
router.get('/cocina/pendientes', verificarTokenAPI, async (req, res) => {
    try {
        const query = await db.find({ selector: { type: 'pedido', estado: 'pendiente' } });
        const pedidos = query.docs.map(p => ({
            ...p, id: p._id, items: (p.items || []).filter(item => item.es_cocina == 1)
        })).sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
        res.json(pedidos);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/pedidos/listos', verificarTokenAPI, async (req, res) => {
    try {
        const query = await db.find({ selector: { type: 'pedido', estado: 'listo_para_entregar' } });
        const pedidos = query.docs.map(p => ({ ...p, id: p._id })).sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
        res.json(pedidos);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/cocina/historial', verificarTokenAPI, async (req, res) => {
    try {
        const qListos = await db.find({ selector: { type: 'pedido', estado: 'listo_para_entregar' } });
        const qTerminados = await db.find({ selector: { type: 'pedido', estado: 'terminado' } });
        let combinados = [...qListos.docs, ...qTerminados.docs].sort((a,b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 15);
        
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
        // Emitir evento por socket usando req.io
        req.io.emit('pedido-listo-para-entregar', { ...doc, id: doc._id });
        req.io.emit('pedido-cocina', { reload: true }); 
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/pedido/entregar/:id', verificarTokenAPI, async (req, res) => {
    try {
        const doc = await db.get(req.params.id);
        doc.estado = 'terminado';
        await db.insert(doc);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;