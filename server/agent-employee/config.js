// ============================================================
// Agent Employee - Configurações
// Definições de estados e mensagens personalizáveis
// ============================================================

export const AGENT_STATES = {
    GREETING: 'GREETING',           // Boas-vindas
    ORDERING: 'ORDERING',           // Escolhendo itens
    DELIVERY_TYPE: 'DELIVERY_TYPE', // Entrega ou Retirada
    ADDRESS: 'ADDRESS',             // Endereço de entrega
    NAME: 'NAME',                   // Nome do cliente
    OBSERVATION: 'OBSERVATION',     // Observações do pedido
    PAYMENT: 'PAYMENT',             // Forma de pagamento
    CHANGE: 'CHANGE',               // Troco (se dinheiro)
    CONFIRM_ORDER: 'CONFIRM_ORDER', // Confirmação final
    COMPLETED: 'COMPLETED'          // Finalizado
};

export const DEFAULT_MESSAGES = {
    // Boas-vindas
    greeting: "Olá! 😊 Que bom ter você aqui! Eu sou a {employeeName}, sua atendente virtual do *{storeName}*.\n\nPara facilitar, aqui estão algumas das nossas delícias:\n\n{menuItems}\n\nO que você gostaria de pedir hoje? Pode escrever do seu jeito, por exemplo: 'quero 2 x-bacon e uma coca lata'.",

    // Item adicionado
    itemAdded: "✅ Registrado!\n\n{cartItems}\n\nO que mais você gostaria? Se preferir, podemos *fechar* o pedido.",

    // Item não encontrado
    itemNotFound: "Hum, não encontrei o item '{itemName}'. 😅\n\nSeria algum destes?\n{suggestions}\n\nOu digite *cardápio* para ver tudo!",

    // Confirmar carrinho (antes de ir pra entrega)
    confirmCart: "Ótima escolha! 😋\n\n{cartItems}\n\nComo você prefere: *Entrega* ou *Retirada*? 🛵🏠",

    // Perguntar endereço
    askAddress: "Certo! 🗺️ Qual o seu endereço completo para entrega?",

    // Perguntar nome
    askName: "Para finalizarmos, qual o seu nome? 😊",

    // Perguntar observação
    askObservation: "Alguma observação para o pedido? (Ex: sem cebola, ponto da carne...)\n\nSe não tiver nada, é só escrever *não*.",

    // Perguntar pagamento
    askPayment: "Tudo certinho! Como você prefere pagar?\n\n💵 *1. Pix*\n💳 *2. Cartão*\n💰 *3. Dinheiro*\n\n{cartItems}",

    // Perguntar troco
    askChange: "Precisa de troco para quanto? 💰",

    // Pedido finalizado
    orderConfirmed: "✅ *PEDIDO RECEBIDO!* 🥳\n\nUhul, {customerName}! Seu pedido número *#{orderNumber}* já está com a nossa equipe.\n\n{cartItems}\n\n{deliveryInfo}\n\n*Pagamento:* {paymentMethod}\n*Obs:* {observation}\n{pixInfo}\n\nMuito obrigado! 💚"
};

export const PAYMENT_METHODS = {
    'PIX': 'Pix',
    'CREDIT_CARD': 'Cartão Crédito',
    'DEBIT_CARD': 'Cartão Débito',
    'CASH': 'Dinheiro',
    'LOCAL': 'Pagar no Local'
};

export default { AGENT_STATES, DEFAULT_MESSAGES, PAYMENT_METHODS };
