// ============================================================
// Order Session Manager
// Gerencia sessoes de pedido por cliente WhatsApp
// ============================================================

// Cache de sessoes ativas (whatsappId -> session)
const activeSessions = new Map();

// Timeout de sessao em minutos
const SESSION_TIMEOUT = 30;

/**
 * Estados possiveis do pedido
 */
export const ORDER_STATES = {
    IDLE: 'IDLE',               // Aguardando interacao
    GREETING: 'GREETING',       // Saudacao enviada
    BROWSING: 'BROWSING',       // Navegando cardapio
    ADDING_ITEM: 'ADDING_ITEM', // Adicionando produto
    SELECT_OPTION: 'SELECT_OPTION', // Escolhendo opcao/tamanho
    ADDONS: 'ADDONS',           // Oferecendo adicionais
    CART_REVIEW: 'CART_REVIEW', // Revisando carrinho
    CHECKOUT: 'CHECKOUT',       // Iniciando checkout
    DELIVERY_TYPE: 'DELIVERY_TYPE', // Entrega ou retirada
    ADDRESS: 'ADDRESS',         // Coletando endereco
    PAYMENT: 'PAYMENT',         // Forma de pagamento
    CONFIRMED: 'CONFIRMED',     // Pedido confirmado
    CANCELLED: 'CANCELLED'      // Pedido cancelado
};

/**
 * Classe de Sessao de Pedido
 */
export class OrderSession {
    constructor(whatsappId, tenantId, customerName = null) {
        this.whatsappId = whatsappId;
        this.tenantId = tenantId;
        this.customerName = customerName;
        this.state = ORDER_STATES.IDLE;
        this.items = [];
        this.currentItem = null;
        this.pendingProduct = null;
        this.deliveryType = null;
        this.address = null;
        this.paymentMethod = null;
        this.observation = '';
        this.createdAt = Date.now();
        this.lastActivity = Date.now();
    }

    /**
     * Atualizar atividade (reseta timeout)
     */
    touch() {
        this.lastActivity = Date.now();
    }

    /**
     * Verificar se sessao expirou
     */
    isExpired() {
        const elapsed = (Date.now() - this.lastActivity) / 1000 / 60;
        return elapsed > SESSION_TIMEOUT;
    }

    /**
     * Mudar estado
     */
    setState(newState) {
        console.log(`[Session ${this.whatsappId}] ${this.state} -> ${newState}`);
        this.state = newState;
        this.touch();
    }

    /**
     * Adicionar item ao carrinho
     */
    addItem(product, quantity = 1, option = null, addons = []) {
        const item = {
            id: Date.now().toString(),
            productId: product.id,
            name: product.name,
            price: Number(product.price),
            quantity,
            option,
            addons: addons.map(a => ({
                id: a.id,
                name: a.name,
                price: Number(a.price || 0)
            })),
            total: this.calculateItemTotal(product, quantity, addons)
        };

        this.items.push(item);
        this.currentItem = null;
        this.pendingProduct = null;
        this.touch();

        return item;
    }

    /**
     * Calcular total de um item
     */
    calculateItemTotal(product, quantity, addons) {
        const basePrice = Number(product.price);
        const addonsPrice = addons.reduce((sum, a) => sum + Number(a.price || 0), 0);
        return (basePrice + addonsPrice) * quantity;
    }

    /**
     * Remover item do carrinho
     */
    removeItem(itemId) {
        this.items = this.items.filter(i => i.id !== itemId);
        this.touch();
    }

    /**
     * Atualizar quantidade de item
     */
    updateQuantity(itemId, quantity) {
        const item = this.items.find(i => i.id === itemId);
        if (item) {
            item.quantity = quantity;
            item.total = (item.price + item.addons.reduce((s, a) => s + a.price, 0)) * quantity;
        }
        this.touch();
    }

    /**
     * Calcular total do pedido
     */
    getTotal() {
        return this.items.reduce((sum, item) => sum + item.total, 0);
    }

    /**
     * Calcular subtotal + taxa de entrega
     */
    getFinalTotal(deliveryFee = 0) {
        return this.getTotal() + deliveryFee;
    }

    /**
     * Formatar carrinho como texto
     */
    formatCart() {
        if (this.items.length === 0) {
            return 'Carrinho vazio';
        }

        return this.items.map(item => {
            let line = `${item.quantity}x ${item.name}`;
            if (item.option) {
                line += ` (${item.option})`;
            }
            if (item.addons?.length) {
                line += ` + ${item.addons.map(a => a.name).join(', ')}`;
            }
            line += ` = R$ ${item.total.toFixed(2).replace('.', ',')}`;
            return line;
        }).join('\n');
    }

    /**
     * Exportar como objeto de pedido
     */
    toOrder() {
        return {
            tenantId: this.tenantId,
            customerName: this.customerName,
            customerPhone: this.whatsappId.replace('@c.us', ''),
            whatsappId: this.whatsappId,
            items: this.items.map(item => ({
                productId: item.productId,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                addons: item.addons,
                observation: ''
            })),
            deliveryType: this.deliveryType,
            address: this.address,
            paymentMethod: this.paymentMethod,
            observation: this.observation,
            total: this.getFinalTotal()
        };
    }

    /**
     * Resetar sessao para novo pedido
     */
    reset() {
        this.state = ORDER_STATES.IDLE;
        this.items = [];
        this.currentItem = null;
        this.pendingProduct = null;
        this.deliveryType = null;
        this.address = null;
        this.paymentMethod = null;
        this.observation = '';
        this.touch();
    }
}

/**
 * Obter ou criar sessao para cliente
 */
export function getOrCreateSession(whatsappId, tenantId, customerName = null) {
    const key = `${tenantId}:${whatsappId}`;

    if (activeSessions.has(key)) {
        const session = activeSessions.get(key);
        if (!session.isExpired()) {
            session.touch();
            if (customerName && !session.customerName) {
                session.customerName = customerName;
            }
            return session;
        }
        // Sessao expirada, remover
        activeSessions.delete(key);
    }

    const session = new OrderSession(whatsappId, tenantId, customerName);
    activeSessions.set(key, session);
    return session;
}

/**
 * Obter sessao existente
 */
export function getSession(whatsappId, tenantId) {
    const key = `${tenantId}:${whatsappId}`;
    const session = activeSessions.get(key);

    if (session && !session.isExpired()) {
        return session;
    }

    return null;
}

/**
 * Remover sessao
 */
export function removeSession(whatsappId, tenantId) {
    const key = `${tenantId}:${whatsappId}`;
    activeSessions.delete(key);
}

/**
 * Limpar sessoes expiradas (rodar periodicamente)
 */
export function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [key, session] of activeSessions) {
        if (session.isExpired()) {
            console.log(`[Session] Removendo sessao expirada: ${key}`);
            activeSessions.delete(key);
        }
    }
}

// Limpar sessoes a cada 5 minutos
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

export default {
    ORDER_STATES,
    OrderSession,
    getOrCreateSession,
    getSession,
    removeSession,
    cleanupExpiredSessions
};
