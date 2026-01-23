// ============================================================
// Direct Order Module - Public Entry Point
// Sistema de pedidos direto via WhatsApp
// ============================================================

import { processMessage } from './core/state-machine.js';
import * as cartService from './services/cart-service.js';
import * as customerService from './services/customer-service.js';
import { formatMenu } from './core/word-analyzer.js';
import { CART_STATES, DEFAULT_CONFIG } from './config.js';

// Módulo de IA para logging e análise
import { logConversation, AI_CONFIG } from '../ai-reinforcement/index.js';

/**
 * Processar pedido direto via WhatsApp
 * @param {object} params - Parâmetros
 * @param {string} params.message - Mensagem do cliente
 * @param {string} params.jid - JID do WhatsApp (número@s.whatsapp.net)
 * @param {string} params.tenantId - ID do tenant
 * @param {string} params.customerName - Nome do cliente (push name)
 * @param {object} params.sock - Socket Baileys
 * @param {object} params.db - Conexão com banco de dados
 * @param {function} params.broadcast - Função de broadcast SSE (opcional)
 * @param {object} params.location - Localização do cliente (opcional) { latitude, longitude }
 * @returns {object} { response, orderCreated? }
 */
export async function processDirectOrder(params) {
    const { message, jid, tenantId, customerName, sock, db, broadcast, location, orderLink } = params;

    // Extrair número do JID
    const customerId = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');

    try {
        console.log(`[DirectOrder] 1. Iniciando processamento para ${customerId}, msg: "${message}", loc: ${location ? 'sim' : 'não'}`);

        // Carregar dados do tenant
        const tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        if (!tenant) {
            console.error(`[DirectOrder] Tenant ${tenantId} não encontrado`);
            return { response: 'Desculpe, houve um problema. Tente novamente mais tarde.' };
        }
        console.log(`[DirectOrder] 2. Tenant carregado: ${tenant.name}`);

        const settings = JSON.parse(tenant.settings || '{}');
        console.log(`[DirectOrder] 3. Settings parsed`);

        // Carregar cardápio
        const menu = await loadMenu(db, tenantId);
        console.log(`[DirectOrder] 4. Menu carregado: ${menu.products?.length || 0} produtos`);

        // ===========================================================
        // LINK UNIFICADO: Usar o orderLink passado por whatsapp-service.js
        // Isso garante paridade com o Modo Link (usa buildOrderLink())
        // ===========================================================
        console.log(`[DirectOrder] 5. Usando orderLink recebido: ${orderLink}`);

        // Processar mensagem
        console.log(`[DirectOrder] 6. Chamando processMessage...`);
        const result = await processMessage({
            message,
            customerId,
            tenantId,
            customerName,
            menu,
            settings,
            db,
            location,  // Passar localização para o state-machine
            tenantSlug: tenant.slug,
            orderLink  // NOVO: Link já computado pelo whatsapp-service.js
        });
        console.log(`[DirectOrder] 7. processMessage retornou:`, result?.text?.substring(0, 50) || 'null');

        // ===========================================================
        // SISTEMA ANTI-SPAM
        // Verifica se deve enviar a mensagem ou silenciar (repetição)
        // ===========================================================
        if (result.text && !result.orderCreated) {
            // Só aplicar anti-spam para mensagens normais (não para confirmação de pedido!)
            const shouldSend = cartService.shouldSendMessage(tenantId, customerId, result.text, 2);

            if (!shouldSend) {
                console.log(`[DirectOrder] ⚠️ Anti-spam: mensagem silenciada (repetição sem alteração)`);
                return { response: null }; // Silenciar - não enviar nada
            }

            // Registrar que a mensagem será enviada
            cartService.registerSentMessage(tenantId, customerId, result.text);
        }

        // Se criou pedido
        if (result.orderCreated) {
            // Reset anti-spam após pedido criado (próxima interação deve funcionar normalmente)
            cartService.resetAntiSpam(tenantId, customerId);

            // 1. Broadcast SSE para atualizar o quadro de pedidos em tempo real
            if (broadcast) {
                try {
                    // Buscar pedido completo do banco para o broadcast
                    const order = await db.get('SELECT * FROM orders WHERE id = ?', [result.orderCreated.id]);
                    if (order) {
                        order.items = JSON.parse(order.items || '[]');
                        order.address = order.address ? JSON.parse(order.address) : null;
                        broadcast(tenantId, 'new-order', order);
                        console.log(`[DirectOrder] ✅ Broadcast SSE enviado para tenant ${tenantId}`);
                    }
                } catch (err) {
                    console.error('[DirectOrder] Erro no broadcast SSE:', err.message);
                }
            }

            // 2. Notificar grupo WhatsApp
            if (settings.whatsappGroupId) {
                try {
                    await sock.sendMessage(
                        settings.whatsappGroupId,
                        { text: result.orderCreated.groupNotification }
                    );
                    console.log(`[DirectOrder] ✅ Notificação enviada para grupo ${settings.whatsappGroupId}`);
                } catch (err) {
                    console.error('[DirectOrder] Erro ao notificar grupo:', err.message);
                }
            }
        }

        // ===========================================================
        // LOGGING PARA IA
        // Registra a interação para análise posterior
        // ===========================================================
        if (AI_CONFIG.loggingEnabled) {
            try {
                const cart = cartService.getCart(tenantId, customerId);
                await logConversation(db, {
                    tenantId,
                    customerId,
                    customerMessage: message,
                    messageType: location ? 'location' : 'text',
                    botResponse: result.text,
                    detectedActions: result.actions || [],
                    matchedProducts: result.matchedProducts || [],
                    cartState: cart.state,
                    cartItems: cart.items,
                    cartTotal: cart.total
                });
            } catch (logErr) {
                console.error('[DirectOrder] Erro ao registrar para IA:', logErr.message);
            }
        }

        return {
            response: result.text,
            orderCreated: result.orderCreated
        };

    } catch (err) {
        console.error('[DirectOrder] Erro:', err.message);
        console.error('[DirectOrder] Stack:', err.stack);
        return { response: 'Desculpe, tive um problema. Pode repetir?' };
    }
}

