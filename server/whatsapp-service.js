// ============================================================
// WhatsApp Service - DeliveryHub SaaS
// Autor: killsis (Lucas Larocca)
// ============================================================

import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import qrcodeImage from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleConversation } from './services/conversation-handler.js';
import { getCacheService } from './services/cache-service.js';
import { getBackupService } from './services/backup-service.js';

const { Client, LocalAuth } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caminho para salvar as sessoes
const SESSIONS_DIR = path.join(__dirname, 'whatsapp-sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

class WhatsAppService {
    constructor(db) {
        this.db = db;
        this.clients = new Map(); // tenantId -> client
        this.qrCodes = new Map(); // tenantId -> qrCode
        this.statuses = new Map(); // tenantId -> status
        this.welcomeLogs = new Map(); // tenantId -> { whatsappId -> timestamp }

        // Intervalo (em horas) para reenvio do welcome
        this.welcomeResendHours = parseFloat(process.env.WELCOME_RESEND_HOURS || '12');

        // Debug mode por tenant
        this.debugMode = new Map(); // tenantId -> boolean

        // Admin WhatsApp IDs (podem executar comandos)
        this.adminNumbers = new Set();

        // Cache service
        this.cacheService = getCacheService();

        // Auto-reconnect settings
        this.autoReconnectEnabled = true;
        this.healthCheckInterval = null;
        this.reconnectAttempts = new Map(); // tenantId -> attempts
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 30000; // 30 segundos
    }

    /**
     * Auto-reconectar todos os tenants ativos ao iniciar servidor
     */
    async autoReconnectAll() {
        console.log('[WhatsApp] Iniciando auto-reconnect de todos os tenants...');

        try {
            // Buscar todos os tenants ativos com WhatsApp configurado
            const tenants = await this.db.all(`
                SELECT id, name, settings 
                FROM tenants 
                WHERE status = 'ACTIVE'
            `);

            for (const tenant of tenants) {
                const settings = JSON.parse(tenant.settings || '{}');

                // Verificar se tem bot habilitado (IA ou basico)
                if (settings.whatsappBotEnabled || settings.aiBot?.enabled) {
                    console.log(`[WhatsApp] Auto-conectando tenant: ${tenant.name} (${tenant.id})`);

                    try {
                        await this.initializeForTenant(tenant.id);
                    } catch (err) {
                        console.error(`[WhatsApp] Erro ao conectar ${tenant.id}:`, err.message);
                    }

                    // Pequeno delay entre conexoes para nao sobrecarregar
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            // Iniciar health check periodico
            this.startHealthCheck();

            console.log('[WhatsApp] Auto-reconnect concluido');
        } catch (error) {
            console.error('[WhatsApp] Erro no auto-reconnect:', error.message);
        }
    }

    /**
     * Iniciar verificacao periodica de saude das conexoes
     */
    startHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Verificar a cada 5 minutos
        this.healthCheckInterval = setInterval(async () => {
            await this.checkConnectionsHealth();
        }, 5 * 60 * 1000);

        console.log('[WhatsApp] Health check iniciado (intervalo: 5 min)');
    }

    /**
     * Verificar saude de todas as conexoes e reconectar se necessario
     */
    async checkConnectionsHealth() {
        for (const [tenantId, status] of this.statuses) {
            if (status === 'disconnected' && this.autoReconnectEnabled) {
                const attempts = this.reconnectAttempts.get(tenantId) || 0;

                if (attempts < this.maxReconnectAttempts) {
                    console.log(`[WhatsApp] Reconectando tenant ${tenantId} (tentativa ${attempts + 1})`);
                    this.reconnectAttempts.set(tenantId, attempts + 1);

                    try {
                        await this.initializeForTenant(tenantId);
                        this.reconnectAttempts.set(tenantId, 0); // Reset em caso de sucesso
                    } catch (err) {
                        console.error(`[WhatsApp] Falha ao reconectar ${tenantId}:`, err.message);
                    }
                }
            }
        }
    }

    // Inicializar cliente para um tenant especifico
    async initializeForTenant(tenantId) {
        if (this.clients.has(tenantId)) {
            console.log(`WhatsApp client ja existe para tenant ${tenantId}`);
            return;
        }

        const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        if (!tenant) {
            throw new Error('Tenant nao encontrado');
        }

        const settings = JSON.parse(tenant.settings || '{}');

        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: `tenant-${tenantId}`,
                dataPath: SESSIONS_DIR
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ]
            }
        });

        // QR Code
        client.on('qr', async qr => {
            console.log(`QR Code para tenant ${tenantId}:`);
            qrcode.generate(qr, { small: true });
            this.qrCodes.set(tenantId, qr);
            this.statuses.set(tenantId, 'qr_ready');
        });

        // Ready
        client.on('ready', () => {
            console.log(`WhatsApp pronto para tenant ${tenantId}`);
            this.statuses.set(tenantId, 'connected');
            this.qrCodes.delete(tenantId);
        });

        // Desconectado
        client.on('disconnected', (reason) => {
            console.log(`WhatsApp desconectado para tenant ${tenantId}:`, reason);
            this.statuses.set(tenantId, 'disconnected');
            this.clients.delete(tenantId);
        });

        // Mensagens recebidas
        client.on('message', async message => {
            await this.handleMessage(tenantId, message, settings);
        });

        this.clients.set(tenantId, client);
        this.statuses.set(tenantId, 'initializing');

        client.initialize();
        console.log(`Inicializando WhatsApp para tenant ${tenantId}`);
    }

    // Verificar se deve enviar welcome
    shouldSendWelcome(tenantId, whatsappId) {
        const log = this.welcomeLogs.get(tenantId) || {};
        const lastSent = log[whatsappId];

        if (!lastSent) return true;

        const intervalMs = this.welcomeResendHours * 60 * 60 * 1000;
        return (Date.now() - lastSent) >= intervalMs;
    }

    // Marcar welcome enviado
    markWelcomeSent(tenantId, whatsappId) {
        const log = this.welcomeLogs.get(tenantId) || {};
        log[whatsappId] = Date.now();
        this.welcomeLogs.set(tenantId, log);
    }

    // Buscar menu do tenant para contexto da IA (com cache de 5 minutos)
    async getMenuData(tenantId) {
        const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
        if (this.menuCache?.has(tenantId)) {
            const cached = this.menuCache.get(tenantId);
            if (Date.now() - cached.timestamp < CACHE_TTL) {
                return cached.data;
            }
        }

        try {
            const products = await this.db.all(
                'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.tenant_id = ? AND p.is_available = 1',
                [tenantId]
            );

            const categories = await this.db.all(
                'SELECT * FROM categories WHERE tenant_id = ? AND is_active = 1',
                [tenantId]
            );

            // Buscar addon_groups e addon_items
            const addonGroups = await this.db.all(
                'SELECT * FROM addon_groups WHERE tenant_id = ?',
                [tenantId]
            );

            const addonItems = await this.db.all(
                'SELECT ai.* FROM addon_items ai JOIN addon_groups ag ON ai.group_id = ag.id WHERE ag.tenant_id = ? AND ai.is_available = 1',
                [tenantId]
            );

            const data = {
                products: products || [],
                categories: categories || [],
                addons: addonItems || [],
                addonGroups: addonGroups || []
            };

            if (!this.menuCache) this.menuCache = new Map();
            this.menuCache.set(tenantId, { data, timestamp: Date.now() });

            return data;
        } catch (error) {
            console.error('Erro ao buscar menu:', error.message);
            return { products: [], categories: [], addons: [], addonGroups: [] };
        }
    }

    // Handler de mensagens
    async handleMessage(tenantId, message, settings) {
        try {
            const chat = await message.getChat();

            // Ignorar grupos e broadcasts
            if (chat.isGroup || message.broadcast) {
                return;
            }

            const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            const currentSettings = tenant ? JSON.parse(tenant.settings || '{}') : settings;

            // Suporte a Localizacao
            if (message.type === 'location') {
                await this.handleLocationMessage(tenantId, message, currentSettings, tenant?.name);
                return;
            }

            let contact;
            try {
                contact = await message.getContact();
            } catch {
                contact = {
                    id: { _serialized: message.from || 'unknown@c.us' },
                    pushname: 'Cliente'
                };
            }

            const whatsappId = contact.id._serialized;
            const sanitizedNumber = String(whatsappId).replace(/[^0-9]/g, '');
            const messageBody = message.body || '';

            console.log(`Mensagem de Cliente (${whatsappId}): ${messageBody.substring(0, 50)}`);

            // ============ COMANDOS DE ADMIN ============
            const msgLower = messageBody.toLowerCase().trim();
            const isAdmin = await this.isAdminNumber(tenantId, sanitizedNumber);

            if (isAdmin && msgLower.startsWith('/')) {
                const response = await this.handleAdminCommand(tenantId, msgLower, currentSettings);
                if (response) {
                    await chat.sendMessage(response);
                    return;
                }
            }

            // Debug mode log
            if (this.debugMode.get(tenantId)) {
                console.log(`[DEBUG][${tenantId}] Msg: "${messageBody}" | From: ${whatsappId}`);
            }

            // Debug: mostrar status do bot
            console.log(`[Bot Config] whatsappBotEnabled: ${currentSettings.whatsappBotEnabled}, aiBot.enabled: ${currentSettings.aiBot?.enabled}, aiBot.apiKey: ${currentSettings.aiBot?.apiKey ? 'SIM' : 'NAO'}`);

            // Verificar se IA esta habilitada (enabled deve ser explicitamente true)
            if (currentSettings.aiBot?.enabled === true && currentSettings.aiBot?.apiKey) {
                console.log(`[IA] Processando mensagem com IA para tenant ${tenantId}`);

                // Buscar menu para contexto da IA
                const menuData = await this.getMenuData(tenantId);

                try {
                    const result = await handleConversation({
                        message: messageBody,
                        whatsappId: whatsappId,
                        tenantId: tenantId,
                        customerName: contact.pushname || 'Cliente',
                        menuData: menuData,
                        tenantSettings: {
                            ...currentSettings,
                            aiBot: currentSettings.aiBot,
                            name: tenant?.name || 'Restaurante'
                        },
                        db: this.db
                    });

                    if (result?.response) {
                        await chat.sendMessage(result.response);
                        console.log(`[IA] Resposta enviada para ${whatsappId}`);
                    }
                } catch (aiError) {
                    console.error('[IA] Erro:', aiError.message);
                    // Fallback: enviar link em caso de erro
                    if (this.shouldSendWelcome(tenantId, whatsappId)) {
                        await this.sendWelcomeMessage(tenantId, chat, sanitizedNumber, currentSettings);
                        this.markWelcomeSent(tenantId, whatsappId);
                    }
                }
                return;
            }

            // Modo Link: Verificar se bot basico esta habilitado
            if (!currentSettings.whatsappBotEnabled) {
                console.log(`Bot desabilitado para tenant ${tenantId}`);
                return;
            }

            // Enviar welcome se necessario (modo link)
            if (this.shouldSendWelcome(tenantId, whatsappId)) {
                await this.sendWelcomeMessage(tenantId, chat, sanitizedNumber, currentSettings);
                this.markWelcomeSent(tenantId, whatsappId);
            }

        } catch (err) {
            console.error('Erro ao processar mensagem:', err.message);
        }
    }

    // Handler para mensagens de localizacao
    async handleLocationMessage(tenantId, message, settings, restaurantName) {
        try {
            const chat = await message.getChat();
            const contact = await message.getContact();
            const whatsappId = contact.id._serialized;
            const { latitude, longitude } = message.location;

            console.log(`[Localizacao] Recebida de ${whatsappId}: ${latitude}, ${longitude}`);

            // Validar distancia se houver coordenadas do restaurante
            const restLat = parseFloat(settings.latitude);
            const restLng = parseFloat(settings.longitude);
            const maxDist = parseFloat(settings.deliveryMaxDistanceKm || 70);

            if (!isNaN(restLat) && !isNaN(restLng)) {
                const dist = this.distanceKm(restLat, restLng, latitude, longitude);
                console.log(`[Distancia] Cliente esta a ${dist.toFixed(2)}km do restaurante`);

                if (dist > maxDist) {
                    await chat.sendMessage(`Desculpe, sua localizacao esta fora da nossa area de entrega atual (${dist.toFixed(1)}km). Atendemos ate ${maxDist}km.`);
                    return;
                }
            }

            // Encaminhar para o handler de conversa
            const { handleLocation } = await import('./services/conversation-handler.js');
            const result = handleLocation(latitude, longitude, whatsappId, tenantId, settings);

            if (result && result.response) {
                await chat.sendMessage(result.response);
            } else {
                await chat.sendMessage('Localizacao recebida! Digite "confirmar" para prosseguir com o pedido.');
            }

        } catch (err) {
            console.error('Erro ao processar localizacao:', err.message);
        }
    }

    async sendWelcomeMessage(tenantId, chat, sanitizedNumber, settings) {
        const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        if (!tenant) return;

        // Tentar buscar domínio customizado
        const customDomain = await this.db.get('SELECT domain FROM custom_domains WHERE tenant_id = ? AND verified = 1', [tenantId]);

        let orderLink;
        if (customDomain) {
            orderLink = `https://${customDomain.domain}/loja/${tenant.slug}?whatsapp=${sanitizedNumber}`;
        } else {
            // Fallback para APP_DOMAIN ou HOST configurado
            let appDomain = process.env.APP_DOMAIN;
            if (!appDomain && process.env.HOST) {
                appDomain = process.env.HOST.replace(/^https?:\/\//, '');
            }
            if (!appDomain) appDomain = 'localhost:3000';

            const protocol = appDomain.includes('localhost') ? 'http' : 'https';
            orderLink = `${protocol}://${appDomain}/loja/${tenant.slug}?whatsapp=${sanitizedNumber}`;
        }

        const restaurantName = tenant.name || 'Restaurante';

        const welcomeMessage = `Ola! Bem-vindo ao ${restaurantName}!\n\n` +
            `Eu sou o robo de atendimento. Posso te ajudar a fazer pedidos rapidamente!\n\n` +
            `Para comecar seu pedido agora, clique no link abaixo:\n${orderLink}\n\n` +
            `Dica: Seu pedido ja estara vinculado ao seu WhatsApp!`;

        await chat.sendMessage(welcomeMessage);
        console.log(`Welcome enviado para ${sanitizedNumber} (tenant ${tenantId})`);
    }

    // Enviar confirmacao de pedido ao cliente
    async sendOrderConfirmation(tenantId, whatsappId, orderData) {
        const client = this.clients.get(tenantId);
        if (!client) {
            console.log(`Cliente WhatsApp nao encontrado para tenant ${tenantId}`);
            return false;
        }

        const chatId = this._ensureChatId(whatsappId);

        try {
            // Buscar config do tenant para o PIX
            const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            const settings = JSON.parse(tenant?.settings || '{}');
            const restaurantName = tenant?.name || 'Restaurante';

            // Montar mensagem de confirmacao
            let itemsList = '';
            let subtotal = 0;

            const items = orderData.items || [];
            items.forEach(item => {
                const itemTotal = item.price * item.quantity;
                subtotal += itemTotal;
                itemsList += `- ${item.quantity}x ${item.name} - R$ ${itemTotal.toFixed(2).replace('.', ',')}\n`;

                if (item.addons && item.addons.length > 0) {
                    item.addons.forEach(addon => {
                        const addonTotal = (addon.price || 0) * item.quantity;
                        subtotal += addonTotal;
                        itemsList += `  + ${addon.name} - R$ ${addonTotal.toFixed(2).replace('.', ',')}\n`;
                    });
                }
            });

            const deliveryFee = orderData.delivery_fee || 0;
            const total = subtotal + deliveryFee;

            const summaryLines = [];
            summaryLines.push('*PEDIDO CONFIRMADO!*');
            summaryLines.push('');
            summaryLines.push(`Numero do pedido: #${orderData.order_number}`);
            summaryLines.push('');
            summaryLines.push('*Itens:*');
            summaryLines.push(itemsList.trim());
            if (deliveryFee > 0) {
                summaryLines.push(`Taxa de entrega: R$ ${deliveryFee.toFixed(2).replace('.', ',')}`);
            }
            summaryLines.push('');
            summaryLines.push(`*Total: R$ ${total.toFixed(2).replace('.', ',')}*`);
            summaryLines.push('');

            // Adicionar dados do PIX se for o caso
            const paymentMethodLower = (orderData.payment_method || '').toLowerCase();
            if (paymentMethodLower.includes('pix') && settings.pixKey) {
                summaryLines.push('━━━━━━━━━━━━━━━━━━━━');
                summaryLines.push('*DADOS PARA PAGAMENTO PIX*');
                summaryLines.push('');
                summaryLines.push(`Chave PIX: ${settings.pixKey}`);
                if (settings.pixName) {
                    summaryLines.push(`Titular: ${settings.pixName}`);
                }
                summaryLines.push('');
                summaryLines.push('_Pague agora para agilizar o preparo!_');
                summaryLines.push('━━━━━━━━━━━━━━━━━━━━');
                summaryLines.push('');
            }

            summaryLines.push('Seu pedido sera preparado e entregue em breve!');

            const message = summaryLines.join('\n');

            await client.sendMessage(chatId, message);
            console.log(`Confirmacao enviada para ${whatsappId} (pedido #${orderData.order_number})`);
            return true;
        } catch (err) {
            console.error('Erro ao enviar confirmacao:', err.message);
            return false;
        }
    }

    // Enviar pedido para grupo de entregas
    async sendOrderToGroup(tenantId, orderData) {
        const client = this.clients.get(tenantId);
        if (!client) {
            console.log(`Cliente WhatsApp nao encontrado para tenant ${tenantId}`);
            return false;
        }

        const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        const settings = JSON.parse(tenant?.settings || '{}');
        const groupId = settings.whatsappGroupId;

        if (!groupId) {
            console.log(`Grupo WhatsApp nao configurado para tenant ${tenantId}`);
            return false;
        }

        try {
            let formattedGroupId = groupId;
            if (!formattedGroupId.includes('@')) {
                formattedGroupId = `${formattedGroupId}@g.us`;
            }

            const groupChat = await client.getChatById(formattedGroupId);

            // Montar mensagem do grupo (FORMATO PREMIUM)
            let itemsList = '';
            let subtotal = 0;

            const items = orderData.items || [];
            items.forEach(item => {
                const itemTotal = item.price * item.quantity;
                subtotal += itemTotal;
                itemsList += `• ${item.quantity}x ${item.name} - R$ ${itemTotal.toFixed(2).replace('.', ',')}\n`;

                if (item.addons && item.addons.length > 0) {
                    item.addons.forEach(addon => {
                        const addonTotal = (addon.price || 0) * item.quantity;
                        subtotal += addonTotal;
                        itemsList += `  + ${addon.name} - R$ ${addonTotal.toFixed(2).replace('.', ',')}\n`;
                    });
                }

                if (item.observation) {
                    itemsList += `  📝 Obs: ${item.observation}\n`;
                }
            });

            const deliveryFee = orderData.delivery_fee || 0;
            const total = parseFloat(orderData.total || 0);
            const calculatedTotal = subtotal + deliveryFee;
            // Usar o maior valor (caso orderData.total ja venha com taxa) ou recalcular se necessario
            const finalTotal = total > 0 ? total : calculatedTotal;

            const groupLines = [];
            groupLines.push(`🍔 *NOVO PEDIDO #${orderData.order_number}*`);
            groupLines.push('');
            groupLines.push('━━━━━━━━━━━━━━━━━━━━');
            groupLines.push('📦 *ITENS DO PEDIDO*');
            groupLines.push(itemsList.trim());
            groupLines.push('');
            groupLines.push('━━━━━━━━━━━━━━━━━━━━');
            groupLines.push('💰 *VALORES*');
            groupLines.push(`Subtotal dos itens: R$ ${subtotal.toFixed(2).replace('.', ',')}`);

            if (deliveryFee > 0) {
                groupLines.push(`Taxa de entrega: R$ ${deliveryFee.toFixed(2).replace('.', ',')}`);
            } else {
                groupLines.push('Taxa de entrega: R$ 0,00 (retirada)');
            }

            groupLines.push(`*TOTAL DO PEDIDO: R$ ${finalTotal.toFixed(2).replace('.', ',')}*`);
            groupLines.push('');
            groupLines.push('━━━━━━━━━━━━━━━━━━━━');
            groupLines.push('👤 *DADOS DO CLIENTE*');
            groupLines.push(`Nome: ${orderData.customer_name}`);

            let addressText = '';
            let mapsLink = '';

            if (orderData.address) {
                if (typeof orderData.address === 'string') {
                    addressText = orderData.address;
                } else {
                    const { street, number, neighborhood, city, complement, reference, lat, lng } = orderData.address;
                    addressText = `${street}, ${number}`;
                    if (neighborhood) addressText += ` - ${neighborhood}`;
                    if (city) addressText += ` - ${city}`;
                    if (complement) addressText += `\nComplemento: ${complement}`;
                    if (reference) addressText += `\nReferência: ${reference}`;

                    if (lat && lng) {
                        mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
                    }
                }
                groupLines.push(`Endereço: ${addressText}`);
            }

            groupLines.push(`Pagamento: ${orderData.payment_method || 'Não informado'}`);

            // Informação de troco
            if (orderData.change_for !== null && orderData.change_for !== undefined) {
                const valorPago = parseFloat(orderData.change_for);
                if (valorPago === 0) {
                    groupLines.push(`💵 *Troco*: Cliente deseja troco (valor não especificado)`);
                } else if (valorPago > finalTotal) {
                    const change = valorPago - finalTotal;
                    groupLines.push(`💵 *Troco*: R$ ${change.toFixed(2).replace('.', ',')} (para R$ ${valorPago.toFixed(2).replace('.', ',')})`);
                } else if (valorPago === finalTotal) {
                    groupLines.push(`💵 *Troco*: Sem troco (valor exato)`);
                }
            }

            // Link WhatsApp do cliente
            const cleanPhone = orderData.customer_phone?.replace(/\D/g, '');
            if (cleanPhone) {
                groupLines.push(`📱 *WhatsApp do Cliente*: https://wa.me/${cleanPhone}`);
            }

            // Link de localização do Google Maps
            if (mapsLink) {
                groupLines.push(`📍 *Localização*: ${mapsLink}`);
            }

            // Observações do local
            if (orderData.observation) {
                groupLines.push(`📝 Observações do local: ${orderData.observation}`);
            }

            groupLines.push(''); // Final newline

            const message = groupLines.join('\n');

            await groupChat.sendMessage(message);
            console.log(`Pedido #${orderData.order_number} enviado para grupo (tenant ${tenantId})`);
            return true;
        } catch (err) {
            console.error('Erro ao enviar para grupo:', err.message);
            return false;
        }
    }

    // Helper: garantir formato do chatId
    _ensureChatId(id) {
        if (!id) return id;
        const str = String(id);
        if (str.includes('@')) return str;
        const digits = str.replace(/\D/g, '');
        return digits + '@c.us';
    }

    // Obter QR Code como Data URL
    async getQRCodeDataURL(tenantId) {
        const qr = this.qrCodes.get(tenantId);
        if (!qr) {
            return null;
        }
        return await qrcodeImage.toDataURL(qr, { width: 300 });
    }

    // Obter status
    getStatus(tenantId) {
        return {
            status: this.statuses.get(tenantId) || 'not_initialized',
            connected: this.statuses.get(tenantId) === 'connected',
            qrAvailable: this.qrCodes.has(tenantId)
        };
    }

    // Desconectar
    async disconnect(tenantId) {
        const client = this.clients.get(tenantId);
        if (!client) return;

        await client.logout();
        this.clients.delete(tenantId);
        this.qrCodes.delete(tenantId);
        this.statuses.set(tenantId, 'disconnected');
    }

    // Reiniciar
    async restart(tenantId) {
        await this.disconnect(tenantId);
        await this.initializeForTenant(tenantId);
    }

    // ============ ADMIN COMMANDS ============

    /**
     * Verificar se o numero e admin do tenant
     */
    async isAdminNumber(tenantId, phoneNumber) {
        try {
            const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            if (!tenant) return false;

            const settings = JSON.parse(tenant.settings || '{}');
            const adminNumbers = settings.adminWhatsappNumbers || [];

            // Tambem verificar o numero principal do tenant
            const mainPhone = tenant.phone?.replace(/\\D/g, '') || '';

            return adminNumbers.includes(phoneNumber) || mainPhone === phoneNumber;
        } catch (err) {
            console.error('Erro ao verificar admin:', err.message);
            return false;
        }
    }

    /**
     * Handler de comandos administrativos
     */
    async handleAdminCommand(tenantId, command, settings) {
        const cmd = command.split(' ')[0];

        switch (cmd) {
            case '/debug':
                const isDebug = !this.debugMode.get(tenantId);
                this.debugMode.set(tenantId, isDebug);
                return `Modo DEBUG ${isDebug ? 'ATIVADO' : 'DESATIVADO'}`;

            case '/reload':
                // Invalidar cache do tenant
                this.cacheService.invalidate(tenantId);
                // Recarregar menu
                if (this.menuCache) this.menuCache.delete(tenantId);
                return 'Cache e configuracoes recarregados!';

            case '/stats':
                const cacheStats = this.cacheService.getStats();
                const status = this.getStatus(tenantId);
                return `*ESTATISTICAS*\n\n` +
                    `WhatsApp: ${status.connected ? 'Conectado' : 'Desconectado'}\n` +
                    `Cache: ${cacheStats.totalEntries} entradas\n` +
                    `Tenants em cache: ${cacheStats.totalTenants}\n` +
                    `Debug: ${this.debugMode.get(tenantId) ? 'ON' : 'OFF'}`;

            case '/cache':
                const action = command.split(' ')[1];
                if (action === 'clear') {
                    this.cacheService.invalidate(tenantId);
                    return 'Cache limpo!';
                }
                const stats = this.cacheService.getStats();
                return `Cache: ${stats.tenantStats[tenantId] || 0} entradas para este tenant`;

            case '/backup':
                const backupService = getBackupService();
                const result = backupService.createBackup('manual');
                return result.success
                    ? `Backup criado: ${result.fileName}`
                    : `Erro: ${result.error}`;

            case '/help':
                return `*COMANDOS ADMIN*\n\n` +
                    `/debug - Ativar/desativar logs\n` +
                    `/reload - Recarregar config\n` +
                    `/stats - Ver estatisticas\n` +
                    `/cache - Info do cache\n` +
                    `/cache clear - Limpar cache\n` +
                    `/backup - Criar backup`;

            default:
                return null; // Comando nao reconhecido, continuar fluxo normal
        }
    }

    // ============ HAVERSINE DISTANCE ============

    /**
     * Calcular distancia entre duas coordenadas em km (formula Haversine)
     */
    distanceKm(lat1, lng1, lat2, lng2) {
        const toRad = (v) => v * Math.PI / 180;
        const R = 6371; // km
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Gerar link do Google Maps se dentro do raio de entrega
     */
    getMapLink(tenantSettings, customerLat, customerLng) {
        const maxDistance = parseFloat(tenantSettings.deliveryMaxDistanceKm || 70);
        const restaurantLat = parseFloat(tenantSettings.latitude || 0);
        const restaurantLng = parseFloat(tenantSettings.longitude || 0);

        if (!restaurantLat || !restaurantLng) return null;

        const distance = this.distanceKm(restaurantLat, restaurantLng, customerLat, customerLng);

        if (distance <= maxDistance) {
            return `https://www.google.com/maps?q=${customerLat},${customerLng}`;
        }

        return null;
    }
}

// Singleton
let whatsappService = null;

export function getWhatsAppService(db) {
    if (!whatsappService) {
        whatsappService = new WhatsAppService(db);
    }
    return whatsappService;
}

export default WhatsAppService;
