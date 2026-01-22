// ============================================================
// Direct Order Module - State Machine
// Máquina de estados principal do fluxo conversacional
// ============================================================

import { CART_STATES } from '../config.js';
import * as cartService from '../services/cart-service.js';
import * as customerService from '../services/customer-service.js';
import { analyzeMessage, formatMenu, formatBuffetMenu } from './word-analyzer.js';
import { DeliveryService } from '../../services/delivery-service.js';

/**
 * Processar mensagem e retornar resposta
 * @param {object} params - Parâmetros da mensagem
 * @returns {object} Resposta { text, orderCreated? }
 */
export async function processMessage(params) {
    const {
        message,
        customerId,
        tenantId,
        customerName,
        menu,
        settings,
        db,
        location,  // Nova propriedade: { latitude, longitude } se disponível
        tenantSlug
    } = params;

    const enableDirect = settings?.enableDirect !== false; // Default true

    // Se o pedido direto estiver desativado, apenas enviar mensagem de boas-vindas com link
    if (!enableDirect) {
        // Permitir apenas comandos básicos de admin ou reset se necessário, mas por padrão bloqueia fluxo
        // Para simplificar, retornamos a msg e paramos.
        // Se quiser permitir suporte/ajuda, teria que filtrar aqui.
        // Vamos retornar apenas a mensagem com link.
        return { text: getWelcomeMessage(settings, tenantSlug, customerId) };
    }

    // Obter ou criar carrinho
    const cart = cartService.getCart(tenantId, customerId);

    // --- LÓGICA DE LOCALIZAÇÃO: Se recebeu localização, processar primeiro ---
    if (location && location.latitude && location.longitude) {
        console.log(`[DirectOrder] Processando localização: ${location.latitude}, ${location.longitude}`);
        return await handleLocationMessage(params, cart, location);
    }

    // Analisar mensagem (com suporte a mapeamentos do banco)
    const actions = await analyzeMessage(message, menu, cart, db, tenantId);

    console.log(`[DirectOrder] Estado: ${cart.state}, Ações: ${JSON.stringify(actions.map(a => a.type))}`);

    // --- LÓGICA GLOBAL: Adição de produtos em qualquer estado ---
    const hasProducts = actions.some(a => a.type === 'ADD_PRODUCT');
    if (hasProducts && cart.state !== CART_STATES.COMPLETED) {
        // Se detectou produtos, processa a adição e redireciona para BROWSING para confirmação
        // Isso permite adicionar itens mesmo estando no meio da coleta de endereço/pagamento
        for (const action of actions) {
            if (action.type === 'ADD_PRODUCT') {
                cartService.addItem(tenantId, customerId, action.product, action.quantity, action.notes, 'product');
            }
        }

        // Resetar para BROWSING para mostrar o carrinho atualizado e pedir confirmação/next steps
        cartService.setState(tenantId, customerId, CART_STATES.BROWSING);
        return handleBrowsing(params, cart, actions);
    }

    // Processar por estado
    switch (cart.state) {
        case CART_STATES.INITIAL:
        case CART_STATES.BROWSING:
            return handleBrowsing(params, cart, actions);

        case CART_STATES.DELIVERY_TYPE:
            return handleDeliveryType(params, cart, actions);

        case CART_STATES.ADDRESS:
            return handleAddress(params, cart, actions);

        case CART_STATES.NAME:
            return handleName(params, cart, actions);

        case CART_STATES.OBSERVATION:
            return handleObservation(params, cart, actions);

        case CART_STATES.PAYMENT:
            return handlePayment(params, cart, actions);

        case CART_STATES.CHANGE:
            return handleChange(params, cart, actions);

        case CART_STATES.COMPLETED:
            return handleCompleted(params, cart, actions);

        case CART_STATES.SUPPORT:
            return handleSupport(params, cart, actions);

        default:
            return handleBrowsing(params, cart, actions);
    }
}

/**
 * Handler: Estado de navegação/inicial
 */
