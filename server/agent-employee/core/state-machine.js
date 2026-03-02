// ============================================================
// Agent Employee - State Machine
// Máquina de estados principal do fluxo de atendimento
// ============================================================

import { AGENT_STATES, DEFAULT_MESSAGES, PAYMENT_METHODS } from '../config.js';
import * as cartService from '../services/cart-service.js';
import * as productMatcher from '../services/product-matcher.js';
import * as customerService from '../services/customer-service.js';
import { DeliveryService } from '../../services/delivery-service.js';
import { AIInterpreter } from './ai-interpreter.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Detectar tamanho (P, M, G) na mensagem do cliente
 */
function detectSizeInMessage(message) {
    const msg = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Padrões de tamanho (do mais específico para o menos)
    const sizePatterns = [
        { pattern: /\b(grande|tamanho g|tam g)\b/i, size: 'G' },
        { pattern: /\b(media|medio|tamanho m|tam m)\b/i, size: 'M' },
        { pattern: /\b(pequena|pequeno|tamanho p|tam p)\b/i, size: 'P' },
        { pattern: /\b(g)\b/i, size: 'G' },
        { pattern: /\b(m)\b/i, size: 'M' },
        { pattern: /\b(p)\b/i, size: 'P' }
    ];

    for (const { pattern, size } of sizePatterns) {
        if (pattern.test(msg)) {
            return size;
        }
    }

    return null;
}

/**
 * Processar mensagem e retornar resposta
 */
export async function processMessage(params) {
    const {
        message,
        customerId,
        tenantId,
        customerName,
        products,
        addons,
        buffet,
        settings,

        db,
        aiConfig,
        mediaData // { location, audio }
    } = params;

    // Obter sessão do cliente
    const session = cartService.getSession(tenantId, customerId);

    // Criar interpretador de IA
    const interpreter = new AIInterpreter(aiConfig);

    // Interpretar mensagem (Passando todos os itens conhecidos com tipos marcados)
    const allKnownItems = [
        ...(products || []).map(p => ({ ...p, _type: 'product' })),
        ...(addons || []).map(a => ({ ...a, _type: 'addon', category: 'Adicionais' }))
    ];

    console.log(`[AgentEmployee] Interpretando mensagem: "${message}"`);
    const intent = await interpreter.interpret(message, session.state, { products: allKnownItems });
    console.log(`[AgentEmployee] Intenção detectada: ${intent.type}`);

    // Aplicar dados extras da intenção (Salto de Estados Inteligente)
    if (intent.deliveryType && !session.deliveryType) {
        session.deliveryType = intent.deliveryType;
        console.log(`[AgentEmployee] Tipo de entrega detectado: ${intent.deliveryType}`);
    }
    if (intent.address && !session.address) {
        session.address = intent.address;
        console.log(`[AgentEmployee] Endereço detectado: ${intent.address}`);
    }
    if (intent.paymentMethod && !session.paymentMethod) {
        session.paymentMethod = intent.paymentMethod;
        console.log(`[AgentEmployee] Forma de pagamento detectada: ${intent.paymentMethod}`);
    }

    // Contexto compartilhado para geração de respostas
    const context = {
        message,
        customerName,
        storeName: settings?.storeName || 'Restaurante',
        employeeName: settings?.aiEmployee?.employeeName || 'Ana',
        cart: session,
        products,
        addons,
        buffet,
        lastIntent: intent,
        // Contexto do cliente (memória)
        customerContext: params.customerContext || {},
        customer: params.customer || null,
        location: mediaData?.location || null // Adicionar localização ao contexto
    };

    // SE INTERCEPTAR LOCALIZAÇÃO:
    if (context.location) {
        // Se enviou localização, calcular taxa e confirmar endereço
        const deliveryService = new DeliveryService(db);
        const feeResult = await deliveryService.calculateFee(tenantId, context.location);

        if (feeResult) {
            const address = feeResult.formattedAddress || `${context.location.latitude}, ${context.location.longitude}`;

            // Atualizar sessão
            session.address = address;
            session.deliveryFee = feeResult.fee;
            session.total = session.subtotal + session.deliveryFee;
            cartService.setState(tenantId, customerId, AGENT_STATES.ADDRESS); // Força para o estado de endereço
            console.log(`[AgentEmployee] Localização recebida. Endereço: ${address}, Taxa: ${feeResult.fee}`);
        }
    }

    // Processar por estado e delegar geração de texto
    let result;
    switch (session.state) {
        case AGENT_STATES.GREETING:
            result = await handleGreeting(params, session, intent, interpreter, context);
            break;
        case AGENT_STATES.ORDERING:
            result = await handleOrdering(params, session, intent, interpreter, context);
            break;
        case AGENT_STATES.DELIVERY_TYPE:
            result = await handleDeliveryType(params, session, intent, interpreter, context);
            break;
        case AGENT_STATES.ADDRESS:
            result = await handleAddress(params, session, intent, interpreter, context);
            break;
        case AGENT_STATES.NAME:
            result = await handleName(params, session, intent, interpreter, context);
            break;
        case AGENT_STATES.OBSERVATION:
            result = await handleObservation(params, session, intent, interpreter, context);
            break;
        case AGENT_STATES.PAYMENT:
            result = await handlePayment(params, session, intent, interpreter, context);
            break;
        case AGENT_STATES.CHANGE:
            result = await handleChange(params, session, intent, interpreter, context);
            break;
        case AGENT_STATES.COMPLETED:
            result = await handleCompleted(params, session, intent, interpreter, context);
            break;
        default:
            result = await handleGreeting(params, session, intent, interpreter, context);
    }

    return result;
}

