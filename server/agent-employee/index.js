// ============================================================
// Agent Employee - Entry Point
// Agente funcionário estruturado com máquina de estados + IA
// ============================================================

import { processMessage } from './core/state-machine.js';
import { getSession, resetSession, formatCart } from './services/cart-service.js';
import * as customerService from './services/customer-service.js';
import { AGENT_STATES } from './config.js';

/**
 * Classe principal do Agent Employee
 */
export class AgentEmployee {
    constructor(db, tenantId, config = {}) {
        this.db = db;
        this.tenantId = tenantId;
        this.config = {
            employeeName: config.employeeName || 'Ana',
            storeName: config.storeName || 'Restaurante',
            ollamaUrl: config.ollamaUrl || 'http://localhost:11434',
            model: config.model || 'gemma3:4b',
            ...config
        };
        this.products = [];
        this.settings = {};
    }

    /**
     * Inicializar dados do tenant (produtos, configurações)
     */
    async initialize() {
        try {
            // Carregar produtos
            this.products = await this.db.all(
                'SELECT * FROM products WHERE tenant_id = ? AND is_available = 1 ORDER BY category_id, name',
                [this.tenantId]
            );

            // Carregar adicionais (global do tenant ou vinculados a categorias)
            // Nota: No schema, addon_items dependem de addon_groups que dependem de categories (tenant_id)
            this.addons = await this.db.all(
                `SELECT ai.* FROM addon_items ai 
                 JOIN addon_groups ag ON ai.group_id = ag.id 
                 WHERE ag.tenant_id = ? AND ai.is_available = 1`,
                [this.tenantId]
            );

            // Carregar itens do buffet
            this.buffet = await this.db.all(
                'SELECT * FROM buffet_items WHERE tenant_id = ? AND ativo = 1',
                [this.tenantId]
            );

            // Carregar configurações do tenant
            const tenant = await this.db.get(
                'SELECT settings, name FROM tenants WHERE id = ?',
                [this.tenantId]
            );

            if (tenant) {
                this.settings = JSON.parse(tenant.settings || '{}');
                this.settings.storeName = tenant.name;
            }

            console.log(`[AgentEmployee] Inicializado para ${this.tenantId}: ${this.products.length} produtos, ${this.addons.length} adicionais, ${this.buffet.length} buffet`);

        } catch (err) {
            console.error('[AgentEmployee] Erro ao inicializar:', err.message);
        }
    }

    /**
     * Processar mensagem do cliente
     * @param {string} customerPhone - Telefone do cliente (sem @s.whatsapp.net)
     * @param {string} message - Mensagem recebida
     * @param {string} pushName - Nome do cliente no WhatsApp
     * @param {Object} mediaData - Dados multimídia (location, audio)
     * @returns {Object} { success, message, orderCreated? }
     */
    async handleMessage(customerPhone, message, pushName = 'Cliente', mediaData = {}) {
        try {
            // Garantir inicialização
            if (this.products.length === 0) {
                await this.initialize();
            }

            // Buscar/criar cliente e carregar contexto
            const customer = await customerService.getOrCreateCustomer(
                this.db, this.tenantId, customerPhone, pushName
            );
            const lastOrder = customer ? await customerService.getLastOrder(this.db, customer.id) : null;
            const customerContext = customerService.getCustomerContext(customer, lastOrder);

            // Processar na máquina de estados
            const result = await processMessage({
                message,
                customerId: customerPhone,
                tenantId: this.tenantId,
                customerName: customerContext.storedName || pushName,
                products: this.products,
                addons: this.addons,
                buffet: this.buffet,
                settings: { ...this.settings, aiEmployee: this.config },
                db: this.db,
                customer,
                customerContext,
                mediaData, // Passar dados de media (location/audio)
                aiConfig: {
                    ollamaUrl: this.config.ollamaUrl,
                    model: this.config.model
                }
            });

            return {
                success: true,
                message: result.text,
                orderCreated: result.orderCreated || null
            };

        } catch (err) {
            console.error('[AgentEmployee] Erro ao processar mensagem:', err.message);
            console.error(err.stack);

            return {
                success: false,
                message: 'Desculpe, tive um problema. Pode repetir? 😅',
                error: err.message
            };
        }
    }

    /**
     * Obter estado atual da sessão do cliente
     */
    getSessionState(customerPhone) {
        return getSession(this.tenantId, customerPhone);
    }

    /**
     * Resetar sessão do cliente
     */
    resetSession(customerPhone) {
        return resetSession(this.tenantId, customerPhone);
    }

    /**
     * Formatar carrinho atual
     */
    getCartView(customerPhone) {
        return formatCart(this.tenantId, customerPhone);
    }
}

// Export para uso direto
export { AGENT_STATES };

export default AgentEmployee;
