import { Router } from 'express';
import { getGUIPreviewService } from '../services/gui-preview-service.js';
import { authMiddleware } from '../middleware/auth.js';

export default function (db) {
    const router = Router();
    const guiPreview = getGUIPreviewService();

    // GET /api/debug/gui-preview - Ver preview em TXT de uma pagina
    router.get('/gui-preview', async (req, res) => {
        try {
            const { page } = req.query;
            if (!page) {
                return res.status(400).json({ error: 'Parâmetro "page" é obrigatório (ex: admin/index.html)' });
            }

            const preview = guiPreview.renderPageToTxt(page);

            // Retornar como texto plano para visualização direta
            res.setHeader('Content-Type', 'text/plain');
            res.send(preview);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/debug/system-status - Status geral para o agente
    router.get('/system-status', authMiddleware(db), async (req, res) => {
        try {
            const stats = {
                database: 'Connected',
                tenants: await db.get('SELECT COUNT(*) as count FROM tenants'),
                orders: await db.get('SELECT COUNT(*) as count FROM orders'),
                products: await db.get('SELECT COUNT(*) as count FROM products'),
                uptime: process.uptime()
            };
            res.json(stats);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}
