// ============================================================
// Rotas Super Admin (Dashboard da Plataforma)
// ============================================================

import { Router } from 'express';
import { authMiddleware, superAdminOnly } from '../middleware/auth.js';

export default function (db) {
    const router = Router();

    // Todas as rotas requerem Super Admin
    router.use(authMiddleware(db), superAdminOnly);

    // ========================================
    // GET /api/superadmin/dashboard - Dashboard principal
    // ========================================
    router.get('/dashboard', async (req, res) => {
        try {
            // Stats
            const tenantsCount = await db.get('SELECT COUNT(*) as count FROM tenants');
            const usersCount = await db.get('SELECT COUNT(*) as count FROM users');
            const ordersToday = await db.get(`
                SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total
                FROM orders WHERE date(created_at) = date('now')
            `);
            const totalRevenue = await db.get('SELECT COALESCE(SUM(total), 0) as total FROM orders');
            const newTenantsMonth = await db.get(`
                SELECT COUNT(*) as count FROM tenants 
                WHERE created_at >= date('now', 'start of month')
            `);

            // Recent tenants
            const recentTenants = await db.all(`
                SELECT t.*, u.name as owner_name, u.email as owner_email,
                       s.status as subscription_status, p.name as plan_name,
                       (SELECT COUNT(*) FROM orders WHERE tenant_id = t.id) as orders_count
                FROM tenants t
                JOIN users u ON t.owner_id = u.id
                LEFT JOIN subscriptions s ON s.tenant_id = t.id
                LEFT JOIN plans p ON s.plan_id = p.id
                ORDER BY t.created_at DESC
                LIMIT 5
            `);

            // Recent activity (simulated from orders and tenants)
            const recentOrders = await db.all(`
                SELECT o.*, t.name as tenant_name
                FROM orders o
                JOIN tenants t ON o.tenant_id = t.id
                ORDER BY o.created_at DESC
                LIMIT 5
            `);

            const recentActivity = [
                ...recentTenants.slice(0, 3).map(t => ({
                    type: 'NEW_TENANT',
                    message: `Nova loja: ${t.name}`,
                    created_at: t.created_at
                })),
                ...recentOrders.slice(0, 5).map(o => ({
                    type: 'ORDER',
                    message: `Pedido #${o.order_number} em ${o.tenant_name}`,
                    created_at: o.created_at
                }))
            ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);

            res.json({
                stats: {
                    tenants: tenantsCount.count,
                    users: usersCount.count,
                    ordersToday: ordersToday.count,
                    revenueToday: ordersToday.total,
                    totalRevenue: totalRevenue.total,
                    newTenantsMonth: newTenantsMonth.count
                },
                recentTenants,
                recentActivity
            });
        } catch (error) {
            console.error('Superadmin dashboard error:', error);
            res.status(500).json({ error: 'Erro ao carregar dashboard' });
        }
    });

    // ========================================
    // GET /api/superadmin/metrics - Metricas gerais
    // ========================================
    router.get('/metrics', async (req, res) => {
        try {
            // Total tenants
            const totalTenants = await db.get('SELECT COUNT(*) as count FROM tenants');

            // Tenants ativos (com pedidos nos ultimos 7 dias)
            const activeTenants = await db.get(`
                SELECT COUNT(DISTINCT tenant_id) as count FROM orders 
                WHERE created_at >= date('now', '-7 days')
            `);

            // Por status de subscription
            const bySubscription = await db.all(`
                SELECT status, COUNT(*) as count 
                FROM subscriptions 
                GROUP BY status
            `);

            // MRR (Monthly Recurring Revenue)
            const mrr = await db.get(`
                SELECT COALESCE(SUM(p.price), 0) as total
                FROM subscriptions s
                JOIN plans p ON s.plan_id = p.id
                WHERE s.status = 'ACTIVE'
            `);

            // Pedidos totais
            const totalOrders = await db.get('SELECT COUNT(*) as count FROM orders');
            const ordersToday = await db.get(`
                SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total
                FROM orders WHERE date(created_at) = date('now')
            `);

            // Trial -> Paying conversion
            const totalTrials = await db.get(
                "SELECT COUNT(*) as count FROM subscriptions WHERE status IN ('TRIALING', 'ACTIVE', 'CANCELLED')"
            );
            const convertedTrials = await db.get(
                "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'ACTIVE'"
            );
            const conversionRate = totalTrials.count > 0
                ? Math.round((convertedTrials.count / totalTrials.count) * 100)
                : 0;

            res.json({
                tenants: {
                    total: totalTenants.count,
                    active: activeTenants.count,
                    bySubscription: bySubscription.reduce((acc, s) => {
                        acc[s.status] = s.count;
                        return acc;
                    }, {})
                },
                revenue: {
                    mrr: mrr.total,
                    arr: mrr.total * 12
                },
                orders: {
                    total: totalOrders.count,
                    today: ordersToday.count,
                    revenueToday: ordersToday.total
                },
                conversion: {
                    rate: conversionRate,
                    trialing: bySubscription.find(s => s.status === 'TRIALING')?.count || 0
                }
            });
        } catch (error) {
            console.error('Superadmin metrics error:', error);
            res.status(500).json({ error: 'Erro ao buscar metricas' });
        }
    });

    // ========================================
    // GET /api/superadmin/tenants - Listar tenants
    // ========================================
    router.get('/tenants', async (req, res) => {
        try {
            const { status, search, limit = 100, offset = 0 } = req.query;

            let query = `
                SELECT t.*, u.name as owner_name, u.email as owner_email,
                       s.status as subscription_status, p.name as plan_name,
                       (SELECT COUNT(*) FROM orders WHERE tenant_id = t.id) as orders_count,
                       (SELECT COUNT(*) FROM products WHERE tenant_id = t.id) as products_count
                FROM tenants t
                JOIN users u ON t.owner_id = u.id
                LEFT JOIN subscriptions s ON s.tenant_id = t.id
                LEFT JOIN plans p ON s.plan_id = p.id
                WHERE 1=1
            `;
            const params = [];

            if (status) {
                query += ' AND s.status = ?';
                params.push(status);
            }

            if (search) {
                query += ' AND (t.name LIKE ? OR t.slug LIKE ? OR u.email LIKE ?)';
                params.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }

            query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const tenants = await db.all(query, params);

            res.json(tenants);
        } catch (error) {
            console.error('Superadmin tenants error:', error);
            res.status(500).json({ error: 'Erro ao buscar tenants' });
        }
    });

    // ========================================
    // POST /api/superadmin/tenants/:id/suspend - Suspender tenant
    // ========================================
    router.post('/tenants/:id/suspend', async (req, res) => {
        try {
            await db.run(
                'UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['SUSPENDED', req.params.id]
            );

            await db.run(
                'UPDATE subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?',
                ['SUSPENDED', req.params.id]
            );

            res.json({ success: true, status: 'SUSPENDED' });
        } catch (error) {
            console.error('Suspend tenant error:', error);
            res.status(500).json({ error: 'Erro ao suspender tenant' });
        }
    });

    // ========================================
    // POST /api/superadmin/tenants/:id/activate - Reativar tenant
    // ========================================
    router.post('/tenants/:id/activate', async (req, res) => {
        try {
            await db.run(
                'UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['ACTIVE', req.params.id]
            );

            await db.run(
                'UPDATE subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?',
                ['ACTIVE', req.params.id]
            );

            res.json({ success: true, status: 'ACTIVE' });
        } catch (error) {
            console.error('Activate tenant error:', error);
            res.status(500).json({ error: 'Erro ao ativar tenant' });
        }
    });

    // ========================================
    // PUT /api/superadmin/tenants/:id/status - Alterar status
    // ========================================
    router.put('/tenants/:id/status', async (req, res) => {
        try {
            const { status } = req.body;

            if (!['ACTIVE', 'SUSPENDED', 'CANCELLED'].includes(status)) {
                return res.status(400).json({ error: 'Status invalido' });
            }

            await db.run(
                'UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [status, req.params.id]
            );

            res.json({ success: true, status });
        } catch (error) {
            console.error('Update tenant status error:', error);
            res.status(500).json({ error: 'Erro ao atualizar status' });
        }
    });

    return router;
}