// ============ Handlers por Estado ============

/**
 * Estado: GREETING - Saudação inicial
 */
async function handleGreeting(params, session, intent, interpreter, context) {
    const { tenantId, customerId, products, settings } = params;

    // Montar cardápio para o contexto
    const menuItems = (products || []).slice(0, 15).map(p =>
        `• *${p.name}* - R$ ${p.price.toFixed(2).replace('.', ',')}`
    ).join('\n');

    // Transição para ORDERING
    cartService.setState(tenantId, customerId, AGENT_STATES.ORDERING);

    // Se veio com pedido junto da saudação
    if (intent.type === 'ORDER' && intent.items?.length > 0) {
        return processOrderIntent(params, session, intent, interpreter, context);
    }

    // [NOVO] Adicionar link web logo na saudação com slug dinâmico
    const tenantSlug = settings?.slug || tenantId;
    const catalogUrl = settings?.aiEmployee?.catalogUrl;
    const domain = catalogUrl || `${process.env.APP_DOMAIN || 'localhost:3000'}/loja/${tenantSlug}`;
    const linkMsg = `\n\nSe preferir pedir mais rápido, acesse nosso cardápio digital: *${domain}* 📲`;

    const aiResponse = await interpreter.generateResponse(AGENT_STATES.GREETING, context);
    if (aiResponse) return { text: aiResponse + linkMsg };

    // Fallback manual
    return {
        text: DEFAULT_MESSAGES.greeting
            .replace('{employeeName}', context.employeeName)
            .replace('{storeName}', context.storeName)
            .replace('{menuItems}', menuItems) + linkMsg
    };
}

/**
 * Estado: ORDERING - Coletando itens
 */