async function handleBrowsing(params, cart, actions) {
    const { menu, settings, customerId, tenantId, db, customerName, tenantSlug } = params;
    const messages = settings?.directOrderMessages || {};

    let productAdded = false;

    // Verificar ações especiais
    for (const action of actions) {
        // Rastrear última ação para evitar repetições (ex: Oi -> Erro -> Oi de novo)
        cart.lastActionType = action.type;
        // Se entrou aqui, é uma ação válida, então resetamos o erro
        cart.lastMessageWasError = false;

        switch (action.type) {
            case 'SHOW_MENU':
                // Se for restaurante/marmitaria, mostrar buffet do dia
                if (menu.businessType === 'RESTAURANTE' || menu.businessType === 'MARMITARIA') {
                    return { text: formatBuffetMenu(menu) };
                }
                return { text: formatMenu(menu) };

            case 'SHOW_PIX':
                const pixKey = settings?.pixKey || 'Não configurado';
                return { text: `*Chave PIX:* ${pixKey}` };

            case 'RESET':
                cartService.resetCart(tenantId, customerId);
                return {
                    text: messages.reset || 'Carrinho reiniciado! O que deseja pedir?'
                };

            case 'HELP':
                return { text: getHelpMessage() };

            case 'GREETING':
                // Resetar estado de erro (já feito no topo do loop, mas reforçando intenção)
                cart.lastMessageWasError = false;
                return { text: getWelcomeMessage(settings, tenantSlug, customerId) };

            case 'ADD_PRODUCT':
                // Nota: Já adicionado globalmente no processMessage
                productAdded = true;
                break; // IMPORTANTE: não dar return aqui para processar múltiplos produtos

            case 'NUMERIC_CHOICE':
                // Tentar encontrar produto pelo número (índice 1-based)
                if (cart.state === CART_STATES.BROWSING || cart.state === CART_STATES.INITIAL) {
                    const number = parseInt(params.message.replace(/\D/g, ''));
                    // Achatar produtos do menu para corresponder à visualização (1..N)
                    let allProducts = [];
                    // Se for menu normal
                    if (menu.products && menu.products.length > 0) {
                        allProducts = menu.products;
                    } else if (menu.categories) {
                        // Se for por categorias (nested) e não tiver lista plana
                        allProducts = [];
                        menu.categories.forEach(cat => {
                            if (cat.products) allProducts.push(...cat.products);
                        });
                    }

                    if (number > 0 && number <= allProducts.length) {
                        const product = allProducts[number - 1];
                        cartService.addItem(tenantId, customerId, product, 1, '', 'product');
                        productAdded = true;
                    }
                }
                break;

            case 'REMOVE_ITEM':
                cartService.removeLastItem(tenantId, customerId);
                const cartViewRemove = cartService.formatCartView(tenantId, customerId);
                return { text: `*Item removido!*\n\n${cartViewRemove}\n${getMenuSubMessage()}` };

            case 'DELIVERY':
                if (cart.items.length === 0 && !productAdded) {
                    return { text: 'Seu carrinho está vazio! Adicione itens primeiro.\n\n' + getMenuSubMessage() };
                }
                // Continuar para o fluxo de entrega (definido após o loop ou return aqui se for ação única)
                break;

            case 'PICKUP':
                if (cart.items.length === 0 && !productAdded) {
                    return { text: 'Seu carrinho está vazio! Adicione itens primeiro.\n\n' + getMenuSubMessage() };
                }
                break;
        }
    }

    // Se adicionou produtos, priorizar mostrar o carrinho
    // Exceto se houver uma intenção de checkout clara
    const hasCheckoutAction = actions.some(a => a.type === 'DELIVERY' || a.type === 'PICKUP');

    if (hasCheckoutAction) {
        const lastAction = actions.find(a => a.type === 'DELIVERY' || a.type === 'PICKUP');
        if (lastAction.type === 'DELIVERY') {
            const customer = await customerService.getCustomer(db, tenantId, customerId);
            cart.deliveryType = 'delivery';
            cartService.setState(tenantId, customerId, CART_STATES.ADDRESS);
            if (customer?.address) {
                cart.address = customer.address;
                const cartView = cartService.formatCartView(tenantId, customerId);
                return {
                    text: `${cartView}\n*Entrega no seu último endereço?*\n➥ ${customer.address}\n\n*S* - _Sim, confirmar._\n\nObs: _Digite o endereço novamente para corrigir._`
                };
            }
            return { text: messages.askAddress || '*Digite seu endereço completo para entrega:*\n_Rua, número, bairro, ponto de referência_' };
        } else {
            cart.deliveryType = 'pickup';
            const customer = await customerService.getCustomer(db, tenantId, customerId);
            if (customer?.name) {
                cart.customerName = customer.name;
                cartService.setState(tenantId, customerId, CART_STATES.OBSERVATION);
                const cartView = cartService.formatCartView(tenantId, customerId);
                return { text: `${cartView}\n*Alguma observação para o pedido?*\n\n_Digite a observação ou N para continuar._` };
            }
            cartService.setState(tenantId, customerId, CART_STATES.NAME);
            return { text: '*Qual seu nome?*' };
        }
    }

    if (productAdded) {
        const cartView = cartService.formatCartView(tenantId, customerId);
        return { text: `${cartView}\n${getMenuSubMessage()}` };
    }

    // Se não entendeu nada (sem ações e sem produtos)
    // E não é um comando conhecido (pois actions estaria preenchido)
    if (actions.length === 0) {
        // Anti-Spam de erros: 
        // 1. Se o último já foi erro, silenciar agora.
        // 2. Ou se a última ação foi SAUDAÇÃO (GREETING), não adianta mandar Boas Vindas de novo, então silencia.
        if (cart.lastMessageWasError || cart.lastActionType === 'GREETING') {
            return { text: null }; // Retorno com text nulo inibe envio de mensagem no index.js/whatsapp-service.js
        }

        cart.lastMessageWasError = true;
        return {
            text: getWelcomeMessage(settings, tenantSlug, customerId, params.baseUrl)
        };
    }

    // Se entendeu algo, limpa a flag de erro
    cart.lastMessageWasError = false;

    return { text: getWelcomeMessage(settings, tenantSlug, customerId, params.baseUrl) };
}

