// ============================================================
// Direct Order Module - Cart Service
// Gerenciamento de carrinho multi-tenant
// ============================================================

import { CART_STATES, DEFAULT_CONFIG } from '../config.js';

/**
 * Armazenamento de carrinhos em memória
 * Chave: `${tenantId}:${customerId}`
 */
const carts = new Map();

/**
 * Cria um carrinho vazio
 */
function createEmptyCart(customerId) {
    return {
        customerId,
        items: [],
        state: CART_STATES.INITIAL,
        total: 0,
        deliveryType: null,      // 'delivery' | 'pickup'
        address: null,
        customerName: null,
        observation: null,
        paymentMethod: null,
        change: null,
        createdAt: Date.now(),
        lastActivity: Date.now()
    };
}

/**
 * Obter ou criar carrinho
 * @param {string} tenantId - ID do tenant
 * @param {string} customerId - ID do cliente (número WhatsApp)
 * @returns {object} Carrinho do cliente
 */
export function getCart(tenantId, customerId) {
    const key = `${tenantId}:${customerId}`;
    if (!carts.has(key)) {
        carts.set(key, createEmptyCart(customerId));
    }
    const cart = carts.get(key);
    cart.lastActivity = Date.now();
    return cart;
}

/**
 * Verificar se carrinho existe
 */
export function hasCart(tenantId, customerId) {
    return carts.has(`${tenantId}:${customerId}`);
}

/**
 * Adicionar item ao carrinho
 * @param {string} tenantId - ID do tenant
 * @param {string} customerId - ID do cliente
 * @param {object} product - Produto do cardápio
 * @param {number} quantity - Quantidade
 * @param {string} notes - Observações do item
 * @param {string} type - Tipo: 'product' | 'drink' | 'addon' | 'delivery'
 * @returns {object} Carrinho atualizado
 */
export function addItem(tenantId, customerId, product, quantity = 1, notes = '', type = 'product') {
    const cart = getCart(tenantId, customerId);

    const item = {
        id: product.id,
        name: product.name,
        price: Number(product.price) || 0,
        quantity: Number(quantity) || 1,
        notes: notes || '',
        type
    };

    cart.items.push(item);
    cart.total = calculateTotal(cart);

    return cart;
}

/**
 * Remover último item do carrinho
 */
export function removeLastItem(tenantId, customerId) {
    const cart = getCart(tenantId, customerId);
    if (cart.items.length > 0) {
        cart.items.pop();
        cart.total = calculateTotal(cart);
    }
    return cart;
}

/**
 * Remover item por ID
 */
export function removeItem(tenantId, customerId, productId) {
    const cart = getCart(tenantId, customerId);
    if (cart.items.length > 0) {
        // Remover item com o ID específico
        cart.items = cart.items.filter(item => item.id != productId);
        cart.total = calculateTotal(cart);
    }
    return cart;
}

/**
 * Calcular valor total do carrinho
 */
export function calculateTotal(cart) {
    return cart.items.reduce((sum, item) => {
        return sum + (item.price * item.quantity);
    }, 0);
}

/**
 * Atualizar estado do carrinho
 */
export function setState(tenantId, customerId, newState) {
    const cart = getCart(tenantId, customerId);
    cart.state = newState;
    return cart;
}

/**
 * Resetar carrinho
 */
export function resetCart(tenantId, customerId) {
    const key = `${tenantId}:${customerId}`;
    const cart = createEmptyCart(customerId);
    carts.set(key, cart);
    return cart;
}

/**
 * Formatar visualização do carrinho para WhatsApp
 */
export function formatCartView(tenantId, customerId) {
    const cart = getCart(tenantId, customerId);

    if (cart.items.length === 0) {
        return '*Seu carrinho está vazio.*';
    }

    const products = cart.items.filter(i => i.type === 'product');
    const drinks = cart.items.filter(i => i.type === 'drink');
    const addons = cart.items.filter(i => i.type === 'addon');
    const delivery = cart.items.filter(i => i.type === 'delivery');

    let msg = '*📋 SEU PEDIDO:*\n';

    if (products.length > 0) {
        msg += products.map(item => {
            const notes = item.notes ? ` _${item.notes}_` : '';
            return `${item.quantity}x ${item.name}${notes}`;
        }).join('\n') + '\n';
    }

    if (drinks.length > 0) {
        msg += drinks.map(item => `${item.quantity}x ${item.name}`).join('\n') + '\n';
    }

    if (addons.length > 0) {
        msg += addons.map(item => `${item.quantity}x ${item.name}`).join('\n') + '\n';
    }

    if (delivery.length > 0) {
        msg += '_+Taxa de entrega_\n';
    }

    msg += `────────────\n`;
    msg += `*TOTAL: R$ ${cart.total.toFixed(2).replace('.', ',')}* 💰\n`;

    return msg;
}

/**
 * Formatar pedido para enviar ao grupo do restaurante
 */
export function formatOrderForGroup(tenantId, customerId) {
    const cart = getCart(tenantId, customerId);

    const products = cart.items.filter(i => i.type === 'product');
    const drinks = cart.items.filter(i => i.type === 'drink');
    const addons = cart.items.filter(i => i.type === 'addon');

    let msg = '*🔔 NOVO PEDIDO!*\n\n';

    if (products.length > 0) {
        msg += '*ITENS:*\n';
        msg += products.map(item => {
            const notes = item.notes ? ` (${item.notes})` : '';
            return `${item.quantity}x ${item.name}${notes}`;
        }).join('\n') + '\n\n';
    }

    if (drinks.length > 0) {
        msg += '*BEBIDAS:*\n';
        msg += drinks.map(item => `${item.quantity}x ${item.name}`).join('\n') + '\n\n';
    }

    if (addons.length > 0) {
        msg += '*ADICIONAIS:*\n';
        msg += addons.map(item => `${item.quantity}x ${item.name}`).join('\n') + '\n\n';
    }

    if (cart.deliveryType === 'delivery' && cart.address) {
        msg += `*📍 ENTREGA:*\n_${cart.address}_\n\n`;
    } else {
        msg += `*🏪 RETIRADA NO LOCAL*\n\n`;
    }

    if (cart.observation) {
        msg += `*📝 OBS:* _${cart.observation}_\n\n`;
    }

    msg += `*💰 TOTAL:* R$ ${cart.total.toFixed(2).replace('.', ',')}\n`;
    msg += `*💳 PAGAMENTO:* ${cart.paymentMethod || 'A combinar'}\n`;

    if (cart.change) {
        msg += `*💵 TROCO PARA:* R$ ${cart.change}\n`;
    }

    msg += `\n*👤 CLIENTE:* ${cart.customerName || 'Não informado'}\n`;
    msg += `*📱 CONTATO:* wa.me/${customerId}\n`;

    return msg;
}

/**
 * Limpar carrinhos inativos (garbage collection)
 */
export function cleanupInactiveCarts(timeoutMinutes = 60) {
    const now = Date.now();
    const timeout = timeoutMinutes * 60 * 1000;

    for (const [key, cart] of carts) {
        if (now - cart.lastActivity > timeout) {
            carts.delete(key);
        }
    }
}

/**
 * Obter todos os carrinhos (para debug)
 */
export function getAllCarts() {
    return Object.fromEntries(carts);
}

export default {
    getCart,
    hasCart,
    addItem,
    removeLastItem,
    setState,
    resetCart,
    formatCartView,
    formatOrderForGroup,
    calculateTotal,
    cleanupInactiveCarts,
    CART_STATES
};