async function handleOrdering(params, session, intent, interpreter, context) {
    const { tenantId, customerId, message, products, addons, buffet } = params;

    // Se quer ver cardápio
    if (intent.type === 'SHOW_MENU') {
        const menuItems = products.map(p => `• *${p.name}* - R$ ${p.price.toFixed(2).replace('.', ',')}`).join('\n');
        return { text: `📋 *Cardápio:*\n\n${menuItems}\n\nO que você gostaria?` };
    }

    // Se quer finalizar
    if (intent.type === 'FINALIZE_CART' || intent.type === 'CONFIRM') {
        if (session.items.length === 0) {
            return { text: 'Seu carrinho está vazio! 😅\n\nO que você gostaria de pedir?' };
        }
        return moveToDeliveryType(params, session, interpreter, context);
    }

    // Tentar encontrar produtos em todos os catálogos (Reutilizando a lista completa com tipos)
    const allKnownItems = [
        ...(products || []).map(p => ({ ...p, _type: 'product' })),
        ...(addons || []).map(a => ({ ...a, _type: 'addon', category: 'Adicionais' })),
        ...(buffet || []).map(b => ({ ...b, name: b.nome, _type: 'buffet', category: 'Buffet', price: 0 }))
    ];

    const foundProducts = productMatcher.findProductsInMessage(message, allKnownItems);
    console.log(`[AgentEmployee] foundByRegex:`, foundProducts.map(r => ({ name: r.product.name, q: r.quantity })));

    let anyAdded = false;

    // Unificar resultados: Regex (prioritário para quantidades exatas) + AI (bom para itens perdidos)
    const finalFound = [];

    // 1. Processar itens encontrados pela Regex e tentar enriquecer com dados da IA
    for (const regexItem of foundProducts) {
        let observation = regexItem.observation || '';
        let aiAddons = [];

        if (intent.type === 'ORDER' && intent.items?.length > 0) {
            // Tentar achar este item na resposta da IA (pelo nome ou se a IA detectou como item)
            const aiItem = intent.items.find(i =>
                productMatcher.normalizeText(i.name).includes(productMatcher.normalizeText(regexItem.product.name)) ||
                productMatcher.normalizeText(regexItem.product.name).includes(productMatcher.normalizeText(i.name))
            );

            if (aiItem) {
                // Se a IA extraiu observação, validar se ela existe no texto (evitar alucinação)
                if (aiItem.observation) {
                    const obsNormalized = aiItem.observation.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    const msgNormalized = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    if (!msgNormalized.includes(obsNormalized)) {
                        console.log(`[AgentEmployee] Alucinação detectada e removida: "${aiItem.observation}"`);
                        aiItem.observation = null;
                    }
                }
                // Priorizar observação da IA se validada, senão manter a da regex
                observation = aiItem.observation || observation;

                // Mapear adicionais da IA para este item
                if (aiItem.modifiers && Array.isArray(aiItem.modifiers)) {
                    for (const modName of aiItem.modifiers) {
                        const mod = productMatcher.findProduct(modName, allKnownItems);
                        if (mod && (mod._type === 'addon' || mod._type === 'buffet')) {
                            aiAddons.push(mod);
                        } else if (modName.toLowerCase().includes('sem') || modName.toLowerCase().includes('não') || modName.length > 3) {
                            // Se não for um produto mas parecer uma observação, adicionar ao texto de observação
                            observation += (observation ? ', ' : '') + modName;
                        }
                    }
                }
            }
        }

        finalFound.push({
            product: regexItem.product,
            quantity: regexItem.quantity,
            addons: aiAddons.length > 0 ? aiAddons : (regexItem.addons || []),
            observation: observation || ''
        });
    }

    // 2. Adicionar itens que SÓ a IA encontrou (e a Regex falhou)
    if (intent.type === 'ORDER' && intent.items?.length > 0) {
        for (const item of intent.items) {
            const product = productMatcher.findProduct(item.name, allKnownItems);

            // [SEGURANÇA] Validar se o produto realmente é mencionado na mensagem (Anti-Alucinação)
            let isPresent = false;
            if (product) {
                const productNameNorm = productMatcher.normalizeText(product.name);
                const messageNorm = productMatcher.normalizeText(message);
                // Verifica se o nome do produto ou as palavras do nome estão na mensagem
                isPresent = messageNorm.includes(productNameNorm) ||
                    productNameNorm.split(' ').some(word => word.length > 3 && messageNorm.includes(word));
            }

            // Só adiciona se não foi pego pela Regex E se foi validado como presente na mensagem
            if (product && isPresent && product._type === 'product' && !finalFound.some(f => f.product.id === product.id)) {
                console.log(`[AgentEmployee] AI found valid item Regex missed: ${product.name}`);

                const itemAddons = [];
                let aiObservation = item.observation || '';
                if (aiObservation) {
                    const obsNormalized = aiObservation.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    const msgNormalized = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    if (!msgNormalized.includes(obsNormalized)) {
                        console.log(`[AgentEmployee] Alucinação detectada e removida (Solo AI): "${aiObservation}"`);
                        aiObservation = '';
                    }
                }

                if (item.modifiers && Array.isArray(item.modifiers)) {
                    for (const modName of item.modifiers) {
                        const mod = productMatcher.findProduct(modName, allKnownItems);
                        if (mod && (mod._type === 'addon' || mod._type === 'buffet')) {
                            itemAddons.push(mod);
                        } else if (modName.toLowerCase().includes('sem') || modName.toLowerCase().includes('não') || modName.length > 3) {
                            aiObservation += (aiObservation ? ', ' : '') + modName;
                        }
                    }
                }

                finalFound.push({
                    product,
                    quantity: item.quantity || 1,
                    addons: itemAddons,
                    observation: aiObservation
                });
            }
        }
    }

    if (finalFound.length > 0) {
        // Separar produtos principais de adicionais
        const mainItems = finalFound.filter(r => r.product._type === 'product');
        const addons = finalFound.filter(r => r.product._type === 'addon' || r.product._type === 'buffet');
        // console.log(`[AgentEmployee] mainItems:`, mainItems.length, `addons:`, addons.length);

        // Detectar tamanho na mensagem
        const detectedSize = detectSizeInMessage(message);

        if (mainItems.length > 0) {
            // Adicionar cada produto principal
            for (const { product, quantity, addons: aiItemAddons, observation } of mainItems) {
                // [FIX] Não aplicar TODOS os adicionais da mensagem a todos os produtos.
                // Se temos apenas UM item principal, podemos ser mais flexíveis.
                // Se temos vários, confiamos apenas nos adicionais que a IA vinculou a este item específico.

                let finalAddons = [];

                if (mainItems.length === 1) {
                    // Caso simples: 1 item, aplica tudo que foi achado de adicional
                    finalAddons = [...addons.map(m => m.product)];
                }

                // Adicionar adicionais específicos vindos da IA para este item
                if (aiItemAddons && Array.isArray(aiItemAddons)) {
                    aiItemAddons.forEach(am => {
                        if (!finalAddons.some(m => m.id === am.id)) {
                            finalAddons.push(am);
                        }
                    });
                }

                let appliedSize = null;
                const pNameLow = product.name.toLowerCase();
                if (detectedSize && (pNameLow.includes('açai') || pNameLow.includes('acai') || pNameLow.includes('marmita') || pNameLow.includes('pizza'))) {
                    appliedSize = detectedSize;
                }

                console.log(`[AgentEmployee] Adding main item ${product.name} q:${quantity}, size: ${appliedSize || 'N/A'}, addons: ${finalAddons.length}, obs: ${observation || 'none'}`);

                cartService.addItem(tenantId, customerId, {
                    product,
                    quantity,
                    addons: finalAddons,
                    size: appliedSize,
                    observation: observation || ''
                });
                anyAdded = true;
            }
        } else if (addons.length > 0) {
            // Se só tem adicionais, tenta adicionar ao último item do carrinho
            const currentSession = cartService.getSession(tenantId, customerId);
            if (currentSession.items.length > 0) {
                const lastItem = currentSession.items[currentSession.items.length - 1];
                addons.forEach(mod => {
                    if (!lastItem.addons?.some(m => m.id === mod.product.id)) {
                        lastItem.addons = lastItem.addons || [];
                        lastItem.addons.push({
                            id: mod.product.id,
                            name: mod.product.name,
                            price: mod.product.price || 0
                        });
                        // Recalcular total do item (itemUnitPrice * quantity)
                        const addonsTotal = lastItem.addons.reduce((sum, m) => sum + (m.price || 0), 0);
                        lastItem.total = (lastItem.price + addonsTotal) * lastItem.quantity;
                        anyAdded = true;
                    }
                });
                if (anyAdded) {
                    currentSession.subtotal = currentSession.items.reduce((sum, item) => sum + item.total, 0);
                    currentSession.total = currentSession.subtotal + (currentSession.deliveryFee || 0);
                }
            } else {
                // Adiciona como item principal se não houver anterior
                for (const { product, quantity } of addons) {
                    cartService.addItem(tenantId, customerId, { product, quantity });
                    anyAdded = true;
                }
            }
        }
    }

    if (anyAdded) {
        const updatedSession = cartService.getSession(tenantId, customerId);
        context.cart = updatedSession;

        const cartView = cartService.formatCart(tenantId, customerId);
        return {
            text: `Ótimo, adicionei à sacola! 🍔\n\n${cartView}\n\nDeseja algo mais ou podemos fechar o pedido?`
        };
    }

    // Se não encontrou nada mas IA achou que era pedido - sugerir
    if (intent.type === 'ORDER' && intent.items?.length > 0) {
        const firstItem = intent.items[0]?.name;
        const suggestions = productMatcher.getSuggestions(firstItem, products);
        if (suggestions.length > 0) {
            const suggestionList = suggestions.map(p => `• *${p.name}* - R$ ${p.price.toFixed(2).replace('.', ',')}`).join('\n');
            return {
                text: DEFAULT_MESSAGES.itemNotFound
                    .replace('{itemName}', firstItem)
                    .replace('{suggestions}', suggestionList)
            };
        }
    }

    // Fallback IA
    const aiFallback = await interpreter.generateResponse(AGENT_STATES.ORDERING, context);
    if (aiFallback) return { text: aiFallback };

    const menuItems = products.slice(0, 10).map(p =>
        `• *${p.name}* - R$ ${p.price.toFixed(2).replace('.', ',')}`
    ).join('\n');

    return {
        text: `Desculpe, não entendi muito bem. 😅\n\n📋 *Aqui está nosso cardápio:*\n${menuItems}\n\nO que você gostaria de pedir?`
    };
}