/**
 * Handler: Escolha de entrega/retirada
 */
async function handleDeliveryType(params, cart, actions) {
    const { customerId, tenantId, db, settings, message } = params;
    const messages = settings?.directOrderMessages || {};

    for (const action of actions) {
        if (action.type === 'DELIVERY' || message.toLowerCase().includes('entrega') || message === '1') {
            cart.deliveryType = 'delivery';

            // PRIORIDADE 1: Verificar se tem localização salva (foi enviada antes do pedido)
            if (cart.savedLocation && cart.savedLocation.fee !== undefined) {
                cart.address = cart.savedLocation.formattedAddress;
                cart.pendingFee = cart.savedLocation.fee;
                cart.pendingDist = cart.savedLocation.distance;

                // Atualizar no banco
                await customerService.updateAddress(db, tenantId, customerId, cart.address);

                // Adicionar taxa de entrega
                cartService.addItem(tenantId, customerId,
                    { id: 0, name: 'Taxa de Entrega', price: cart.pendingFee },
                    1, `${cart.address}`, 'delivery'
                );

                // Pular direto para observação
                cartService.setState(tenantId, customerId, CART_STATES.OBSERVATION);
                const cartView = cartService.formatCartView(tenantId, customerId);
                return {
                    text: `📍 *Usando sua localização salva!*\n\nDistância: ${cart.pendingDist?.toFixed(1) || '?'} km\nTaxa: R$ ${cart.pendingFee.toFixed(2).replace('.', ',')}\n\n${cartView}\n\n*Alguma observação para o pedido?*\n\n_Digite a observação ou N para continuar._`
                };
            }

            // PRIORIDADE 2: Verificar endereço anterior do cliente
            const customer = await customerService.getCustomer(db, tenantId, customerId);
            if (customer?.address) {
                cart.address = customer.address;

                // Calcular taxa estimada para o endereço salvo
                let fee = settings.deliveryFee || 0;
                try {
                    const deliveryService = new DeliveryService(db);
                    const feeResult = await deliveryService.calculateFee(tenantId, { text: cart.address });
                    if (!feeResult.outOfRange && !feeResult.addressNotFound) {
                        fee = feeResult.fee;
                        cart.pendingDist = feeResult.distance;
                    }
                    // Se falhar, mantem o default
                } catch (e) { }

                cart.pendingFee = fee;
                const totalWithFee = cart.total + fee;
                const cartView = cartService.formatCartView(tenantId, customerId);

                return {
                    text: `${cartView}\n*Entrega no seu último endereço?*\n➥ ${customer.address}\n\n*Taxa:* R$ ${fee.toFixed(2).replace('.', ',')}\n*Total:* R$ ${totalWithFee.toFixed(2).replace('.', ',')}\n\n*S* - _Sim, confirmar._\n\nObs: _Digite o endereço novamente para corrigir._`
                };
            }

            cartService.setState(tenantId, customerId, CART_STATES.ADDRESS);
            return { text: messages.askAddress || '*Digite seu endereço completo para entrega:*\n_Rua, número, bairro, ponto de referência ou 📍 localização_' };
        }

        if (action.type === 'PICKUP' || message.toLowerCase().includes('retirada') || message.toLowerCase().includes('buscar') || message === '2') {
            cart.deliveryType = 'pickup';

            const customer = await customerService.getCustomer(db, tenantId, customerId);
            if (customer?.name) {
                cart.customerName = customer.name;
                cartService.setState(tenantId, customerId, CART_STATES.OBSERVATION);
                return { text: '*Alguma observação para o pedido?*\n\n_Digite a observação ou N para continuar._' };
            }

            cartService.setState(tenantId, customerId, CART_STATES.NAME);
            return { text: '*Qual seu nome?*' };
        }

        if (action.type === 'BACK') {
            cartService.setState(tenantId, customerId, CART_STATES.BROWSING);
            const cartView = cartService.formatCartView(tenantId, customerId);
            return { text: `${cartView}\n${getMenuSubMessage()}` };
        }
    }

    return { text: '*Será entrega ou retirada?*\n\n*1* - Entrega\n*2* - Retirada' };
}

