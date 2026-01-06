// ============================================================
// Rotas de Cupons de Desconto
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/coupons - Listar cupons do tenant
    // ========================================
    router.get('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const coupons = await db.all(`
                SELECT * FROM coupons 
                WHERE tenant_id = ? 
                ORDER BY created_at DESC
            `, [req.tenantId]);

            res.json(coupons);
        } catch (error) {
            console.error('Get coupons error:', error);
            res.status(500).json({ error: 'Erro ao buscar cupons' });
        }
    });

    // ========================================
    // POST /api/coupons - Criar cupom
    // ========================================
    router.post('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const {
                code, description, discountType, discountValue,
                minOrderValue, maxUses, validFrom, validUntil
            } = req.body;

            if (!code || !discountValue) {
                return res.status(400).json({ error: 'Codigo e valor sao obrigatorios' });
            }

            // Verificar se codigo ja existe
            const existing = await db.get(
                'SELECT id FROM coupons WHERE tenant_id = ? AND code = ?',
                [req.tenantId, code.toUpperCase()]
            );

            if (existing) {
                return res.status(400).json({ error: 'Codigo ja existe' });
            }

            const id = uuidv4();

            await db.run(`
                INSERT INTO coupons (
                    id, tenant_id, code, description, discount_type, discount_value,
                    min_order_value, max_uses, valid_from, valid_until
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id, req.tenantId, code.toUpperCase(), description || '',
                discountType || 'PERCENTAGE', parseFloat(discountValue),
                parseFloat(minOrderValue || 0), maxUses || null,
                validFrom || new Date().toISOString(), validUntil || null
            ]);

            const coupon = await db.get('SELECT * FROM coupons WHERE id = ?', [id]);
            res.status(201).json(coupon);
        } catch (error) {
            console.error('Create coupon error:', error);
            res.status(500).json({ error: 'Erro ao criar cupom' });
        }
    });

    // ========================================
    // PUT /api/coupons/:id - Atualizar cupom
    // ========================================
    router.put('/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const {
                code, description, discountType, discountValue,
                minOrderValue, maxUses, validFrom, validUntil, isActive
            } = req.body;

            await db.run(`
                UPDATE coupons SET
                    code = COALESCE(?, code),
                    description = COALESCE(?, description),
                    discount_type = COALESCE(?, discount_type),
                    discount_value = COALESCE(?, discount_value),
                    min_order_value = COALESCE(?, min_order_value),
                    max_uses = ?,
                    valid_from = COALESCE(?, valid_from),
                    valid_until = ?,
                    is_active = COALESCE(?, is_active)
                WHERE id = ? AND tenant_id = ?
            `, [
                code?.toUpperCase(), description, discountType, discountValue,
                minOrderValue, maxUses, validFrom, validUntil, isActive,
                req.params.id, req.tenantId
            ]);

            const coupon = await db.get('SELECT * FROM coupons WHERE id = ?', [req.params.id]);
            res.json(coupon);
        } catch (error) {
            console.error('Update coupon error:', error);
            res.status(500).json({ error: 'Erro ao atualizar cupom' });
        }
    });

    // ========================================
    // DELETE /api/coupons/:id - Excluir cupom
    // ========================================
    router.delete('/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            await db.run(
                'DELETE FROM coupons WHERE id = ? AND tenant_id = ?',
                [req.params.id, req.tenantId]
            );
            res.json({ success: true });
        } catch (error) {
            console.error('Delete coupon error:', error);
            res.status(500).json({ error: 'Erro ao excluir cupom' });
        }
    });

    // ========================================
    // POST /api/coupons/validate - Validar cupom (publico)
    // ========================================
    router.post('/validate', async (req, res) => {
        try {
            const { tenantId, code, orderTotal } = req.body;

            if (!tenantId || !code) {
                return res.status(400).json({ valid: false, error: 'Dados incompletos' });
            }

            const coupon = await db.get(`
                SELECT * FROM coupons 
                WHERE tenant_id = ? AND code = ? AND is_active = 1
            `, [tenantId, code.toUpperCase()]);

            if (!coupon) {
                return res.json({ valid: false, error: 'Cupom invalido ou expirado' });
            }

            // Verificar validade
            const now = new Date();
            if (coupon.valid_from && new Date(coupon.valid_from) > now) {
                return res.json({ valid: false, error: 'Cupom ainda nao esta ativo' });
            }
            if (coupon.valid_until && new Date(coupon.valid_until) < now) {
                return res.json({ valid: false, error: 'Cupom expirado' });
            }

            // Verificar usos
            if (coupon.max_uses && coupon.uses_count >= coupon.max_uses) {
                return res.json({ valid: false, error: 'Cupom esgotado' });
            }

            // Verificar valor minimo
            if (orderTotal && coupon.min_order_value > orderTotal) {
                return res.json({
                    valid: false,
                    error: `Valor minimo: R$ ${coupon.min_order_value.toFixed(2)}`
                });
            }

            // Calcular desconto
            let discount = 0;
            if (coupon.discount_type === 'PERCENTAGE') {
                discount = (orderTotal || 0) * (coupon.discount_value / 100);
            } else {
                discount = coupon.discount_value;
            }

            res.json({
                valid: true,
                coupon: {
                    id: coupon.id,
                    code: coupon.code,
                    discountType: coupon.discount_type,
                    discountValue: coupon.discount_value,
                    description: coupon.description
                },
                discount: Math.min(discount, orderTotal || discount)
            });
        } catch (error) {
            console.error('Validate coupon error:', error);
            res.status(500).json({ valid: false, error: 'Erro ao validar cupom' });
        }
    });

    // ========================================
    // POST /api/coupons/apply - Aplicar cupom (incrementa uso)
    // ========================================
    router.post('/apply', async (req, res) => {
        try {
            const { tenantId, code } = req.body;

            await db.run(`
                UPDATE coupons SET uses_count = uses_count + 1
                WHERE tenant_id = ? AND code = ?
            `, [tenantId, code.toUpperCase()]);

            res.json({ success: true });
        } catch (error) {
            console.error('Apply coupon error:', error);
            res.status(500).json({ error: 'Erro ao aplicar cupom' });
        }
    });

    return router;
}
