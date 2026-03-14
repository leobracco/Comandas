const sqlite3 = require('sqlite3').verbose();
// Reemplaza 'admin:password' con tus credenciales de CouchDB
const nano = require('nano')('http://admin:1564Santiago@127.0.0.1:5984'); 
const couch = nano.use('casadelmolino');

const dbSQLite = new sqlite3.Database('./restaurante.db');

async function migrarDatos() {
    console.log("🚀 Iniciando migración de SQLite a CouchDB...");

    // 1. Migrar Insumos
    dbSQLite.all("SELECT * FROM insumos", [], async (err, insumos) => {
        if (err) return console.error("Error leyendo insumos:", err);
        
        const docsInsumos = insumos.map(i => ({
            _id: `insumo_${i.id}`,
            type: 'insumo',
            nombre: i.nombre,
            costo: i.costo,
            quitable: i.quitable !== undefined ? i.quitable : 1,
            es_extra: i.es_extra !== undefined ? i.es_extra : 1
        }));

        await guardarEnCouch(docsInsumos, "Insumos");
    });

    // 2. Migrar Usuarios
    dbSQLite.all("SELECT * FROM usuarios", [], async (err, usuarios) => {
        if (err) return console.error("Error leyendo usuarios:", err);
        
        const docsUsuarios = usuarios.map(u => ({
            _id: `usuario_${u.id}`,
            type: 'usuario',
            username: u.username,
            password: u.password,
            rol: u.rol
        }));

        await guardarEnCouch(docsUsuarios, "Usuarios");
    });

    // 3. Migrar Productos (Anidando sus recetas)
    // En CouchDB, la receta vive ADENTRO del producto, no en una tabla separada.
    dbSQLite.all("SELECT * FROM productos", [], async (err, productos) => {
        if (err) return console.error("Error leyendo productos:", err);
        
        for (let prod of productos) {
            // Buscamos la receta de este producto en SQLite
            dbSQLite.all("SELECT insumo_id, cantidad FROM receta_items WHERE producto_id = ?", [prod.id], async (err, receta) => {
                
                const docProducto = {
                    _id: `producto_${prod.id}`,
                    type: 'producto',
                    nombre: prod.nombre,
                    markup: prod.markup,
                    es_cocina: prod.es_cocina,
                    receta: receta.map(r => ({
                        insumo_id: `insumo_${r.insumo_id}`,
                        cantidad: r.cantidad
                    }))
                };

                await couch.insert(docProducto);
                console.log(`✅ Producto migrado: ${prod.nombre}`);
            });
        }
    });

    console.log("⏳ Migración en proceso. Espera unos segundos y revisa tu panel de CouchDB.");
}

async function guardarEnCouch(documentos, nombre) {
    if(documentos.length === 0) return console.log(`No hay ${nombre} para migrar.`);
    try {
        await couch.bulk({ docs: documentos });
        console.log(`✅ ${documentos.length} ${nombre} migrados con éxito.`);
    } catch (e) {
        console.error(`❌ Error migrando ${nombre}:`, e.message);
    }
}

migrarDatos();