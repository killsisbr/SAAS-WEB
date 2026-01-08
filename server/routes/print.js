// ============================================================
// Rotas de Impressao Termica
// ============================================================

import { Router } from 'express';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/print/:orderId - Gerar recibo para impressao
    // ========================================
    router.get('/:orderId', async (req, res) => {
        try {
            const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.orderId]);

            if (!order) {
                return res.status(404).json({ error: 'Pedido nao encontrado' });
            }

            // Buscar tenant
            const tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [order.tenant_id]);

            // Parse items
            const items = JSON.parse(order.items || '[]');
            const address = order.address ? JSON.parse(order.address) : null;

            // Gerar texto formatado para impressora termica (80mm)
            const width = 48; // caracteres para 80mm
            const line = '='.repeat(width);
            const dashes = '-'.repeat(width);

            let receipt = '';

            // Cabecalho
            receipt += centerText(tenant?.name?.toUpperCase() || 'DELIVERY', width) + '\n';
            receipt += centerText('PEDIDO #' + order.order_number, width) + '\n';
            receipt += line + '\n';

            // Data/Hora
            const date = new Date(order.created_at);
            receipt += `Data: ${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR')}\n`;
            receipt += dashes + '\n';

            // Cliente
            receipt += `Cliente: ${order.customer_name}\n`;
            receipt += `Telefone: ${order.customer_phone}\n`;

            if (order.delivery_type === 'DELIVERY' && address) {
                receipt += dashes + '\n';
                receipt += 'ENTREGA:\n';
                receipt += `${address.street || address.formatted || '-'}\n`;
                if (address.neighborhood) receipt += `${address.neighborhood}\n`;
                if (address.complement) receipt += `Obs: ${address.complement}\n`;
            } else {
                receipt += '\n*** RETIRADA NO LOCAL ***\n';
            }

            receipt += line + '\n';
            receipt += 'ITENS:\n';
            receipt += dashes + '\n';

            // Itens
            let subtotal = 0;
            for (const item of items) {
                const name = item.name || item.title || 'Produto';
                const qty = item.qty || item.quantity || 1;
                const price = item.totalPrice || (item.price * qty) || 0;
                subtotal += price;

                const itemLine = `${qty}x ${name}`;
                const priceLine = `R$ ${price.toFixed(2)}`;

                receipt += formatLine(itemLine, priceLine, width) + '\n';

                // Adicionais
                if (item.extras && item.extras.length > 0) {
                    for (const extra of item.extras) {
                        receipt += `   + ${extra.name}\n`;
                    }
                }

                // Observacao do item
                if (item.obs) {
                    receipt += `   Obs: ${item.obs}\n`;
                }
            }

            receipt += dashes + '\n';

            // Totais
            receipt += formatLine('Subtotal:', `R$ ${subtotal.toFixed(2)}`, width) + '\n';

            if (order.delivery_fee > 0) {
                receipt += formatLine('Taxa de entrega:', `R$ ${order.delivery_fee.toFixed(2)}`, width) + '\n';
            }

            if (order.discount > 0) {
                receipt += formatLine('Desconto:', `-R$ ${order.discount.toFixed(2)}`, width) + '\n';
            }

            receipt += line + '\n';
            receipt += formatLine('TOTAL:', `R$ ${order.total.toFixed(2)}`, width) + '\n';
            receipt += line + '\n';

            // Pagamento
            const paymentMap = {
                'PIX': 'PIX',
                'CASH': 'DINHEIRO',
                'CREDIT_CARD': 'CARTAO CREDITO',
                'DEBIT_CARD': 'CARTAO DEBITO',
                'LOCAL': 'PAGAR NO LOCAL',
                'pix': 'PIX',
                'dinheiro': 'DINHEIRO',
                'cartao': 'CARTAO',
                'local': 'PAGAR NO LOCAL'
            };
            receipt += `Pagamento: ${paymentMap[order.payment_method] || order.payment_method}\n`;

            if (order.observation) {
                receipt += dashes + '\n';
                receipt += 'OBSERVACOES:\n';
                receipt += order.observation + '\n';
            }

            receipt += line + '\n';
            receipt += centerText('OBRIGADO PELA PREFERENCIA!', width) + '\n';
            receipt += centerText('www.deliveryhub.com.br', width) + '\n';
            receipt += '\n\n\n'; // Espaco para corte

            res.type('text/plain').send(receipt);
        } catch (error) {
            console.error('Print order error:', error);
            res.status(500).json({ error: 'Erro ao gerar impressao' });
        }
    });

    // ========================================
    // GET /api/print/:orderId/html - HTML para impressao web
    // ========================================
    router.get('/:orderId/html', async (req, res) => {
        try {
            const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.orderId]);

            if (!order) {
                return res.status(404).send('Pedido nao encontrado');
            }

            const tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [order.tenant_id]);
            const items = JSON.parse(order.items || '[]');
            const address = order.address ? JSON.parse(order.address) : null;

            const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Pedido #${order.order_number}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Courier New', monospace; 
            font-size: 12px; 
            width: 80mm; 
            padding: 5mm;
        }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 5px 0; }
        .items { margin: 10px 0; }
        .item { display: flex; justify-content: space-between; margin: 3px 0; }
        .extras { padding-left: 15px; font-size: 10px; color: #666; }
        .total { font-size: 14px; font-weight: bold; }
        @media print {
            body { width: 80mm; }
            @page { margin: 0; }
        }
    </style>
</head>
<body>
    <div class="center bold">${tenant?.name?.toUpperCase() || 'DELIVERY'}</div>
    <div class="center bold">PEDIDO #${order.order_number}</div>
    <div class="line"></div>
    
    <div>Data: ${new Date(order.created_at).toLocaleString('pt-BR')}</div>
    <div class="line"></div>
    
    <div><strong>Cliente:</strong> ${order.customer_name}</div>
    <div><strong>Tel:</strong> ${order.customer_phone}</div>
    
    ${order.delivery_type === 'DELIVERY' && address ? `
        <div class="line"></div>
        <div><strong>ENTREGA:</strong></div>
        <div>${address.street || address.formatted || '-'}</div>
        ${address.neighborhood ? `<div>${address.neighborhood}</div>` : ''}
        ${address.complement ? `<div>Obs: ${address.complement}</div>` : ''}
    ` : '<div class="center bold">*** RETIRADA ***</div>'}
    
    <div class="line"></div>
    <div class="bold">ITENS:</div>
    <div class="items">
        ${items.map(item => `
            <div class="item">
                <span>${item.qty || item.quantity || 1}x ${item.name || item.title}</span>
                <span>R$ ${(item.totalPrice || (item.price * (item.qty || 1))).toFixed(2)}</span>
            </div>
            ${item.extras?.length ? item.extras.map(e => `<div class="extras">+ ${e.name}</div>`).join('') : ''}
            ${item.obs ? `<div class="extras">Obs: ${item.obs}</div>` : ''}
        `).join('')}
    </div>
    
    <div class="line"></div>
    <div class="item"><span>Subtotal:</span><span>R$ ${order.subtotal?.toFixed(2) || order.total?.toFixed(2)}</span></div>
    ${order.delivery_fee > 0 ? `<div class="item"><span>Entrega:</span><span>R$ ${order.delivery_fee.toFixed(2)}</span></div>` : ''}
    ${order.discount > 0 ? `<div class="item"><span>Desconto:</span><span>-R$ ${order.discount.toFixed(2)}</span></div>` : ''}
    <div class="line"></div>
    <div class="item total"><span>TOTAL:</span><span>R$ ${order.total.toFixed(2)}</span></div>
    <div class="line"></div>
    
    <div><strong>Pagamento:</strong> ${order.payment_method}</div>
    
    ${order.observation ? `
        <div class="line"></div>
        <div><strong>OBS:</strong> ${order.observation}</div>
    ` : ''}
    
    <div class="line"></div>
    <div class="center">OBRIGADO!</div>
</body>
</html>
            `;

            res.type('text/html').send(html);
        } catch (error) {
            console.error('Print HTML error:', error);
            res.status(500).send('Erro ao gerar impressao');
        }
    });

    // Helpers
    function centerText(text, width) {
        const padding = Math.max(0, Math.floor((width - text.length) / 2));
        return ' '.repeat(padding) + text;
    }

    function formatLine(left, right, width) {
        const spaces = Math.max(1, width - left.length - right.length);
        return left + ' '.repeat(spaces) + right;
    }

    return router;
}