/**
 * Carregar cardápio do tenant
 */
async function loadMenu(db, tenantId) {
    let products = [];
    let categories = [];
    let addons = [];
    let buffetItems = [];
    let businessType = 'OUTROS';

    // Buscar business_type do tenant
    try {
        const tenant = await db.get('SELECT business_type FROM tenants WHERE id = ?', [tenantId]);
        businessType = tenant?.business_type || 'OUTROS';
    } catch (err) {
        console.error('[DirectOrder] Erro ao carregar tipo de negócio:', err.message);
    }

    try {
        products = await db.all(`
                SELECT p.*, c.name as category_name
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.tenant_id = ? AND p.is_available = 1
                ORDER BY c.order_index, p.name
            `, [tenantId]);
    } catch (err) {
        console.error('[DirectOrder] Erro ao carregar produtos:', err.message);
    }

    try {
        categories = await db.all(`
                SELECT * FROM categories 
                WHERE tenant_id = ? AND is_active = 1
                ORDER BY order_index
            `, [tenantId]);
    } catch (err) {
        console.error('[DirectOrder] Erro ao carregar categorias:', err.message);
    }

    try {
        addons = await db.all(`
                SELECT * FROM addon_groups
                WHERE tenant_id = ?
            `, [tenantId]);
    } catch (err) {
        console.error('[DirectOrder] Erro ao carregar addons:', err.message);
    }

    // Carregar itens do buffet (para RESTAURANTE/MARMITARIA)
    if (businessType === 'RESTAURANTE' || businessType === 'MARMITARIA') {
        try {
            // Nova lógica: Buscar de addon_items via grupos de buffet (JOIN categories)
            buffetItems = await db.all(`
                SELECT i.*, g.name as group_name 
                FROM addon_items i
                JOIN addon_groups g ON i.group_id = g.id
                JOIN categories c ON g.category_id = c.id
                WHERE c.tenant_id = ? 
                AND i.is_available = 1
                AND (
                    LOWER(g.name) LIKE '%buffet%' OR 
                    LOWER(g.name) LIKE '%marmita%' OR
                    LOWER(g.name) LIKE '%acompanhamento%'
                )
                ORDER BY i.name
            `, [tenantId]);

            // Fallback para tabela antiga se estiver vazia
            if (buffetItems.length === 0) {
                const legacyItems = await db.all(`
                    SELECT * FROM buffet_items 
                    WHERE tenant_id = ? AND ativo = 1
                    ORDER BY order_index, nome
                `, [tenantId]);
                if (legacyItems.length > 0) buffetItems = legacyItems;
            }

        } catch (err) {
            console.error('[DirectOrder] Erro ao carregar buffet:', err.message);
        }
    }

    return { products, categories, addons, buffetItems, businessType };
}

/**
 * Verificar se deve processar como pedido direto
 * @param {object} settings - Configurações do tenant
 * @returns {boolean} True se modo direto está ativo
 */
export function isDirectOrderEnabled(settings) {
    return settings?.whatsappOrderMode === 'direct';
}

/**
 * Limpar carrinhos inativos (para chamar periodicamente)
 */
export function cleanupCarts(timeoutMinutes = 60) {
    cartService.cleanupInactiveCarts(timeoutMinutes);
}

// Exportar utilitários
export {
    cartService,
    customerService,
    formatMenu,
    CART_STATES,
    DEFAULT_CONFIG
};

export default {
    processDirectOrder,
    isDirectOrderEnabled,
    cleanupCarts,
    CART_STATES
};
