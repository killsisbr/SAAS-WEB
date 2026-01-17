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

    // Função auxiliar para obter serviço de forma segura
    const getService = () => {
        const service = getWhatsAppService();
        if (!service) {
            throw new Error('WhatsApp service nao inicializado');
        }
        return service;
    };

    // ========================================
    // GET /api/orders/lid-mapping/:lid - Buscar telefone pelo LID
    // ========================================
    router.get('/lid-mapping/:lid', async (req, res) => {
        try {
            const { lid } = req.params;
            const { tenantId } = req.query;

            if (!tenantId) {
                return res.status(400).json({ error: 'Tenant ID obrigatorio' });
            }

            const mapping = await db.get(
                'SELECT phone FROM lid_phone_mappings WHERE tenant_id = ? AND lid = ?',
                [tenantId, lid]
            );

            if (mapping) {
                console.log(`[LidMapping API] Encontrado: ${lid} -> ${mapping.phone}`);
                return res.json({ exists: true, phone: mapping.phone });
            }

            res.json({ exists: false });
        } catch (error) {
            console.error('Get LID mapping error:', error);
            res.status(500).json({ error: 'Erro ao buscar mapeamento' });
        }
    });

    // ========================================
    // POST /api/orders/lid-mapping - Salvar mapeamento LID -> Telefone
    // ========================================
    router.post('/lid-mapping', async (req, res) => {
        try {
            const { lid, phone, tenantId } = req.body;

            if (!lid || !phone || !tenantId) {
                return res.status(400).json({ error: 'Dados incompletos (lid, phone, tenantId)' });
            }

            // Limpar telefone
            const cleanPhone = phone.replace(/\D/g, '');

            const id = `lid_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            await db.run(
                `INSERT INTO lid_phone_mappings (id, lid, phone, tenant_id) 
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(lid, tenant_id) DO UPDATE SET phone = ?, updated_at = CURRENT_TIMESTAMP`,
                [id, lid, cleanPhone, tenantId, cleanPhone]
            );

            console.log(`[LidMapping API] Salvo: ${lid} -> ${cleanPhone} (tenant: ${tenantId})`);
            res.json({ success: true });
        } catch (error) {
            console.error('Save LID mapping error:', error);
            res.status(500).json({ error: 'Erro ao salvar mapeamento' });
        }
    });

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
                orderToken, // Token JWT do WhatsApp
                whatsappId // ID do WhatsApp (pode ser PID)
            } = req.body;

            // DEBUG: Log dos dados recebidos
            console.log(`[Orders] Recebido: customerPhone=${customerPhone}, whatsappId=${whatsappId}`);

            // Verificar tenant primeiro
            const tenant = await db.get('SELECT * FROM tenants WHERE id = ? AND status = ?', [tenantId, 'ACTIVE']);
            if (!tenant) {
                return res.status(404).json({ error: 'Loja nao encontrada' });
            }

            const tenantSettings = JSON.parse(tenant.settings || '{}');

            // ========================================
            // Validação de Token WhatsApp (se habilitado)
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

            // ========================================
            // Validar se customerPhone é um telefone válido ou PID
            // Telefone BR: 10-13 dígitos / PID: 15+ dígitos
            // ========================================
            let validPhone = customerPhone;
            if (customerPhone) {
                const cleanPhone = customerPhone.replace(/\D/g, '');
                const isValidBrazilianPhone = cleanPhone.length >= 10 && cleanPhone.length <= 13;
                if (!isValidBrazilianPhone) {
                    console.log(`[Orders] customerPhone parece ser PID (${cleanPhone.length} dígitos), ignorando como telefone`);
                    validPhone = null; // Não é um telefone válido, é um PID
                }
            }

            // Usar telefone do token se disponível, senão telefone validado
            const finalPhone = phoneFromToken || validPhone;

            // Validações - permitir pedido mesmo sem telefone se tiver whatsappId
            if (!customerName || !items || items.length === 0) {
                return res.status(400).json({ error: 'Dados incompletos' });
            }
            if (!finalPhone && !whatsappId) {
                return res.status(400).json({ error: 'Telefone ou WhatsApp ID é obrigatório' });
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

            // ========================================
            // RESPOSTA IMEDIATA - Não bloquear o cliente
            // ========================================
            res.status(201).json({
                success: true,
                order: {
                    id: orderId,
                    orderNumber,
                    total
                }
            });

            // ========================================
            // ENVIOS ASSÍNCRONOS (fire-and-forget)
            // São executados após a resposta ao cliente
            // ========================================

            // Enviar confirmação via WhatsApp para o cliente
            // ESTRATÉGIA: Sempre formatar corretamente para @s.whatsapp.net
            let confirmationTarget = null;

            if (whatsappId) {
                // Extrair número do whatsappId (remover @c.us, @s.whatsapp.net, etc)
                let phone = whatsappId.replace(/@.*$/, '').replace(/\D/g, '');

                // Verificar se é PID (15+ dígitos) ou telefone (10-13 dígitos)
                if (phone.length >= 15) {
                    // É um PID - passar para o service que vai buscar o mapeamento
                    confirmationTarget = phone + '@s.whatsapp.net';
                    console.log(`[Confirmacao] Usando PID: ${confirmationTarget}`);
                } else {
                    // É um telefone - adicionar código do país se necessário
                    if (!phone.startsWith('55') && phone.length >= 10 && phone.length <= 11) {
                        phone = '55' + phone;
                    }
                    confirmationTarget = phone + '@s.whatsapp.net';
                    console.log(`[Confirmacao] Usando telefone formatado: ${confirmationTarget}`);
                }
            } else if (validPhone) {
                // Cliente não veio do bot - usar telefone digitado (já validado)
                let cleanPhone = validPhone.replace(/\D/g, '');
                if (!cleanPhone.startsWith('55') && cleanPhone.length >= 10 && cleanPhone.length <= 11) {
                    cleanPhone = '55' + cleanPhone;
                }
                confirmationTarget = cleanPhone + '@s.whatsapp.net';
                console.log(`[Confirmacao] Usando telefone do checkout: ${confirmationTarget}`);
            }

            if (confirmationTarget) {
                getService().sendOrderConfirmation(tenantId, confirmationTarget, {
                    order_number: orderNumber,
                    items: itemsWithDetails,
                    delivery_fee: deliveryFee,
                    total,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    address,
                    payment_method: paymentMethod
                }).then(() => {
                    console.log(`[Confirmacao] ✅ WhatsApp enviado para ${confirmationTarget}`);
                }).catch(err => {
                    console.error('[Confirmacao] Erro:', err.message);
                });
            } else {
                console.log(`[Confirmacao] ⚠️ Sem destino para enviar confirmação`);
            }

            // Enviar para grupo de entregas
            getService().sendOrderToGroup(tenantId, {
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
            }).then(() => {
                console.log(`[Grupo] ✅ Pedido #${orderNumber} enviado para grupo`);
            }).catch(err => {
                console.error('Erro ao enviar para grupo WhatsApp:', err.message);
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