/**
 * Transição para DELIVERY_TYPE
 */
async function moveToDeliveryType(params, session, interpreter, context) {
    const { tenantId, customerId, settings } = params;
    const { customerContext } = context;

    console.log('[DEBUG] moveToDeliveryType -> settings.allow_pickup =', settings?.allow_pickup, typeof settings?.allow_pickup);

    // [NOVO] Se retirada NÃO estiver permitida, pular direto para coleta de endereço
    if (settings && settings.allow_pickup === false) {
        console.log(`[AgentEmployee] Retirada desabilitada para o tenant ${tenantId}. Pulando para ADDRESS.`);
        session.deliveryType = 'delivery';
        cartService.setState(tenantId, customerId, AGENT_STATES.ADDRESS);

        // Fast-track: Verifica último endereço
        const lastAddr = customerContext?.lastAddress;
        if (lastAddr) {
            const addrStr = typeof lastAddr === 'object' ? (lastAddr.full || lastAddr.street || JSON.stringify(lastAddr)) : lastAddr;
            return {
                text: `Ótimo! Tudo anotado. 🍔\n\nSua última entrega foi no endereço:\n*${addrStr}*\n\nQuer entregar neste mesmo endereço ou é em outro lugar hoje? (Responda "Sim" para confirmar ou envie o novo endereço)`
            };
        }

        const cartView = cartService.formatCart(tenantId, customerId);
        return {
            text: `Ótimo! Tudo anotado. 🍔\n\n${cartView}\n\nPara o envio, qual seria o seu *endereço*?`
        };
    }

    cartService.setState(tenantId, customerId, AGENT_STATES.DELIVERY_TYPE);

    const cartView = cartService.formatCart(tenantId, customerId);
    return {
        text: `Ótimo! Tudo anotado. 🍔\n\n${cartView}\n\nPara o envio, você vai querer *Entrega* ou virá fazer a *Retirada*?`
    };
}

