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
        this.recentMessages = new Map(); // tenantId -> { whatsappId -> { message, timestamp } }

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
        const chromePath = process.env.WHATSAPP_CHROME_PATH || (process.platform === 'linux'
            ? ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'].find(p => fs.existsSync(p))
            : undefined);

        console.log(`[WhatsApp][${tenantId}] Usando Chrome em: ${chromePath || 'Bundled Chromium'}`);

        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: `tenant-${tenantId}`,
                dataPath: SESSIONS_DIR
            }),
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
            },
            puppeteer: {
                headless: true,
                executablePath: chromePath,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu',
                    '--disable-extensions'
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

    // Verificar se já enviou mensagem similar recentemente (previne duplicatas)
    hasRecentlySentMessage(tenantId, whatsappId, messageType = 'welcome') {
        const recentLog = this.recentMessages.get(tenantId) || {};
        const lastMessage = recentLog[`${whatsappId}_${messageType}`];

        if (!lastMessage) return false;

        // Considerar "recente" se enviou nos últimos 5 minutos
        const RECENT_THRESHOLD = 5 * 60 * 1000; // 5 minutos
        return (Date.now() - lastMessage.timestamp) < RECENT_THRESHOLD;
    }

    // Marcar mensagem como enviada
    markMessageSent(tenantId, whatsappId, messageType = 'welcome') {
        const recentLog = this.recentMessages.get(tenantId) || {};
        recentLog[`${whatsappId}_${messageType}`] = {
            timestamp: Date.now(),
            type: messageType
        };
        this.recentMessages.set(tenantId, recentLog);
        console.log(`[AntiDup] Marcado ${messageType} para ${whatsappId} (tenant: ${tenantId})`);
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

            // Ignorar mensagens do proprio bot (evita loops)
            if (message.fromMe) {
                return;
            }

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

            // Estratégia para obter número real (evitar LID):
            // LID (@lid) é um identificador interno do WhatsApp que não representa o número real
            // Apenas usar @c.us que contém o número de telefone real
            let whatsappId = message.from || contact.id._serialized;
            let sanitizedNumber = '';
            let isLid = false;
            let lidValue = '';

            // Verificar se é @c.us (número real)
            if (whatsappId && whatsappId.includes('@c.us')) {
                sanitizedNumber = String(whatsappId).replace(/[^0-9]/g, '');
                console.log(`[DEBUG] Numero obtido de @c.us: ${whatsappId} -> ${sanitizedNumber}`);
            }
            // Se for @lid, tentar obter de contact.number ou mapeamento
            else if (whatsappId && whatsappId.includes('@lid')) {
                isLid = true;
                lidValue = whatsappId.replace('@lid', ''); // Extrair apenas o ID
                console.log(`[DEBUG] Detectado LID: ${whatsappId}, lidValue: ${lidValue}`);

                // Tentar contact.number primeiro
                if (contact.number && String(contact.number).match(/^\d{10,15}$/)) {
                    sanitizedNumber = String(contact.number).replace(/[^0-9]/g, '');
                    console.log(`[DEBUG] Numero obtido de contact.number: ${sanitizedNumber}`);
                } else {
                    // Buscar mapeamento LID -> Telefone no banco
                    const mapping = await this.getLidPhoneMapping(tenantId, lidValue);
                    if (mapping) {
                        sanitizedNumber = mapping.phone;
                        console.log(`[DEBUG] Numero obtido do mapeamento LID: ${sanitizedNumber}`);
                    } else {
                        // LID sem mapeamento - enviar link com LID para cliente preencher telefone
                        console.log(`[INFO] LID sem mapeamento - enviando link com lid=${lidValue}`);
                        // sanitizedNumber fica vazio, usaremos lid
                    }
                }
            } else {
                sanitizedNumber = String(whatsappId).replace(/[^0-9]/g, '');
                console.log(`[DEBUG] Numero padrao: ${sanitizedNumber}`);
            }

            // Números brasileiros começam com 55 - remover para ficar só DDD+número
            if (sanitizedNumber.startsWith('55') && sanitizedNumber.length >= 12) {
                sanitizedNumber = sanitizedNumber.substring(2);
                console.log(`[DEBUG] Removido 55, resultado: ${sanitizedNumber}`);
            }
            const messageBody = message.body || '';

            console.log(`Mensagem de Cliente (${whatsappId}): ${messageBody.substring(0, 50)}, tel: ${sanitizedNumber}`);

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
            console.log(`[Bot Config] whatsappBotEnabled: ${currentSettings.whatsappBotEnabled}`);

            // ============ BOT COM IA - DESABILITADO TEMPORARIAMENTE ============
            // TODO: Reimplementar bot com IA futuramente
            // if (currentSettings.aiBot?.enabled === true && currentSettings.aiBot?.apiKey) {
            //     ... codigo IA removido temporariamente ...
            // }

            // ============ GATILHOS DE PALAVRAS-CHAVE ============
            // (Funciona mesmo se whatsappBotEnabled estiver desligado)
            const triggers = currentSettings.triggers || [];
            console.log(`[Triggers] Tenant ${tenantId} tem ${triggers.length} gatilhos configurados`);

            if (triggers.length > 0) {
                const msgLowerTrigger = messageBody.toLowerCase().trim();

                for (const trigger of triggers) {
                    // Verificar se a mensagem contém a palavra-chave
                    if (msgLowerTrigger.includes(trigger.word.toLowerCase())) {
                        console.log(`[Trigger] Palavra-chave "${trigger.word}" detectada para ${whatsappId}`);

                        // ANTI-DUPLICAÇÃO: Verificar se já enviou link recentemente
                        if (this.hasRecentlySentMessage(tenantId, whatsappId, 'link')) {
                            console.log(`[AntiDup] Link já enviado recentemente para ${whatsappId}, ignorando`);
                            return; // Não enviar novamente
                        }

                        // Preparar link da loja (com telefone ou LID)
                        let orderLink = await this.buildOrderLink(tenantId, tenant, sanitizedNumber, isLid ? lidValue : null);

                        // Substituir variaveis na resposta
                        let response = trigger.response
                            .replace(/\{link\}/gi, orderLink)
                            .replace(/\{restaurante\}/gi, tenant?.name || 'Restaurante')
                            .replace(/\{nome\}/gi, contact.pushname || 'Cliente');

                        await chat.sendMessage(response);
                        console.log(`[Trigger] Resposta enviada: ${response.substring(0, 50)}...`);

                        // Marcar mensagem como enviada
                        this.markMessageSent(tenantId, whatsappId, 'link');
                        this.markWelcomeSent(tenantId, whatsappId); // Também marcar welcome para evitar envio duplo

                        return; // Nao continuar processamento
                    }
                }
            }

            // Modo Link: Verificar se bot basico esta habilitado
            if (!currentSettings.whatsappBotEnabled) {
                console.log(`Bot desabilitado para tenant ${tenantId}`);
                return;
            }

            // Enviar welcome se necessario (modo link)
            if (this.shouldSendWelcome(tenantId, whatsappId)) {
                // ANTI-DUPLICAÇÃO: Verificar se já enviou link/welcome recentemente
                if (this.hasRecentlySentMessage(tenantId, whatsappId, 'link') ||
                    this.hasRecentlySentMessage(tenantId, whatsappId, 'welcome')) {
                    console.log(`[AntiDup] Welcome/Link já enviado recentemente para ${whatsappId}, ignorando`);
                    return;
                }

                await this.sendWelcomeMessage(tenantId, chat, sanitizedNumber, currentSettings, contact.pushname, isLid ? lidValue : null);
                this.markWelcomeSent(tenantId, whatsappId);
                this.markMessageSent(tenantId, whatsappId, 'welcome');
                this.markMessageSent(tenantId, whatsappId, 'link'); // Marcar link também
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

    // Construir link da loja com domínio customizado se disponível
    // Agora aceita lidValue para quando não conseguir o número real
    async buildOrderLink(tenantId, tenant, sanitizedNumber, lidValue = null) {
        if (!tenant) {
            tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        }
        if (!tenant) return '';

        // Determinar qual parâmetro usar: whatsapp (se tiver número) ou lid (se não tiver)
        let queryParam = '';
        if (sanitizedNumber) {
            queryParam = `whatsapp=${sanitizedNumber}`;
        } else if (lidValue) {
            queryParam = `lid=${lidValue}`;
        }

        // Tentar buscar domínio customizado verificado
        const customDomain = await this.db.get('SELECT domain FROM custom_domains WHERE tenant_id = ? AND verified = 1', [tenantId]);

        if (customDomain) {
            return queryParam
                ? `https://${customDomain.domain}/loja/${tenant.slug}?${queryParam}`
                : `https://${customDomain.domain}/loja/${tenant.slug}`;
        }

        // Fallback para APP_DOMAIN ou HOST configurado
        let appDomain = process.env.APP_DOMAIN;
        if (!appDomain && process.env.HOST) {
            appDomain = process.env.HOST.replace(/^https?:\/\//, '');
        }
        if (!appDomain) appDomain = 'localhost:3000';

        const protocol = appDomain.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${appDomain}/loja/${tenant.slug}`;
        return queryParam ? `${baseUrl}?${queryParam}` : baseUrl;
    }

    // Buscar mapeamento LID -> Telefone no banco
    async getLidPhoneMapping(tenantId, lid) {
        try {
            const mapping = await this.db.get(
                'SELECT phone FROM lid_phone_mappings WHERE tenant_id = ? AND lid = ?',
                [tenantId, lid]
            );
            return mapping || null;
        } catch (err) {
            console.error('[LidMapping] Erro ao buscar mapeamento:', err.message);
            return null;
        }
    }

    // Salvar mapeamento LID -> Telefone no banco
    async saveLidPhoneMapping(tenantId, lid, phone) {
        try {
            const id = `lid_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            await this.db.run(
                `INSERT INTO lid_phone_mappings (id, lid, phone, tenant_id) 
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(lid, tenant_id) DO UPDATE SET phone = ?, updated_at = CURRENT_TIMESTAMP`,
                [id, lid, phone, tenantId, phone]
            );
            console.log(`[LidMapping] Mapeamento salvo: ${lid} -> ${phone} (tenant: ${tenantId})`);
            return true;
        } catch (err) {
            console.error('[LidMapping] Erro ao salvar mapeamento:', err.message);
            return false;
        }
    }

    async sendWelcomeMessage(tenantId, chat, sanitizedNumber, settings, customerName = 'Cliente', lidValue = null) {
        const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        if (!tenant) return;

        const tenantSettings = JSON.parse(tenant.settings || '{}');
        const restaurantName = tenant.name || 'Restaurante';
        const orderLink = await this.buildOrderLink(tenantId, tenant, sanitizedNumber, lidValue);

        // Usar mensagem customizada ou fallback padrao
        let welcomeMessage;
        if (tenantSettings.botMessages?.welcome) {
            welcomeMessage = tenantSettings.botMessages.welcome
                .replace(/\{restaurante\}/gi, restaurantName)
                .replace(/\{link\}/gi, orderLink)
                .replace(/\{nome\}/gi, customerName || 'Cliente');
        } else {
            // Mensagem padrao
            welcomeMessage = `Ola! Bem-vindo ao ${restaurantName}!\n\n` +
                `Eu sou o robo de atendimento. Posso te ajudar a fazer pedidos rapidamente!\n\n` +
                `Para comecar seu pedido agora, clique no link abaixo:\n${orderLink}\n\n` +
                `Dica: Seu pedido ja estara vinculado ao seu WhatsApp!`;
        }

        await chat.sendMessage(welcomeMessage);
        console.log(`Welcome enviado para ${sanitizedNumber} (tenant ${tenantId})`);
    }

    /**
     * Normalizar whatsappId para formato correto de chatId
     * Trata números brasileiros - remove o 9 adicional quando necessário
     */
    _ensureChatId(whatsappId) {
        if (!whatsappId) return null;

        let cleanNumber = '';
        let domain = '@c.us';

        // Se já é um ID completo
        if (whatsappId.includes('@')) {
            // Se for LID, retornar como está (não podemos processar)
            if (whatsappId.includes('@lid')) {
                return whatsappId;
            }
            // Se for @c.us, extrair o número para processar
            if (whatsappId.includes('@c.us')) {
                cleanNumber = whatsappId.replace('@c.us', '').replace(/\D/g, '');
            } else {
                // Outro formato desconhecido, retornar como está
                return whatsappId;
            }
        } else {
            // Limpar caracteres não numéricos
            cleanNumber = whatsappId.replace(/\D/g, '');
        }

        // Se tem 10 ou 11 dígitos, adicionar 55 (codigo do Brasil)
        if (cleanNumber.length >= 10 && cleanNumber.length <= 11) {
            cleanNumber = '55' + cleanNumber;
        }

        // Tratar números brasileiros - remover 9 adicional
        // Formato WhatsApp: 55DDXXXXXXXX (12 dígitos, sem o 9 adicional)
        // Se tem 13 dígitos (55 + DDD + 9 + 8 dígitos), remover o 9
        if (cleanNumber.length === 13 && cleanNumber.startsWith('55')) {
            const ddd = cleanNumber.substring(2, 4);
            const nineDigit = cleanNumber.substring(4, 5);
            const restOfNumber = cleanNumber.substring(5);

            // Se o terceiro dígito após 55 é 9 e o resto tem 8 dígitos, remover o 9
            if (nineDigit === '9' && restOfNumber.length === 8) {
                const oldNumber = cleanNumber;
                cleanNumber = '55' + ddd + restOfNumber;
                console.log(`[ChatId] Removido 9 adicional: ${oldNumber} -> ${cleanNumber}`);
            }
        }

        console.log(`[ChatId] Normalizado: ${whatsappId} -> ${cleanNumber}@c.us`);
        return cleanNumber + '@c.us';
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
                itemsList += `• ${item.quantity}x ${item.name} - R$ ${itemTotal.toFixed(2).replace('.', ',')}\n`;

                if (item.addons && item.addons.length > 0) {
                    item.addons.forEach(addon => {
                        const addonTotal = (addon.price || 0) * item.quantity;
                        subtotal += addonTotal;
                        itemsList += `  + ${addon.name} - R$ ${addonTotal.toFixed(2).replace('.', ',')}\n`;
                    });
                }

                // Observação do item
                if (item.observation && String(item.observation).trim().length > 0) {
                    itemsList += `  📝 ${item.observation.trim()}\n`;
                }
            });

            const deliveryFee = orderData.delivery_fee || 0;
            const total = subtotal + deliveryFee;

            const summaryLines = [];
            summaryLines.push('✅ *Pedido Confirmado!*');
            summaryLines.push('');
            summaryLines.push(`Número do pedido: #${orderData.order_number}`);
            summaryLines.push('');
            summaryLines.push('Itens:');
            summaryLines.push(itemsList.trim());
            if (deliveryFee > 0) {
                summaryLines.push(`• Taxa de entrega - R$ ${deliveryFee.toFixed(2).replace('.', ',')}`);
            }
            summaryLines.push(`Total: R$ ${total.toFixed(2).replace('.', ',')}`);
            summaryLines.push('');

            // Informações do cliente
            summaryLines.push('Informações do cliente:');
            summaryLines.push(`Nome: ${orderData.customer_name}`);

            // Endereço (se for entrega)
            if (orderData.address) {
                let addressText = '';
                if (typeof orderData.address === 'string') {
                    addressText = orderData.address;
                } else {
                    const { street, neighborhood, reference } = orderData.address;
                    addressText = street || '';
                    if (neighborhood) addressText += ` - ${neighborhood}`;
                }
                if (addressText) {
                    summaryLines.push(`Endereço: ${addressText}`);
                }

                // Observações do local
                const addressNote = orderData.address?.reference || orderData.observation;
                if (addressNote && String(addressNote).trim().length > 0) {
                    summaryLines.push(`Observações do local: ${String(addressNote).trim()}`);
                }
            }

            // Traduzir método de pagamento para português
            const paymentLabels = {
                'PIX': 'PIX',
                'CREDIT_CARD': 'Cartão',
                'DEBIT_CARD': 'Cartão (Débito)',
                'CASH': 'Dinheiro'
            };
            const paymentDisplay = paymentLabels[orderData.payment_method] || orderData.payment_method || 'Não informado';
            summaryLines.push(`Forma de pagamento: ${paymentDisplay}`);
            summaryLines.push('');

            // Adicionar dados do PIX se for o caso
            const paymentMethodLower = (orderData.payment_method || '').toLowerCase();
            const pixKey = settings.pixKey || settings.pix_key || '';
            const pixName = settings.pixName || settings.pix_holder_name || '';
            console.log(`[PIX Debug] payment_method: "${orderData.payment_method}", pixKey: "${pixKey || 'NAO CONFIGURADO'}"`);
            if (paymentMethodLower.includes('pix') && pixKey) {
                summaryLines.push('━━━━━━━━━━━━━━━━━━━━');
                summaryLines.push('*DADOS PARA PAGAMENTO PIX*');
                summaryLines.push('');
                summaryLines.push(`Chave PIX: ${pixKey}`);
                if (pixName) {
                    summaryLines.push(`Titular: ${pixName}`);
                }
                summaryLines.push('');
                summaryLines.push('_Pague agora para agilizar o preparo!_');
                summaryLines.push('━━━━━━━━━━━━━━━━━━━━');
                summaryLines.push('');
            }

            summaryLines.push('*Seu pedido será preparado e entregue em breve!*');

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

            // DEBUG: Log dos dados recebidos
            console.log(`[WhatsApp Group] Pedido #${orderData.order_number} - Address:`, JSON.stringify(orderData.address));
            console.log(`[WhatsApp Group] Observation:`, orderData.observation);

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
            let addressObservation = '';

            if (orderData.address && typeof orderData.address === 'object') {
                const { street, number, neighborhood, city, complement, reference, lat, lng } = orderData.address;

                // Montar endereco sem undefined
                let parts = [];
                if (street) parts.push(street);
                if (number) parts.push(number);
                addressText = parts.join(', ');

                if (neighborhood) addressText += ` - ${neighborhood}`;
                if (city) addressText += ` - ${city}`;
                if (complement) addressText += `\nComplemento: ${complement}`;

                // Guardar reference para usar como observacao
                if (reference) addressObservation = reference;

                if (lat && lng) {
                    mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
                    console.log(`[WhatsApp Group] Link Maps gerado: ${mapsLink}`);
                } else {
                    console.log(`[WhatsApp Group] SEM coordenadas - lat: ${lat}, lng: ${lng}`);
                }
                groupLines.push(`Endereço: ${addressText || 'Não informado'}`);
            } else if (typeof orderData.address === 'string' && orderData.address.trim()) {
                addressText = orderData.address;
                groupLines.push(`Endereço: ${addressText}`);
            } else {
                // Pedido de RETIRADA ou sem endereço
                groupLines.push(`📍 *RETIRADA NO LOCAL*`);
            }

            // Traduzir método de pagamento para português
            const groupPaymentLabels = {
                'PIX': 'PIX',
                'CREDIT_CARD': 'Cartão',
                'DEBIT_CARD': 'Cartão (Débito)',
                'CASH': 'Dinheiro'
            };
            const groupPaymentDisplay = groupPaymentLabels[orderData.payment_method] || orderData.payment_method || 'Não informado';
            groupLines.push(`Pagamento: ${groupPaymentDisplay}`);

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

            // Link WhatsApp do cliente - garantir formato com 55
            let cleanPhone = orderData.customer_phone?.replace(/\D/g, '') || '';
            // Adicionar 55 se não começar com ele (números brasileiros)
            if (cleanPhone && !cleanPhone.startsWith('55')) {
                cleanPhone = '55' + cleanPhone;
            }
            if (cleanPhone) {
                groupLines.push(`📱 *WhatsApp do Cliente*: https://wa.me/${cleanPhone}`);
            }

            // Link de localização do Google Maps
            if (mapsLink) {
                groupLines.push(`📍 *Localização*: ${mapsLink}`);
            }

            // Observações do local (usar orderData.observation ou address.reference)
            const obsLocal = orderData.observation || addressObservation;
            if (obsLocal) {
                groupLines.push(`📝 Observações do local: ${obsLocal}`);
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
