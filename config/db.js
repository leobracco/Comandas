require('dotenv').config();
const nano = require('nano')(`${process.env.COUCHDB_PROTOCOL}://${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASS}@${process.env.COUCHDB_HOST}`);
const db = nano.use(process.env.COUCHDB_DB);

// Inicializar DB y crear usuario admin por defecto si no existe
async function inicializarCouchDB() {
    try {
        const check = await db.find({ selector: { type: 'usuario', username: 'admin' } });
        if (check.docs.length === 0) {
            const bcrypt = require('bcryptjs');
            const hash = bcrypt.hashSync('123456', 10);
            await db.insert({ type: 'usuario', username: 'admin', password: hash, rol: 'admin' });
            console.log("✅ Usuario por defecto creado en CouchDB: admin / 123456");
        }
        console.log("✅ Conexión a CouchDB establecida correctamente.");
    } catch (error) {
        console.error("❌ Error conectando a CouchDB. Verifica tus credenciales en el .env:", error.message);
    }
}

inicializarCouchDB();

module.exports = db;