/**
 * Estado: DELIVERY_TYPE - Entrega ou Retirada
 */
async function handleDeliveryType(params, session, intent, interpreter, context) {
    const { tenantId, customerId, message, db, settings } = params;
    const msgLower = message.toLowerCase().trim();

    // [NOVO] Detecção inteligente de endereço implícito
    // Se o cliente já mandar a rua, assume 'delivery' e pula para ADDRESS
    const isAddressPattern = /\b(rua|av|avenida|estrada|travessa|alameda|rodovia|condominio|bloco|apto|apartamento)\b/i.test(msgLower) ||
        (/\d+/.test(msgLower) && msgLower.length > 10);

    if (!session.deliveryType && isAddressPattern) {
        console.log(`[AgentEmployee] Endereço implícito detectado no estado DELIVERY_TYPE: "${message}"`);
        session.deliveryType = 'delivery';
    }

    // Se já temos deliveryType (vido da extração global ou mensagem anterior)
    if (session.deliveryType || intent.type === 'DELIVERY' || intent.type === 'PICKUP') {
        if (!session.deliveryType) {
            session.deliveryType = intent.type === 'DELIVERY' ? 'delivery' : 'pickup';
        }

        // [NOVO] Validar se o tipo escolhido é permitido
        if (session.deliveryType === 'pickup' && settings && settings.allow_pickup === false) {
            session.deliveryType = null;
            return { text: 'Desculpe, mas no momento não estamos aceitando retiradas no local. 😔\n\nPodemos fazer a entrega do seu pedido?' };
        }

        if (session.deliveryType === 'delivery') {
            // Sempre ir para o estado ADDRESS para confirmar ou pedir endereço
            cartService.setState(tenantId, customerId, AGENT_STATES.ADDRESS);

            // [FIX] Processar o endereço IMEDIATAMENTE se estiver na mesma mensagem
            const addressResponse = await handleAddress(params, session, intent, interpreter, context);
            return addressResponse;
        } else {
            session.deliveryFee = 0;
            cartService.setState(tenantId, customerId, AGENT_STATES.NAME);
            // Delega para o handleName que já tem a lógica de pulo pre-processada
            return await handleName({ ...params, message: '' }, session, { type: 'UNKNOWN' }, interpreter, context);
        }
    }

    return { text: 'Vai ser *entrega* ou você prefere vir *retirar*? 🏠📦' };
}

/**
 * Estado: ADDRESS - Coletando endereço
 */
