// ============================================================
// Rotas de Blacklist
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/blacklist - Listar blacklist
    // ========================================
    router.get('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const blacklist = await db.all(
                'SELECT * FROM blacklist WHERE tenant_id = ? ORDER BY created_at DESC',
                [req.tenantId]
            );
            res.json(blacklist);
        } catch (error) {
            console.error('Get blacklist error:', error);
            res.status(500).json({ error: 'Erro ao buscar blacklist' });
        }
    });

    // ========================================
    // POST /api/blacklist - Adicionar a blacklist
    // ========================================
    router.post('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { phone, reason } = req.body;

            if (!phone) {
                return res.status(400).json({ error: 'Telefone e obrigatorio' });
            }

            // Verificar se ja existe
            const existing = await db.get(
                'SELECT id FROM blacklist WHERE tenant_id = ? AND phone = ?',
                [req.tenantId, phone]
            );

            if (existing) {
                return res.status(400).json({ error: 'Telefone ja esta na blacklist' });
            }

            const id = uuidv4();
            await db.run(
                'INSERT INTO blacklist (id, tenant_id, phone, reason) VALUES (?, ?, ?, ?)',
                [id, req.tenantId, phone, reason || null]
            );

            res.status(201).json({ success: true, id, phone, reason });
        } catch (error) {
            console.error('Add to blacklist error:', error);
            res.status(500).json({ error: 'Erro ao adicionar blacklist' });
        }
    });

    // ========================================
    // DELETE /api/blacklist/:phone - Remover
    // ========================================
    router.delete('/:phone', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const result = await db.run(
                'DELETE FROM blacklist WHERE tenant_id = ? AND phone = ?',
                [req.tenantId, req.params.phone]
            );

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Telefone nao encontrado na blacklist' });
            }

            res.json({ success: true, message: 'Removido da blacklist' });
        } catch (error) {
            console.error('Remove from blacklist error:', error);
            res.status(500).json({ error: 'Erro ao remover da blacklist' });
        }
    });

    // ========================================
    // GET /api/blacklist/check/:phone - Verificar
    // ========================================
    router.get('/check/:phone', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const entry = await db.get(
                'SELECT * FROM blacklist WHERE tenant_id = ? AND phone = ?',
                [req.tenantId, req.params.phone]
            );

            res.json({
                isBlacklisted: !!entry,
                reason: entry?.reason
            });
        } catch (error) {
            console.error('Check blacklist error:', error);
            res.status(500).json({ error: 'Erro ao verificar blacklist' });
        }
    });

    return router;
}
