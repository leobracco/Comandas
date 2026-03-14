const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

// Conectamos a tu base de datos
const db = new sqlite3.Database('./restaurante.db');

// --- ✏️ MODIFICA ESTOS DOS VALORES ---
const nuevoUsuario = "nuevo";
const nuevaPassword = "mipasswordsegura2026";
// -------------------------------------

// Encriptamos la nueva contraseña
const hash = bcrypt.hashSync(nuevaPassword, 10);

// Actualizamos el usuario administrador (asumimos que es el que tiene ID 1 o se llamaba 'admin')
db.run("UPDATE usuarios SET username = ?, password = ? WHERE id = 1", [nuevoUsuario, hash], function(err) {
    if (err) {
        console.error("❌ Error al actualizar:", err.message);
    } else {
        console.log(`✅ Éxito! Tu nuevo acceso es:`);
        console.log(`Usuario: ${nuevoUsuario}`);
        console.log(`Password: ${nuevaPassword}`);
    }
    db.close();
});