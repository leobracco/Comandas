const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs'); // NUEVO
const db = new sqlite3.Database('./restaurante.db');

db.serialize(() => {
    // Tablas existentes
    // Agregamos 'quitable' y 'es_extra'
db.run(`CREATE TABLE IF NOT EXISTS insumos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, costo REAL, quitable INTEGER DEFAULT 1, es_extra INTEGER DEFAULT 1)`);
    db.run(`CREATE TABLE IF NOT EXISTS productos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, markup REAL, es_cocina INTEGER DEFAULT 1)`);
    db.run(`CREATE TABLE IF NOT EXISTS receta_items (producto_id INTEGER, insumo_id INTEGER, cantidad REAL)`);
    db.run(`CREATE TABLE IF NOT EXISTS pedidos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente TEXT, mesa TEXT, total REAL, items_json TEXT, estado TEXT DEFAULT 'pendiente', fecha DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS pedido_detalles (id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER, producto_nombre TEXT, cantidad INTEGER, precio_unitario REAL, FOREIGN KEY(pedido_id) REFERENCES pedidos(id))`);

    // NUEVA TABLA: USUARIOS
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        username TEXT UNIQUE, 
        password TEXT, 
        rol TEXT
    )`, () => {
        // Crear usuario admin por defecto si no existe
        db.get("SELECT * FROM usuarios WHERE username = 'user'", (err, row) => {
            if (!row) {
                const hash = bcrypt.hashSync('pass', 10);
                db.run("INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)", ['cambiar', hash, 'cambiar']);
                
            }
        });
    });
});

function calcularPrecioVenta(costoTotal, markup) {
    if (markup >= 100) return 0;
    return (costoTotal / (100 - markup)) * 100;
}

module.exports = { db, calcularPrecioVenta };