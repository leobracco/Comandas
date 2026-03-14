const db = require('../config/db');

module.exports = (io) => {
    io.on('connection', (socket) => {
        socket.on('nuevo-pedido', async (data) => {
            const itemsCocina = data.items.filter(item => item.es_cocina == 1);
            const estadoInicial = itemsCocina.length > 0 ? 'pendiente' : 'listo_para_entregar';

            try {
                const pedidoBase = {
    id: pedidoId,
    cliente: data.cliente,
    mesa: data.mesa,
    total: data.total,
    // Forzamos el formato argentino
    hora: new Date().toLocaleTimeString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires', 
        hour: '2-digit', 
        minute:'2-digit'
    })
};

                const response = await db.insert(nuevoPedido);
                const pedidoId = response.id;
                
                const pedidoBase = {
                    id: pedidoId,
                    cliente: data.cliente,
                    mesa: data.mesa,
                    total: data.total,
                    hora: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                };

                if (itemsCocina.length > 0) {
                    io.emit('pedido-cocina', { ...pedidoBase, items: itemsCocina }); 
                } else {
                    io.emit('pedido-listo-para-entregar', { ...pedidoBase, items: data.items });
                }
            } catch (error) {
                console.error("Error al guardar pedido en CouchDB:", error.message);
            }
        });
    });
};