// ============================================================
// Customer Service - Gerenciamento de dados de clientes
// Permite ao agente lembrar nome, endereço e histórico
// ============================================================

/**
 * Buscar ou criar cliente pelo telefone
 */
export async function getOrCreateCustomer(db, tenantId, phone, name = null) {
    try {
        // Buscar cliente existente
        let customer = await db.get(
            'SELECT * FROM customers WHERE tenant_id = ? AND phone = ?',
            [tenantId, phone]
        );

        if (customer) {
            // Parse do endereço se for JSON
            if (customer.address && typeof customer.address === 'string') {
                try {
                    customer.address = JSON.parse(customer.address);
                } catch (e) {
                    // Manter como string se não for JSON válido
                }
            }

            // Atualizar nome se fornecido e cliente não tiver nome ou tiver nome genérico
            const isGenericName = !customer.name || ['Cliente', 'Cliente WhatsApp', 'Usuário'].includes(customer.name);
            if (name && !['Cliente', 'Cliente WhatsApp', 'Usuário'].includes(name) && isGenericName) {
                await db.run(
                    'UPDATE customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [name, customer.id]
                );
                customer.name = name;
            }

            return customer;
        }

        // Criar novo cliente
        const { v4: uuidv4 } = await import('uuid');
        const customerId = uuidv4();

        const finalName = (name && !['Cliente', 'Cliente WhatsApp', 'Usuário'].includes(name)) ? name : 'Cliente';

        await db.run(
            `INSERT INTO customers (id, tenant_id, name, phone, created_at) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [customerId, tenantId, finalName, phone]
        );

        return {
            id: customerId,
            tenant_id: tenantId,
            name: finalName,
            phone,
            address: null,
            total_orders: 0,
            total_spent: 0,
            last_order_at: null,
            isNew: true
        };

    } catch (err) {
        console.error('[CustomerService] Erro ao buscar/criar cliente:', err.message);
        return null;
    }
}

/**
 * Atualizar endereço do cliente
 */
export async function updateCustomerAddress(db, customerId, address) {
    try {
        const addressJson = typeof address === 'string' ? address : JSON.stringify(address);

        await db.run(
            'UPDATE customers SET address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [addressJson, customerId]
        );

        return true;
    } catch (err) {
        console.error('[CustomerService] Erro ao atualizar endereço:', err.message);
        return false;
    }
}

/**
 * Atualizar nome do cliente
 */
export async function updateCustomerName(db, customerId, name) {
    try {
        await db.run(
            'UPDATE customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [name, customerId]
        );

        return true;
    } catch (err) {
        console.error('[CustomerService] Erro ao atualizar nome:', err.message);
        return false;
    }
}

/**
 * Buscar último pedido do cliente
 */
export async function getLastOrder(db, customerId) {
    try {
        const order = await db.get(
            `SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1`,
            [customerId]
        );

        if (order && order.address) {
            try {
                order.address = JSON.parse(order.address);
            } catch (e) { }
        }

        if (order && order.items) {
            try {
                order.items = JSON.parse(order.items);
            } catch (e) { }
        }

        return order;
    } catch (err) {
        console.error('[CustomerService] Erro ao buscar último pedido:', err.message);
        return null;
    }
}

/**
 * Incrementar estatísticas do cliente após pedido
 */
export async function incrementOrderStats(db, customerId, orderTotal) {
    try {
        await db.run(
            `UPDATE customers SET 
                total_orders = total_orders + 1,
                total_spent = total_spent + ?,
                last_order_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [orderTotal, customerId]
        );

        return true;
    } catch (err) {
        console.error('[CustomerService] Erro ao atualizar estatísticas:', err.message);
        return false;
    }
}

/**
 * Obter contexto do cliente para a IA
 */
export function getCustomerContext(customer, lastOrder) {
    const isGeneric = !customer?.name || ['Cliente', 'Cliente WhatsApp', 'Usuário'].includes(customer.name);
    return {
        isReturningCustomer: customer && customer.total_orders > 0,
        isVIP: customer && customer.total_orders >= 10,
        totalOrders: customer?.total_orders || 0,
        totalSpent: customer?.total_spent || 0,
        storedName: !isGeneric ? customer.name : null,
        lastAddress: lastOrder?.address || customer?.address || null,
        lastOrderItems: lastOrder?.items || null
    };
}
