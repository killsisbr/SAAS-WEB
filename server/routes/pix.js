// ============================================================
// Rotas de PIX
// ============================================================

import { Router } from 'express';
import { generatePixComplete, generatePixPayload, generatePixQRCode } from '../utils/pix.js';

export default function (db) {
    const router = Router();

    // ========================================
    // POST /api/pix/generate - Gerar QR Code PIX
    // ========================================
    router.post('/generate', async (req, res) => {
        try {
            const { tenantId, orderId, orderNumber, amount } = req.body;

            // Buscar config do tenant
            const tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);

            if (!tenant) {
                return res.status(404).json({ error: 'Loja nao encontrada' });
            }

            const settings = JSON.parse(tenant.settings || '{}');

            if (!settings.pixKey) {
                return res.status(400).json({ error: 'PIX nao configurado para esta loja' });
            }

            // Gerar PIX
            const pix = await generatePixComplete({
                pixKey: settings.pixKey,
                pixKeyType: settings.pixKeyType || 'PHONE',
                merchantName: tenant.name,
                merchantCity: settings.city || 'SAO PAULO',
                amount: amount,
                txId: `PED${orderNumber}`,
                description: `Pedido #${orderNumber}`
            });

            res.json({
                success: true,
                qrCode: pix.qrCode,
                payload: pix.payload,
                copyPaste: pix.copyPaste,
                pixKey: settings.pixKey
            });
        } catch (error) {
            console.error('Generate PIX error:', error);
            res.status(500).json({ error: 'Erro ao gerar PIX' });
        }
    });

    // ========================================
    // GET /api/pix/qr/:tenantId/:amount - QR Code simples (publico)
    // ========================================
    router.get('/qr/:tenantId/:amount', async (req, res) => {
        try {
            const { tenantId, amount } = req.params;

            const tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);

            if (!tenant) {
                return res.status(404).json({ error: 'Loja nao encontrada' });
            }

            const settings = JSON.parse(tenant.settings || '{}');

            if (!settings.pixKey) {
                return res.status(400).json({ error: 'PIX nao configurado' });
            }

            const payload = generatePixPayload({
                pixKey: settings.pixKey,
                merchantName: tenant.name,
                merchantCity: settings.city || 'SAO PAULO',
                amount: parseFloat(amount)
            });

            const qrCode = await generatePixQRCode(payload);

            // Retornar imagem
            const base64Data = qrCode.replace(/^data:image\/png;base64,/, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');

            res.set('Content-Type', 'image/png');
            res.send(imgBuffer);
        } catch (error) {
            console.error('PIX QR error:', error);
            res.status(500).send('Erro ao gerar QR');
        }
    });

    return router;
}