/**
 * Handler: Coleta de endereço
 */
async function handleAddress(params, cart, actions) {
    const { customerId, tenantId, db, message, settings } = params;

    for (const action of actions) {
        if (action.type === 'CONFIRM') {
            // Confirmar endereço existente e taxa
            if (cart.address) {
                cart.deliveryType = 'delivery';

                // Recalcular taxa se estiver pendente (caso de recall de endereço)
                if (cart.pendingFee === undefined) {
                    const deliveryService = new DeliveryService(db);
                    const feeResult = await deliveryService.calculateFee(tenantId, { text: cart.address });
                    if (!feeResult.outOfRange) {
                        cart.pendingFee = feeResult.fee;
                        cart.pendingDist = feeResult.distance;
                    }
                }

                await customerService.updateAddress(db, tenantId, customerId, cart.address);

                // Adicionar taxa de entrega (calculada ou padrão)
                const deliveryFee = (cart.pendingFee !== undefined) ? cart.pendingFee : (settings?.deliveryFee || 5.00);

                // Remover taxa anterior se houver
                cartService.removeItem(tenantId, customerId, 0);

                cartService.addItem(tenantId, customerId,
                    { id: 0, name: 'Taxa de Entrega', price: deliveryFee },
                    1, `${cart.address} (${cart.pendingDist || '?'}km)`, 'delivery'
                );

                // Verificar se já temos o nome do cliente
                const customer = await customerService.getCustomer(db, tenantId, customerId);
                // Nome válido = existe e não é o default e tem pelo menos 3 letras
                const hasValidName = customer?.name &&
                    customer.name !== 'Cliente WhatsApp' &&
                    customer.name.length > 2;

                if (hasValidName) {
                    cart.customerName = customer.name;
                    cartService.setState(tenantId, customerId, CART_STATES.OBSERVATION);
                    return { text: '*Alguma observação para o pedido?*\n\n_Digite a observação ou N para continuar._' };
                } else {
                    cartService.setState(tenantId, customerId, CART_STATES.NAME);
                    return { text: '*Qual seu nome?*' };
                }
            }
        }

        if (action.type === 'BACK') {
            cartService.setState(tenantId, customerId, CART_STATES.BROWSING);
            const cartView = cartService.formatCartView(tenantId, customerId);
            return { text: `${cartView}\n${getMenuSubMessage()}` };
        }
    }

    // Tratar como novo endereço
    if (message.trim().length > 5) {
        const addressText = message.trim();
        const deliveryService = new DeliveryService(db);

        const feeResult = await deliveryService.calculateFee(tenantId, { text: addressText });

        // Fallback: Se estiver fora da área ou não calcular, aceitar com taxa mínima
        if (feeResult.outOfRange || feeResult.addressNotFound) {
            cart.address = addressText; // Preservar o texto digitado
            const fallbackFee = settings?.deliveryFee || 7.00;
            cart.pendingFee = fallbackFee;
            cart.pendingDist = feeResult.distance || 0;

            await customerService.updateAddress(db, tenantId, customerId, cart.address);

            return {
                text: `*Endereço:* ${cart.address}\n⚠️ _Não conseguimos calcular a distância exata. Aplicamos a taxa padrão._\n*Taxa de Entrega:* R$ ${fallbackFee.toFixed(2).replace('.', ',')}\n\nDigite *SIM* para confirmar.`
            };
        }

        cart.address = feeResult.formattedAddress || addressText;
        cart.pendingFee = feeResult.fee; // Guardar taxa temporariamente
        cart.pendingDist = feeResult.distance;

        // Atualizar endereço no banco
        await customerService.updateAddress(db, tenantId, customerId, cart.address);

        const feeFormatted = feeResult.fee.toFixed(2).replace('.', ',');
        const totalWithFee = cart.total + feeResult.fee;

        return {
            text: `*Endereço:* ${cart.address}\n*Taxa de Entrega:* R$ ${feeFormatted}\n*Total final:* R$ ${totalWithFee.toFixed(2).replace('.', ',')}\n\nDigite *SIM* para confirmar.`
        };
    }

    return { text: '*Digite seu endereço completo para entrega:*' };
}

