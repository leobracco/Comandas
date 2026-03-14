require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

// Importar módulos propios
const { protegerVistas } = require('./middlewares/auth');
const apiRoutes = require('./routes/api');
const setupSockets = require('./sockets/index');

const PORT = process.env.PORT || 5010;

// Middlewares Globales
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Inyectar io en el request para que las rutas puedan emitir eventos (ej: al terminar pedido)
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Middleware de Seguridad para las Vistas HTML
app.use(protegerVistas);

// Carpeta de archivos estáticos (Frontend)
app.use(express.static('public'));

// Rutas de la API
app.use('/api', apiRoutes);

// Inicializar WebSockets
setupSockets(io);

// Levantar el servidor
http.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Casa del Molino corriendo en el puerto ${PORT}`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV}`);
});