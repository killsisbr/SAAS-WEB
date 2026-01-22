// ============================================================
// Direct Order Module - Customer Service
// Cache de informações de clientes
// ============================================================

/**
 * Cache de clientes em memória
 * Chave: `${tenantId}:${customerId}`
 */
const customers = new Map();

/**
 * Obter informações do cliente
 * @param {object} db - Conexão com banco de dados
 * @param {string} tenantId - ID do tenant
 * @param {string} customerId - ID do cliente (número WhatsApp)
 * @returns {object|null} Dados do cliente ou null
 */
export async function getCustomer(db, tenantId, customerId) {
    const key = `${tenantId}:${customerId}`;

    // Verificar cache primeiro
    if (customers.has(key)) {
        return customers.get(key);
    }

    // Buscar no banco de dados
    try {
        const customer = await db.get(`
            SELECT * FROM customers 
            WHERE tenant_id = ? AND phone = ?
            ORDER BY created_at DESC
            LIMIT 1
        `, [tenantId, customerId]);

        if (customer) {
            customers.set(key, customer);
            return customer;
        }
    } catch (err) {
        console.error('[CustomerService] Erro ao buscar cliente:', err.message);
    }

    return null;
}

/**
 * Salvar/atualizar informações do cliente
 * @param {object} db - Conexão com banco de dados
 * @param {string} tenantId - ID do tenant
 * @param {string} customerId - ID do cliente
 * @param {object} data - Dados para salvar
 */
export async function saveCustomer(db, tenantId, customerId, data) {
    const key = `${tenantId}:${customerId}`;

    try {
        // Verificar se cliente existe
        const existing = await db.get(`
            SELECT id FROM customers 
            WHERE tenant_id = ? AND phone = ?
        `, [tenantId, customerId]);

        if (existing) {
            // Atualizar
            const updates = [];
            const values = [];

            if (data.name) {
                updates.push('name = ?');
                values.push(data.name);
            }
            if (data.address) {
                updates.push('address = ?');
                values.push(data.address);
            }
            if (data.phone) {
                updates.push('phone = ?');
                values.push(data.phone);
            }

            if (updates.length > 0) {
                values.push(existing.id);

                await db.run(`
                    UPDATE customers SET ${updates.join(', ')} WHERE id = ?
                `, values);
            }
        } else {
            // Inserir novo
            const { v4: uuidv4 } = await import('uuid');
            await db.run(`
                INSERT INTO customers (id, tenant_id, phone, name, address, created_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
            `, [
                uuidv4(),
                tenantId,
                data.phone || customerId,
                data.name || 'Cliente WhatsApp',
                data.address || null
            ]);
        }

        // Atualizar cache
        const customer = await db.get(`
            SELECT * FROM customers 
            WHERE tenant_id = ? AND phone = ?
        `, [tenantId, customerId]);

        if (customer) {
            customers.set(key, customer);
        }

        return customer;
    } catch (err) {
        console.error('[CustomerService] Erro ao salvar cliente:', err.message);
        return null;
    }
}

/**
 * Atualizar endereço do cliente
 */
export async function updateAddress(db, tenantId, customerId, address) {
    return saveCustomer(db, tenantId, customerId, { address });
}

/**
 * Atualizar nome do cliente
 */
export async function updateName(db, tenantId, customerId, name) {
    return saveCustomer(db, tenantId, customerId, { name });
}

/**
 * Limpar cache de um cliente específico
 */
export function clearCache(tenantId, customerId) {
    const key = `${tenantId}:${customerId}`;
    customers.delete(key);
}

/**
 * Limpar todo o cache
 */
export function clearAllCache() {
    customers.clear();
}

export default {
    getCustomer,
    saveCustomer,
    updateAddress,
    updateName,
    clearCache,
    clearAllCache
};
