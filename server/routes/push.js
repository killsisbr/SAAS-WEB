// ============================================================
// Rotas de Push Notifications (PWA)
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import webpush from 'web-push';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // Configurar VAPID keys (deve estar no .env em producao)
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || 'UUxI4O8r5V7VRXGJ_lgGy8P-bq_CP91-D5t-uVB6cZw';

    if (vapidPublicKey && vapidPrivateKey) {
        webpush.setVapidDetails(
            'mailto:suporte@deliveryhub.com.br',
            vapidPublicKey,
            vapidPrivateKey
        );
    }

    // ========================================
    // GET /api/push/vapid-key - Chave publica VAPID
    // ========================================
    router.get('/vapid-key', (req, res) => {
        res.json({ publicKey: vapidPublicKey });
    });

    // ========================================
    // POST /api/push/subscribe - Registrar subscription
    // ========================================
    router.post('/subscribe', async (req, res) => {
        try {
            const { tenantId, customerId, subscription, userAgent } = req.body;

            if (!subscription || !subscription.endpoint) {
                return res.status(400).json({ error: 'Subscription invalida' });
            }

            // Verificar se ja existe
            const existing = await db.get(
                'SELECT id FROM push_subscriptions WHERE endpoint = ?',
                [subscription.endpoint]
            );

            if (existing) {
                // Atualizar
                await db.run(`
                    UPDATE push_subscriptions SET
                        p256dh = ?,
                        auth = ?,
                        user_agent = ?
                    WHERE id = ?
                `, [
                    subscription.keys.p256dh,
                    subscription.keys.auth,
                    userAgent,
                    existing.id
                ]);
            } else {
                // Criar
                await db.run(`
                    INSERT INTO push_subscriptions (id, tenant_id, customer_id, endpoint, p256dh, auth, user_agent)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    uuidv4(),
                    tenantId || null,
                    customerId || null,
                    subscription.endpoint,
                    subscription.keys.p256dh,
                    subscription.keys.auth,
                    userAgent || null
                ]);
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Push subscribe error:', error);
            res.status(500).json({ error: 'Erro ao registrar subscription' });
        }
    });

    // ========================================
    // POST /api/push/unsubscribe - Remover subscription
    // ========================================
    router.post('/unsubscribe', async (req, res) => {
        try {
            const { endpoint } = req.body;

            await db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);

            res.json({ success: true });
        } catch (error) {
            console.error('Push unsubscribe error:', error);
            res.status(500).json({ error: 'Erro ao remover subscription' });
        }
    });

    // ========================================
    // POST /api/push/send - Enviar notificacao (admin)
    // ========================================
    router.post('/send', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { title, body, icon, url, targetType, targetId } = req.body;

            if (!title || !body) {
                return res.status(400).json({ error: 'Titulo e mensagem sao obrigatorios' });
            }

            let subscriptions = [];

            if (targetType === 'customer' && targetId) {
                // Enviar para cliente especifico
                subscriptions = await db.all(
                    'SELECT * FROM push_subscriptions WHERE customer_id = ?',
                    [targetId]
                );
            } else if (targetType === 'all') {
                // Enviar para todos da loja
                subscriptions = await db.all(
                    'SELECT * FROM push_subscriptions WHERE tenant_id = ?',
                    [req.tenantId]
                );
            } else {
                // Broadcast geral (apenas tenant owner)
                subscriptions = await db.all(
                    'SELECT * FROM push_subscriptions WHERE tenant_id = ?',
                    [req.tenantId]
                );
            }

            const payload = JSON.stringify({
                title,
                body,
                icon: icon || '/icon-192.png',
                url: url || '/'
            });

            let sent = 0;
            let failed = 0;

            for (const sub of subscriptions) {
                try {
                    await webpush.sendNotification({
                        endpoint: sub.endpoint,
                        keys: {
                            p256dh: sub.p256dh,
                            auth: sub.auth
                        }
                    }, payload);
                    sent++;
                } catch (e) {
                    failed++;
                    // Se subscription expirou, remover
                    if (e.statusCode === 410) {
                        await db.run('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
                    }
                }
            }

            res.json({ success: true, sent, failed });
        } catch (error) {
            console.error('Push send error:', error);
            res.status(500).json({ error: 'Erro ao enviar notificacao' });
        }
    });

    // ========================================
    // POST /api/push/notify-order - Notificar sobre pedido (interno)
    // ========================================
    router.post('/notify-order', async (req, res) => {
        try {
            const { tenantId, orderId, orderNumber, status, customerPhone } = req.body;

            // Buscar subscription do cliente pelo telefone
            const customer = await db.get(
                'SELECT id FROM customers WHERE tenant_id = ? AND phone = ?',
                [tenantId, customerPhone]
            );

            if (!customer) {
                return res.json({ success: false, message: 'Cliente nao encontrado' });
            }

            const subscriptions = await db.all(
                'SELECT * FROM push_subscriptions WHERE customer_id = ?',
                [customer.id]
            );

            if (!subscriptions.length) {
                return res.json({ success: false, message: 'Sem subscriptions' });
            }

            // Mensagens por status
            const messages = {
                'CONFIRMED': { title: 'Pedido Confirmado!', body: `Seu pedido #${orderNumber} foi confirmado.` },
                'PREPARING': { title: 'Em Preparo', body: `Seu pedido #${orderNumber} esta sendo preparado.` },
                'READY': { title: 'Pedido Pronto!', body: `Seu pedido #${orderNumber} esta pronto!` },
                'OUT_FOR_DELIVERY': { title: 'Saiu para Entrega', body: `Seu pedido #${orderNumber} saiu para entrega!` },
                'DELIVERED': { title: 'Entregue', body: `Seu pedido #${orderNumber} foi entregue. Obrigado!` }
            };

            const msg = messages[status] || { title: 'Atualizacao', body: `Pedido #${orderNumber}: ${status}` };

            const payload = JSON.stringify({
                title: msg.title,
                body: msg.body,
                icon: '/icon-192.png',
                url: `/pedido/${orderId}`
            });

            let sent = 0;
            for (const sub of subscriptions) {
                try {
                    await webpush.sendNotification({
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth }
                    }, payload);
                    sent++;
                } catch (e) {
                    if (e.statusCode === 410) {
                        await db.run('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
                    }
                }
            }

            res.json({ success: true, sent });
        } catch (error) {
            console.error('Push notify order error:', error);
            res.status(500).json({ error: 'Erro ao notificar' });
        }
    });

    return router;
}
