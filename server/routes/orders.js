// ============================================================
// Rotas de Pedidos
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';
import { tenantMiddleware, tenantResolver, checkLimits } from '../middleware/tenant.js';
import { getWhatsAppService } from '../whatsapp-service.js';
import { verifyOrderToken } from '../services/whatsapp-bot.js';

export default function (db, broadcast) {
    const router = Router();
    const whatsappService = getWhatsAppService(db);

    // ========================================
    // GET /api/orders/customer/:phone - Buscar ultimo endereco do cliente
    // ========================================
    router.get('/customer/:phone', async (req, res) => {
        try {
            const { phone } = req.params;
            const { tenantId } = req.query;

            if (!tenantId) {
                return res.status(400).json({ error: 'Tenant ID obrigatorio' });
            }

            const customer = await db.get(
                'SELECT * FROM customers WHERE tenant_id = ? AND phone = ?',
                [tenantId, phone.replace(/\D/g, '')]
            );

            if (!customer) {
                return res.json({ exists: false });
            }

            // Buscar ultimo pedido com endereco
            const lastOrder = await db.get(`
                SELECT address, customer_name FROM orders 
                WHERE tenant_id = ? AND customer_phone = ? AND address IS NOT NULL
                ORDER BY created_at DESC LIMIT 1
            `, [tenantId, phone.replace(/\D/g, '')]);

            res.json({
                exists: true,
                customer: {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    lastAddress: lastOrder?.address ? JSON.parse(lastOrder.address) : null
                }
            });
        } catch (error) {
            console.error('Get customer error:', error);
            res.status(500).json({ error: 'Erro ao buscar cliente' });
        }
    });

    // ========================================
    // POST /api/orders - Criar pedido (publico)
    // ========================================
    router.post('/', async (req, res) => {
        try {
            const {
                tenantId, customerName, customerPhone, items,
                deliveryType, address, paymentMethod, observation,
                deliveryFee: clientDeliveryFee, // Taxa de entrega calculada pelo front-end
                orderToken // Token JWT do WhatsApp
            } = req.body;

            // Verificar tenant primeiro
            const tenant = await db.get('SELECT * FROM tenants WHERE id = ? AND status = ?', [tenantId, 'ACTIVE']);
            if (!tenant) {
                return res.status(404).json({ error: 'Loja nao encontrada' });
            }

            const tenantSettings = JSON.parse(tenant.settings || '{}');

            // ========================================
            // Validacao de Token WhatsApp (se habilitado)
            // ========================================
            let phoneFromToken = null;
            if (tenantSettings.requireWhatsAppToken) {
                if (!orderToken) {
                    return res.status(403).json({
                        error: 'Acesso nao autorizado',
                        message: 'Use o link enviado pelo WhatsApp para fazer seu pedido.'
                    });
                }

                const jwtSecret = tenantSettings.jwtSecret || process.env.JWT_SECRET;
                const decoded = verifyOrderToken(orderToken, jwtSecret);

                if (!decoded || decoded.tenantId !== tenantId) {
                    return res.status(403).json({
                        error: 'Token invalido ou expirado',
                        message: 'Solicite um novo link pelo WhatsApp.'
                    });
                }

                phoneFromToken = decoded.phone;
            }

            // Usar telefone do token se disponivel
            const finalPhone = phoneFromToken || customerPhone;

            // Validacoes
            if (!customerName || !finalPhone || !items || items.length === 0) {
                return res.status(400).json({ error: 'Dados incompletos' });
            }

            // Verificar blacklist
            const blacklisted = await db.get(
                'SELECT * FROM blacklist WHERE tenant_id = ? AND phone = ?',
                [tenantId, finalPhone]
            );

            // Calcular totais
            let subtotal = 0;
            const itemsWithDetails = [];

            for (const item of items) {
                const product = await db.get('SELECT * FROM products WHERE id = ?', [item.productId]);
                if (product) {
                    const itemTotal = product.price * item.quantity;
                    subtotal += itemTotal;

                    // Calcular adicionais
                    let addonsTotal = 0;
                    if (item.addons && Array.isArray(item.addons)) {
                        for (const addon of item.addons) {
                            addonsTotal += addon.price || 0;
                        }
                    }
                    subtotal += addonsTotal * item.quantity;

                    itemsWithDetails.push({
                        productId: product.id,
                        name: product.name,
                        price: product.price,
                        quantity: item.quantity,
                        addons: item.addons || [],
                        total: itemTotal + (addonsTotal * item.quantity)
                    });
                }
            }

            // Taxa de entrega - priorizar valor do front-end (zonas) ou usar fixo das settings
            let deliveryFee = 0;
            if (deliveryType === 'DELIVERY') {
                // Usar taxa calculada pelo front-end (baseada em zonas) se disponível
                if (clientDeliveryFee !== undefined && clientDeliveryFee !== null) {
                    deliveryFee = parseFloat(clientDeliveryFee) || 0;
                } else {
                    // Fallback para taxa fixa das settings
                    const settings = JSON.parse(tenant.settings || '{}');
                    deliveryFee = settings.deliveryFee || 0;
                }
            }

            const total = subtotal + deliveryFee;

            // Obter proximo numero de pedido
            const lastOrder = await db.get(
                'SELECT MAX(order_number) as max FROM orders WHERE tenant_id = ?',
                [tenantId]
            );
            const orderNumber = (lastOrder?.max || 0) + 1;

            // Criar/atualizar cliente
            let customerId = null;
            const existingCustomer = await db.get(
                'SELECT id FROM customers WHERE tenant_id = ? AND phone = ?',
                [tenantId, customerPhone]
            );

            if (existingCustomer) {
                customerId = existingCustomer.id;
                await db.run(`
                    UPDATE customers SET 
                        name = ?, total_orders = total_orders + 1, 
                        total_spent = total_spent + ?, last_order_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [customerName, total, customerId]);
            } else {
                customerId = uuidv4();
                await db.run(`
                    INSERT INTO customers (id, tenant_id, name, phone, total_orders, total_spent, last_order_at)
                    VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
                `, [customerId, tenantId, customerName, customerPhone, total]);
            }

            // Criar pedido
            const orderId = uuidv4();
            await db.run(`
                INSERT INTO orders (
                    id, tenant_id, customer_id, order_number, customer_name, customer_phone,
                    items, subtotal, delivery_fee, total, delivery_type, address,
                    status, observation, payment_method, payment_change
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
            `, [
                orderId, tenantId, customerId, orderNumber, customerName, customerPhone,
                JSON.stringify(itemsWithDetails), subtotal, deliveryFee, total,
                deliveryType || 'DELIVERY', address ? JSON.stringify(address) : null,
                observation || null, (paymentMethod === 'LOCAL' ? 'CASH' : paymentMethod) || null, req.body.payment_change || 0
            ]);

            // Buscar pedido criado
            const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
            order.items = JSON.parse(order.items || '[]');
            order.address = order.address ? JSON.parse(order.address) : null;
            order.isBlacklisted = !!blacklisted;

            // Broadcast via SSE
            if (broadcast) {
                broadcast(tenantId, 'new-order', order);
            }

            // Enviar confirmacao via WhatsApp (se cliente veio do bot)
            const { whatsappId } = req.body;
            if (whatsappId) {
                try {
                    // Enviar confirmacao para o cliente
                    await whatsappService.sendOrderConfirmation(tenantId, whatsappId, {
                        order_number: orderNumber,
                        items: itemsWithDetails,
                        delivery_fee: deliveryFee,
                        total,
                        customer_name: customerName,
                        customer_phone: customerPhone,
                        address,
                        payment_method: paymentMethod
                    });
                    console.log(`Confirmacao WhatsApp enviada para ${whatsappId}`);
                } catch (err) {
                    console.error('Erro ao enviar confirmacao WhatsApp:', err.message);
                }
            }

            // Enviar para grupo de entregas
            try {
                await whatsappService.sendOrderToGroup(tenantId, {
                    order_number: orderNumber,
                    items: itemsWithDetails,
                    total,
                    delivery_fee: deliveryFee,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    address: address || null, // Objeto completo com lat, lng, street, number, etc.
                    payment_method: paymentMethod,
                    change_for: req.body.payment_change || null,
                    observation: observation || null
                });
            } catch (err) {
                console.error('Erro ao enviar para grupo WhatsApp:', err.message);
            }

            res.status(201).json({
                success: true,
                order: {
                    id: orderId,
                    orderNumber,
                    total
                }
            });
        } catch (error) {
            console.error('Create order error:', error);
            res.status(500).json({ error: 'Erro ao criar pedido' });
        }
    });

    // ========================================
    // GET /api/orders/tenant/:tenantId - Pedidos por tenant (publico para quadro)
    // ========================================
    router.get('/tenant/:tenantId', async (req, res) => {
        try {
            const { tenantId } = req.params;
            const { status, date, limit } = req.query;

            // Verificar tenant
            const tenant = await db.get('SELECT id FROM tenants WHERE id = ?', [tenantId]);
            if (!tenant) {
                return res.status(404).json({ error: 'Tenant nao encontrado' });
            }

            let query = 'SELECT * FROM orders WHERE tenant_id = ?';
            const params = [tenantId];

            if (status) {
                query += ' AND status = ?';
                params.push(status);
            }

            if (date === 'today') {
                // Usar data local do servidor ao inves de UTC do SQLite
                const today = new Date().toISOString().split('T')[0];
                query += ' AND date(created_at) = ?';
                params.push(today);
            } else if (date) {
                query += ' AND date(created_at) = ?';
                params.push(date);
            }

            query += ' ORDER BY created_at DESC';

            if (limit) {
                query += ' LIMIT ?';
                params.push(parseInt(limit));
            }

            const orders = await db.all(query, params);

            // Parse JSON e verificar blacklist
            for (const order of orders) {
                order.items = JSON.parse(order.items || '[]');
                order.address = order.address ? JSON.parse(order.address) : null;

                const blacklisted = await db.get(
                    'SELECT id FROM blacklist WHERE tenant_id = ? AND phone = ?',
                    [tenantId, order.customer_phone]
                );
                order.isBlacklisted = !!blacklisted;
            }

            res.json(orders);
        } catch (error) {
            console.error('Get orders by tenant error:', error);
            res.status(500).json({ error: 'Erro ao buscar pedidos' });
        }
    });

    // ========================================
    // GET /api/orders - Listar pedidos do tenant
    // ========================================
    router.get('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { status, date, limit } = req.query;

            let query = 'SELECT * FROM orders WHERE tenant_id = ?';
            const params = [req.tenantId];

            if (status) {
                query += ' AND status = ?';
                params.push(status);
            }

            if (date === 'today') {
                // Usar data local do servidor ao inves de UTC do SQLite
                const today = new Date().toISOString().split('T')[0];
                query += ' AND date(created_at) = ?';
                params.push(today);
            } else if (date) {
                query += ' AND date(created_at) = ?';
                params.push(date);
            }

            query += ' ORDER BY created_at DESC';

            if (limit) {
                query += ' LIMIT ?';
                params.push(parseInt(limit));
            }

            console.log(`[Orders API] tenant: ${req.tenantId}, date: ${date}, query params:`, params);

            const orders = await db.all(query, params);
            console.log(`[Orders API] Encontrados ${orders.length} pedidos`);

            // Parse JSON e verificar blacklist
            for (const order of orders) {
                order.items = JSON.parse(order.items || '[]');
                order.address = order.address ? JSON.parse(order.address) : null;

                const blacklisted = await db.get(
                    'SELECT id FROM blacklist WHERE tenant_id = ? AND phone = ?',
                    [req.tenantId, order.customer_phone]
                );
                order.isBlacklisted = !!blacklisted;
            }

            res.json(orders);
        } catch (error) {
            console.error('Get orders error:', error);
            res.status(500).json({ error: 'Erro ao buscar pedidos' });
        }
    });

    // ========================================
    // PUT /api/orders/:id/status - Atualizar status (publico para quadro)
    // ========================================
    router.put('/:id/status', async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;

            const validStatuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: 'Status invalido' });
            }

            const order = await db.get('SELECT * FROM orders WHERE id = ?', [id]);

            if (!order) {
                return res.status(404).json({ error: 'Pedido nao encontrado' });
            }

            await db.run(
                'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [status, id]
            );

            // Broadcast via SSE
            if (broadcast) {
                broadcast(order.tenant_id, 'order-updated', { id, status });
            }

            res.json({ success: true, status });
        } catch (error) {
            console.error('Update order status error:', error);
            res.status(500).json({ error: 'Erro ao atualizar status' });
        }
    });

    // ========================================
    // GET /api/orders/:id - Detalhes do pedido
    // ========================================
    router.get('/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const order = await db.get(
                'SELECT * FROM orders WHERE id = ? AND tenant_id = ?',
                [req.params.id, req.tenantId]
            );

            if (!order) {
                return res.status(404).json({ error: 'Pedido nao encontrado' });
            }

            order.items = JSON.parse(order.items || '[]');
            order.address = order.address ? JSON.parse(order.address) : null;

            // Blacklist check
            const blacklisted = await db.get(
                'SELECT * FROM blacklist WHERE tenant_id = ? AND phone = ?',
                [req.tenantId, order.customer_phone]
            );
            order.isBlacklisted = !!blacklisted;
            order.blacklistReason = blacklisted?.reason;

            res.json(order);
        } catch (error) {
            console.error('Get order error:', error);
            res.status(500).json({ error: 'Erro ao buscar pedido' });
        }
    });

    // ========================================
    // PUT /api/orders/:id - Atualizar pedido completo
    // ========================================
    router.put('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const {
                customer_name, customer_phone, items,
                delivery_type, address, payment_method,
                observation, payment_change, subtotal,
                delivery_fee, total
            } = req.body;

            const order = await db.get('SELECT * FROM orders WHERE id = ?', [id]);
            if (!order) {
                return res.status(404).json({ error: 'Pedido nao encontrado' });
            }

            await db.run(`
                UPDATE orders SET 
                    customer_name = ?, customer_phone = ?, items = ?,
                    delivery_type = ?, address = ?, payment_method = ?,
                    observation = ?, payment_change = ?, subtotal = ?,
                    delivery_fee = ?, total = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                customer_name, customer_phone, JSON.stringify(items),
                delivery_type, typeof address === 'string' ? address : JSON.stringify(address),
                payment_method, observation, payment_change, subtotal,
                delivery_fee, total, id
            ]);

            // Broadcast via SSE para atualizar o quadro
            if (broadcast) {
                broadcast(order.tenant_id, 'order-updated', { id, updated: true });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Update order error:', error);
            res.status(500).json({ error: 'Erro ao atualizar pedido' });
        }
    });

    // ========================================
    // DELETE /api/orders/:id - Apagar pedido
    // ========================================
    router.delete('/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { id } = req.params;

            // Verificar se o pedido existe e pertence ao tenant
            const order = await db.get('SELECT * FROM orders WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
            if (!order) {
                return res.status(404).json({ error: 'Pedido nao encontrado' });
            }

            // Deletar o pedido
            await db.run('DELETE FROM orders WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);

            console.log(`Pedido #${order.order_number} deletado pelo tenant ${req.tenantId}`);

            // Broadcast via SSE para atualizar o quadro
            if (broadcast) {
                broadcast(req.tenantId, 'order-deleted', { id });
            }

            res.json({ success: true, message: `Pedido #${order.order_number} apagado` });
        } catch (error) {
            console.error('Delete order error:', error);
            res.status(500).json({ error: 'Erro ao apagar pedido' });
        }
    });

    return router;
}
