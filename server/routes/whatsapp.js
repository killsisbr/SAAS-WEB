// ============================================================
// Rotas do WhatsApp - DeliveryHub SaaS
// Autor: killsis (Lucas Larocca)
// ============================================================

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { getWhatsAppService } from '../whatsapp-service.js';
import { getFollowUpService } from '../services/follow-up.js';

export default function (db) {
    const router = Router();
    const whatsappService = getWhatsAppService(db);

    // Auto-reconectar todos os WhatsApps ativos ao iniciar servidor
    // Executar apos pequeno delay para garantir que o servidor esta pronto
    setTimeout(async () => {
        await whatsappService.autoReconnectAll();

        // Iniciar servico de follow-up
        const followUpService = getFollowUpService(db);
        followUpService.init();
    }, 5000);

    // ========================================
    // POST /api/whatsapp/initialize - Iniciar WhatsApp
    // ========================================
    router.post('/initialize', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            await whatsappService.initializeForTenant(req.tenantId);
            res.json({ success: true, message: 'WhatsApp inicializado' });
        } catch (error) {
            console.error('Erro ao inicializar WhatsApp:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // GET /api/whatsapp/status - Status da conexao
    // ========================================
    router.get('/status', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const status = whatsappService.getStatus(req.tenantId);
            res.json(status);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // GET /api/whatsapp/qr - QR Code para conectar
    // ========================================
    router.get('/qr', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const qrDataUrl = await whatsappService.getQRCodeDataURL(req.tenantId);

            if (!qrDataUrl) {
                return res.json({
                    available: false,
                    message: 'QR Code nao disponivel. WhatsApp pode ja estar conectado ou nao inicializado.'
                });
            }

            res.json({ available: true, qrCode: qrDataUrl });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // POST /api/whatsapp/disconnect - Desconectar
    // ========================================
    router.post('/disconnect', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            await whatsappService.disconnect(req.tenantId);
            res.json({ success: true, message: 'WhatsApp desconectado' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // POST /api/whatsapp/restart - Reiniciar
    // ========================================
    router.post('/restart', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            await whatsappService.restart(req.tenantId);
            res.json({ success: true, message: 'WhatsApp reiniciado' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // POST /api/whatsapp/send-confirmation - Enviar confirmacao
    // ========================================
    router.post('/send-confirmation', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { whatsappId, orderData } = req.body;

            if (!whatsappId || !orderData) {
                return res.status(400).json({ error: 'whatsappId e orderData sao obrigatorios' });
            }

            const sent = await whatsappService.sendOrderConfirmation(req.tenantId, whatsappId, orderData);

            res.json({ success: sent });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // POST /api/whatsapp/send-to-group - Enviar para grupo
    // ========================================
    router.post('/send-to-group', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { orderData } = req.body;

            if (!orderData) {
                return res.status(400).json({ error: 'orderData e obrigatorio' });
            }

            const sent = await whatsappService.sendOrderToGroup(req.tenantId, orderData);

            res.json({ success: sent });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // PUT /api/whatsapp/settings - Atualizar configuracoes
    // ========================================
    router.put('/settings', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { whatsappBotEnabled, whatsappGroupId, botMessages, aiBot, triggers } = req.body;

            // Buscar tenant atual
            const tenant = await db.get('SELECT settings FROM tenants WHERE id = ?', [req.tenantId]);
            const settings = JSON.parse(tenant?.settings || '{}');

            // Atualizar settings
            if (whatsappBotEnabled !== undefined) {
                settings.whatsappBotEnabled = whatsappBotEnabled;
            }
            if (whatsappGroupId !== undefined) {
                settings.whatsappGroupId = whatsappGroupId;
            }
            // Salvar mensagens do bot
            if (botMessages !== undefined) {
                settings.botMessages = botMessages;
            }
            // Salvar config de IA
            if (aiBot !== undefined) {
                settings.aiBot = aiBot;
            }
            // Salvar gatilhos de palavras-chave
            if (triggers !== undefined) {
                settings.triggers = triggers;
            }

            await db.run(
                'UPDATE tenants SET settings = ? WHERE id = ?',
                [JSON.stringify(settings), req.tenantId]
            );

            res.json({ success: true, settings });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // GET /api/whatsapp/groups - Listar grupos
    // ========================================
    router.get('/groups', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const client = whatsappService.clients.get(req.tenantId);

            if (!client) {
                return res.status(400).json({ error: 'WhatsApp nao conectado' });
            }

            const chats = await client.getChats();
            const groups = chats.filter(chat => chat.isGroup).map(g => ({
                name: g.name,
                id: g.id._serialized
            }));

            res.json(groups);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}
