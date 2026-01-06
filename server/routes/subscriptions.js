// ============================================================
// Rotas de Subscriptions (Assinaturas)
// ============================================================

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/subscriptions/plans - Listar planos
    // ========================================
    router.get('/plans', async (req, res) => {
        try {
            const plans = await db.all('SELECT * FROM plans WHERE is_active = 1 ORDER BY price ASC');

            // Parse features JSON
            for (const plan of plans) {
                try {
                    plan.features = JSON.parse(plan.features || '[]');
                } catch {
                    plan.features = [];
                }
            }

            res.json(plans);
        } catch (error) {
            console.error('Get plans error:', error);
            res.status(500).json({ error: 'Erro ao buscar planos' });
        }
    });

    // ========================================
    // GET /api/subscriptions/current - Assinatura atual
    // ========================================
    router.get('/current', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const subscription = await db.get(`
                SELECT s.*, p.name as plan_name, p.slug as plan_slug, p.price,
                       p.max_products, p.max_orders_month, p.max_images,
                       p.has_whatsapp, p.has_custom_domain, p.has_premium_themes
                FROM subscriptions s
                JOIN plans p ON s.plan_id = p.id
                WHERE s.tenant_id = ?
            `, [req.tenantId]);

            if (!subscription) {
                return res.status(404).json({ error: 'Assinatura nao encontrada' });
            }

            // Calcular uso atual
            const productCount = await db.get(
                'SELECT COUNT(*) as count FROM products WHERE tenant_id = ?',
                [req.tenantId]
            );

            const orderCountMonth = await db.get(`
                SELECT COUNT(*) as count FROM orders 
                WHERE tenant_id = ? AND created_at >= date('now', 'start of month')
            `, [req.tenantId]);

            res.json({
                ...subscription,
                usage: {
                    products: productCount.count,
                    orders_this_month: orderCountMonth.count
                }
            });
        } catch (error) {
            console.error('Get subscription error:', error);
            res.status(500).json({ error: 'Erro ao buscar assinatura' });
        }
    });

    // ========================================
    // POST /api/subscriptions/checkout - Iniciar pagamento
    // ========================================
    router.post('/checkout', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { planSlug } = req.body;

            const plan = await db.get('SELECT * FROM plans WHERE slug = ?', [planSlug]);
            if (!plan) {
                return res.status(404).json({ error: 'Plano nao encontrado' });
            }

            // TODO: Integrar com Stripe/PagSeguro
            // Por enquanto, simular upgrade

            await db.run(`
                UPDATE subscriptions SET 
                    plan_id = ?,
                    status = 'ACTIVE',
                    trial_ends_at = NULL,
                    current_period_start = CURRENT_TIMESTAMP,
                    current_period_end = date('now', '+1 month'),
                    updated_at = CURRENT_TIMESTAMP
                WHERE tenant_id = ?
            `, [plan.id, req.tenantId]);

            res.json({
                success: true,
                message: 'Plano atualizado com sucesso',
                // url: stripeSession.url // Quando integrado com Stripe
            });
        } catch (error) {
            console.error('Checkout error:', error);
            res.status(500).json({ error: 'Erro ao processar checkout' });
        }
    });

    return router;
}
