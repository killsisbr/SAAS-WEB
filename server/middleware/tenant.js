// ============================================================
// Middleware de Tenant (Isolamento Multi-Tenant)
// ============================================================

/**
 * Middleware que verifica se usuario tem acesso ao tenant
 */
export function tenantMiddleware(db) {
    return async (req, res, next) => {
        try {
            // Super Admin pode acessar qualquer tenant
            if (req.user?.role === 'SUPER_ADMIN') {
                return next();
            }

            // Tenant ID pode vir de:
            // 1. Token JWT (req.tenantId)
            // 2. Parametro da rota (req.params.tenantId)
            // 3. Body (req.body.tenantId)
            // 4. Header X-Tenant-Slug (resolve slug para ID)
            let tenantId = req.tenantId || req.params.tenantId || req.body?.tenantId;

            // Resolver slug para tenantId se necessario
            const slugHeader = req.headers['x-tenant-slug'];
            if (!tenantId && slugHeader) {
                const tenantBySlug = await db.get('SELECT id FROM tenants WHERE slug = ?', [slugHeader]);
                if (tenantBySlug) {
                    tenantId = tenantBySlug.id;
                }
            }

            if (!tenantId) {
                return res.status(400).json({ error: 'Tenant ID nao fornecido' });
            }

            // Verificar se tenant existe e esta ativo
            const tenant = await db.get(
                'SELECT * FROM tenants WHERE id = ?',
                [tenantId]
            );

            if (!tenant) {
                return res.status(404).json({ error: 'Tenant nao encontrado' });
            }

            if (tenant.status !== 'ACTIVE') {
                return res.status(403).json({
                    error: 'Loja suspensa ou cancelada',
                    status: tenant.status
                });
            }

            // Verificar se usuario pertence ao tenant
            if (req.user && tenant.owner_id !== req.user.id) {
                // Verificar se e staff do tenant
                // TODO: implementar tabela tenant_users
                return res.status(403).json({ error: 'Voce nao tem acesso a esta loja' });
            }

            // Adicionar tenant ao request
            req.tenant = tenant;
            req.tenantId = tenantId;

            next();
        } catch (error) {
            console.error('Tenant middleware error:', error);
            return res.status(500).json({ error: 'Erro ao verificar tenant' });
        }
    };
}

/**
 * Middleware para resolver tenant via slug/dominio
 * Usado em rotas publicas (loja)
 */
export function tenantResolver(db) {
    return async (req, res, next) => {
        try {
            const host = req.hostname;
            let tenant = null;

            // 1. Dominio customizado (Enterprise)
            tenant = await db.get(`
                SELECT t.* FROM tenants t
                JOIN custom_domains cd ON cd.tenant_id = t.id
                WHERE cd.domain = ? AND cd.verified = 1
            `, [host]);

            // 2. Subdominio (Pro)
            if (!tenant) {
                const subdomain = host.split('.')[0];
                if (subdomain !== 'www' && subdomain !== 'localhost' && subdomain !== 'deliveryhub') {
                    tenant = await db.get('SELECT * FROM tenants WHERE slug = ?', [subdomain]);
                }
            }

            // 3. Path (Starter) - /loja/:slug
            if (!tenant && req.params.slug) {
                tenant = await db.get('SELECT * FROM tenants WHERE slug = ?', [req.params.slug]);
            }

            if (tenant) {
                // Verificar se esta ativo
                if (tenant.status !== 'ACTIVE') {
                    return res.status(503).json({
                        error: 'Loja temporariamente indisponivel',
                        status: tenant.status
                    });
                }

                // Carregar tema
                if (tenant.theme_id) {
                    tenant.theme = await db.get('SELECT * FROM themes WHERE id = ?', [tenant.theme_id]);
                }

                req.tenant = tenant;
                req.tenantId = tenant.id;
            }

            next();
        } catch (error) {
            console.error('Tenant resolver error:', error);
            next();
        }
    };
}

/**
 * Middleware de limites do plano
 */
export function checkLimits(db, limitType) {
    return async (req, res, next) => {
        try {
            if (!req.tenantId) return next();

            // Buscar subscription
            const subscription = await db.get(`
                SELECT s.*, p.* FROM subscriptions s
                JOIN plans p ON s.plan_id = p.id
                WHERE s.tenant_id = ?
            `, [req.tenantId]);

            if (!subscription) return next();

            // Verificar se trial expirou
            if (subscription.status === 'TRIALING' && new Date(subscription.trial_ends_at) < new Date()) {
                return res.status(402).json({
                    error: 'Seu periodo de trial expirou. Assine um plano para continuar.',
                    redirect: '/admin/config?tab=plano'
                });
            }

            // Verificar limites especificos
            if (limitType === 'products') {
                const count = await db.get(
                    'SELECT COUNT(*) as count FROM products WHERE tenant_id = ?',
                    [req.tenantId]
                );

                if (count.count >= subscription.max_products) {
                    return res.status(403).json({
                        error: `Limite de ${subscription.max_products} produtos atingido. Faca upgrade do plano.`,
                        limit: subscription.max_products,
                        current: count.count
                    });
                }
            }

            if (limitType === 'orders') {
                // Contar pedidos do mes atual
                const count = await db.get(`
                    SELECT COUNT(*) as count FROM orders 
                    WHERE tenant_id = ? 
                    AND created_at >= date('now', 'start of month')
                `, [req.tenantId]);

                if (count.count >= subscription.max_orders_month) {
                    return res.status(403).json({
                        error: `Limite de ${subscription.max_orders_month} pedidos/mes atingido.`,
                        limit: subscription.max_orders_month,
                        current: count.count
                    });
                }
            }

            next();
        } catch (error) {
            console.error('Check limits error:', error);
            next();
        }
    };
}

export default {
    tenantMiddleware,
    tenantResolver,
    checkLimits
};
