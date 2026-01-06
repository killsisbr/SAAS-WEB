// ============================================================
// Rotas de Reviews/Avaliacoes
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/reviews/tenant/:tenantId - Reviews publicas da loja
    // ========================================
    router.get('/tenant/:tenantId', async (req, res) => {
        try {
            const reviews = await db.all(`
                SELECT r.*, p.name as product_name
                FROM reviews r
                LEFT JOIN products p ON r.product_id = p.id
                WHERE r.tenant_id = ? AND r.is_approved = 1
                ORDER BY r.created_at DESC
                LIMIT 50
            `, [req.params.tenantId]);

            // Stats
            const stats = await db.get(`
                SELECT 
                    COUNT(*) as total,
                    AVG(rating) as average,
                    SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_stars,
                    SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_stars,
                    SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_stars,
                    SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_stars,
                    SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
                FROM reviews
                WHERE tenant_id = ? AND is_approved = 1
            `, [req.params.tenantId]);

            res.json({ reviews, stats });
        } catch (error) {
            console.error('Get public reviews error:', error);
            res.status(500).json({ error: 'Erro ao buscar avaliacoes' });
        }
    });

    // ========================================
    // GET /api/reviews/product/:productId - Reviews de um produto
    // ========================================
    router.get('/product/:productId', async (req, res) => {
        try {
            const reviews = await db.all(`
                SELECT * FROM reviews
                WHERE product_id = ? AND is_approved = 1
                ORDER BY created_at DESC
            `, [req.params.productId]);

            const stats = await db.get(`
                SELECT COUNT(*) as total, AVG(rating) as average
                FROM reviews WHERE product_id = ? AND is_approved = 1
            `, [req.params.productId]);

            res.json({ reviews, stats });
        } catch (error) {
            console.error('Get product reviews error:', error);
            res.status(500).json({ error: 'Erro ao buscar avaliacoes' });
        }
    });

    // ========================================
    // POST /api/reviews - Criar review (publico)
    // ========================================
    router.post('/', async (req, res) => {
        try {
            const {
                tenantId, productId, customerName, customerPhone,
                rating, comment, orderId
            } = req.body;

            if (!tenantId || !rating || !customerName) {
                return res.status(400).json({ error: 'Dados incompletos' });
            }

            if (rating < 1 || rating > 5) {
                return res.status(400).json({ error: 'Avaliacao deve ser entre 1 e 5' });
            }

            // Verificar se ja avaliou este pedido
            if (orderId) {
                const existing = await db.get(
                    'SELECT id FROM reviews WHERE order_id = ?',
                    [orderId]
                );
                if (existing) {
                    return res.status(400).json({ error: 'Pedido ja foi avaliado' });
                }
            }

            // Buscar customer_id se existir
            let customerId = null;
            if (customerPhone) {
                const customer = await db.get(
                    'SELECT id FROM customers WHERE tenant_id = ? AND phone = ?',
                    [tenantId, customerPhone]
                );
                customerId = customer?.id;
            }

            const id = uuidv4();

            await db.run(`
                INSERT INTO reviews (
                    id, tenant_id, product_id, customer_id, customer_name,
                    customer_phone, rating, comment, order_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id, tenantId, productId || null, customerId,
                customerName, customerPhone || null, rating,
                comment || null, orderId || null
            ]);

            res.status(201).json({ success: true, id });
        } catch (error) {
            console.error('Create review error:', error);
            res.status(500).json({ error: 'Erro ao criar avaliacao' });
        }
    });

    // ========================================
    // GET /api/reviews - Listar reviews do tenant (admin)
    // ========================================
    router.get('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { approved } = req.query;

            let query = `
                SELECT r.*, p.name as product_name
                FROM reviews r
                LEFT JOIN products p ON r.product_id = p.id
                WHERE r.tenant_id = ?
            `;
            const params = [req.tenantId];

            if (approved !== undefined) {
                query += ' AND r.is_approved = ?';
                params.push(approved === 'true' ? 1 : 0);
            }

            query += ' ORDER BY r.created_at DESC';

            const reviews = await db.all(query, params);
            res.json(reviews);
        } catch (error) {
            console.error('Get reviews error:', error);
            res.status(500).json({ error: 'Erro ao buscar avaliacoes' });
        }
    });

    // ========================================
    // PUT /api/reviews/:id/approve - Aprovar review
    // ========================================
    router.put('/:id/approve', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            await db.run(
                'UPDATE reviews SET is_approved = 1 WHERE id = ? AND tenant_id = ?',
                [req.params.id, req.tenantId]
            );
            res.json({ success: true });
        } catch (error) {
            console.error('Approve review error:', error);
            res.status(500).json({ error: 'Erro ao aprovar avaliacao' });
        }
    });

    // ========================================
    // PUT /api/reviews/:id/reject - Rejeitar review
    // ========================================
    router.put('/:id/reject', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            await db.run(
                'UPDATE reviews SET is_approved = 0 WHERE id = ? AND tenant_id = ?',
                [req.params.id, req.tenantId]
            );
            res.json({ success: true });
        } catch (error) {
            console.error('Reject review error:', error);
            res.status(500).json({ error: 'Erro ao rejeitar avaliacao' });
        }
    });

    // ========================================
    // PUT /api/reviews/:id/reply - Responder review
    // ========================================
    router.put('/:id/reply', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { reply } = req.body;

            await db.run(`
                UPDATE reviews SET reply = ?, reply_at = CURRENT_TIMESTAMP
                WHERE id = ? AND tenant_id = ?
            `, [reply, req.params.id, req.tenantId]);

            res.json({ success: true });
        } catch (error) {
            console.error('Reply review error:', error);
            res.status(500).json({ error: 'Erro ao responder avaliacao' });
        }
    });

    // ========================================
    // DELETE /api/reviews/:id - Excluir review
    // ========================================
    router.delete('/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            await db.run(
                'DELETE FROM reviews WHERE id = ? AND tenant_id = ?',
                [req.params.id, req.tenantId]
            );
            res.json({ success: true });
        } catch (error) {
            console.error('Delete review error:', error);
            res.status(500).json({ error: 'Erro ao excluir avaliacao' });
        }
    });

    return router;
}
