// ============================================================
// WhatsApp Service - DeliveryHub SaaS (BAILEYS VERSION)
// Autor: killsis (Lucas Larocca)
// Migrado de whatsapp-web.js para Baileys
// ============================================================

import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import qrcodeImage from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { handleConversation } from './services/conversation-handler.js';
import { getCacheService } from './services/cache-service.js';
import { getBackupService } from './services/backup-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caminho para salvar as sessoes
const SESSIONS_DIR = path.join(__dirname, 'baileys-sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Logger silencioso para Baileys
const logger = pino({ level: 'silent' });

class WhatsAppService {
    constructor(db) {
        this.db = db;
        this.clients = new Map(); // tenantId -> socket
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

        const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos

        this.healthCheckInterval = setInterval(async () => {
            for (const [tenantId, sock] of this.clients) {
                try {
                    // Verificar se socket está conectado
                    if (!sock?.user) {
                        console.log(`[HealthCheck] Tenant ${tenantId} desconectado, tentando reconectar...`);
                        await this.reconnectTenant(tenantId);
                    }
                } catch (err) {
                    console.error(`[HealthCheck] Erro ao verificar tenant ${tenantId}:`, err.message);
                }
            }
        }, CHECK_INTERVAL);

        console.log('[WhatsApp] Health check iniciado (intervalo: 5 min)');
    }

    /**
     * Reconectar tenant
     */
    async reconnectTenant(tenantId) {
        const attempts = this.reconnectAttempts.get(tenantId) || 0;

        if (attempts >= this.maxReconnectAttempts) {
            console.error(`[WhatsApp] Max tentativas atingidas para tenant ${tenantId}`);
            this.statuses.set(tenantId, 'FAILED');
            return;
        }

        this.reconnectAttempts.set(tenantId, attempts + 1);
        console.log(`[WhatsApp] Tentativa ${attempts + 1} de reconexao para tenant ${tenantId}`);

        try {
            await this.initializeForTenant(tenantId);
            this.reconnectAttempts.set(tenantId, 0); // Reset on success
        } catch (err) {
            console.error(`[WhatsApp] Falha ao reconectar:`, err.message);
            // Agendar proxima tentativa
            setTimeout(() => this.reconnectTenant(tenantId), this.reconnectDelay);
        }
    }

    /**
     * Inicializar WhatsApp para um tenant usando Baileys
     */
    async initializeForTenant(tenantId) {
        // Verificar se ja existe cliente
        if (this.clients.has(tenantId) && this.clients.get(tenantId)?.user) {
            console.log(`WhatsApp client ja existe e esta conectado para tenant ${tenantId}`);
            return;
        }

        const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        if (!tenant) {
            throw new Error(`Tenant ${tenantId} nao encontrado`);
        }

        const settings = JSON.parse(tenant.settings || '{}');

        console.log(`Inicializando WhatsApp (Baileys) para tenant ${tenantId}`);
        this.statuses.set(tenantId, 'INITIALIZING');

        // Diretorio de autenticacao para este tenant
        const authDir = path.join(SESSIONS_DIR, `session-${tenantId}`);

        // Carregar estado de autenticacao
        const { state, saveCreds } = await useMultiFileAuthState(authDir);

        // Buscar versao mais recente do Baileys
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`[Baileys] Usando versao WA: ${version.join('.')}, isLatest: ${isLatest}`);

        // Criar socket
        const sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            markOnlineOnConnect: true,
        });

        // Salvar credenciais quando atualizarem
        sock.ev.on('creds.update', saveCreds);

        // Handler de QR Code
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log(`QR Code para tenant ${tenantId}:`);
                qrcode.generate(qr, { small: true });

                // Gerar QR code como imagem base64
                try {
                    const qrImageBase64 = await qrcodeImage.toDataURL(qr);
                    this.qrCodes.set(tenantId, qrImageBase64);
                } catch (err) {
                    this.qrCodes.set(tenantId, qr);
                }

                this.statuses.set(tenantId, 'QR_READY');
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

                console.log(`[WhatsApp] Conexao fechada para tenant ${tenantId}. Reconectando: ${shouldReconnect}`);

                if (shouldReconnect) {
                    this.statuses.set(tenantId, 'RECONNECTING');
                    // Reconectar automaticamente
                    setTimeout(() => this.initializeForTenant(tenantId), 5000);
                } else {
                    this.statuses.set(tenantId, 'LOGGED_OUT');
                    this.clients.delete(tenantId);
                    // Apagar sessao se foi logout
                    try {
                        fs.rmSync(authDir, { recursive: true, force: true });
                    } catch (e) { }
                }
            } else if (connection === 'open') {
                console.log(`WhatsApp pronto para tenant ${tenantId}`);
                this.statuses.set(tenantId, 'READY');
                this.qrCodes.delete(tenantId);
                this.reconnectAttempts.set(tenantId, 0);
            }
        });

        // Handler de mensagens
        sock.ev.on('messages.upsert', async (m) => {
            if (m.type !== 'notify') return;

            for (const msg of m.messages) {
                // Ignorar mensagens do proprio bot
                if (msg.key.fromMe) continue;

                // Ignorar mensagens de grupos
                if (msg.key.remoteJid?.endsWith('@g.us')) continue;

                // Ignorar mensagens de status
                if (msg.key.remoteJid === 'status@broadcast') continue;

                await this.handleMessage(tenantId, msg, settings, sock);
            }
        });

        // Armazenar socket
        this.clients.set(tenantId, sock);
    }

    /**
     * Handler de mensagens - Baileys version
     */
    async handleMessage(tenantId, message, settings, sock) {
        try {
            const jid = message.key.remoteJid;

            // Extrair numero do JID
            const numberMatch = jid.match(/^(\d+)@/);
            if (!numberMatch) return;

            const fullNumber = numberMatch[1];

            // Sanitizar numero (remover codigo do pais para comparacao)
            let sanitizedNumber = fullNumber;
            if (sanitizedNumber.startsWith('55') && sanitizedNumber.length >= 12) {
                sanitizedNumber = sanitizedNumber.substring(2);
            }

            // Extrair texto da mensagem
            const messageBody = message.message?.conversation ||
                message.message?.extendedTextMessage?.text ||
                '';

            if (!messageBody) return; // Ignorar mensagens sem texto

            const pushName = message.pushName || 'Cliente';

            console.log(`Mensagem de Cliente (${jid}): ${messageBody.substring(0, 50)}, tel: ${sanitizedNumber}`);

            const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            const currentSettings = tenant ? JSON.parse(tenant.settings || '{}') : settings;

            // Debug: mostrar status do bot
            console.log(`[Bot Config] whatsappBotEnabled: ${currentSettings.whatsappBotEnabled}`);

            // ============ GATILHOS DE PALAVRAS-CHAVE ============
            const triggers = currentSettings.triggers || [];
            console.log(`[Triggers] Tenant ${tenantId} tem ${triggers.length} gatilhos configurados`);

            let triggerMatched = false;
            if (triggers.length > 0) {
                const msgLowerTrigger = messageBody.toLowerCase().trim();

                for (const trigger of triggers) {
                    if (msgLowerTrigger.includes(trigger.word.toLowerCase())) {
                        console.log(`[Trigger] Palavra-chave "${trigger.word}" detectada para ${jid}`);

                        // ANTI-DUPLICAÇÃO
                        if (this.hasRecentlySentMessage(tenantId, jid, 'link')) {
                            console.log(`[AntiDup] Link já enviado recentemente para ${jid}, ignorando`);
                            return;
                        }

                        // Preparar link da loja
                        let orderLink = await this.buildOrderLink(tenantId, tenant, sanitizedNumber, null);
                        console.log(`[Trigger] Link construído: ${orderLink}`);

                        // Substituir variaveis na resposta
                        let response = trigger.response
                            .replace(/\{link\}/gi, orderLink)
                            .replace(/\{restaurante\}/gi, tenant?.name || 'Restaurante')
                            .replace(/\{nome\}/gi, pushName || 'Cliente');

                        // Enviar mensagem
                        const sent = await this.safeSendMessage(tenantId, jid, response, sock);
                        if (sent) {
                            this.markMessageSent(tenantId, jid, 'link');
                            this.markWelcomeSent(tenantId, jid);
                            console.log(`[Trigger] Resposta enviada com sucesso`);
                        }

                        triggerMatched = true;
                        return;
                    }
                }
            }

            // ============ RESPOSTA PADRÃO - PRIMEIRA MENSAGEM DO DIA ============
            const welcomeAllowed = this.shouldSendWelcome(tenantId, jid);
            console.log(`[Welcome Check] shouldSendWelcome: ${welcomeAllowed}, jid: ${jid}`);

            if (!triggerMatched && welcomeAllowed) {
                // ANTI-DUPLICAÇÃO
                if (this.hasRecentlySentMessage(tenantId, jid, 'link') ||
                    this.hasRecentlySentMessage(tenantId, jid, 'welcome')) {
                    console.log(`[AntiDup] Welcome/Link já enviado recentemente para ${jid}, ignorando`);
                    return;
                }

                console.log(`[AutoWelcome] Enviando link automático para ${jid} (primeira mensagem do dia)`);
                const success = await this.sendWelcomeMessage(tenantId, jid, sanitizedNumber, currentSettings, pushName, sock);

                if (success) {
                    this.markWelcomeSent(tenantId, jid);
                    this.markMessageSent(tenantId, jid, 'welcome');
                    this.markMessageSent(tenantId, jid, 'link');
                    console.log(`[AutoWelcome] ✅ Marcado como enviado para ${jid}`);
                } else {
                    console.log(`[AutoWelcome] ❌ Falhou para ${jid}`);
                }
                return;
            }

        } catch (err) {
            console.error('Erro ao processar mensagem:', err.message);
        }
    }

    /**
     * Enviar mensagem de forma segura - Baileys version
     */
    async safeSendMessage(tenantId, jid, message, sock = null) {
        try {
            const socket = sock || this.clients.get(tenantId);
            if (!socket) {
                console.error(`[SafeSend] ❌ Socket não encontrado para tenant ${tenantId}`);
                return false;
            }

            console.log(`[SafeSend] 📤 Enviando mensagem para ${jid}...`);
            console.log(`[SafeSend] Mensagem: ${message.substring(0, 50)}...`);

            await socket.sendMessage(jid, { text: message });
            console.log(`[SafeSend] ✅ Mensagem enviada com sucesso para ${jid}`);
            return true;
        } catch (err) {
            console.error(`[SafeSend] ❌ ERRO ao enviar mensagem: ${err.message}`);
            return false;
        }
    }

    /**
     * Enviar mensagem de welcome
     */
    async sendWelcomeMessage(tenantId, jid, sanitizedNumber, settings, customerName = 'Cliente', sock = null) {
        try {
            const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            if (!tenant) {
                console.log(`[Welcome] Tenant ${tenantId} não encontrado`);
                return false;
            }

            const tenantSettings = JSON.parse(tenant.settings || '{}');
            const restaurantName = tenant.name || 'Restaurante';
            const orderLink = await this.buildOrderLink(tenantId, tenant, sanitizedNumber, null);
            console.log(`[Welcome] Link construído: ${orderLink}`);

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

            return await this.safeSendMessage(tenantId, jid, welcomeMessage, sock);
        } catch (err) {
            console.error(`[Welcome] ❌ ERRO: ${err.message}`);
            return false;
        }
    }

    /**
     * Construir link do pedido
     */
    async buildOrderLink(tenantId, tenant, sanitizedNumber, lidValue = null) {
        if (!tenant) {
            tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        }

        const settings = JSON.parse(tenant?.settings || '{}');
        const baseUrl = settings.siteUrl || process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const slug = tenant?.slug || 'loja';

        let link = `${baseUrl}/loja/${slug}`;

        if (sanitizedNumber) {
            link += `?whatsapp=${sanitizedNumber}`;
        }

        if (lidValue) {
            link += (link.includes('?') ? '&' : '?') + `lid=${lidValue}`;
        }

        return link;
    }

    // ============ MÉTODOS AUXILIARES ============

    shouldSendWelcome(tenantId, whatsappId) {
        const log = this.welcomeLogs.get(tenantId) || {};
        const lastSent = log[whatsappId];

        if (!lastSent) return true;

        const intervalMs = this.welcomeResendHours * 60 * 60 * 1000;
        return (Date.now() - lastSent) >= intervalMs;
    }

    markWelcomeSent(tenantId, whatsappId) {
        const log = this.welcomeLogs.get(tenantId) || {};
        log[whatsappId] = Date.now();
        this.welcomeLogs.set(tenantId, log);
    }

    hasRecentlySentMessage(tenantId, whatsappId, messageType = 'welcome') {
        const recentLog = this.recentMessages.get(tenantId) || {};
        const lastMessage = recentLog[`${whatsappId}_${messageType}`];

        if (!lastMessage) return false;

        const RECENT_THRESHOLD = 5 * 60 * 1000; // 5 minutos
        return (Date.now() - lastMessage.timestamp) < RECENT_THRESHOLD;
    }

    markMessageSent(tenantId, whatsappId, messageType = 'welcome') {
        const recentLog = this.recentMessages.get(tenantId) || {};
        recentLog[`${whatsappId}_${messageType}`] = {
            timestamp: Date.now(),
            type: messageType
        };
        this.recentMessages.set(tenantId, recentLog);
        console.log(`[AntiDup] Marcado ${messageType} para ${whatsappId} (tenant: ${tenantId})`);
    }

    // ============ API METHODS ============

    getQRCode(tenantId) {
        return this.qrCodes.get(tenantId);
    }

    getStatus(tenantId) {
        return this.statuses.get(tenantId) || 'NOT_INITIALIZED';
    }

    async disconnect(tenantId) {
        const sock = this.clients.get(tenantId);
        if (sock) {
            try {
                await sock.logout();
            } catch (e) { }
            this.clients.delete(tenantId);
        }
        this.statuses.set(tenantId, 'DISCONNECTED');
        return { success: true };
    }

    async sendMessage(tenantId, to, message) {
        const sock = this.clients.get(tenantId);
        if (!sock) {
            throw new Error('WhatsApp nao conectado');
        }

        // Formatar numero
        let jid = to;
        if (!jid.includes('@')) {
            if (!jid.startsWith('55') && jid.length >= 10 && jid.length <= 11) {
                jid = '55' + jid;
            }
            jid = jid + '@s.whatsapp.net';
        }

        return await this.safeSendMessage(tenantId, jid, message, sock);
    }

    /**
     * Get QR Code as Data URL
     */
    async getQRCodeDataURL(tenantId) {
        return this.qrCodes.get(tenantId);
    }

    /**
     * Reiniciar conexão WhatsApp
     */
    async restart(tenantId) {
        await this.disconnect(tenantId);
        await new Promise(r => setTimeout(r, 2000));
        await this.initializeForTenant(tenantId);
        return { success: true };
    }

    /**
     * Enviar confirmação de pedido
     */
    async sendOrderConfirmation(tenantId, whatsappId, orderData) {
        try {
            const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            const restaurantName = tenant?.name || 'Restaurante';

            const message = `✅ *Pedido Confirmado!*\n\n` +
                `Olá! Seu pedido #${orderData.orderNumber || orderData.id} foi recebido!\n\n` +
                `📋 *Resumo:*\n${orderData.items?.map(i => `- ${i.quantity}x ${i.name}`).join('\n') || 'Itens do pedido'}\n\n` +
                `💰 *Total:* R$ ${orderData.total?.toFixed(2) || '0.00'}\n\n` +
                `Obrigado por pedir no ${restaurantName}!`;

            // Formatar JID
            let jid = whatsappId;
            if (!jid.includes('@')) {
                if (!jid.startsWith('55') && jid.length >= 10) {
                    jid = '55' + jid;
                }
                jid = jid + '@s.whatsapp.net';
            }

            return await this.safeSendMessage(tenantId, jid, message);
        } catch (err) {
            console.error('[OrderConfirmation] Erro:', err.message);
            return false;
        }
    }

    /**
     * Enviar pedido para grupo
     */
    async sendOrderToGroup(tenantId, orderData) {
        try {
            const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            const settings = JSON.parse(tenant?.settings || '{}');
            const groupId = settings.whatsappGroupId;

            if (!groupId) {
                console.log('[GroupOrder] Grupo não configurado');
                return false;
            }

            const message = `🆕 *NOVO PEDIDO #${orderData.orderNumber || orderData.id}*\n\n` +
                `👤 Cliente: ${orderData.customerName || 'Cliente'}\n` +
                `📱 WhatsApp: ${orderData.whatsappId || 'N/A'}\n\n` +
                `📋 *Itens:*\n${orderData.items?.map(i => `- ${i.quantity}x ${i.name} - R$ ${(i.price * i.quantity).toFixed(2)}`).join('\n') || 'Itens do pedido'}\n\n` +
                `💰 *Total:* R$ ${orderData.total?.toFixed(2) || '0.00'}\n` +
                `📍 *Entrega:* ${orderData.deliveryType || 'A definir'}\n` +
                `📝 *Obs:* ${orderData.notes || 'Nenhuma'}`;

            return await this.safeSendMessage(tenantId, groupId, message);
        } catch (err) {
            console.error('[GroupOrder] Erro:', err.message);
            return false;
        }
    }
}

// Singleton
let instance = null;

export function initWhatsAppService(db) {
    if (!instance) {
        instance = new WhatsAppService(db);
    }
    return instance;
}

export function getWhatsAppService() {
    return instance;
}

export default WhatsAppService;
