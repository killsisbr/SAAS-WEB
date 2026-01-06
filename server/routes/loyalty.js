// ============================================================
// Rotas de Programa de Fidelidade
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/loyalty/config/:tenantId - Config publica
    // ========================================
    router.get('/config/:tenantId', async (req, res) => {
        try {
            const config = await db.get(
                'SELECT * FROM loyalty_config WHERE tenant_id = ?',
                [req.params.tenantId]
            );

            if (!config || !config.is_enabled) {
                return res.json({ enabled: false });
            }

            const rewards = await db.all(`
                SELECT * FROM loyalty_rewards
                WHERE tenant_id = ? AND is_active = 1
                ORDER BY points_required ASC
            `, [req.params.tenantId]);

            res.json({
                enabled: true,
                pointsPerReal: config.points_per_real,
                minPointsRedeem: config.min_points_redeem,
                rewards
            });
        } catch (error) {
            console.error('Get loyalty config error:', error);
            res.status(500).json({ error: 'Erro ao buscar config' });
        }
    });

    // ========================================
    // GET /api/loyalty/points/:tenantId/:phone - Pontos do cliente
    // ========================================
    router.get('/points/:tenantId/:phone', async (req, res) => {
        try {
            const { tenantId, phone } = req.params;

            // Buscar customer
            const customer = await db.get(
                'SELECT id FROM customers WHERE tenant_id = ? AND phone = ?',
                [tenantId, phone]
            );

            if (!customer) {
                return res.json({ points: 0, totalEarned: 0, totalRedeemed: 0 });
            }

            const loyalty = await db.get(
                'SELECT * FROM loyalty_points WHERE tenant_id = ? AND customer_id = ?',
                [tenantId, customer.id]
            );

            if (!loyalty) {
                return res.json({ points: 0, totalEarned: 0, totalRedeemed: 0 });
            }

            // Historico recente
            const history = await db.all(`
                SELECT * FROM loyalty_transactions
                WHERE tenant_id = ? AND customer_id = ?
                ORDER BY created_at DESC
                LIMIT 10
            `, [tenantId, customer.id]);

            res.json({
                points: loyalty.points,
                totalEarned: loyalty.total_earned,
                totalRedeemed: loyalty.total_redeemed,
                history
            });
        } catch (error) {
            console.error('Get loyalty points error:', error);
            res.status(500).json({ error: 'Erro ao buscar pontos' });
        }
    });

    // ========================================
    // POST /api/loyalty/earn - Ganhar pontos (chamado apos pedido)
    // ========================================
    router.post('/earn', async (req, res) => {
        try {
            const { tenantId, customerId, orderTotal, orderId } = req.body;

            // Verificar config
            const config = await db.get(
                'SELECT * FROM loyalty_config WHERE tenant_id = ? AND is_enabled = 1',
                [tenantId]
            );

            if (!config) {
                return res.json({ success: false, message: 'Programa desabilitado' });
            }

            // Calcular pontos
            const pointsEarned = Math.floor(orderTotal * config.points_per_real);

            if (pointsEarned <= 0) {
                return res.json({ success: true, pointsEarned: 0 });
            }

            // Atualizar ou criar registro
            const existing = await db.get(
                'SELECT * FROM loyalty_points WHERE tenant_id = ? AND customer_id = ?',
                [tenantId, customerId]
            );

            if (existing) {
                await db.run(`
                    UPDATE loyalty_points SET
                        points = points + ?,
                        total_earned = total_earned + ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE tenant_id = ? AND customer_id = ?
                `, [pointsEarned, pointsEarned, tenantId, customerId]);
            } else {
                await db.run(`
                    INSERT INTO loyalty_points (id, tenant_id, customer_id, points, total_earned)
                    VALUES (?, ?, ?, ?, ?)
                `, [uuidv4(), tenantId, customerId, pointsEarned, pointsEarned]);
            }

            // Registrar transacao
            await db.run(`
                INSERT INTO loyalty_transactions (id, tenant_id, customer_id, points, type, description, order_id)
                VALUES (?, ?, ?, ?, 'EARNED', ?, ?)
            `, [uuidv4(), tenantId, customerId, pointsEarned, `Pedido #${orderId}`, orderId]);

            res.json({ success: true, pointsEarned });
        } catch (error) {
            console.error('Earn loyalty points error:', error);
            res.status(500).json({ error: 'Erro ao adicionar pontos' });
        }
    });

    // ========================================
    // POST /api/loyalty/redeem - Resgatar recompensa
    // ========================================
    router.post('/redeem', async (req, res) => {
        try {
            const { tenantId, customerId, rewardId } = req.body;

            // Buscar recompensa
            const reward = await db.get(
                'SELECT * FROM loyalty_rewards WHERE id = ? AND tenant_id = ? AND is_active = 1',
                [rewardId, tenantId]
            );

            if (!reward) {
                return res.status(404).json({ error: 'Recompensa nao encontrada' });
            }

            // Verificar pontos
            const loyalty = await db.get(
                'SELECT * FROM loyalty_points WHERE tenant_id = ? AND customer_id = ?',
                [tenantId, customerId]
            );

            if (!loyalty || loyalty.points < reward.points_required) {
                return res.status(400).json({ error: 'Pontos insuficientes' });
            }

            // Descontar pontos
            await db.run(`
                UPDATE loyalty_points SET
                    points = points - ?,
                    total_redeemed = total_redeemed + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE tenant_id = ? AND customer_id = ?
            `, [reward.points_required, reward.points_required, tenantId, customerId]);

            // Registrar transacao
            await db.run(`
                INSERT INTO loyalty_transactions (id, tenant_id, customer_id, points, type, description, reward_id)
                VALUES (?, ?, ?, ?, 'REDEEMED', ?, ?)
            `, [uuidv4(), tenantId, customerId, -reward.points_required, `Resgate: ${reward.name}`, rewardId]);

            res.json({
                success: true,
                reward: {
                    name: reward.name,
                    type: reward.reward_type,
                    value: reward.reward_value
                }
            });
        } catch (error) {
            console.error('Redeem reward error:', error);
            res.status(500).json({ error: 'Erro ao resgatar recompensa' });
        }
    });

    // ========================================
    // ADMIN ROUTES
    // ========================================

    // GET /api/loyalty/admin/config - Config do tenant
    router.get('/admin/config', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            let config = await db.get(
                'SELECT * FROM loyalty_config WHERE tenant_id = ?',
                [req.tenantId]
            );

            if (!config) {
                // Criar config padrao
                const id = uuidv4();
                await db.run(`
                    INSERT INTO loyalty_config (id, tenant_id)
                    VALUES (?, ?)
                `, [id, req.tenantId]);
                config = await db.get('SELECT * FROM loyalty_config WHERE id = ?', [id]);
            }

            const rewards = await db.all(
                'SELECT * FROM loyalty_rewards WHERE tenant_id = ? ORDER BY points_required',
                [req.tenantId]
            );

            res.json({ config, rewards });
        } catch (error) {
            console.error('Get admin loyalty config error:', error);
            res.status(500).json({ error: 'Erro ao buscar config' });
        }
    });

    // PUT /api/loyalty/admin/config - Atualizar config
    router.put('/admin/config', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { isEnabled, pointsPerReal, minPointsRedeem } = req.body;

            await db.run(`
                UPDATE loyalty_config SET
                    is_enabled = COALESCE(?, is_enabled),
                    points_per_real = COALESCE(?, points_per_real),
                    min_points_redeem = COALESCE(?, min_points_redeem)
                WHERE tenant_id = ?
            `, [isEnabled ? 1 : 0, pointsPerReal, minPointsRedeem, req.tenantId]);

            res.json({ success: true });
        } catch (error) {
            console.error('Update loyalty config error:', error);
            res.status(500).json({ error: 'Erro ao atualizar config' });
        }
    });

    // POST /api/loyalty/admin/rewards - Criar recompensa
    router.post('/admin/rewards', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { name, description, pointsRequired, rewardType, rewardValue, productId } = req.body;

            const id = uuidv4();
            await db.run(`
                INSERT INTO loyalty_rewards (id, tenant_id, name, description, points_required, reward_type, reward_value, product_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [id, req.tenantId, name, description, pointsRequired, rewardType || 'DISCOUNT', rewardValue, productId]);

            const reward = await db.get('SELECT * FROM loyalty_rewards WHERE id = ?', [id]);
            res.status(201).json(reward);
        } catch (error) {
            console.error('Create reward error:', error);
            res.status(500).json({ error: 'Erro ao criar recompensa' });
        }
    });

    // DELETE /api/loyalty/admin/rewards/:id - Excluir recompensa
    router.delete('/admin/rewards/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            await db.run(
                'DELETE FROM loyalty_rewards WHERE id = ? AND tenant_id = ?',
                [req.params.id, req.tenantId]
            );
            res.json({ success: true });
        } catch (error) {
            console.error('Delete reward error:', error);
            res.status(500).json({ error: 'Erro ao excluir recompensa' });
        }
    });

    return router;
}