/**
 * Handler: Coleta de nome
 */
async function handleName(params, cart, actions) {
    const { customerId, tenantId, db, message } = params;

    for (const action of actions) {
        if (action.type === 'BACK') {
            cartService.setState(tenantId, customerId, CART_STATES.BROWSING);
            const cartView = cartService.formatCartView(tenantId, customerId);
            return { text: `${cartView}\n${getMenuSubMessage()}` };
        }
    }

    if (message.trim().length >= 2) {
        cart.customerName = message.trim();
        await customerService.updateName(db, tenantId, customerId, cart.customerName);

        cartService.setState(tenantId, customerId, CART_STATES.OBSERVATION);
        const cartView = cartService.formatCartView(tenantId, customerId);
        return { text: `${cartView}\n*Alguma observação para o pedido?*\n\n_Digite a observação ou N para continuar._` };
    }

    return { text: '*Qual seu nome?*' };
}

/**
 * Handler: Observação do pedido
 */
async function handleObservation(params, cart, actions) {
    const { customerId, tenantId, message, settings } = params;

    for (const action of actions) {
        if (action.type === 'CANCEL' || message.toLowerCase() === 'n') {
            cart.observation = null;
            cartService.setState(tenantId, customerId, CART_STATES.PAYMENT);
            return { text: getPaymentMethodsMessage(settings, cart.total) };
        }

        if (action.type === 'BACK') {
            cartService.setState(tenantId, customerId, CART_STATES.BROWSING);
            const cartView = cartService.formatCartView(tenantId, customerId);
            return { text: `${cartView}\n${getMenuSubMessage()}` };
        }
    }

    if (message.trim().length > 0 && message.toLowerCase() !== 'n') {
        cart.observation = message.trim();
    }

    cartService.setState(tenantId, customerId, CART_STATES.PAYMENT);
    return { text: getPaymentMethodsMessage(settings, cart.total) };
}

/**
 * Handler: Forma de pagamento
 */
