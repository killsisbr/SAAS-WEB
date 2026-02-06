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
        this.maxReconnectAttempts = 15;
        this.reconnectDelay = 10000; // 10 segundos (base para exponential backoff)

        // Garantir que a tabela de mapeamento existe
        this.ensurePidJidTable();
    }

    /**
     * Criar tabela pid_jid_mappings se não existir
     */
    async ensurePidJidTable() {
        try {
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS pid_jid_mappings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tenant_id TEXT NOT NULL,
                    pid TEXT NOT NULL,
                    jid TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(tenant_id, pid)
                )
            `);
            await this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_pid_jid_mappings ON pid_jid_mappings(tenant_id, pid)
            `);
            console.log('[WhatsApp] Tabela pid_jid_mappings verificada/criada');
        } catch (err) {
            console.error('[WhatsApp] Erro ao criar tabela pid_jid_mappings:', err.message);
        }
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

                // Verificar se existe sessão salva no disco
                const sessionDir = path.join(SESSIONS_DIR, `session-${tenant.id}`);
                const hasSession = fs.existsSync(sessionDir) && fs.existsSync(path.join(sessionDir, 'creds.json'));

                // Reconectar se:
                // 1. Bot habilitado (básico ou IA) OU
                // 2. Existe sessão salva no disco (foi conectado antes)
                if (settings.whatsappBotEnabled || settings.aiBot?.enabled || hasSession) {
                    console.log(`[WhatsApp] Auto-conectando tenant: ${tenant.name} (${tenant.id})${hasSession ? ' [sessão existente]' : ''}`);

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

        const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutos

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

        console.log('[WhatsApp] Health check iniciado (intervalo: 2 min)');
    }

    /**
     * Reconectar tenant
     */
    async reconnectTenant(tenantId) {
        const attempts = this.reconnectAttempts.get(tenantId) || 0;

        if (attempts >= this.maxReconnectAttempts) {
            console.error(`[WhatsApp] Max tentativas atingidas para tenant ${tenantId}`);
            this.statuses.set(tenantId, 'FAILED');
            // Agendar reset automatico em 1 hora para tentar novamente
            console.log(`[WhatsApp] Agendando auto-reset em 1h para tenant ${tenantId}`);
            setTimeout(() => {
                console.log(`[WhatsApp] Auto-reset executado para tenant ${tenantId}`);
                this.reconnectAttempts.set(tenantId, 0);
                this.initializeForTenant(tenantId);
            }, 60 * 60 * 1000);
            return;
        }

        this.reconnectAttempts.set(tenantId, attempts + 1);

        // Exponential backoff: 10s, 20s, 40s, 80s, ... max 5min
        const delay = Math.min(this.reconnectDelay * Math.pow(2, attempts), 5 * 60 * 1000);
        console.log(`[WhatsApp] Tentativa ${attempts + 1} de reconexao para tenant ${tenantId} (delay: ${Math.round(delay / 1000)}s)`);

        try {
            await this.initializeForTenant(tenantId);
            this.reconnectAttempts.set(tenantId, 0); // Reset on success
        } catch (err) {
            console.error(`[WhatsApp] Falha ao reconectar:`, err.message);
            // Agendar proxima tentativa com backoff
            setTimeout(() => this.reconnectTenant(tenantId), delay);
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
            // Configurações de estabilidade para evitar Status 408
            keepAliveIntervalMs: 25000, // Ping a cada 25 segundos
            retryRequestDelayMs: 250, // Delay entre retry de requests
            connectTimeoutMs: 60000, // 60 segundos para conectar
            qrTimeout: 45000, // 45 segundos para escanear QR
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
                // [FIX] Corrigido bug: instanceof retorna boolean, não objeto
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(`[WhatsApp] Conexao fechada para tenant ${tenantId}. Status: ${statusCode}, Reconectando: ${shouldReconnect}`);

                if (shouldReconnect) {
                    this.statuses.set(tenantId, 'RECONNECTING');
                    // Delay randomizado para evitar rate-limit do WhatsApp
                    const delay = 5000 + Math.random() * 5000; // 5-10 segundos
                    setTimeout(() => this.initializeForTenant(tenantId), delay);
                } else {
                    this.statuses.set(tenantId, 'LOGGED_OUT');
                    this.clients.delete(tenantId);
                    // Apagar sessao se foi logout
                    try {
                        fs.rmSync(authDir, { recursive: true, force: true });
                    } catch (e) { /* ignore */ }
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
            // Ignorar history sync (append) e outros tipos que não sejam notify
            if (m.type !== 'notify') return;

            for (const msg of m.messages) {
                // [CRITICAL] Ignorar mensagens do proprio bot
                if (msg.key.fromMe) return;

                // Ignorar mensagens de status/broadcast
                if (msg.key.remoteJid === 'status@broadcast') return;

                // Ignorar mensagens muito antigas (evitar processar backlog em loop)
                const msgTime = (msg.messageTimestamp || 0);
                const now = Math.floor(Date.now() / 1000);
                if (now - msgTime > 30) { // Ignorar mensagens com mais de 30s
                    return;
                }

                // Processar comandos de grupos ANTES de ignorar
                if (msg.key.remoteJid?.endsWith('@g.us')) {
                    await this.handleGroupCommand(tenantId, msg, sock);
                    continue; // Não processar como mensagem normal
                }

                await this.handleMessage(tenantId, msg, settings, sock);
            }
        });

        // Armazenar sockettt
        this.clients.set(tenantId, sock);
    }

    /**
     * Handler de mensagens - Baileys version
     */
    async handleMessage(tenantId, message, settings, sock) {
        try {
            console.log(`[handleMessage] === MENSAGEM RECEBIDA para tenant ${tenantId} ===`);
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

            // ============ VERIFICAR MODO DE OPERAÇÃO ============
            const orderMode = currentSettings.whatsappOrderMode || 'link'; // 'link' | 'direct' | 'ai'
            console.log(`[OrderMode] Tenant ${tenantId} está usando modo: ${orderMode}`);

            // MODO DIRETO: Pedidos conversacionais via WhatsApp
            if (orderMode === 'direct') {
                try {
                    console.log(`[DirectOrder] Importando módulos...`);
                    const { processDirectOrder } = await import('./direct-order/index.js');
                    const { broadcast } = await import('./server.js');
                    console.log(`[DirectOrder] Módulos importados, processando...`);

                    // Detectar mensagem de localização
                    const locationMessage = message.message?.locationMessage;
                    let locationData = null;
                    if (locationMessage) {
                        locationData = {
                            latitude: locationMessage.degreesLatitude,
                            longitude: locationMessage.degreesLongitude
                        };
                        console.log(`[DirectOrder] Localização recebida: ${JSON.stringify(locationData)}`);
                    }

                    // UNIFICAÇÃO: Usar a MESMA função buildOrderLink() que o Modo Link usa
                    // Isso garante paridade entre os dois modos
                    const orderLink = await this.buildOrderLink(tenantId, tenant, sanitizedNumber, null, jid);
                    console.log(`[DirectOrder] Link gerado por buildOrderLink: ${orderLink}`);

                    const result = await processDirectOrder({
                        message: messageBody,
                        jid,
                        tenantId,
                        customerName: pushName,
                        sock,
                        db: this.db,
                        broadcast,  // Passar broadcast SSE para atualizar quadro
                        location: locationData,  // Passar localização se disponível
                        orderLink  // NOVO: Link já computado pelo mesmo código do Modo Link
                    });

                    if (result?.response) {
                        await this.safeSendMessage(tenantId, jid, result.response, sock);
                        console.log(`[DirectOrder] Resposta enviada para ${jid}`);
                    }
                } catch (err) {
                    console.error('[DirectOrder] Erro no processamento:', err.message);
                    console.error('[DirectOrder] Stack:', err.stack);
                }
                return; // Não processar como modo link
            }

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

                        // Preparar link da loja (passa jid para salvar mapeamento)
                        let orderLink = await this.buildOrderLink(tenantId, tenant, sanitizedNumber, null, jid);
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
     * Handler de comandos em grupos - processa .grupodefine
     */
    async handleGroupCommand(tenantId, message, sock) {
        try {
            const groupJid = message.key.remoteJid;

            // Extrair texto da mensagem
            const messageBody = message.message?.conversation ||
                message.message?.extendedTextMessage?.text ||
                '';

            if (!messageBody) return;

            const command = messageBody.trim().toLowerCase();

            // Comando .grupodefine - Define este grupo para receber pedidos
            if (command === '.grupodefine') {
                console.log(`[GroupCommand] Comando .grupodefine recebido no grupo ${groupJid}`);

                // Buscar tenant e atualizar settings
                const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
                if (!tenant) {
                    console.log(`[GroupCommand] Tenant ${tenantId} não encontrado`);
                    return;
                }

                const settings = JSON.parse(tenant.settings || '{}');
                settings.whatsappGroupId = groupJid;

                // Salvar no banco
                await this.db.run(
                    'UPDATE tenants SET settings = ? WHERE id = ?',
                    [JSON.stringify(settings), tenantId]
                );

                console.log(`[GroupCommand] ✅ Grupo ${groupJid} definido para tenant ${tenantId}`);

                // Enviar confirmação no grupo
                const confirmMessage = `✅ *Grupo configurado com sucesso!*\n\n` +
                    `Este grupo foi definido para receber notificações de novos pedidos.\n\n` +
                    `📋 *ID do Grupo:* \`${groupJid}\`\n` +
                    `🏪 *Loja:* ${tenant.name}`;

                await this.safeSendMessage(tenantId, groupJid, confirmMessage, sock);
            }

            // Comando .gruporemover - Remove este grupo das notificações
            if (command === '.gruporemover') {
                console.log(`[GroupCommand] Comando .gruporemover recebido no grupo ${groupJid}`);

                const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
                if (!tenant) return;

                const settings = JSON.parse(tenant.settings || '{}');

                if (settings.whatsappGroupId === groupJid) {
                    delete settings.whatsappGroupId;

                    await this.db.run(
                        'UPDATE tenants SET settings = ? WHERE id = ?',
                        [JSON.stringify(settings), tenantId]
                    );

                    console.log(`[GroupCommand] ✅ Grupo ${groupJid} removido do tenant ${tenantId}`);

                    const confirmMessage = `❌ *Grupo removido!*\n\n` +
                        `Este grupo não receberá mais notificações de pedidos.`;

                    await this.safeSendMessage(tenantId, groupJid, confirmMessage, sock);
                }
            }

            // Comando .grupostatus - Verifica se o grupo está configurado
            if (command === '.grupostatus') {
                const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
                if (!tenant) return;

                const settings = JSON.parse(tenant.settings || '{}');

                let statusMessage;
                if (settings.whatsappGroupId === groupJid) {
                    statusMessage = `✅ *Este grupo está configurado*\n\n` +
                        `📋 Pedidos serão enviados aqui.\n` +
                        `🏪 Loja: ${tenant.name}`;
                } else if (settings.whatsappGroupId) {
                    statusMessage = `⚠️ *Outro grupo está configurado*\n\n` +
                        `Use \`.grupodefine\` para mudar para este grupo.`;
                } else {
                    statusMessage = `❌ *Nenhum grupo configurado*\n\n` +
                        `Use \`.grupodefine\` para configurar este grupo.`;
                }

                await this.safeSendMessage(tenantId, groupJid, statusMessage, sock);
            }

        } catch (err) {
            console.error('[GroupCommand] Erro:', err.message);
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
            const orderLink = await this.buildOrderLink(tenantId, tenant, sanitizedNumber, null, jid);
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
     * @param {string} jid - JID completo do cliente (para salvar mapeamento)
     */
    async buildOrderLink(tenantId, tenant, sanitizedNumber, lidValue = null, jid = null) {
        if (!tenant) {
            tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        }

        const settings = JSON.parse(tenant?.settings || '{}');
        const storedUrl = settings.siteUrl || settings.domain;
        const envBaseUrl = process.env.BASE_URL || process.env.APP_DOMAIN;
        const envDomain = process.env.DOMAIN;

        let baseUrl = '';

        // Se houver uma URL no banco, mas for localhost e tivermos uma env de produção, priorizamos a env
        const isStoredLocal = storedUrl && (storedUrl.includes('localhost') || storedUrl.includes('127.0.0.1'));

        if (storedUrl && !isStoredLocal) {
            baseUrl = storedUrl;
        } else if (envBaseUrl) {
            baseUrl = envBaseUrl;
        } else if (envDomain) {
            const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
            baseUrl = `${protocol}://${envDomain}`;
        } else {
            // Fallback para o que estiver no banco (mesmo que seja localhost) ou localhost padrão
            baseUrl = storedUrl || `http://localhost:${process.env.PORT || 3000}`;
        }

        // Garantir que não termina com barra
        baseUrl = baseUrl.replace(/\/$/, '');

        const slug = tenant?.slug || 'loja';
        let link = `${baseUrl}/loja/${slug}`;

        if (sanitizedNumber) {
            link += `?whatsapp=${sanitizedNumber}`;

            // IMPORTANTE: Salvar mapeamento PID -> JID para poder responder depois
            if (jid) {
                try {
                    await this.db.run(`
                        INSERT OR REPLACE INTO pid_jid_mappings (tenant_id, pid, jid, created_at)
                        VALUES (?, ?, ?, datetime('now'))
                    `, [tenantId, sanitizedNumber, jid]);
                    console.log(`[PID->JID] Salvo mapeamento: ${sanitizedNumber} -> ${jid}`);
                } catch (err) {
                    console.error(`[PID->JID] Erro ao salvar mapeamento:`, err.message);
                }
            }
        }

        if (lidValue) {
            link += (link.includes('?') ? '&' : '?') + `lid=${lidValue}`;
        }

        console.log(`[LinkBuilder] Tenant: ${tenant?.slug}, Stored: ${storedUrl}, Env: ${envDomain}, Final: ${baseUrl}`);

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
     * Hard Reset - Desconectar e APAGAR arquivos de sessão
     */
    async hardReset(tenantId) {
        console.log(`[WhatsApp] Executando Hard Reset para tenant ${tenantId}...`);

        // 1. Tentar desconectar graciosamente
        await this.disconnect(tenantId);

        // 2. Aguardar
        await new Promise(r => setTimeout(r, 1000));

        // 3. Forçar remoção da pasta da sessão
        const authDir = path.join(SESSIONS_DIR, `session-${tenantId}`);
        try {
            if (fs.existsSync(authDir)) {
                console.log(`[WhatsApp] Removendo diretório de sessão: ${authDir}`);
                fs.rmSync(authDir, { recursive: true, force: true });
            }
        } catch (err) {
            console.error(`[WhatsApp] Erro ao remover sessão no hard reset: ${err.message}`);
        }

        // 4. Limpar status
        this.statuses.delete(tenantId);
        this.qrCodes.delete(tenantId);
        this.clients.delete(tenantId);

        // 5. Reinicializar
        await new Promise(r => setTimeout(r, 1000));
        await this.initializeForTenant(tenantId); // Isso deve gerar novo QR Code

        return { success: true };
    }

    /**
     * Salvar mapeamento LID -> Telefone
     */
    async saveLidPhoneMapping(tenantId, lid, phone) {
        try {
            const cleanPhone = String(phone).replace(/\D/g, '');
            const id = `lid_${Date.now()}_${Math.random().toString(36).substring(7)}`;

            await this.db.run(
                `INSERT INTO lid_phone_mappings (id, lid, phone, tenant_id) 
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(lid, tenant_id) DO UPDATE SET phone = ?, updated_at = CURRENT_TIMESTAMP`,
                [id, lid, cleanPhone, tenantId, cleanPhone]
            );
            return true;
        } catch (err) {
            console.error('[WhatsApp] Erro ao salvar mapeamento LID:', err.message);
            return false;
        }
    }

    /**
     * Enviar confirmação de pedido
     * IMPORTANTE: Prioriza customer_phone do orderData (telefone real)
     * porque whatsappId pode ser PID/LID que não funciona para envio
     */
    async sendOrderConfirmation(tenantId, whatsappId, orderData) {
        try {
            const tenant = await this.db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            const settings = JSON.parse(tenant?.settings || '{}');
            const restaurantName = tenant?.name || 'Restaurante';

            // Montar mensagem de confirmação (formato premium)
            let itemsList = '';
            let subtotal = 0;
            const items = orderData.items || [];

            items.forEach(item => {
                const qty = item.quantity || item.qty || 1;
                const price = item.price || 0;
                const name = item.name || item.title || 'Item';
                const itemTotal = item.total || (price * qty);

                // Calcular total dos adicionais primeiro
                let itemAddonsTotal = 0;
                if (item.addons && item.addons.length > 0) {
                    itemAddonsTotal = item.addons.reduce((sum, addon) => sum + ((addon.price || 0) * qty), 0);
                }

                // Exibir preço base (Total do item - Adicionais)
                // Isso evita que pareça que o adicional está sendo cobrado 2x
                const displayBasePrice = itemTotal - itemAddonsTotal;

                // Acumular subtotal principal (apenas debug/fallback, finalTotal usa orderData.total)
                subtotal += itemTotal;
                if (item.total === undefined) {
                    // Se item.total veio undefined, calculamos (price*qty), mas precisamos somar addons no subtotal geral
                    // SE os addons não estivessem inclusos em price. 
                    // Mas assumindo lógica segura: itemTotal contém tudo.
                    // Se itemTotal era só price*qty (base), então itemAddonsTotal deve ser somado ao subtotal?
                    // A lógica anterior somava: subtotal += itemTotal; subtotal += addonTotal;
                    // Se itemTotal ERA 23 (full), somar 5 dava 28. Errado.
                    // Se itemTotal ERA 18 (base), somar 5 da 23. Certo.
                    // O screenshot mostrou Total 30 (Correto). Então o backend Order Total estava certo.
                    // O problema era apenas visual.
                    // Vamos manter a lógica de soma interna igual a anterior só para garantir, 
                    // mas mudando A STRING DA MENSAGEM.
                    subtotal += itemAddonsTotal;
                } else {
                    // Se item.total já existia (full), não somamos addonsTotal no subtotal geral de novo
                    // porem a logica original somava...
                    // A subtotal calculation aqui é meio inútil se tem orderData.total.
                    // Vamos focar NA STRING.
                }

                // CORREÇÃO: A lógica anterior somava itemTotal E addonTotal acumulativamente no subtotal.
                // Vou manter subtotal += addonTotal se itemTotal for (price*qty).
                // Mas para DISPLAY, usamos displayBasePrice.

                itemsList += `• ${qty}x ${name} - R$ ${displayBasePrice.toFixed(2).replace('.', ',')}\n`;

                if (item.addons && item.addons.length > 0) {
                    item.addons.forEach(addon => {
                        const addonTotal = (addon.price || 0) * qty;
                        // Nota: a lógica anterior somava ao subtotal aqui.
                        // subtotal += addonTotal;
                        itemsList += `  + ${addon.name} - R$ ${addonTotal.toFixed(2).replace('.', ',')}\n`;
                    });
                }
            });

            const deliveryFee = orderData.delivery_fee || 0;
            const total = parseFloat(orderData.total || 0);
            const finalTotal = total > 0 ? total : (subtotal + deliveryFee);

            const summaryLines = [];
            summaryLines.push('✅ *Pedido Confirmado!*');
            summaryLines.push('');
            summaryLines.push(`Número do pedido: #${orderData.order_number || orderData.orderNumber}`);
            summaryLines.push('');
            summaryLines.push('Itens:');
            summaryLines.push(itemsList.trim());
            if (deliveryFee > 0) {
                summaryLines.push(`• Taxa de entrega - R$ ${deliveryFee.toFixed(2).replace('.', ',')}`);
            }
            summaryLines.push(`*Total: R$ ${finalTotal.toFixed(2).replace('.', ',')}*`);
            summaryLines.push('');

            // Dados do PIX se for pagamento PIX
            const paymentMethod = (orderData.payment_method || '').toUpperCase();
            const pixKey = settings.pixKey || settings.pix_key || '';
            const pixName = settings.pixName || settings.pix_holder_name || '';

            if (paymentMethod.includes('PIX') && pixKey) {
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

            summaryLines.push(`*Seu pedido será preparado e entregue em breve!*`);
            summaryLines.push(`Obrigado por pedir no ${restaurantName}!`);

            const message = summaryLines.join('\n');

            // ESTRATÉGIA: Buscar JID salvo no mapeamento PID->JID
            let jid = null;

            if (whatsappId) {
                // Extrair o número/PID do whatsappId (remover @c.us, @s.whatsapp.net, etc)
                const pid = whatsappId.replace(/@.*$/, '');

                // Verificar se parece ser um PID (15+ dígitos)
                if (pid.length >= 15) {
                    // Buscar JID salvo no mapeamento
                    try {
                        const mapping = await this.db.get(
                            'SELECT jid FROM pid_jid_mappings WHERE tenant_id = ? AND pid = ?',
                            [tenantId, pid]
                        );
                        if (mapping && mapping.jid) {
                            jid = mapping.jid;
                            console.log(`[OrderConfirmation] Usando JID do mapeamento: ${pid} -> ${jid}`);
                        } else {
                            console.log(`[OrderConfirmation] ⚠️ Mapeamento não encontrado para PID: ${pid}`);

                            // [FIX] NÃO usar whatsappId (PID) diretamente se falhar mapeamento, pois PID não é roteável
                            // Se tiver menos de 15 digitos, pode ser telefone mal formatado
                            if (pid.length < 15) {
                                let phone = pid.replace(/\D/g, '');
                                if (!phone.startsWith('55') && phone.length >= 10 && phone.length <= 11) phone = '55' + phone;
                                jid = phone + '@s.whatsapp.net';
                            }
                            // Se for PID longo e não achou mapeamento, deixamos jid = null.
                            // O código abaixo (fallback customerPhone) tentará usar o telefone do cadastro.
                        }
                    } catch (err) {
                        console.error(`[OrderConfirmation] Erro ao buscar mapeamento:`, err.message);
                        jid = whatsappId;
                    }
                } else {
                    // Parece ser um telefone, formatar corretamente
                    let phone = whatsappId.replace(/@.*$/, '').replace(/\D/g, '');
                    // Adicionar código do país se necessário
                    if (!phone.startsWith('55') && phone.length >= 10 && phone.length <= 11) {
                        phone = '55' + phone;
                    }
                    jid = phone + '@s.whatsapp.net';
                    console.log(`[OrderConfirmation] Usando whatsappId como telefone: ${jid}`);
                }
            }

            if (!jid) {
                // Fallback: usar telefone do pedido se não tiver whatsappId
                const customerPhone = orderData.customer_phone || orderData.customerPhone;
                if (customerPhone) {
                    let cleanPhone = String(customerPhone).replace(/\D/g, '');

                    // Verificar se parece um telefone válido (não um PID)
                    if (cleanPhone.length >= 10 && cleanPhone.length <= 13) {
                        if (!cleanPhone.startsWith('55') && cleanPhone.length >= 10 && cleanPhone.length <= 11) {
                            cleanPhone = '55' + cleanPhone;
                        }
                        jid = cleanPhone + '@s.whatsapp.net';
                        console.log(`[OrderConfirmation] Usando telefone: ${cleanPhone}`);
                    } else {
                        console.log(`[OrderConfirmation] ⚠️ customerPhone parece ser PID: ${cleanPhone}`);
                    }
                }
            }

            if (!jid) {
                console.log(`[OrderConfirmation] ⚠️ Sem destino válido para enviar confirmação`);
                return false;
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

            // Montar mensagem do grupo (FORMATO PREMIUM)
            let itemsList = '';
            let subtotal = 0;

            const items = orderData.items || [];
            items.forEach(item => {
                const qty = item.quantity || item.qty || 1;
                const price = item.price || 0;
                const name = item.name || item.title || 'Item';
                const itemTotal = item.total || (price * qty);
                subtotal += itemTotal;
                itemsList += `• ${qty}x ${name} - R$ ${itemTotal.toFixed(2).replace('.', ',')}\n`;

                if (item.addons && item.addons.length > 0) {
                    item.addons.forEach(addon => {
                        const addonTotal = (addon.price || 0) * qty;
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
            const finalTotal = total > 0 ? total : calculatedTotal;

            const groupLines = [];
            groupLines.push(`🍔 *NOVO PEDIDO #${orderData.order_number || orderData.orderNumber || 'N/A'}*`);
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
            groupLines.push(`Nome: ${orderData.customer_name || orderData.customerName || 'Cliente'}`);

            let addressText = '';
            let mapsLink = '';
            let addressObservation = '';

            if (orderData.address && typeof orderData.address === 'object') {
                const { street, number, neighborhood, city, complement, reference, lat, lng } = orderData.address;

                let parts = [];
                if (street) parts.push(street);
                if (number) parts.push(number);
                addressText = parts.join(', ');

                if (neighborhood) addressText += ` - ${neighborhood}`;
                if (city) addressText += ` - ${city}`;
                if (complement) addressText += `\nComplemento: ${complement}`;

                if (reference) addressObservation = reference;

                if (lat && lng) {
                    mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
                }
                groupLines.push(`Endereço: ${addressText || 'Não informado'}`);
            } else if (typeof orderData.address === 'string' && orderData.address.trim()) {
                addressText = orderData.address;
                groupLines.push(`Endereço: ${addressText}`);
            } else {
                groupLines.push(`📍 *RETIRADA NO LOCAL*`);
            }

            // Traduzir método de pagamento
            const groupPaymentLabels = {
                'PIX': 'PIX',
                'CREDIT_CARD': 'Cartão',
                'DEBIT_CARD': 'Cartão (Débito)',
                'CASH': 'Dinheiro',
                'LOCAL': 'Pagamento no Local'
            };
            const paymentMethod = orderData.payment_method || orderData.paymentMethod || 'N/A';
            groupLines.push(`Pagamento: ${groupPaymentLabels[paymentMethod] || paymentMethod}`);

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
            let cleanPhone = (orderData.customer_phone || orderData.customerPhone || '').replace(/\D/g, '');

            // [FIX] Se for PID no grupo, tentar resolver para telefone real para gerar link wa.me correto
            if (cleanPhone.length >= 15) {
                try {
                    // Tentar resolver PID -> JID (telefone)
                    const mapping = await this.db.get(
                        'SELECT jid FROM pid_jid_mappings WHERE tenant_id = ? AND pid = ?',
                        [tenantId, cleanPhone]
                    );
                    if (mapping?.jid) {
                        cleanPhone = mapping.jid.replace(/@.*$/, '').replace(/\D/g, '');
                    }
                } catch (e) { }
            }

            if (cleanPhone && !cleanPhone.startsWith('55') && cleanPhone.length >= 10 && cleanPhone.length <= 11) {
                cleanPhone = '55' + cleanPhone;
            }
            if (cleanPhone && cleanPhone.length < 15) { // Só exibir link se for telefone real, não PID
                groupLines.push(`📱 *WhatsApp do Cliente*: https://wa.me/${cleanPhone}`);
            } else if (cleanPhone) {
                groupLines.push(`📱 *WhatsApp (PID)*: ${cleanPhone} (Link indisponível)`);
            }

            // Link de localização do Google Maps
            if (mapsLink) {
                groupLines.push(`📍 *Localização*: ${mapsLink}`);
            }

            // Observações do local
            const obsLocal = orderData.observation || addressObservation || orderData.notes;
            if (obsLocal) {
                groupLines.push(`📝 Observações do local: ${obsLocal}`);
            }

            groupLines.push('');

            const message = groupLines.join('\n');

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
