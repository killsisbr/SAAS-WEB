// ============================================================
// WhatsApp Bot Service - Multi-Tenant
// Responde automaticamente com link tokenizado ou via IA
// ============================================================

import pkg from 'whatsapp-web.js';
import qrcodeImage from 'qrcode';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleConversation, handleLocation } from './conversation-handler.js';

const { Client, LocalAuth } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSIONS_DIR = path.join(__dirname, 'whatsapp-sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Cache de bots por tenant
const botInstances = new Map();

/**
 * Gerar token JWT para pedido
 * @param {string} phone - Telefone do cliente
 * @param {string} tenantId - ID do tenant
 * @param {string} secret - JWT secret do tenant
 * @returns {string} Token JWT
 */
export function generateOrderToken(phone, tenantId, secret) {
    const payload = {
        phone: phone.replace(/\D/g, ''), // Apenas digitos
        tenantId,
        type: 'order',
        iat: Math.floor(Date.now() / 1000)
    };

    // Token expira em 24 horas
    return jwt.sign(payload, secret, { expiresIn: '24h' });
}

/**
 * Verificar token JWT de pedido
 * @param {string} token - Token JWT
 * @param {string} secret - JWT secret do tenant
 * @returns {object|null} Payload decodificado ou null se invalido
 */
export function verifyOrderToken(token, secret) {
    try {
        const decoded = jwt.verify(token, secret);
        if (decoded.type !== 'order') return null;
        return decoded;
    } catch (error) {
        console.log('Token verification failed:', error.message);
        return null;
    }
}

/**
 * Classe principal do Bot WhatsApp por Tenant
 */
export class WhatsAppBot {
    constructor(tenantId, tenantSlug, settings = {}, db = null) {
        this.tenantId = tenantId;
        this.tenantSlug = tenantSlug;
        this.settings = settings;
        this.db = db;
        this.menuData = null;
        this.client = null;
        this.lastQRCode = null;
        this.isConnected = false;
        this.welcomeLog = new Map(); // Cache de welcomes enviados
        this.welcomeResendHours = settings.welcomeResendHours || 12;
        this.jwtSecret = settings.jwtSecret || process.env.JWT_SECRET || 'default-secret';
        this.domain = settings.domain || process.env.DOMAIN || 'killsis.com';
        this.restaurantName = settings.restaurantName || 'Delivery';
    }

    /**
     * Inicializar cliente WhatsApp
     */
    initialize() {
        const sessionId = `tenant-${this.tenantSlug}`;

        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: sessionId,
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

        this.client.on('qr', async qr => {
            console.log(`[${this.tenantSlug}] QR Code gerado`);
            this.lastQRCode = qr;
            this.isConnected = false;
        });

        this.client.on('ready', () => {
            console.log(`[${this.tenantSlug}] WhatsApp conectado!`);
            this.isConnected = true;
            this.lastQRCode = null;
        });

        this.client.on('disconnected', (reason) => {
            console.log(`[${this.tenantSlug}] WhatsApp desconectado:`, reason);
            this.isConnected = false;
        });

        this.client.on('message', async message => {
            await this.handleMessage(message);
        });

        this.client.initialize();
    }

    /**
     * Obter QR Code como Data URL
     */
    async getQRCodeDataURL() {
        if (!this.lastQRCode) {
            throw new Error('Nenhum QR Code disponivel');
        }
        return await qrcodeImage.toDataURL(this.lastQRCode, { width: 300 });
    }

    /**
     * Obter status do bot
     */
    getStatus() {
        return {
            connected: this.isConnected,
            qrCodeAvailable: !!this.lastQRCode,
            tenantId: this.tenantId,
            tenantSlug: this.tenantSlug
        };
    }

    /**
     * Verificar se deve enviar welcome (intervalo configuravel)
     */
    shouldSendWelcome(whatsappId) {
        const last = this.welcomeLog.get(whatsappId);
        if (!last) return true;

        const intervalMs = this.welcomeResendHours * 60 * 60 * 1000;
        return (Date.now() - last) >= intervalMs;
    }

    /**
     * Marcar welcome como enviado
     */
    markWelcomeSent(whatsappId) {
        this.welcomeLog.set(whatsappId, Date.now());
    }

    /**
     * Carregar dados do cardapio
     */
    async loadMenuData() {
        if (!this.db) return null;

        try {
            const categories = await this.db.all(
                'SELECT * FROM categories WHERE tenant_id = ? ORDER BY sort_order',
                [this.tenantId]
            );
            const products = await this.db.all(
                'SELECT * FROM products WHERE tenant_id = ? AND active = 1',
                [this.tenantId]
            );
            const addons = await this.db.all(
                'SELECT * FROM product_addons WHERE product_id IN (SELECT id FROM products WHERE tenant_id = ?)',
                [this.tenantId]
            );

            this.menuData = { categories, products, addons };
            return this.menuData;
        } catch (error) {
            console.error(`[${this.tenantSlug}] Erro ao carregar cardapio:`, error.message);
            return null;
        }
    }

    /**
     * Manipular mensagens recebidas
     */
    async handleMessage(message) {
        try {
            const chat = await message.getChat();

            // Ignorar grupos
            if (chat.isGroup) return;

            let contact;
            try {
                contact = await message.getContact();
            } catch {
                contact = { id: { _serialized: message.from }, pushname: 'Cliente' };
            }

            const whatsappId = contact.id._serialized;
            const phone = whatsappId.replace('@c.us', '');
            const msg = message.body?.trim() || '';

            console.log(`[${this.tenantSlug}] Msg de ${contact.pushname}: ${msg.substring(0, 50)}`);

            // Verificar se modo IA esta habilitado
            const aiConfig = this.settings.aiBot || {};
            if (aiConfig.enabled && aiConfig.apiKey && this.db) {
                // Carregar cardapio se necessario
                if (!this.menuData) {
                    await this.loadMenuData();
                }

                // Processar com IA
                const result = await handleConversation({
                    message: msg,
                    whatsappId,
                    tenantId: this.tenantId,
                    customerName: contact.pushname,
                    menuData: this.menuData,
                    tenantSettings: {
                        ...this.settings,
                        name: this.restaurantName
                    },
                    db: this.db
                });

                if (result && result.response) {
                    await chat.sendMessage(result.response);

                    // Se pedido criado, notificar (broadcast para admin)
                    if (result.orderCreated) {
                        console.log(`[${this.tenantSlug}] Pedido #${result.orderCreated.orderNumber} criado via IA`);
                    }
                    return;
                }
            }

            // FALLBACK: Modo link (quando IA nao esta habilitada)

            // Verificar se deve enviar welcome automatico
            if (this.shouldSendWelcome(whatsappId)) {
                await this.sendWelcomeMessage(chat, phone);
                this.markWelcomeSent(whatsappId);
                return;
            }

            // Comandos basicos
            const msgLower = msg.toLowerCase();
            if (['oi', 'ola', 'olá', 'opa', 'noite', 'bom dia', 'boa tarde', 'boa noite'].includes(msgLower)) {
                await this.sendWelcomeMessage(chat, phone);
            } else if (['pedir', 'pedido', 'cardapio', 'cardápio', 'menu'].includes(msgLower)) {
                await this.sendOrderLink(chat, phone);
            } else if (msgLower === 'ajuda') {
                await this.sendHelpMessage(chat);
            }
        } catch (err) {
            console.error(`[${this.tenantSlug}] Erro handleMessage:`, err.message);
        }
    }

    /**
     * Verificar se a loja esta aberta (manual override + horario automatico)
     */
    async isStoreOpen() {
        let settings = this.settings || {};

        // Se DB disponivel, buscar settings atualizadas
        if (this.db && this.tenantId) {
            try {
                const tenant = await this.db.get(
                    'SELECT settings FROM tenants WHERE id = ?',
                    [this.tenantId]
                );
                if (tenant && tenant.settings) {
                    settings = typeof tenant.settings === 'string'
                        ? JSON.parse(tenant.settings)
                        : tenant.settings;
                }
            } catch (e) {
                console.log(`[${this.tenantSlug}] Erro ao verificar status da loja:`, e.message);
            }
        }

        // Override manual: se isOpen esta definido explicitamente como false, respeitar
        if (settings.isOpen === false) {
            return false;
        }

        // Se isOpen esta true OU nao definido, verificar horario automatico
        return this.isWithinSchedule(settings.schedule);
    }

    /**
     * Verificar se esta dentro do horario de funcionamento
     */
    isWithinSchedule(schedule) {
        if (!schedule) return true; // Sem horario configurado = sempre aberta

        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Domingo, 1=Segunda, etc.

        // Mapear dia da semana para key do schedule
        const dayKeys = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
        const dayKey = dayKeys[dayOfWeek];

        const todaySchedule = schedule[dayKey];

        // Se nao tem horario para hoje = fechado
        if (!todaySchedule || !todaySchedule.open || !todaySchedule.close) {
            return false;
        }

        // Converter horario atual para minutos desde meia-noite
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        // Converter horarios de abertura/fechamento
        const [openHour, openMin] = todaySchedule.open.split(':').map(Number);
        const [closeHour, closeMin] = todaySchedule.close.split(':').map(Number);

        const openMinutes = openHour * 60 + openMin;
        const closeMinutes = closeHour * 60 + closeMin;

        // Verificar se horario atual esta dentro do intervalo
        // Caso especial: se fecha apos meia-noite (ex: 18:00 - 02:00)
        if (closeMinutes < openMinutes) {
            // Horario atravessa meia-noite
            return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
        }

        return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
    }

    /**
     * Enviar mensagem de loja fechada
     */
    async sendClosedMessage(chat) {
        const schedule = this.settings?.schedule || {};
        let horarioMsg = '';

        // Tentar mostrar horario de funcionamento
        if (schedule.seg && schedule.seg.open) {
            horarioMsg = `\n\nNosso horario de funcionamento:\nSeg-Sex: ${schedule.seg.open} - ${schedule.seg.close || '22:00'}`;
        }

        const message = `Ola! Obrigado por entrar em contato com ${this.restaurantName}!` +
            `\n\n*No momento estamos fechados.*${horarioMsg}` +
            `\n\nVolte mais tarde para fazer seu pedido!`;

        await chat.sendMessage(message);
    }

    /**
     * Enviar mensagem de boas-vindas com link simples
     */
    async sendWelcomeMessage(chat, phone) {
        // Verificar se loja esta aberta
        const isOpen = await this.isStoreOpen();

        if (!isOpen) {
            await this.sendClosedMessage(chat);
            return;
        }

        // Link simples com telefone (mais curto e limpo)
        const cleanPhone = phone.replace(/\D/g, '');
        const orderLink = `https://${this.domain}/loja/${this.tenantSlug}?p=${cleanPhone}`;

        const message = `Ola! Bem-vindo ao ${this.restaurantName}!\n\n` +
            `Faca seu pedido pelo link:\n${orderLink}\n\n` +
            `Seu pedido sera enviado diretamente para nos!`;

        await chat.sendMessage(message);
    }

    /**
     * Enviar apenas o link do pedido
     */
    async sendOrderLink(chat, phone) {
        const cleanPhone = phone.replace(/\D/g, '');
        const orderLink = `https://${this.domain}/loja/${this.tenantSlug}?p=${cleanPhone}`;

        const message = `Clique no link para fazer seu pedido:\n${orderLink}`;
        await chat.sendMessage(message);
    }

    /**
     * Enviar mensagem de ajuda
     */
    async sendHelpMessage(chat) {
        const message = `Como fazer seu pedido:\n\n` +
            `1. Clique no link que enviei\n` +
            `2. Monte seu pedido no site\n` +
            `3. Confirme e aguarde a entrega!\n\n` +
            `Qualquer duvida, estou aqui!`;

        await chat.sendMessage(message);
    }

    /**
     * Enviar confirmacao de pedido para o cliente
     */
    async sendOrderConfirmation(phone, orderData) {
        if (!this.isConnected) {
            console.log(`[${this.tenantSlug}] Bot desconectado, nao pode enviar confirmacao`);
            return false;
        }

        try {
            const chatId = phone.replace(/\D/g, '') + '@c.us';
            const chat = await this.client.getChatById(chatId);

            let itemsList = orderData.items.map(item =>
                `${item.quantity}x ${item.name} - R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}`
            ).join('\n');

            const message = `Pedido Confirmado! #${orderData.order_number}\n\n` +
                `Itens:\n${itemsList}\n\n` +
                `Total: R$ ${orderData.total.toFixed(2).replace('.', ',')}\n\n` +
                `Seu pedido esta sendo preparado!`;

            await chat.sendMessage(message);
            return true;
        } catch (err) {
            console.error(`[${this.tenantSlug}] Erro ao enviar confirmacao:`, err.message);
            return false;
        }
    }

    /**
     * Desconectar bot
     */
    async disconnect() {
        if (this.client) {
            await this.client.logout();
            this.isConnected = false;
            this.lastQRCode = null;
        }
    }

    /**
     * Destruir bot
     */
    async destroy() {
        if (this.client) {
            await this.client.destroy();
            this.client = null;
            this.isConnected = false;
        }
    }
}

/**
 * Obter ou criar instancia do bot para tenant
 */
export function getOrCreateBot(tenantId, tenantSlug, settings = {}, db = null) {
    const key = tenantId;

    if (botInstances.has(key)) {
        const bot = botInstances.get(key);
        // Atualizar db se fornecido
        if (db && !bot.db) {
            bot.db = db;
        }
        // Atualizar settings se necessario
        if (settings.aiBot) {
            bot.settings.aiBot = settings.aiBot;
        }
        return bot;
    }

    const bot = new WhatsAppBot(tenantId, tenantSlug, settings, db);
    botInstances.set(key, bot);
    return bot;
}

/**
 * Obter bot existente
 */
export function getBot(tenantId) {
    return botInstances.get(tenantId);
}

/**
 * Remover bot
 */
export async function removeBot(tenantId) {
    const bot = botInstances.get(tenantId);
    if (bot) {
        await bot.destroy();
        botInstances.delete(tenantId);
    }
}

export default {
    generateOrderToken,
    verifyOrderToken,
    WhatsAppBot,
    getOrCreateBot,
    getBot,
    removeBot
};