async function handlePayment(params, cart, actions) {
    const { customerId, tenantId, message, settings, db } = params;
    const msg = message.toLowerCase().trim();

    let paymentMethod = null;

    if (msg.includes('pix') || msg === '1') {
        paymentMethod = 'PIX';
    } else if (msg.includes('cartao') || msg.includes('cartão') || msg.includes('debito') || msg.includes('credito') || msg === '2') {
        paymentMethod = 'CREDIT_CARD'; // Simplificação: trata cartão como cartão de crédito por padrão
    } else if (msg.includes('dinheiro') || msg === '3') {
        paymentMethod = 'CASH';
        cartService.setState(tenantId, customerId, CART_STATES.CHANGE);
        return { text: '*Vai precisar de troco?*\n\n_Digite o valor da nota (ex: 50) ou N se não precisa de troco._' };
    }

    for (const action of actions) {
        if (action.type === 'BACK') {
            cartService.setState(tenantId, customerId, CART_STATES.OBSERVATION);
            return { text: '*Alguma observação para o pedido?*\n\n_Digite a observação ou N para continuar._' };
        }
    }

    if (paymentMethod) {
        cart.paymentMethod = paymentMethod;
        return await finalizeOrder(params, cart);
    }

    return { text: getPaymentMethodsMessage(settings, cart.total) };
}

/**
 * Handler: Troco
 */
async function handleChange(params, cart, actions) {
    const { customerId, tenantId, message } = params;
    const msg = message.toLowerCase().trim();

    if (msg === 'n' || msg === 'nao' || msg === 'não') {
        cart.change = null;
    } else {
        const value = parseFloat(msg.replace(',', '.'));
        if (!isNaN(value) && value > 0) {
            cart.change = value;
        }
    }

    cart.paymentMethod = 'CASH';
    return await finalizeOrder(params, cart);
}

/**
 * Handler: Pedido finalizado
 */
async function handleCompleted(params, cart, actions) {
    const { customerId, tenantId, settings } = params;
    const messages = settings?.directOrderMessages || {};

    for (const action of actions) {
        if (action.type === 'SHOW_PIX') {
            const pixKey = settings?.pixKey || 'Não configurado';
            return { text: `*Chave PIX:* ${pixKey}` };
        }

        if (action.type === 'HELP') {
            cartService.setState(tenantId, customerId, CART_STATES.SUPPORT);
            return { text: '*Precisa de ajuda? Digite sua dúvida que vamos responder em breve!*' };
        }

        if (action.type === 'RESET' || action.type === 'ADD_PRODUCT') {
            cartService.resetCart(tenantId, customerId);
            cartService.setState(tenantId, customerId, CART_STATES.BROWSING);
            return { text: messages.reset || 'Novo pedido iniciado! O que deseja?' };
        }
    }

    return {
        text: messages.completed || '*Seu pedido foi enviado!*\n\nDigite *pix* para ver a chave, *ajuda* para suporte ou *novo* para fazer outro pedido.'
    };
}

/**
 * Handler: Suporte
 */
async function handleSupport(params, cart, actions) {
    const { customerId, tenantId } = params;

    for (const action of actions) {
        if (action.type === 'BACK' || action.type === 'RESET') {
            cartService.setState(tenantId, customerId, CART_STATES.COMPLETED);
            return { text: 'Voltando ao menu. Digite *novo* para fazer outro pedido.' };
        }
    }

    return { text: '*Sua mensagem foi encaminhada para o restaurante!* Aguarde um momento.' };
}

/**
 * Finalizar pedido
 */
