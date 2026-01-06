// ============================================================
// Rotas de Relatorios e Analytics
// ============================================================

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // Todas as rotas requerem autenticacao
    router.use(authMiddleware(db), tenantMiddleware(db));

    // ========================================
    // GET /api/reports/sales - Relatorio de vendas
    // ========================================
    router.get('/sales', async (req, res) => {
        try {
            const { startDate, endDate, groupBy = 'day' } = req.query;

            // Filtros de data
            let dateFilter = '';
            const params = [req.tenantId];

            if (startDate) {
                dateFilter += ' AND date(created_at) >= ?';
                params.push(startDate);
            }
            if (endDate) {
                dateFilter += ' AND date(created_at) <= ?';
                params.push(endDate);
            }

            // Agrupamento
            let dateFormat = '%Y-%m-%d';
            if (groupBy === 'week') dateFormat = '%Y-W%W';
            if (groupBy === 'month') dateFormat = '%Y-%m';

            // Vendas por periodo
            const salesByPeriod = await db.all(`
                SELECT 
                    strftime('${dateFormat}', created_at) as period,
                    COUNT(*) as orders,
                    SUM(total) as revenue,
                    AVG(total) as avg_ticket
                FROM orders
                WHERE tenant_id = ? AND status != 'CANCELLED' ${dateFilter}
                GROUP BY period
                ORDER BY period DESC
                LIMIT 30
            `, params);

            // Totais
            const totals = await db.get(`
                SELECT 
                    COUNT(*) as total_orders,
                    COALESCE(SUM(total), 0) as total_revenue,
                    COALESCE(AVG(total), 0) as avg_ticket
                FROM orders
                WHERE tenant_id = ? AND status != 'CANCELLED' ${dateFilter}
            `, params);

            // Por forma de pagamento
            const byPayment = await db.all(`
                SELECT 
                    payment_method,
                    COUNT(*) as orders,
                    SUM(total) as revenue
                FROM orders
                WHERE tenant_id = ? AND status != 'CANCELLED' ${dateFilter}
                GROUP BY payment_method
            `, params);

            // Por tipo de entrega
            const byDelivery = await db.all(`
                SELECT 
                    delivery_type,
                    COUNT(*) as orders,
                    SUM(total) as revenue
                FROM orders
                WHERE tenant_id = ? AND status != 'CANCELLED' ${dateFilter}
                GROUP BY delivery_type
            `, params);

            // Horarios de pico
            const byHour = await db.all(`
                SELECT 
                    strftime('%H', created_at) as hour,
                    COUNT(*) as orders
                FROM orders
                WHERE tenant_id = ? AND status != 'CANCELLED' ${dateFilter}
                GROUP BY hour
                ORDER BY hour
            `, params);

            res.json({
                salesByPeriod: salesByPeriod.reverse(),
                totals,
                byPayment,
                byDelivery,
                byHour
            });
        } catch (error) {
            console.error('Sales report error:', error);
            res.status(500).json({ error: 'Erro ao gerar relatorio' });
        }
    });

    // ========================================
    // GET /api/reports/products - Relatorio de produtos
    // ========================================
    router.get('/products', async (req, res) => {
        try {
            const { startDate, endDate } = req.query;

            let dateFilter = '';
            const params = [req.tenantId];

            if (startDate) {
                dateFilter += ' AND date(o.created_at) >= ?';
                params.push(startDate);
            }
            if (endDate) {
                dateFilter += ' AND date(o.created_at) <= ?';
                params.push(endDate);
            }

            // Produtos mais vendidos (parsing JSON items)
            const orders = await db.all(`
                SELECT items FROM orders o
                WHERE o.tenant_id = ? AND o.status != 'CANCELLED' ${dateFilter}
            `, params);

            // Agregar produtos
            const productStats = {};
            for (const order of orders) {
                try {
                    const items = JSON.parse(order.items || '[]');
                    for (const item of items) {
                        const key = item.productId || item.id || item.name;
                        if (!productStats[key]) {
                            productStats[key] = {
                                id: item.productId || item.id,
                                name: item.name || item.title || 'Produto',
                                quantity: 0,
                                revenue: 0
                            };
                        }
                        productStats[key].quantity += item.quantity || item.qty || 1;
                        productStats[key].revenue += item.totalPrice || (item.price * (item.quantity || 1)) || 0;
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }

            // Ordenar por quantidade
            const bestSellers = Object.values(productStats)
                .sort((a, b) => b.quantity - a.quantity)
                .slice(0, 20);

            // Produtos sem vendas
            const allProducts = await db.all(
                'SELECT id, name FROM products WHERE tenant_id = ?',
                [req.tenantId]
            );

            const soldIds = new Set(bestSellers.map(p => p.id));
            const noSales = allProducts.filter(p => !soldIds.has(p.id));

            res.json({
                bestSellers,
                noSales,
                totalProducts: allProducts.length
            });
        } catch (error) {
            console.error('Products report error:', error);
            res.status(500).json({ error: 'Erro ao gerar relatorio' });
        }
    });

    // ========================================
    // GET /api/reports/customers - Relatorio de clientes
    // ========================================
    router.get('/customers', async (req, res) => {
        try {
            const { startDate, endDate } = req.query;

            let dateFilter = '';
            const params = [req.tenantId];

            if (startDate) {
                dateFilter += ' AND date(last_order_at) >= ?';
                params.push(startDate);
            }
            if (endDate) {
                dateFilter += ' AND date(last_order_at) <= ?';
                params.push(endDate);
            }

            // Top clientes
            const topCustomers = await db.all(`
                SELECT 
                    id, name, phone, total_orders, total_spent,
                    ROUND(total_spent / NULLIF(total_orders, 0), 2) as avg_ticket,
                    last_order_at
                FROM customers
                WHERE tenant_id = ? ${dateFilter}
                ORDER BY total_spent DESC
                LIMIT 20
            `, params);

            // Totais
            const totals = await db.get(`
                SELECT 
                    COUNT(*) as total_customers,
                    SUM(total_orders) as total_orders,
                    SUM(total_spent) as total_spent,
                    AVG(total_spent / NULLIF(total_orders, 0)) as avg_ticket
                FROM customers
                WHERE tenant_id = ?
            `, [req.tenantId]);

            // Novos clientes por periodo
            const newCustomers = await db.all(`
                SELECT 
                    strftime('%Y-%m', created_at) as month,
                    COUNT(*) as count
                FROM customers
                WHERE tenant_id = ?
                GROUP BY month
                ORDER BY month DESC
                LIMIT 12
            `, [req.tenantId]);

            // Clientes recorrentes (mais de 1 pedido)
            const recurring = await db.get(`
                SELECT COUNT(*) as count FROM customers
                WHERE tenant_id = ? AND total_orders > 1
            `, [req.tenantId]);

            res.json({
                topCustomers,
                totals,
                newCustomers: newCustomers.reverse(),
                recurringCustomers: recurring.count,
                recurringRate: totals.total_customers > 0
                    ? Math.round((recurring.count / totals.total_customers) * 100)
                    : 0
            });
        } catch (error) {
            console.error('Customers report error:', error);
            res.status(500).json({ error: 'Erro ao gerar relatorio' });
        }
    });

    // ========================================
    // GET /api/reports/summary - Resumo geral
    // ========================================
    router.get('/summary', async (req, res) => {
        try {
            // Usar data local do servidor
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            const yesterday = new Date(now.setDate(now.getDate() - 1)).toISOString().split('T')[0];

            // Hoje
            const todayData = await db.get(`
                SELECT COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue
                FROM orders WHERE tenant_id = ? AND date(created_at) = ? AND status != 'CANCELLED'
            `, [req.tenantId, today]);

            // Ontem
            const yesterdayData = await db.get(`
                SELECT COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue
                FROM orders WHERE tenant_id = ? AND date(created_at) = ? AND status != 'CANCELLED'
            `, [req.tenantId, yesterday]);

            // Este mes
            const thisMonth = await db.get(`
                SELECT COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue
                FROM orders WHERE tenant_id = ? AND created_at >= date('now', 'start of month') AND status != 'CANCELLED'
            `, [req.tenantId]);

            // Mes passado
            const lastMonth = await db.get(`
                SELECT COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue
                FROM orders WHERE tenant_id = ? 
                    AND created_at >= date('now', 'start of month', '-1 month')
                    AND created_at < date('now', 'start of month')
                    AND status != 'CANCELLED'
            `, [req.tenantId]);

            // Total de taxas de entrega do mes (para motoboy)
            const deliveryFees = await db.get(`
                SELECT 
                    COUNT(*) as delivery_count,
                    COALESCE(SUM(delivery_fee), 0) as total_fees
                FROM orders 
                WHERE tenant_id = ? 
                    AND created_at >= date('now', 'start of month') 
                    AND status != 'CANCELLED'
                    AND delivery_type = 'DELIVERY'
            `, [req.tenantId]);

            // Calcular variacao
            const orderChange = yesterdayData.orders > 0
                ? Math.round(((todayData.orders - yesterdayData.orders) / yesterdayData.orders) * 100)
                : 0;
            const revenueChange = yesterdayData.revenue > 0
                ? Math.round(((todayData.revenue - yesterdayData.revenue) / yesterdayData.revenue) * 100)
                : 0;
            const monthChange = lastMonth.revenue > 0
                ? Math.round(((thisMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100)
                : 0;

            res.json({
                today: { ...todayData, orderChange, revenueChange },
                yesterday: yesterdayData,
                thisMonth: { ...thisMonth, monthChange },
                lastMonth,
                deliveryFees: {
                    total: deliveryFees.total_fees || 0,
                    count: deliveryFees.delivery_count || 0
                }
            });
        } catch (error) {
            console.error('Summary report error:', error);
            res.status(500).json({ error: 'Erro ao gerar resumo' });
        }
    });

    // ========================================
    // GET /api/reports/follow-up - Relatorio de Follow-up
    // ========================================
    router.get('/follow-up', async (req, res) => {
        try {
            const { getFollowUpService } = await import('../services/follow-up.js');
            const followUpService = getFollowUpService(db);
            const stats = await followUpService.getFollowUpStats(req.tenantId);
            res.json(stats);
        } catch (error) {
            console.error('Follow-up report error:', error);
            res.status(500).json({ error: 'Erro ao gerar relatorio' });
        }
    });

    return router;
}
