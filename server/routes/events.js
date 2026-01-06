// ============================================================
// Rotas de Events (Server-Sent Events)
// ============================================================

import { Router } from 'express';

export default function (addSSEClient, removeSSEClient) {
    const router = Router();

    // ========================================
    // GET /api/events/:tenantId - SSE Stream
    // ========================================
    router.get('/:tenantId', (req, res) => {
        const { tenantId } = req.params;

        // Configurar headers SSE
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Accel-Buffering': 'no' // Nginx
        });

        // Heartbeat inicial
        res.write(`event: connected\ndata: ${JSON.stringify({ tenantId, time: new Date().toISOString() })}\n\n`);

        // Registrar cliente
        addSSEClient(tenantId, res);

        // Heartbeat a cada 30 segundos
        const heartbeat = setInterval(() => {
            res.write(`event: ping\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
        }, 30000);

        // Cleanup on close
        req.on('close', () => {
            clearInterval(heartbeat);
            removeSSEClient(tenantId, res);
        });
    });

    return router;
}