async function handleAddress(params, session, intent, interpreter, context) {
    const { tenantId, customerId, message, settings, db } = params;
    const { customerContext, location } = context;

    // SE RECEBEU LOCALIZAÇÃO (via anexo do WhatsApp)
    if (location) {
        console.log(`[handleAddress] Processing location attachment:`, location);

        try {
            const deliveryService = new DeliveryService(db);
            const feeResult = await deliveryService.calculateFee(tenantId, location);

            if (feeResult) {
                const addressText = feeResult.formattedAddress || `${location.latitude}, ${location.longitude}`;
                const fee = feeResult.fee || 0;

                // Padronizar endereço como objeto para o frontend
                const addressObj = { street: addressText };
                session.address = addressObj;
                await updateCustomerAddress(db, tenantId, customerId, JSON.stringify(addressObj));
                cartService.setDeliveryFee(tenantId, customerId, fee);

                const feeMsg = fee > 0 ? `Taxa de entrega: R$ ${fee.toFixed(2).replace('.', ',')}` : 'Entrega grátis!';

                // Responder e avançar
                cartService.setState(tenantId, customerId, AGENT_STATES.NAME); // Avança

                return {
                    text: `📍 Recebi sua localização!\n*${addressText}*\n${feeMsg}\n\nPodemos continuar? Qual seu nome?`
                };
            }
        } catch (err) {
            console.error('[handleAddress] Error processing location:', err);
        }
    }

    // Se já temos endereço (capturado globalmente ou no BD)
    if (session.address) {
        const fee = parseFloat(settings?.deliveryFee) || 5;
        cartService.setDeliveryFee(tenantId, customerId, fee);
        cartService.setState(tenantId, customerId, AGENT_STATES.NAME);
        return await handleName(params, session, intent, interpreter, context);
    }

    // 4. Se cliente digitou novo endereço (Explicitamente ou via detecção de texto longo)
    if (intent.type === 'ADDRESS_INPUT' || (message.trim().length > 10 && !/^(sim|s|ok|mesmo|isso|nao|não)/i.test(message.trim()))) {
        const addressText = intent.address || message.trim();
        const addressObj = { street: addressText };
        session.address = addressObj;
        await updateCustomerAddress(db, tenantId, customerId, JSON.stringify(addressObj));
        const fee = parseFloat(settings?.deliveryFee) || 5;
        cartService.setDeliveryFee(tenantId, customerId, fee);

        cartService.setState(tenantId, customerId, AGENT_STATES.NAME);
        return await handleName({ ...params, message: '' }, session, { type: 'UNKNOWN' }, interpreter, context);
    }

    // 5. Se cliente tem último endereço e ainda não definiu o atual, oferecer
    if (customerContext?.lastAddress && !session.address) {
        const lastAddr = typeof customerContext.lastAddress === 'object'
            ? customerContext.lastAddress.full || customerContext.lastAddress.street || JSON.stringify(customerContext.lastAddress)
            : customerContext.lastAddress;

        // Se a mensagem for "Sim" ou similar, já confirma
        if (intent.type === 'CONFIRM' || /^(sim|s|ok|mesmo|isso)/i.test(message.trim())) {
            const addressObj = typeof lastAddr === 'string' ? { street: lastAddr } : lastAddr;
            session.address = addressObj;
            await updateCustomerAddress(db, tenantId, customerId, JSON.stringify(addressObj));
            const fee = parseFloat(settings?.deliveryFee) || 5;
            cartService.setDeliveryFee(tenantId, customerId, fee);
            cartService.setState(tenantId, customerId, AGENT_STATES.NAME);
            return await handleName({ ...params, message: '' }, session, { type: 'UNKNOWN' }, interpreter, context);
        }

        // Se não for confirmação nem endereço novo, oferece o antigo
        return {
            text: `📍 Entregar no mesmo endereço de antes?\n\n*${lastAddr}*\n\nResponda *Sim* ou digite um novo endereço.`
        };
    }

    // 6. Fallback: pedir endereço
    return { text: DEFAULT_MESSAGES.askAddress };
}

/**
 * Estado: NAME - Coletando nome
 */
async function handleName(params, session, intent, interpreter, context) {
    const { tenantId, customerId, message, db } = params;
    const { customerContext } = context;

    // Usar nome do contexto do cliente (já carregado em index.js)
    if (customerContext?.storedName) {
        session.customerName = customerContext.storedName;
        cartService.setState(tenantId, customerId, AGENT_STATES.OBSERVATION);
        return await handleObservation(params, session, intent, interpreter, context);
    }

    // Fallback: buscar do banco diretamente
    const customer = await getCustomerData(db, tenantId, customerId);
    const isGeneric = !customer?.name || ['Cliente', 'Cliente WhatsApp', 'Usuário'].includes(customer.name);
    if (!isGeneric) {
        session.customerName = customer.name;
        cartService.setState(tenantId, customerId, AGENT_STATES.OBSERVATION);
        return { text: 'Deseja adicionar alguma observação geral (Ex: troco, sem campainha)?' };
    }

    if (message.trim().length >= 2 && intent.type !== 'CONFIRM') {
        session.customerName = message.trim();
        await updateCustomerName(db, tenantId, customerId, session.customerName);
        cartService.setState(tenantId, customerId, AGENT_STATES.OBSERVATION);
        return { text: 'Deseja adicionar alguma observação geral (Ex: troco, sem campainha)?' };
    }

    return { text: 'Ótimo! Para quem é o pedido? Como posso te chamar? 🗣️' };
}

/**
 * Estado: OBSERVATION - Coletando observação
 */
async function handleObservation(params, session, intent, interpreter, context) {
    const { tenantId, customerId, message } = params;

    if (intent.type === 'DENY' || message.toLowerCase().includes('nao') || message.toLowerCase().includes('não')) {
        session.observation = null;
    } else if (message.trim().length > 0 && intent.type !== 'CONFIRM') {
        session.observation = message.trim();
    }

    if (session.deliveryType === 'pickup') {
        session.paymentMethod = 'LOCAL'; // Alinhado com orders.js (LOCAL vira CASH ou é tratado como retirada)
        return await finalizeOrder(params, session);
    }

    cartService.setState(tenantId, customerId, AGENT_STATES.PAYMENT);

    const updatedSession = cartService.getSession(tenantId, customerId);
    const cartView = cartService.formatCart(tenantId, customerId);
    return { text: `Tudo certo!\n\n${cartView}\n\nO total é de R$ ${updatedSession.total.toFixed(2).replace('.', ',')}.\nQual a forma de pagamento (Pix, Cartão ou Dinheiro)? 💸` };
}

