// ============================================================
// Servico de Follow-up Completo
// - Clientes inativos
// - Carrinhos abandonados
// - Pos-pedido (feedback)
// Autor: killsis (Lucas Larocca)
// ============================================================

import { getWhatsAppService } from '../whatsapp-service.js';

/**
 * Tipos de Follow-up disponiveis
 */
export const FOLLOW_UP_TYPES = {
    INACTIVE_CUSTOMER: 'INACTIVE_CUSTOMER',      // Cliente nao pede ha tempo
    CART_ABANDONED: 'CART_ABANDONED',            // Iniciou conversa mas nao fez pedido
    POST_ORDER_FEEDBACK: 'POST_ORDER_FEEDBACK',  // Pedir feedback apos entrega
    PROMOTIONAL: 'PROMOTIONAL'                    // Promocoes especiais
};

/**
 * Classe principal do sistema de Follow-up
 */
class FollowUpService {
    constructor(db) {
        this.db = db;
        this.whatsappService = null;
        this.schedulerInterval = null;
    }

    /**
     * Inicializar servico
     */
    init() {
        this.whatsappService = getWhatsAppService(this.db);
        this.startScheduler();
        console.log('[Follow-up] Servico iniciado');
    }

    /**
     * Iniciar agendador de follow-ups
     */
    startScheduler() {
        // Executar a cada hora
        this.schedulerInterval = setInterval(async () => {
            await this.processAllFollowUps();
        }, 60 * 60 * 1000);

        // Executar primeira vez apos 30 segundos
        setTimeout(() => this.processAllFollowUps(), 30000);

        console.log('[Follow-up] Agendador iniciado (intervalo: 1h)');
    }

    /**
     * Processar todos os tipos de follow-up
     */
    async processAllFollowUps() {
        // ============ DESABILITADO TEMPORARIAMENTE ============
        console.log('[Follow-up] DESABILITADO TEMPORARIAMENTE - Remover este return para reativar');
        return;
        // ========================================================

        console.log('[Follow-up] Processando follow-ups...');

        try {
            const tenants = await this.db.all(`
                SELECT t.id, t.name, t.slug, t.settings 
                FROM tenants t 
                WHERE t.status = 'ACTIVE'
            `);

            for (const tenant of tenants) {
                const settings = JSON.parse(tenant.settings || '{}');

                // Verificar se follow-up esta habilitado
                if (settings.followUpEnabled === false) continue;

                // Processar cada tipo
                await this.processInactiveCustomers(tenant.id);
                await this.processCartAbandonment(tenant.id);
                await this.processPostOrderFeedback(tenant.id);
            }

            console.log('[Follow-up] Processamento concluido');
        } catch (error) {
            console.error('[Follow-up] Erro:', error.message);
        }
    }

    // ========================================
    // CLIENTES INATIVOS
    // ========================================
    async processInactiveCustomers(tenantId) {
        try {
            const client = this.whatsappService.clients.get(tenantId);
            if (!client) return;

            const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            const settings = JSON.parse(tenant?.settings || '{}');
            const daysInactive = settings.followUpDaysInactive || 7;

            // Buscar clientes inativos
            const customers = await this.db.all(`
                SELECT c.id, c.name, c.phone, 
                       MAX(o.created_at) as last_order,
                       julianday('now') - julianday(MAX(o.created_at)) as days_inactive
                FROM customers c
                JOIN orders o ON c.id = o.customer_id
                WHERE c.tenant_id = ?
                  AND c.phone IS NOT NULL
                GROUP BY c.id
                HAVING days_inactive >= ? AND days_inactive < 60
                LIMIT 20
            `, [tenantId, daysInactive]);

            for (const customer of customers) {
                // Verificar se ja enviou recentemente
                if (await this.wasFollowUpSentRecently(tenantId, customer.phone, FOLLOW_UP_TYPES.INACTIVE_CUSTOMER)) {
                    continue;
                }

                const message = this.buildInactiveMessage(customer, tenant);
                await this.sendFollowUp(tenantId, customer.phone, message, FOLLOW_UP_TYPES.INACTIVE_CUSTOMER);
            }
        } catch (error) {
            console.error(`[Follow-up] Erro clientes inativos:`, error.message);
        }
    }

