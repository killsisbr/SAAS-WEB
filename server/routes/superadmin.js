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

    // ========================================
    // GET /api/superadmin/tenants/:id - Detalhes do tenant
    // ========================================
    router.get('/tenants/:id', async (req, res) => {
        try {
            const tenant = await db.get(`
                SELECT t.*, u.name as owner_name, u.email as owner_email,
                       s.status as subscription_status, s.plan_id, s.trial_ends_at, 
                       s.current_period_start, s.current_period_end,
                       p.name as plan_name, p.price as plan_price,
                       cd.domain as custom_domain
                FROM tenants t
                JOIN users u ON t.owner_id = u.id
                LEFT JOIN subscriptions s ON s.tenant_id = t.id
                LEFT JOIN plans p ON s.plan_id = p.id
                LEFT JOIN custom_domains cd ON cd.tenant_id = t.id AND cd.verified = 1
                WHERE t.id = ?
            `, [req.params.id]);

            if (!tenant) {
                return res.status(404).json({ error: 'Tenant não encontrado' });
            }

            res.json(tenant);
        } catch (error) {
            console.error('Get tenant error:', error);
            res.status(500).json({ error: 'Erro ao buscar tenant' });
        }
    });

    // ========================================
    // PUT /api/superadmin/tenants/:id - Atualizar tenant
    // ========================================
    router.put('/tenants/:id', async (req, res) => {
        try {
            const { name, slug, settings } = req.body;
            const { id } = req.params;

            // Atualizar tenant
            await db.run(`
                UPDATE tenants SET 
                    name = COALESCE(?, name),
                    slug = COALESCE(?, slug),
                    settings = COALESCE(?, settings),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [name, slug, typeof settings === 'object' ? JSON.stringify(settings) : settings, id]);

            res.json({ success: true });
        } catch (error) {
            console.error('Update tenant error:', error);
            res.status(500).json({ error: 'Erro ao atualizar tenant' });
        }
    });

    // ========================================
    // POST /api/superadmin/tenants/:id/domain - Adicionar/atualizar domínio
    // ========================================
    router.post('/tenants/:id/domain', async (req, res) => {
        try {
            const { domain } = req.body;
            const { id } = req.params;

            if (!domain) {
                return res.status(400).json({ error: 'Domínio é obrigatório' });
            }

            // Verificar se já existe
            const existing = await db.get(
                'SELECT id FROM custom_domains WHERE tenant_id = ?',
                [id]
            );

            if (existing) {
                // Atualizar
                await db.run(
                    'UPDATE custom_domains SET domain = ?, verified = 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?',
                    [domain, id]
                );
            } else {
                // Criar
                const { v4: uuidv4 } = await import('uuid');
                await db.run(
                    'INSERT INTO custom_domains (id, tenant_id, domain, verified, ssl_status) VALUES (?, ?, ?, 1, ?)',
                    [uuidv4(), id, domain, 'active']
                );
            }

            res.json({ success: true, domain });
        } catch (error) {
            console.error('Set domain error:', error);
            res.status(500).json({ error: 'Erro ao configurar domínio' });
        }
    });
    // ========================================
    // GET /api/superadmin/plans - Listar planos disponíveis
    // ========================================
    router.get('/plans', async (req, res) => {
        try {
            const plans = await db.all('SELECT * FROM plans ORDER BY price ASC');
            res.json(plans);
        } catch (error) {
            console.error('Get plans error:', error);
            res.status(500).json({ error: 'Erro ao buscar planos' });
        }
    });

    // ========================================
    // PUT /api/superadmin/tenants/:id/subscription - Atualizar subscription
    // ========================================
    router.put('/tenants/:id/subscription', async (req, res) => {
        try {
            const { plan_id, status, trial_ends_at, current_period_end } = req.body;
            const { id } = req.params;

            // Verificar se já existe subscription
            const existing = await db.get(
                'SELECT id FROM subscriptions WHERE tenant_id = ?',
                [id]
            );

            if (existing) {
                // Atualizar
                await db.run(`
                    UPDATE subscriptions SET 
                        plan_id = COALESCE(?, plan_id),
                        status = COALESCE(?, status),
                        trial_ends_at = COALESCE(?, trial_ends_at),
                        current_period_end = COALESCE(?, current_period_end),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE tenant_id = ?
                `, [plan_id, status, trial_ends_at, current_period_end, id]);
            } else {
                // Criar nova subscription
                const { v4: uuidv4 } = await import('uuid');
                await db.run(`
                    INSERT INTO subscriptions (id, tenant_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
                    VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
                `, [uuidv4(), id, plan_id || 'plan_trial', status || 'TRIALING', trial_ends_at, current_period_end]);
            }

            // Atualizar status do tenant também se mudar status da subscription
            if (status) {
                let tenantStatus = 'ACTIVE';
                if (status === 'SUSPENDED') tenantStatus = 'SUSPENDED';
                if (status === 'CANCELLED') tenantStatus = 'CANCELLED';

                await db.run(
                    'UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [tenantStatus, id]
                );
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Update subscription error:', error);
            res.status(500).json({ error: 'Erro ao atualizar subscription' });
        }
    });

    return router;
}
