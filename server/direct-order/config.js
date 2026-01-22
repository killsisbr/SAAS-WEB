// ============================================================
// Direct Order Module - Configuration
// Sistema de pedidos direto via WhatsApp
// ============================================================

/**
 * Estados do carrinho conversacional
 */
export const CART_STATES = {
    INITIAL: 'menu-inicial',
    BROWSING: 'browsing',
    DRINKS: 'menu-bebidas',
    DRINK_QTY: 'menu-quantidade-bebidas',
    ADDONS: 'adicionais',
    ADDON_QTY: 'quantidade-adicionais',
    DELIVERY_TYPE: 'resgate',
    ADDRESS: 'coletando-endereco',
    NAME: 'coletando-nome',
    OBSERVATION: 'confirmando-pedido',
    PAYMENT: 'forma-pagamento',
    CHANGE: 'definindo-troco',
    COMPLETED: 'finalizado',
    SUPPORT: 'suporte'
};

/**
 * Configurações padrão do módulo
 */
export const DEFAULT_CONFIG = {
    welcomeResendHours: 12,
    sessionTimeoutMinutes: 60,
    currency: 'R$',
    deliveryFee: 5.00
};

/**
 * Mapa de números escritos para dígitos
 */
export const NUMBER_MAP = {
    'um': 1, 'uma': 1, '1': 1,
    'dois': 2, 'duas': 2, '2': 2,
    'tres': 3, 'três': 3, '3': 3,
    'quatro': 4, '4': 4,
    'cinco': 5, '5': 5,
    'seis': 6, '6': 6,
    'sete': 7, '7': 7,
    'oito': 8, '8': 8,
    'nove': 9, '9': 9,
    'dez': 10, '10': 10
};

/**
 * Palavras-chave para intenções
 */
export const INTENT_KEYWORDS = {
    MENU: ['cardapio', 'cardápio', 'menu', 'opções', 'opcoes'],
    DELIVERY: ['entrega', 'entregar', 'entregam', 'levar'],
    PICKUP: ['buscar', 'busco', 'pegar', 'retirada', 'retirar', 'vou buscar'],
    PIX: ['pix', 'chave', 'pix?'],
    CONFIRM: ['s', 'sim', 'isso', 'correto', 'confirmo', 'confirmar'],
    CANCEL: ['n', 'não', 'nao', 'cancelar', 'cancela'],
    REMOVE_ITEM: ['c', 'remover', 'tira', 'tirar'],
    BACK: ['voltar', 'volta', 'retornar', 'v'],
    HELP: ['ajuda', 'help', 'suporte'],
    RESET: ['reiniciar', 'limpar', 'novo', 'pedir']
};

export default {
    CART_STATES,
    DEFAULT_CONFIG,
    NUMBER_MAP,
    INTENT_KEYWORDS
};
