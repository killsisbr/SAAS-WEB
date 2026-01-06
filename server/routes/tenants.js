// ============================================================
// Rotas de Tenants (Lojas)
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, generateToken } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/tenants/me - Dados do tenant atual
    // ========================================
    router.get('/me', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [req.tenantId]);

            if (!tenant) {
                return res.status(404).json({ error: 'Tenant nao encontrado' });
            }

            // Parse settings
            let settings = {};
            try {
                settings = JSON.parse(tenant.settings || '{}');
            } catch { }

            res.json({
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                businessType: tenant.business_type,
                status: tenant.status,
                settings
            });
        } catch (error) {
            console.error('Get tenant me error:', error);
            res.status(500).json({ error: 'Erro ao buscar tenant' });
        }
    });

    // ========================================
    // GET /api/tenants/slug/:slug - Buscar tenant por slug
    // ========================================
    router.get('/slug/:slug', authMiddleware(db), async (req, res) => {
        try {
            const { slug } = req.params;
            const tenant = await db.get('SELECT * FROM tenants WHERE slug = ?', [slug]);

            if (!tenant) {
                return res.status(404).json({ error: 'Tenant nao encontrado' });
            }

            res.json({
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                businessType: tenant.business_type,
                status: tenant.status
            });
        } catch (error) {
            console.error('Get tenant by slug error:', error);
            res.status(500).json({ error: 'Erro ao buscar tenant' });
        }
    });

    // ========================================
    // POST /api/tenants - Criar nova loja
    // ========================================
    router.post('/', authMiddleware(db), async (req, res) => {
        try {
            const { name, businessType, themeId, slug } = req.body;

            // Validacoes
            if (!name) {
                return res.status(400).json({ error: 'Nome da loja e obrigatorio' });
            }

            // Gerar slug se nao fornecido
            let finalSlug = slug || name
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');

            // Verificar slug unico
            let slugExists = await db.get('SELECT id FROM tenants WHERE slug = ?', [finalSlug]);
            let counter = 1;
            while (slugExists) {
                finalSlug = `${finalSlug}-${counter}`;
                slugExists = await db.get('SELECT id FROM tenants WHERE slug = ?', [finalSlug]);
                counter++;
            }

            // Verificar se usuario ja tem loja (limite por usuario)
            const existingTenant = await db.get('SELECT id FROM tenants WHERE owner_id = ?', [req.user.id]);
            if (existingTenant && req.user.role !== 'SUPER_ADMIN') {
                return res.status(400).json({ error: 'Voce ja possui uma loja cadastrada' });
            }

            // Criar tenant
            const tenantId = uuidv4();
            const settings = JSON.stringify({
                phone: '',
                whatsapp: '',
                address: null,
                schedule: {},
                deliveryFee: 0,
                deliveryFeePerKm: 0,
                minOrder: 0,
                pixKey: '',
                acceptCard: true,
                acceptPix: true,
                acceptCash: true
            });

            await db.run(`
                INSERT INTO tenants (id, owner_id, name, slug, business_type, theme_id, settings, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
            `, [tenantId, req.user.id, name, finalSlug, businessType || 'OUTROS', themeId || null, settings]);

            // Criar subscription trial
            const subscriptionId = uuidv4();
            const trialPlan = await db.get("SELECT id FROM plans WHERE slug = 'trial'");
            const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

            await db.run(`
                INSERT INTO subscriptions (id, tenant_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
                VALUES (?, ?, ?, 'TRIALING', ?, CURRENT_TIMESTAMP, ?)
            `, [subscriptionId, tenantId, trialPlan.id, trialEndsAt, trialEndsAt]);

            // Gerar novo token com tenant
            const newToken = generateToken(req.user.id, tenantId);

            res.status(201).json({
                success: true,
                tenant: {
                    id: tenantId,
                    name,
                    slug: finalSlug,
                    businessType: businessType || 'OUTROS',
                    status: 'ACTIVE'
                },
                subscription: {
                    status: 'TRIALING',
                    trialEndsAt
                },
                token: newToken
            });
        } catch (error) {
            console.error('Create tenant error:', error);
            res.status(500).json({ error: 'Erro ao criar loja' });
        }
    });

    // ========================================
    // GET /api/tenants/:slug - Dados publicos da loja
    // ========================================
    router.get('/:slug', async (req, res) => {
        try {
            const { slug } = req.params;

            const tenant = await db.get(`
                SELECT t.*, th.primary_color, th.secondary_color, th.accent_color,
                       th.background_color, th.text_color, th.card_style, th.button_style,
                       th.font_family
                FROM tenants t
                LEFT JOIN themes th ON t.theme_id = th.id
                WHERE t.slug = ? AND t.status = 'ACTIVE'
            `, [slug]);

            if (!tenant) {
                return res.status(404).json({ error: 'Loja nao encontrada' });
            }

            // Buscar categorias com produtos
            const categories = await db.all(`
                SELECT * FROM categories 
                WHERE tenant_id = ? AND is_active = 1
                ORDER BY order_index ASC
            `, [tenant.id]);

            for (const cat of categories) {
                cat.products = await db.all(`
                    SELECT * FROM products 
                    WHERE category_id = ? AND is_available = 1
                    ORDER BY order_index ASC
                `, [cat.id]);

                // Parse images JSON
                for (const prod of cat.products) {
                    try {
                        prod.images = JSON.parse(prod.images || '[]');
                    } catch {
                        prod.images = [];
                    }
                }
            }

            // Parse settings
            let settings = {};
            try {
                settings = JSON.parse(tenant.settings || '{}');
                // FORCAR ZONAS DO CAMPESTRE (Fix temporario para garantir update)
                settings.deliveryZones = [
                    { maxKm: 4, fee: 7 },
                    { maxKm: 10, fee: 15 },
                    { maxKm: 20, fee: 25 },
                    { maxKm: 70, fee: 65 }
                ];
            } catch { }

            res.json({
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                logo_url: tenant.logo_url,
                business_type: tenant.business_type,
                settings,
                theme: {
                    primary_color: tenant.primary_color,
                    secondary_color: tenant.secondary_color,
                    accent_color: tenant.accent_color,
                    background_color: tenant.background_color,
                    text_color: tenant.text_color,
                    card_style: tenant.card_style,
                    button_style: tenant.button_style,
                    font_family: tenant.font_family
                },
                categories
            });
        } catch (error) {
            console.error('Get tenant error:', error);
            res.status(500).json({ error: 'Erro ao buscar loja' });
        }
    });

    // ========================================
    // PUT /api/tenants/:id - Atualizar loja
    // ========================================
    router.put('/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { id } = req.params;
            const { name, themeId, settings, logoUrl } = req.body;

            // Verificar permissao
            if (req.tenant.id !== id && req.user.role !== 'SUPER_ADMIN') {
                return res.status(403).json({ error: 'Sem permissao para editar esta loja' });
            }

            // Atualizar
            const updates = [];
            const params = [];

            if (name) {
                updates.push('name = ?');
                params.push(name);
            }
            if (themeId !== undefined) {
                updates.push('theme_id = ?');
                params.push(themeId);
            }
            if (settings) {
                updates.push('settings = ?');
                params.push(typeof settings === 'string' ? settings : JSON.stringify(settings));
            }
            if (logoUrl !== undefined) {
                updates.push('logo_url = ?');
                params.push(logoUrl);
            }

            if (updates.length > 0) {
                updates.push('updated_at = CURRENT_TIMESTAMP');
                params.push(id);

                await db.run(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`, params);
            }

            // Retornar tenant atualizado
            const tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [id]);

            res.json({ success: true, tenant });
        } catch (error) {
            console.error('Update tenant error:', error);
            res.status(500).json({ error: 'Erro ao atualizar loja' });
        }
    });

    // ========================================
    // PUT /api/tenants/:id/settings - Atualizar settings
    // ========================================
    router.put('/:id/settings', async (req, res) => {
        try {
            const { id } = req.params;
            const { settings } = req.body;

            if (!settings) {
                return res.status(400).json({ error: 'Settings sao obrigatorios' });
            }

            // Buscar settings atuais
            const tenant = await db.get('SELECT settings FROM tenants WHERE id = ?', [id]);
            if (!tenant) {
                return res.status(404).json({ error: 'Loja nao encontrada' });
            }

            // Merge com settings existentes
            let currentSettings = {};
            try {
                currentSettings = JSON.parse(tenant.settings || '{}');
            } catch { }

            const mergedSettings = { ...currentSettings, ...settings };

            // Atualizar no banco
            await db.run(
                'UPDATE tenants SET settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [JSON.stringify(mergedSettings), id]
            );

            res.json({ success: true, settings: mergedSettings });
        } catch (error) {
            console.error('Update settings error:', error);
            res.status(500).json({ error: 'Erro ao atualizar configuracoes' });
        }
    });

    // ========================================
    // GET /api/tenants/:id/dashboard - Metricas
    // ========================================
    router.get('/:id/dashboard', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const tenantId = req.tenant.id;

            // Pedidos hoje
            const todayOrders = await db.get(`
                SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total
                FROM orders 
                WHERE tenant_id = ? AND date(created_at) = date('now')
            `, [tenantId]);

            // Pedidos semana
            const weekOrders = await db.get(`
                SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total
                FROM orders 
                WHERE tenant_id = ? AND created_at >= date('now', '-7 days')
            `, [tenantId]);

            // Pedidos mes
            const monthOrders = await db.get(`
                SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total
                FROM orders 
                WHERE tenant_id = ? AND created_at >= date('now', 'start of month')
            `, [tenantId]);

            // Pedidos por status
            const byStatus = await db.all(`
                SELECT status, COUNT(*) as count
                FROM orders WHERE tenant_id = ?
                GROUP BY status
            `, [tenantId]);

            // Produtos cadastrados
            const productsCount = await db.get(
                'SELECT COUNT(*) as count FROM products WHERE tenant_id = ?',
                [tenantId]
            );

            // Categorias
            const categoriesCount = await db.get(
                'SELECT COUNT(*) as count FROM categories WHERE tenant_id = ?',
                [tenantId]
            );

            // Clientes
            const customersCount = await db.get(
                'SELECT COUNT(*) as count FROM customers WHERE tenant_id = ?',
                [tenantId]
            );

            res.json({
                today: {
                    orders: todayOrders.count,
                    revenue: todayOrders.total
                },
                week: {
                    orders: weekOrders.count,
                    revenue: weekOrders.total
                },
                month: {
                    orders: monthOrders.count,
                    revenue: monthOrders.total
                },
                byStatus: byStatus.reduce((acc, s) => {
                    acc[s.status] = s.count;
                    return acc;
                }, {}),
                counts: {
                    products: productsCount.count,
                    categories: categoriesCount.count,
                    customers: customersCount.count
                }
            });
        } catch (error) {
            console.error('Dashboard error:', error);
            res.status(500).json({ error: 'Erro ao buscar metricas' });
        }
    });

    return router;
}
