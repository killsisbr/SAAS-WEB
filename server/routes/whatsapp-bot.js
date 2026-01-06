// ============================================================
// Rotas de WhatsApp Bot - Gerenciamento por Tenant
// ============================================================

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { getOrCreateBot, getBot, removeBot } from '../services/whatsapp-bot.js';
import { getFollowUpService } from '../services/follow-up.js';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/whatsapp/status - Status do bot
    // ========================================
    router.get('/status', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const bot = getBot(req.tenantId);

            if (!bot) {
                return res.json({
                    initialized: false,
                    connected: false,
                    message: 'Bot nao inicializado'
                });
            }

            const status = bot.getStatus();
            res.json({
                initialized: true,
                ...status
            });
        } catch (error) {
            console.error('WhatsApp status error:', error);
            res.status(500).json({ error: 'Erro ao obter status' });
        }
    });

    // ========================================
    // POST /api/whatsapp/start - Iniciar bot
    // ========================================
    router.post('/start', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [req.tenantId]);
            if (!tenant) {
                return res.status(404).json({ error: 'Tenant nao encontrado' });
            }

            const settings = JSON.parse(tenant.settings || '{}');

            const bot = getOrCreateBot(req.tenantId, tenant.slug, {
                restaurantName: tenant.name,
                domain: settings.domain || process.env.DOMAIN || 'killsis.com',
                jwtSecret: settings.jwtSecret || process.env.JWT_SECRET,
                welcomeResendHours: settings.welcomeResendHours || 12,
                aiBot: settings.aiBot || {}
            }, db);

            if (!bot.client) {
                bot.initialize();
            }

            res.json({
                success: true,
                message: 'Bot iniciado. Aguarde o QR Code.',
                status: bot.getStatus()
            });
        } catch (error) {
            console.error('WhatsApp start error:', error);
            res.status(500).json({ error: 'Erro ao iniciar bot' });
        }
    });

    // ========================================
    // GET /api/whatsapp/qr - Obter QR Code
    // ========================================
    router.get('/qr', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const bot = getBot(req.tenantId);

            if (!bot) {
                return res.status(400).json({ error: 'Bot nao inicializado' });
            }

            if (bot.isConnected) {
                return res.json({
                    connected: true,
                    message: 'WhatsApp ja conectado'
                });
            }

            if (!bot.lastQRCode) {
                return res.json({
                    connected: false,
                    qrAvailable: false,
                    message: 'QR Code ainda nao disponivel. Aguarde...'
                });
            }

            const qrDataURL = await bot.getQRCodeDataURL();
            res.json({
                connected: false,
                qrAvailable: true,
                qrCode: qrDataURL
            });
        } catch (error) {
            console.error('WhatsApp QR error:', error);
            res.status(500).json({ error: 'Erro ao obter QR Code' });
        }
    });

    // ========================================
    // POST /api/whatsapp/stop - Parar bot
    // ========================================
    router.post('/stop', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            await removeBot(req.tenantId);
            res.json({ success: true, message: 'Bot desconectado' });
        } catch (error) {
            console.error('WhatsApp stop error:', error);
            res.status(500).json({ error: 'Erro ao parar bot' });
        }
    });

    // ========================================
    // POST /api/whatsapp/test-link - Gerar link simples
    // ========================================
    router.post('/test-link', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { phone } = req.body;

            if (!phone) {
                return res.status(400).json({ error: 'Telefone obrigatorio' });
            }

            const tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [req.tenantId]);
            const settings = JSON.parse(tenant?.settings || '{}');
            const domain = settings.domain || process.env.DOMAIN || 'killsis.com';
            const cleanPhone = phone.replace(/\D/g, '');

            // Link simples com telefone (curto e limpo)
            const link = `https://${domain}/loja/${tenant.slug}?p=${cleanPhone}`;

            res.json({
                success: true,
                link,
                phone: cleanPhone
            });
        } catch (error) {
            console.error('Test link error:', error);
            res.status(500).json({ error: 'Erro ao gerar link' });
        }
    });

    // ========================================
    // POST /api/whatsapp/follow-up - Enviar follow-up
    // ========================================
    router.post('/follow-up', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { daysInactive } = req.body;
            const days = daysInactive || 7;

            const result = await sendFollowUpMessages(db, req.tenantId, days);

            res.json({
                success: true,
                message: `Follow-up enviado para ${result.sent} clientes`,
                ...result
            });
        } catch (error) {
            console.error('Follow-up error:', error);
            res.status(500).json({ error: 'Erro ao enviar follow-up' });
        }
    });

    // ========================================
    // PUT /api/whatsapp/settings - Atualizar config
    // ========================================
    router.put('/settings', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { requireWhatsAppToken, welcomeResendHours } = req.body;

            const tenant = await db.get('SELECT settings FROM tenants WHERE id = ?', [req.tenantId]);
            const settings = JSON.parse(tenant?.settings || '{}');

            if (requireWhatsAppToken !== undefined) {
                settings.requireWhatsAppToken = requireWhatsAppToken;
            }
            if (welcomeResendHours !== undefined) {
                settings.welcomeResendHours = welcomeResendHours;
            }

            await db.run(
                'UPDATE tenants SET settings = ? WHERE id = ?',
                [JSON.stringify(settings), req.tenantId]
            );

            res.json({
                success: true,
                message: 'Configuracoes atualizadas',
                settings: {
                    requireWhatsAppToken: settings.requireWhatsAppToken,
                    welcomeResendHours: settings.welcomeResendHours
                }
            });
        } catch (error) {
            console.error('WhatsApp settings error:', error);
            res.status(500).json({ error: 'Erro ao atualizar configuracoes' });
        }
    });

    return router;
}