async function finalizeOrder(params, cart) {
    const { customerId, tenantId, db, settings } = params;

    try {
        // Gerar número do pedido (sequencial absoluto por tenant para evitar colisão)
        const countResult = await db.get(
            'SELECT MAX(order_number) as max_order FROM orders WHERE tenant_id = ?',
            [tenantId]
        );
        const orderNumber = (countResult?.max_order || 0) + 1;

        // Salvar pedido no banco
        // Salvar pedido no banco
        const { v4: uuidv4 } = await import('uuid');
        const orderId = uuidv4();

        // Calcular total final com taxa
        const deliveryFee = (cart.deliveryType === 'delivery' && cart.pendingFee) ? cart.pendingFee : 0;
        const finalTotal = cart.total + deliveryFee;

        const result = await db.run(`
            INSERT INTO orders (
                id, tenant_id, order_number, customer_name, customer_phone,
                items, delivery_type, address, payment_method, observation,
                subtotal, total, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'))
        `, [
            orderId,
            tenantId,
            orderNumber,
            cart.customerName || 'Cliente WhatsApp',
            customerId,
            JSON.stringify(cart.items),
            cart.deliveryType?.toUpperCase() || 'PICKUP',
            cart.address || null,
            cart.paymentMethod || 'CASH',
            cart.observation || null,
            cart.total,   // subtotal (itens)
            finalTotal    // total (itens + taxa)
        ]);

        // Atribuir ID gerado ao resultado para uso posterior
        result.lastID = orderId;

        // Marcar como finalizado
        cartService.setState(tenantId, customerId, CART_STATES.COMPLETED);

        // Montar mensagem de confirmação
        let response = `✅ *Pedido #${orderNumber} confirmado!*\n\n`;
        response += cartService.formatCartView(tenantId, customerId);

        if (cart.deliveryType === 'delivery' && cart.address) {
            response += `\n*📍 Entrega:* ${cart.address}`;
            if (deliveryFee > 0) {
                response += `\n*Taxa de Entrega:* R$ ${deliveryFee.toFixed(2).replace('.', ',')}`;
            }
        } else {
            response += `\n*🏪 Retirada no local*`;
        }

        response += `\n*💰 TOTAL FINAL: R$ ${finalTotal.toFixed(2).replace('.', ',')}*`;

        if (cart.observation) {
            response += `\n*📝 Obs:* ${cart.observation}`;
        }

        response += `\n*💳 Pagamento:* ${cart.paymentMethod}`;

        if (cart.change) {
            response += `\n*💵 Troco para:* R$ ${cart.change.toFixed(2).replace('.', ',')}`;
        }

        // Adicionar chave PIX se for pagamento PIX
        if (cart.paymentMethod === 'PIX' && settings?.pixKey) {
            response += `\n\n*Chave PIX:* ${settings.pixKey}`;
            response += `\n_Pague agora para agilizar o preparo!_`;
        }

        response += `\n\n*Agradecemos a preferência!*`;

        // Notificar grupo
        const groupNotification = cartService.formatOrderForGroup(tenantId, customerId);

        return {
            text: response,
            orderCreated: {
                id: result.lastID,
                orderNumber,
                groupNotification
            }
        };

    } catch (err) {
        console.error('[DirectOrder] Erro ao finalizar pedido:', err.message);
        return { text: 'Ops! Tive um problema ao finalizar. Pode tentar novamente?' };
    }
}

// ============ Mensagens Auxiliares ============

function getWelcomeMessage(settings, tenantSlug, customerId, baseUrl) {
    const msg = settings?.directOrderMessages?.welcome;

    // URL do cardápio (ajustar domínio conforme ambiente)
    // Se baseUrl foi passado (via index.js -> domínio customizado ou padrão), usa ele.
    // Fallback para hardcoded caso falhe.
    const rootUrl = baseUrl || `https://app.deliveryhub.com.br/loja/${tenantSlug}`;

    // Anexar parametro de customerId para auto-login (usando 'whatsapp' para compatibilidade com modo link)
    const catalogUrl = `${rootUrl}?whatsapp=${customerId || ''}`;

    if (msg) {
        // Se já tem mensagem customizada, apenas garantir que o link esteja lá ou adicionar
        // O usuário pediu "os dois", então vamos concatenar se não estiver presente
        if (msg.includes('http')) return msg;
        return `${msg}\n\n🔗 *Faça seu pedido também pelo link:*\n${catalogUrl}`;
    }

    return `Olá! Bem-vindo! 👋\n\nPosso te ajudar a fazer seu pedido por aqui ou você pode acessar nosso cardápio digital:\n\n🔗 ${catalogUrl}\n\n${getMenuSubMessage()}`;
}

function getMenuSubMessage() {
    return `*Para pedir:* _Diga o que deseja_\n` +
        `*Remover último:* _digite_ *c*\n` +
        `*Ver cardápio:* _cardápio_\n` +
        `*Finalizar:* _entrega_ ou _retirada_`;
}

function getHelpMessage() {
    return `*Como posso ajudar:*\n\n` +
        `📝 Diga o que quer pedir\n` +
        `❌ Digite *c* para remover o último item\n` +
        `📋 Digite *cardápio* para ver opções\n` +
        `🛒 Digite *entrega* ou *retirada* para finalizar\n` +
        `💰 Digite *pix* para ver a chave\n` +
        `🔄 Digite *reiniciar* para limpar o carrinho`;
}

