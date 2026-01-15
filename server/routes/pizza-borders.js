// ============================================================
// Rotas de Bordas de Pizza
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/pizza-borders - Listar bordas (autenticado)
    // ========================================
    router.get('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const borders = await db.all(`
                SELECT * FROM pizza_borders 
                WHERE tenant_id = ?
                ORDER BY order_index ASC
            `, [req.tenantId]);

            res.json(borders);
        } catch (error) {
            console.error('Get pizza borders error:', error);
            res.status(500).json({ error: 'Erro ao buscar bordas' });
        }
    });

    // ========================================
    // GET /api/pizza-borders/tenant/:tenantId - Listar bordas (publico - store)
    // ========================================
    router.get('/tenant/:tenantId', async (req, res) => {
        try {
            const { tenantId } = req.params;
            const borders = await db.all(`
                SELECT * FROM pizza_borders 
                WHERE tenant_id = ? AND is_active = 1
                ORDER BY order_index ASC
            `, [tenantId]);

            res.json(borders);
        } catch (error) {
            console.error('Get pizza borders error:', error);
            res.status(500).json({ error: 'Erro ao buscar bordas' });
        }
    });

    // ========================================
    // POST /api/pizza-borders - Criar borda
    // ========================================
    router.post('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { name, price } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Nome e obrigatorio' });
            }

            // Obter order_index
            const last = await db.get(
                'SELECT MAX(order_index) as max FROM pizza_borders WHERE tenant_id = ?',
                [req.tenantId]
            );
            const orderIndex = (last?.max || 0) + 1;

            const borderId = uuidv4();
            await db.run(`
                INSERT INTO pizza_borders (id, tenant_id, name, price, order_index)
                VALUES (?, ?, ?, ?, ?)
            `, [borderId, req.tenantId, name, price || 0, orderIndex]);

            const border = await db.get('SELECT * FROM pizza_borders WHERE id = ?', [borderId]);

            res.status(201).json({ success: true, border });
        } catch (error) {
            console.error('Create pizza border error:', error);
            res.status(500).json({ error: 'Erro ao criar borda' });
        }
    });

    // ========================================
    // PUT /api/pizza-borders/:id - Atualizar borda
    // ========================================
    router.put('/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { id } = req.params;
            const { name, price, isActive, orderIndex } = req.body;

            const border = await db.get(
                'SELECT * FROM pizza_borders WHERE id = ? AND tenant_id = ?',
                [id, req.tenantId]
            );

            if (!border) {
                return res.status(404).json({ error: 'Borda nao encontrada' });
            }

            const fields = [];
            const params = [];

            if (name !== undefined) { fields.push('name = ?'); params.push(name); }
            if (price !== undefined) { fields.push('price = ?'); params.push(price); }
            if (isActive !== undefined) { fields.push('is_active = ?'); params.push(isActive ? 1 : 0); }
            if (orderIndex !== undefined) { fields.push('order_index = ?'); params.push(orderIndex); }

            if (fields.length > 0) {
                params.push(id);
                await db.run(`UPDATE pizza_borders SET ${fields.join(', ')} WHERE id = ?`, params);
            }

            const updated = await db.get('SELECT * FROM pizza_borders WHERE id = ?', [id]);
            res.json({ success: true, border: updated });
        } catch (error) {
            console.error('Update pizza border error:', error);
            res.status(500).json({ error: 'Erro ao atualizar borda' });
        }
    });

    // ========================================
    // DELETE /api/pizza-borders/:id - Deletar borda
    // ========================================
    router.delete('/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { id } = req.params;

            const result = await db.run(
                'DELETE FROM pizza_borders WHERE id = ? AND tenant_id = ?',
                [id, req.tenantId]
            );

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Borda nao encontrada' });
            }

            res.json({ success: true, message: 'Borda deletada' });
        } catch (error) {
            console.error('Delete pizza border error:', error);
            res.status(500).json({ error: 'Erro ao deletar borda' });
        }
    });

    return router;
}
