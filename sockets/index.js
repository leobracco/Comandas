const db = require('../config/db');

module.exports = (io) => {
    io.on('connection', (socket) => {
        socket.on('nuevo-pedido', async (data) => {
            const itemsCocina = data.items.filter(item => item.es_cocina == 1);
            const estadoInicial = itemsCocina.length > 0 ? 'pendiente' : 'listo_para_entregar';

            try {
                // 1. Criar o objeto corretamente para guardar na base de dados
                const nuevoPedido = {
                    type: 'pedido',
                    cliente: data.cliente,
                    mesa: data.mesa,
                    total: data.total,
                    items: data.items,
                    estado: estadoInicial,
                    fecha: new Date().toISOString()
                };

                // 2. Inserir no CouchDB
                const response = await db.insert(nuevoPedido);
                const pedidoId = response.id;
                
                // 3. Estruturar os dados para enviar pelo WebSocket
                const pedidoEmit = {
                    id: pedidoId,
                    cliente: data.cliente,
                    mesa: data.mesa,
                    total: data.total,
                    hora: new Date().toLocaleTimeString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires', 
                        hour: '2-digit', 
                        minute:'2-digit'
                    })
                };

                // 4. Emitir os eventos consoante o destino
                if (itemsCocina.length > 0) {
                    io.emit('pedido-cocina', { ...pedidoEmit, items: itemsCocina }); 
                } else {
                    io.emit('pedido-listo-para-entregar', { ...pedidoEmit, items: data.items });
                }
            } catch (error) {
                console.error("Erro ao guardar pedido no CouchDB:", error.message);
            }
        });
    });
};