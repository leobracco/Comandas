const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET_KEY = process.env.JWT_SECRET;

// Protege las páginas HTML
const protegerVistas = (req, res, next) => {
    const protectedPages = ['/', '/index.html', '/admin.html', '/ventas.html', '/cocina.html'];
    const path = req.path === '/' ? '/index.html' : req.path;

    if (protectedPages.includes(path)) {
        const token = req.cookies.token;
        if (!token) return res.redirect('/login.html');
        try {
            jwt.verify(token, SECRET_KEY);
            next();
        } catch (e) {
            return res.redirect('/login.html');
        }
    } else {
        next();
    }
};

// Protege los endpoints de la API (JSON)
const verificarTokenAPI = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
    try {
        req.user = jwt.verify(token, SECRET_KEY);
        next();
    } catch (e) {
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

module.exports = { protegerVistas, verificarTokenAPI };