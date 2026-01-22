// ============================================================
// API de Mapeamentos - Direct Order
// Gerencia keywords → produtos
// ============================================================

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { v4 as uuidv4 } from 'uuid';

// Normalizar texto (igual ao mapping-service)
function normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.,!?;:'"()]/g, '')
        .replace(/[-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/mappings - Listar mapeamentos
    // ========================================
    router.get('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const mappings = await db.all(`
                SELECT m.id, m.keyword, m.product_id, m.created_at,
                       p.name as product_name, p.price as product_price
                FROM product_mappings m
                LEFT JOIN products p ON m.product_id = p.id
                WHERE m.tenant_id = ?
                ORDER BY m.keyword
            `, [req.tenantId]);

            res.json(mappings);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // GET /api/mappings/product/:productId - Mapeamentos de um produto
    // ========================================
    router.get('/product/:productId', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const mappings = await db.all(
                'SELECT keyword FROM product_mappings WHERE tenant_id = ? AND product_id = ?',
                [req.tenantId, req.params.productId]
            );
            res.json(mappings.map(m => m.keyword));
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // POST /api/mappings - Adicionar mapeamento
    // ========================================
    router.post('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { keyword, productId } = req.body;

            if (!keyword || !productId) {
                return res.status(400).json({ error: 'keyword e productId são obrigatórios' });
            }

            const normalized = normalizeText(keyword);
            if (!normalized) {
                return res.status(400).json({ error: 'Keyword inválida' });
            }

            // Verificar se produto existe
            const product = await db.get(
                'SELECT id FROM products WHERE id = ? AND tenant_id = ?',
                [productId, req.tenantId]
            );
            if (!product) {
                return res.status(404).json({ error: 'Produto não encontrado' });
            }

            const id = uuidv4();
            await db.run(
                `INSERT OR REPLACE INTO product_mappings (id, tenant_id, keyword, product_id)
                 VALUES (?, ?, ?, ?)`,
                [id, req.tenantId, normalized, productId]
            );

            res.json({ success: true, id, keyword: normalized, productId });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // POST /api/mappings/bulk - Adicionar múltiplos
    // ========================================
    router.post('/bulk', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { keywords, productId } = req.body;

            if (!Array.isArray(keywords) || !productId) {
                return res.status(400).json({ error: 'keywords (array) e productId são obrigatórios' });
            }

            let added = 0;
            for (const keyword of keywords) {
                const normalized = normalizeText(keyword);
                if (normalized) {
                    const id = uuidv4();
                    try {
                        await db.run(
                            `INSERT OR REPLACE INTO product_mappings (id, tenant_id, keyword, product_id)
                             VALUES (?, ?, ?, ?)`,
                            [id, req.tenantId, normalized, productId]
                        );
                        added++;
                    } catch (e) { }
                }
            }

            res.json({ success: true, added });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // DELETE /api/mappings/:keyword - Remover
    // ========================================
    router.delete('/:keyword', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const normalized = normalizeText(req.params.keyword);

            await db.run(
                'DELETE FROM product_mappings WHERE tenant_id = ? AND keyword = ?',
                [req.tenantId, normalized]
            );

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // POST /api/mappings/auto-generate/:productId
    // ========================================
    router.post('/auto-generate/:productId', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const product = await db.get(
                'SELECT id, name FROM products WHERE id = ? AND tenant_id = ?',
                [req.params.productId, req.tenantId]
            );

            if (!product) {
                return res.status(404).json({ error: 'Produto não encontrado' });
            }

            // Gerar mapeamentos automáticos
            const base = normalizeText(product.name);
            const mappings = [base];
            const words = base.split(' ');

            // Palavras individuais (> 2 caracteres)
            for (const word of words) {
                if (word.length > 2 && !mappings.includes(word)) {
                    mappings.push(word);
                }
            }

            // Combinações de 2 palavras
            if (words.length >= 2) {
                for (let i = 0; i < words.length - 1; i++) {
                    const combo = `${words[i]} ${words[i + 1]}`;
                    if (!mappings.includes(combo)) {
                        mappings.push(combo);
                    }
                }
            }

            // Salvar mapeamentos
            let added = 0;
            for (const keyword of mappings) {
                const id = uuidv4();
                try {
                    await db.run(
                        `INSERT OR IGNORE INTO product_mappings (id, tenant_id, keyword, product_id)
                         VALUES (?, ?, ?, ?)`,
                        [id, req.tenantId, keyword, product.id]
                    );
                    added++;
                } catch (e) { }
            }

            res.json({ success: true, mappings, added });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}