    // ========================================
    // CARRINHOS ABANDONADOS (sessoes inativas)
    // ========================================
    async processCartAbandonment(tenantId) {
        try {
            const client = this.whatsappService.clients.get(tenantId);
            if (!client) return;

            const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);

            // Buscar sessoes abandonadas (iniciaram conversa mas nao finalizaram)
            // Nota: Isso depende de ter uma tabela de sessoes/conversas persistidas
            // Por enquanto, vamos usar um fallback para clientes que mandaram msg mas nao pediram

            const abandoned = await this.db.all(`
                SELECT DISTINCT al.details
                FROM activity_logs al
                WHERE al.tenant_id = ?
                  AND al.action = 'WHATSAPP_MESSAGE_RECEIVED'
                  AND al.created_at > datetime('now', '-2 days')
                  AND al.created_at < datetime('now', '-30 minutes')
                  AND NOT EXISTS (
                    SELECT 1 FROM orders o 
                    WHERE o.tenant_id = al.tenant_id
                      AND o.created_at > al.created_at
                      AND json_extract(al.details, '$.phone') = o.customer_phone
                  )
                LIMIT 10
            `, [tenantId]);

            for (const item of abandoned) {
                try {
                    const details = JSON.parse(item.details || '{}');
                    const phone = details.phone;
                    if (!phone) continue;

                    if (await this.wasFollowUpSentRecently(tenantId, phone, FOLLOW_UP_TYPES.CART_ABANDONED, 24)) {
                        continue;
                    }

                    const message = `Oi! Vi que voce estava olhando nosso cardapio mas nao finalizou o pedido.\n\n` +
                        `Posso te ajudar com algo? Se tiver alguma duvida, e so perguntar!\n\n` +
                        `${tenant?.name || 'Restaurante'}`;

                    await this.sendFollowUp(tenantId, phone, message, FOLLOW_UP_TYPES.CART_ABANDONED);
                } catch (e) { /* ignore parse errors */ }
            }
        } catch (error) {
            console.error(`[Follow-up] Erro carrinhos abandonados:`, error.message);
        }
    }

    // ========================================
    // POS-PEDIDO (FEEDBACK)
    // ========================================
    async processPostOrderFeedback(tenantId) {
        try {
            const client = this.whatsappService.clients.get(tenantId);
            if (!client) return;

            const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);

            // Buscar pedidos entregues ha 2-4 horas
            const orders = await this.db.all(`
                SELECT o.id, o.order_number, o.customer_name, o.customer_phone
                FROM orders o
                WHERE o.tenant_id = ?
                  AND o.status = 'DELIVERED'
                  AND o.updated_at > datetime('now', '-4 hours')
                  AND o.updated_at < datetime('now', '-2 hours')
                LIMIT 10
            `, [tenantId]);

            for (const order of orders) {
                if (!order.customer_phone) continue;

                if (await this.wasFollowUpSentRecently(tenantId, order.customer_phone, FOLLOW_UP_TYPES.POST_ORDER_FEEDBACK, 48)) {
                    continue;
                }

                const message = `Ola ${order.customer_name || ''}! Seu pedido #${order.order_number} foi entregue.\n\n` +
                    `Como foi sua experiencia? Ficamos felizes em saber sua opiniao!\n\n` +
                    `Obrigado pela preferencia!\n${tenant?.name || 'Restaurante'}`;

                await this.sendFollowUp(tenantId, order.customer_phone, message, FOLLOW_UP_TYPES.POST_ORDER_FEEDBACK);
            }
        } catch (error) {
            console.error(`[Follow-up] Erro pos-pedido:`, error.message);
        }
    }

    // ========================================
    // HELPERS
    // ========================================

    /**
     * Verificar se follow-up foi enviado recentemente
     */
    async wasFollowUpSentRecently(tenantId, phone, type, hoursAgo = 72) {
        const result = await this.db.get(`
            SELECT id FROM activity_logs 
            WHERE tenant_id = ?
              AND action = 'FOLLOW_UP_SENT'
              AND details LIKE ?
              AND details LIKE ?
              AND created_at > datetime('now', '-${hoursAgo} hours')
        `, [tenantId, `%${phone}%`, `%${type}%`]);

        return !!result;
    }

    /**
     * Enviar mensagem de follow-up
     */
    async sendFollowUp(tenantId, phone, message, type) {
        try {
            const client = this.whatsappService.clients.get(tenantId);
            if (!client) return false;

            // Limpar e formatar numero
            let cleanPhone = String(phone).replace(/\D/g, '');

            // Adicionar 55 se nao comecar com ele (numeros brasileiros)
            if (cleanPhone && !cleanPhone.startsWith('55')) {
                cleanPhone = '55' + cleanPhone;
            }

            // Validar tamanho minimo (55 + DDD + numero = 12-13 digitos)
            if (cleanPhone.length < 12) {
                console.log(`[Follow-up] Numero invalido (muito curto): ${cleanPhone}`);
                return false;
            }

            // Tentar obter o ID correto do numero usando getNumberId
            let chatId = cleanPhone + '@c.us';
            try {
                const numberId = await client.getNumberId(cleanPhone);
                if (numberId) {
                    chatId = numberId._serialized;
                    console.log(`[Follow-up] ID resolvido: ${chatId}`);
                } else {
                    console.log(`[Follow-up] Numero nao encontrado no WhatsApp: ${cleanPhone}`);
                    return false;
                }
            } catch (idError) {
                console.log(`[Follow-up] Erro ao resolver ID, tentando direto: ${cleanPhone}`);
                // Fallback: tentar enviar direto
            }

            await client.sendMessage(chatId, message);

            // Registrar envio
            await this.db.run(`
                INSERT INTO activity_logs (id, tenant_id, action, details, created_at)
                VALUES (?, ?, 'FOLLOW_UP_SENT', ?, datetime('now'))
            `, [require('crypto').randomUUID(), tenantId, JSON.stringify({ phone: cleanPhone, type, message: message.substring(0, 100) })]);

            console.log(`[Follow-up] ${type} enviado para ${cleanPhone}`);

            // Delay entre envios
            await new Promise(r => setTimeout(r, 3000));

            return true;
        } catch (error) {
            console.error(`[Follow-up] Erro ao enviar:`, error.message);
            return false;
        }
    }

    /**
     * Construir mensagem para cliente inativo
     */
    buildInactiveMessage(customer, tenant) {
        const name = customer.name || 'cliente';
        const restaurantName = tenant?.name || 'Restaurante';
        const days = Math.floor(customer.days_inactive);
        const settings = JSON.parse(tenant?.settings || '{}');
        const domain = settings.domain || process.env.APP_DOMAIN || 'localhost:3000';
        const protocol = domain.includes('localhost') ? 'http' : 'https';

        if (days <= 14) {
            return `Ola ${name}! Sentimos sua falta no ${restaurantName}!\n\n` +
                `Que tal um pedido hoje? Estamos esperando por voce!\n\n` +
                `Faca seu pedido: ${protocol}://${domain}/loja/${tenant?.slug}`;
        } else if (days <= 30) {
            return `${name}, faz um tempinho que voce nao aparece por aqui!\n\n` +
                `O ${restaurantName} esta com saudade! Volte logo!\n` +
                `${protocol}://${domain}/loja/${tenant?.slug}`;
        } else {
            return `Ola ${name}! Lembra da gente? Somos o ${restaurantName}!\n\n` +
                `Que tal matar a saudade? Estamos te esperando!\n` +
                `${protocol}://${domain}/loja/${tenant?.slug}`;
        }
    }

    /**
     * Obter estatisticas de follow-up para um tenant
     */
    async getFollowUpStats(tenantId) {
        try {
            // Historico de envios dos ultimos 30 dias
            const history = await this.db.all(`
                SELECT 
                    date(created_at) as date,
                    COUNT(*) as count
                FROM activity_logs
                WHERE tenant_id = ? AND action = 'FOLLOW_UP_SENT'
                  AND created_at > datetime('now', '-30 days')
                GROUP BY date
                ORDER BY date ASC
            `, [tenantId]);

            // Totais por tipo
            const byType = await this.db.all(`
                SELECT 
                    json_extract(details, '$.type') as type,
                    COUNT(*) as count
                FROM activity_logs
                WHERE tenant_id = ? AND action = 'FOLLOW_UP_SENT'
                GROUP BY type
            `, [tenantId]);

            // Clientes inativos (estimativa baseada em orders)
            const inactive = await this.db.get(`
                SELECT COUNT(DISTINCT customer_id) as count
                FROM orders
                WHERE tenant_id = ? 
                  AND created_at < datetime('now', '-7 days')
                  AND customer_id NOT IN (
                      SELECT customer_id FROM orders 
                      WHERE tenant_id = ? AND created_at >= datetime('now', '-7 days')
                  )
            `, [tenantId, tenantId]);

            // Carrinhos abandonados (activity_logs sem pedidos recentes)
            const abandoned = await this.db.get(`
                SELECT COUNT(DISTINCT json_extract(details, '$.phone')) as count
                FROM activity_logs al
                WHERE al.tenant_id = ?
                  AND al.action = 'WHATSAPP_MESSAGE_RECEIVED'
                  AND al.created_at > datetime('now', '-2 days')
                  AND NOT EXISTS (
                    SELECT 1 FROM orders o 
                    WHERE o.tenant_id = al.tenant_id
                      AND o.created_at > al.created_at
                      AND json_extract(al.details, '$.phone') = o.customer_phone
                  )
            `, [tenantId]);

            return {
                history,
                summary: {
                    totalSent: byType.reduce((acc, curr) => acc + curr.count, 0),
                    inactiveCount: inactive?.count || 0,
                    abandonedCount: abandoned?.count || 0,
                    byType
                }
            };
        } catch (error) {
            console.error('[Follow-up] Erro ao buscar stats:', error.message);
            return { history: [], summary: { totalSent: 0, inactiveCount: 0, abandonedCount: 0, byType: [] } };
        }
    }

    /**
     * Parar agendador
     */
    stop() {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }
        console.log('[Follow-up] Servico parado');
    }
}

// Singleton
let followUpService = null;

export function getFollowUpService(db) {
    if (!followUpService) {
        followUpService = new FollowUpService(db);
    }
    return followUpService;
}

export default FollowUpService;