function getPaymentMethodsMessage(settings, total) {
    const totalFormatted = (total || 0).toFixed(2).replace('.', ',');
    let msg = `💰 *TOTAL A PAGAR: R$ ${totalFormatted}*\n\n*Qual a forma de pagamento?*\n\n`;

    if (settings?.acceptPix !== false) msg += '*1* - PIX\n';
    if (settings?.acceptCard !== false) msg += '*2* - Cartão\n';
    if (settings?.acceptCash !== false) msg += '*3* - Dinheiro\n';

    return msg;
}

// ============ Handler de Localização ============

/**
 * Handler: Mensagem de localização (pin do WhatsApp)
 * Calcula taxa de entrega e salva localização para uso posterior
 */
async function handleLocationMessage(params, cart, location) {
    const { customerId, tenantId, db, settings } = params;

    try {
        console.log(`[DirectOrder] Calculando taxa para localização: ${location.latitude}, ${location.longitude}`);

        const deliveryService = new DeliveryService(db);
        const feeResult = await deliveryService.calculateFee(tenantId, {
            latitude: location.latitude,
            longitude: location.longitude
        });

        console.log(`[DirectOrder] Resultado do cálculo:`, feeResult);

        // Verificar se está fora da área de entrega
        if (feeResult.outOfRange) {
            return {
                text: `😔 *Infelizmente não entregamos nessa localização.*\n\nDistância: ${feeResult.distance?.toFixed(1) || '?'} km\nÁrea máxima: ${feeResult.maxDistance || '?'} km\n\nVocê pode tentar outro endereço ou optar por *retirada no local*.`
            };
        }

        // Salvar localização e taxa no carrinho para uso posterior
        cart.savedLocation = {
            latitude: location.latitude,
            longitude: location.longitude,
            fee: feeResult.fee,
            distance: feeResult.distance,
            formattedAddress: feeResult.formattedAddress || `📍 Localização (${feeResult.distance?.toFixed(1) || '?'}km)`
        };

        // Decidir resposta baseada no estado atual
        if (cart.state === CART_STATES.ADDRESS) {
            // Cliente já está no fluxo de checkout, aplicar localização e continuar
            cart.address = cart.savedLocation.formattedAddress;
            cart.pendingFee = feeResult.fee;
            cart.pendingDist = feeResult.distance;

            // Atualizar no banco
            await customerService.updateAddress(db, tenantId, customerId, cart.address);

            const cartView = cartService.formatCartView(tenantId, customerId);
            const totalWithFee = cart.total + feeResult.fee;

            return {
                text: `📍 *Localização recebida!*\n\n*Taxa de entrega:* R$ ${feeResult.fee.toFixed(2).replace('.', ',')}\n*Total final:* R$ ${totalWithFee.toFixed(2).replace('.', ',')}\n\n${cartView}\n\nDigite *S* para confirmar este endereço ou envie outro.`
            };
        }

        // Cliente perguntou taxa antes de fazer pedido
        if (cart.items.length === 0) {
            return {
                text: `📍 *Localização recebida!*\n\n*Taxa de entrega: R$ ${feeResult.fee.toFixed(2).replace('.', ',')}*\n\n✅ Vou lembrar dessa localização para seu pedido!\n\n${getMenuSubMessage()}`
            };
        }

        // Cliente tem itens no carrinho, mostrar nova taxa
        const cartView = cartService.formatCartView(tenantId, customerId);
        return {
            text: `📍 *Localização recebida!*\n\nDistância: ${feeResult.distance?.toFixed(1) || '?'} km\n*Taxa de entrega: R$ ${feeResult.fee.toFixed(2).replace('.', ',')}*\n\n${cartView}\n\nDigite *entrega* para finalizar ou continue adicionando itens.`
        };

    } catch (err) {
        console.error('[DirectOrder] Erro ao processar localização:', err);
        return {
            text: `*Não consegui calcular a taxa para essa localização.*\n\nPor favor, digite seu endereço ou tente enviar a localização novamente.`
        };
    }
}

export default {
    processMessage
};
