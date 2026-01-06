// ============================================================
// Rotas de Activity Logs (Auditoria)
// ============================================================

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/logs - Listar logs com paginacao
    // ========================================
    router.get('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { page = 1, limit = 50, action, startDate, endDate } = req.query;
            const offset = (page - 1) * limit;

            let query = `
                SELECT l.*, u.name as user_name, u.email as user_email
                FROM activity_logs l
                LEFT JOIN users u ON l.user_id = u.id
                WHERE l.tenant_id = ?
            `;
            const params = [req.tenantId];

            if (action) {
                query += ' AND l.action = ?';
                params.push(action);
            }

            if (startDate) {
                query += ' AND l.created_at >= ?';
                params.push(startDate);
            }

            if (endDate) {
                query += ' AND l.created_at <= ?';
                params.push(endDate + ' 23:59:59');
            }

            query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const logs = await db.all(query, params);

            // Total count
            const countResult = await db.get(
                'SELECT COUNT(*) as total FROM activity_logs WHERE tenant_id = ?',
                [req.tenantId]
            );

            res.json({
                logs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult.total,
                    pages: Math.ceil(countResult.total / limit)
                }
            });
        } catch (error) {
            console.error('Get logs error:', error);
            res.status(500).json({ error: 'Erro ao buscar logs' });
        }
    });

    // ========================================
    // GET /api/logs/actions - Listar tipos de acoes
    // ========================================
    router.get('/actions', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const actions = await db.all(`
                SELECT DISTINCT action FROM activity_logs 
                WHERE tenant_id = ? 
                ORDER BY action
            `, [req.tenantId]);

            res.json(actions.map(a => a.action));
        } catch (error) {
            console.error('Get actions error:', error);
            res.status(500).json({ error: 'Erro ao buscar acoes' });
        }
    });

    return router;
}