/**
 * Estado: PAYMENT - Forma de pagamento
 */
async function handlePayment(params, session, intent, interpreter, context) {
    const { tenantId, customerId } = params;

    if (session.paymentMethod || intent.type === 'PAYMENT') {
        if (!session.paymentMethod && intent.method) {
            session.paymentMethod = intent.method;
        }

        if (session.paymentMethod === 'CASH') {
            cartService.setState(tenantId, customerId, AGENT_STATES.CHANGE);
            const aiResponse = await interpreter.generateResponse(AGENT_STATES.CHANGE, context);
            return { text: aiResponse || DEFAULT_MESSAGES.askChange };
        }

        return await finalizeOrder(params, session);
    }

    const updatedSession = cartService.getSession(tenantId, customerId);
    context.cart = updatedSession;
    const cartView = cartService.formatCart(tenantId, customerId);
    return {
        text: `Qual a forma de pagamento (Pix, Cartão ou Dinheiro)? 💸\nO total é de R$ ${updatedSession.total.toFixed(2).replace('.', ',')}`
    };
}

/**
 * Estado: CHANGE - Troco
 */
async function handleChange(params, session, intent, interpreter, context) {
    const { message } = params;

    if (intent.type === 'DENY') {
        session.change = null;
    } else {
        const value = parseFloat(message.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (!isNaN(value)) session.change = value;
    }

    session.paymentMethod = 'CASH';
    return await finalizeOrder(params, session);
}

/**
 * Estado: COMPLETED - Pedido finalizado
 */
async function handleCompleted(params, session, intent) {
    const { tenantId, customerId } = params;

    if (intent.type === 'RESET' || intent.type === 'GREETING') {
        cartService.resetSession(tenantId, customerId);
        cartService.setState(tenantId, customerId, AGENT_STATES.ORDERING);
        return { text: '🔄 Novo pedido iniciado! O que você gostaria?' };
    }

    return { text: '✅ Seu pedido já foi registrado! Digite *novo* para fazer outro pedido.' };
}

// ============ Funções Auxiliares ============

async function finalizeOrder(params, session) {
    const { tenantId, customerId, db, settings } = params;

    try {
        const countResult = await db.get('SELECT MAX(order_number) as max_order FROM orders WHERE tenant_id = ?', [tenantId]);
        const orderNumber = (countResult?.max_order || 0) + 1;
        const finalSession = cartService.getSession(tenantId, customerId);

        const orderId = uuidv4();
        // const now = new Date().toISOString(); // SQLite lida com default CURRENT_TIMESTAMP se configurado, mas mantendo a lógica de negócio aqui se necessário. 
        // No entanto, as colunas do Orders Route sugerem outro padrão.

        await db.run(`
            INSERT INTO orders (
                id, tenant_id, customer_id, order_number, customer_name, customer_phone,
                items, delivery_type, address, payment_method, observation,
                payment_change, subtotal, delivery_fee, total, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `, [
            orderId, tenantId, finalSession.customerId || null, orderNumber, finalSession.customerName || 'Cliente WhatsApp',
            customerId, JSON.stringify(finalSession.items), finalSession.deliveryType?.toUpperCase() || 'PICKUP',
            finalSession.address ? (typeof finalSession.address === 'string' ? finalSession.address : JSON.stringify(finalSession.address)) : null,
            finalSession.paymentMethod || 'CASH', finalSession.observation || null,
            finalSession.change || 0, finalSession.subtotal, finalSession.deliveryFee || 0, finalSession.total
        ]);

        // [NEW] Sempre atualizar o nome e dados do cliente no banco ao finalizar
        if (finalSession.customerName && !['Cliente', 'Cliente WhatsApp', 'Usuário'].includes(finalSession.customerName)) {
            await updateCustomerName(db, tenantId, customerId, finalSession.customerName);
        }
        await customerService.incrementOrderStats(db, finalSession.customerId || customerId, finalSession.total);

        cartService.setState(tenantId, customerId, AGENT_STATES.COMPLETED);

        const cartView = cartService.formatCart(tenantId, customerId);
        const addressDisplay = finalSession.address ? (typeof finalSession.address === 'string' ? finalSession.address : (finalSession.address.street || finalSession.address.formatted || JSON.stringify(finalSession.address))) : 'Não informado';
        let deliveryInfo = finalSession.deliveryType === 'delivery' ? `📍 *Entrega:* ${addressDisplay}\n🚗 *Taxa:* R$ ${finalSession.deliveryFee.toFixed(2).replace('.', ',')}` : '🏪 *Retirada no local*';
        let pixInfo = (finalSession.paymentMethod === 'PIX' && settings?.pixKey) ? `\n💰 *Chave PIX:* ${settings.pixKey}\n_Pague agora para agilizar o preparo!_` : '';

        const confirmation = DEFAULT_MESSAGES.orderConfirmed
            .replace('{orderNumber}', orderNumber)
            .replace('{customerName}', finalSession.customerName || 'Cliente')
            .replace('{cartItems}', cartView)
            .replace('{deliveryInfo}', deliveryInfo)
            .replace('{total}', finalSession.total.toFixed(2).replace('.', ','))
            .replace('{paymentMethod}', PAYMENT_METHODS[finalSession.paymentMethod] || finalSession.paymentMethod)
            .replace('{observation}', finalSession.observation || 'Nenhuma')
            .replace('{pixInfo}', pixInfo);

        return { text: confirmation, orderCreated: { ...finalSession, id: orderId, orderNumber } };

    } catch (err) {
        console.error('[AgentEmployee] Erro CRÍTICO ao finalizar pedido:', err);
        return { text: 'Ops! Tive um problema ao finalizar. Pode tentar novamente?' };
    }
}

async function processOrderIntent(params, session, intent, interpreter, context) {
    const { tenantId, customerId, products, addons, buffet, message } = params;

    // Reconstruir lista completa para o matcher
    const allKnownItems = [
        ...(products || []).map(p => ({ ...p, _type: 'product' })),
        ...(addons || []).map(a => ({ ...a, _type: 'addon', category: 'Adicionais' }))
    ];

    // Tentar encontrar produtos na mensagem bruta primeiro (para suportar modificadores)
    const foundProducts = productMatcher.findProductsInMessage(message, allKnownItems);
    let anyAdded = false;

    if (foundProducts.length > 0) {
        const mainItems = foundProducts.filter(r => r.product._type === 'product');
        const modifiers = foundProducts.filter(r => r.product._type === 'addon' || r.product._type === 'buffet');

        if (mainItems.length > 0) {
            for (const { product, quantity } of mainItems) {
                cartService.addItem(tenantId, customerId, {
                    product,
                    quantity,
                    addons: modifiers.map(m => m.product)
                });
                anyAdded = true;
            }
        } else {
            // Se só tem adicionais (ou nenhum mainItem identificado na mensagem bruta), tenta usar o item da IA
            for (const item of intent.items || []) {
                const product = productMatcher.findProduct(item.name, allKnownItems);
                if (product) {
                    cartService.addItem(tenantId, customerId, { product, quantity: item.quantity || 1 });
                    anyAdded = true;
                }
            }
        }
    } else {
        // Fallback para itens da IA
        for (const item of intent.items || []) {
            const product = productMatcher.findProduct(item.name, allKnownItems);
            if (product) {
                cartService.addItem(tenantId, customerId, { product, quantity: item.quantity || 1 });
                anyAdded = true;
            }
        }
    }

    const updatedSession = cartService.getSession(tenantId, customerId);
    if (updatedSession.items.length > 0) {
        context.cart = updatedSession;
        const aiResponse = await interpreter.generateResponse(AGENT_STATES.ORDERING, context);
        if (aiResponse) {
            const cartView = cartService.formatCart(tenantId, customerId);
            return { text: `${aiResponse}\n\n${cartView}` };
        }

        const cartView = cartService.formatCart(tenantId, customerId);
        return { text: DEFAULT_MESSAGES.itemAdded.replace('{cartItems}', cartView).replace('{subtotal}', updatedSession.subtotal.toFixed(2).replace('.', ',')) };
    }

    return handleGreeting(params, session, { type: 'GREETING' }, interpreter, context);
}

// ============ Funções de Banco ============

async function getCustomerData(db, tenantId, customerId) {
    return await db.get('SELECT * FROM customers WHERE tenant_id = ? AND phone = ?', [tenantId, customerId]);
}

async function updateCustomerAddress(db, tenantId, customerId, address) {
    const existing = await getCustomerData(db, tenantId, customerId);
    if (existing) await db.run('UPDATE customers SET address = ? WHERE id = ?', [address, existing.id]);
}

async function updateCustomerName(db, tenantId, customerId, name) {
    const existing = await getCustomerData(db, tenantId, customerId);
    if (existing) {
        await db.run('UPDATE customers SET name = ? WHERE id = ?', [name, existing.id]);
    } else {
        await db.run('INSERT INTO customers (id, tenant_id, phone, name, created_at) VALUES (?, ?, ?, ?, datetime("now"))', [uuidv4(), tenantId, customerId, name]);
    }
}

export default { processMessage };
