// ============================================================
// Rotas de Produtos
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware, checkLimits } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/products/tenant/:tenantId - Listar produtos publico
    // ========================================
    router.get('/tenant/:tenantId', async (req, res) => {
        try {
            const { tenantId } = req.params;
            const { categoryId, available } = req.query;

            let query = 'SELECT * FROM products WHERE tenant_id = ?';
            const params = [tenantId];

            if (categoryId) {
                query += ' AND category_id = ?';
                params.push(categoryId);
            }

            if (available === 'true') {
                query += ' AND is_available = 1';
            }

            query += ' ORDER BY order_index ASC';

            const products = await db.all(query, params);

            // Parse JSON fields
            for (const prod of products) {
                try {
                    prod.images = JSON.parse(prod.images || '[]');
                    prod.addons = JSON.parse(prod.addons || '[]');
                    prod.sizes = JSON.parse(prod.sizes || '[]');
                    prod.size_prices = JSON.parse(prod.size_prices || '{}');
                    prod.image_settings = JSON.parse(prod.image_settings || '{}');
                } catch { }
            }

            res.json(products);
        } catch (error) {
            console.error('Get products error:', error);
            res.status(500).json({ error: 'Erro ao buscar produtos' });
        }
    });

    // ========================================
    // GET /api/products/tenant/:tenantId/search - Fuzzy search
    // ========================================
    router.get('/tenant/:tenantId/search', async (req, res) => {
        try {
            const { tenantId } = req.params;
            const { q } = req.query;

            if (!q || q.length < 2) {
                return res.json([]);
            }

            // Get all available products
            const products = await db.all(
                'SELECT * FROM products WHERE tenant_id = ? AND is_available = 1 ORDER BY order_index ASC',
                [tenantId]
            );

            // Normalize search term
            const searchTerm = normalizeText(q);

            // Score each product with fuzzy matching
            const results = products.map(prod => {
                const name = normalizeText(prod.name);
                const desc = normalizeText(prod.description || '');

                // Calculate similarity scores
                let score = 0;

                // Exact match in name (highest)
                if (name.includes(searchTerm)) {
                    score += 100;
                    if (name.startsWith(searchTerm)) score += 50;
                }

                // Exact match in description
                if (desc.includes(searchTerm)) {
                    score += 30;
                }

                // Word-level fuzzy matching
                const searchWords = searchTerm.split(/\s+/);
                const nameWords = name.split(/\s+/);

                for (const sw of searchWords) {
                    for (const nw of nameWords) {
                        const distance = levenshteinDistance(sw, nw);
                        const maxLen = Math.max(sw.length, nw.length);
                        const similarity = 1 - (distance / maxLen);

                        if (similarity >= 0.7) {
                            score += Math.round(similarity * 40);
                        }
                    }
                }

                return { ...prod, score };
            })
                .filter(p => p.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 10); // Top 10 results

            // Parse JSON fields
            for (const prod of results) {
                try {
                    prod.images = JSON.parse(prod.images || '[]');
                    prod.addons = JSON.parse(prod.addons || '[]');
                    prod.sizes = JSON.parse(prod.sizes || '[]');
                    prod.size_prices = JSON.parse(prod.size_prices || '{}');
                    prod.image_settings = JSON.parse(prod.image_settings || '{}');
                } catch { }
            }

            res.json(results);
        } catch (error) {
            console.error('Fuzzy search error:', error);
            res.status(500).json({ error: 'Erro na busca' });
        }
    });

    // ========================================
    // GET /api/products - Listar produtos do tenant
    // ========================================
    router.get('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { categoryId, available } = req.query;

            let query = 'SELECT * FROM products WHERE tenant_id = ?';
            const params = [req.tenantId];

            if (categoryId) {
                query += ' AND category_id = ?';
                params.push(categoryId);
            }

            if (available === 'true') {
                query += ' AND is_available = 1';
            }

            query += ' ORDER BY order_index ASC';

            const products = await db.all(query, params);

            // Parse images JSON
            for (const prod of products) {
                try {
                    prod.images = JSON.parse(prod.images || '[]');
                    prod.addons = JSON.parse(prod.addons || '[]');
                    prod.image_settings = JSON.parse(prod.image_settings || '{}');
                } catch { }
            }

            res.json(products);
        } catch (error) {
            console.error('Get products error:', error);
            res.status(500).json({ error: 'Erro ao buscar produtos' });
        }
    });

    // ========================================
    // POST /api/products/tenant - Criar produto (publico)
    // ========================================
    router.post('/tenant', async (req, res) => {
        try {
            const { tenantId, name, description, price, categoryId, images, isAvailable, isFeatured, hasAddons, addons } = req.body;

            if (!tenantId || !name || !price || !categoryId) {
                return res.status(400).json({ error: 'tenantId, nome, preco e categoria sao obrigatorios' });
            }

            // Verificar categoria
            const category = await db.get(
                'SELECT id FROM categories WHERE id = ? AND tenant_id = ?',
                [categoryId, tenantId]
            );

            if (!category) {
                return res.status(400).json({ error: 'Categoria nao encontrada' });
            }

            // Obter order_index
            const lastProduct = await db.get(
                'SELECT MAX(order_index) as max FROM products WHERE tenant_id = ?',
                [tenantId]
            );
            const orderIndex = (lastProduct?.max || 0) + 1;

            // Criar produto
            const productId = uuidv4();
            await db.run(`
                INSERT INTO products (id, tenant_id, category_id, name, description, price, images, is_available, is_featured, order_index, has_addons, addons)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                productId,
                tenantId,
                categoryId,
                name,
                description || null,
                price,
                JSON.stringify(images || []),
                isAvailable !== false ? 1 : 0,
                isFeatured ? 1 : 0,
                orderIndex,
                hasAddons ? 1 : 0,
                JSON.stringify(addons || [])
            ]);

            const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
            product.images = JSON.parse(product.images || '[]');
            product.addons = JSON.parse(product.addons || '[]');
            product.image_settings = JSON.parse(product.image_settings || '{}');

            res.status(201).json({ success: true, product });
        } catch (error) {
            console.error('Create product error:', error);
            res.status(500).json({ error: 'Erro ao criar produto' });
        }
    });

    // ========================================
    // PUT /api/products/tenant/:id - Atualizar produto (publico)
    // ========================================
    router.put('/tenant/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            // Verificar produto
            const product = await db.get('SELECT * FROM products WHERE id = ?', [id]);

            if (!product) {
                return res.status(404).json({ error: 'Produto nao encontrado' });
            }

            // Construir query
            const fields = [];
            const params = [];

            if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
            if (updates.description !== undefined) { fields.push('description = ?'); params.push(updates.description); }
            if (updates.price !== undefined) { fields.push('price = ?'); params.push(updates.price); }
            if (updates.categoryId !== undefined) { fields.push('category_id = ?'); params.push(updates.categoryId); }
            if (updates.images !== undefined) { fields.push('images = ?'); params.push(JSON.stringify(updates.images)); }
            if (updates.isAvailable !== undefined) { fields.push('is_available = ?'); params.push(updates.isAvailable ? 1 : 0); }
            if (updates.isFeatured !== undefined) { fields.push('is_featured = ?'); params.push(updates.isFeatured ? 1 : 0); }
            if (updates.orderIndex !== undefined) { fields.push('order_index = ?'); params.push(updates.orderIndex); }
            if (updates.hasAddons !== undefined) { fields.push('has_addons = ?'); params.push(updates.hasAddons ? 1 : 0); }
            if (updates.addons !== undefined) { fields.push('addons = ?'); params.push(JSON.stringify(updates.addons)); }
            if (updates.imageSettings !== undefined) { fields.push('image_settings = ?'); params.push(JSON.stringify(updates.imageSettings)); }

            if (fields.length > 0) {
                fields.push('updated_at = CURRENT_TIMESTAMP');
                params.push(id);

                await db.run(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, params);
            }

            const updated = await db.get('SELECT * FROM products WHERE id = ?', [id]);
            updated.images = JSON.parse(updated.images || '[]');
            updated.addons = JSON.parse(updated.addons || '[]');

            res.json({ success: true, product: updated });
        } catch (error) {
            console.error('Update product error:', error);
            res.status(500).json({ error: 'Erro ao atualizar produto' });
        }
    });

    // ========================================
    // DELETE /api/products/tenant/:id - Deletar produto (publico)
    // ========================================
    router.delete('/tenant/:id', async (req, res) => {
        try {
            const { id } = req.params;

            const result = await db.run('DELETE FROM products WHERE id = ?', [id]);

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Produto nao encontrado' });
            }

            res.json({ success: true, message: 'Produto deletado' });
        } catch (error) {
            console.error('Delete product error:', error);
            res.status(500).json({ error: 'Erro ao deletar produto' });
        }
    });

    // ========================================
    // POST /api/products - Criar produto
    // ========================================
    router.post('/', authMiddleware(db), tenantMiddleware(db), checkLimits(db, 'products'), async (req, res) => {
        try {
            const { name, description, price, categoryId, images, isAvailable, isFeatured, addons, imageSettings, has_sizes, sizes, size_prices } = req.body;

            // Validar: price obrigatorio apenas se NAO tem tamanhos
            const hasSizes = has_sizes || (sizes && JSON.parse(sizes).length > 0);
            if (!name || !categoryId) {
                return res.status(400).json({ error: 'Nome e categoria sao obrigatorios' });
            }
            if (!hasSizes && (!price && price !== 0)) {
                return res.status(400).json({ error: 'Preco e obrigatorio para produtos sem tamanhos' });
            }

            // Verificar categoria
            const category = await db.get(
                'SELECT id FROM categories WHERE id = ? AND tenant_id = ?',
                [categoryId, req.tenantId]
            );

            if (!category) {
                return res.status(400).json({ error: 'Categoria nao encontrada' });
            }

            // Obter order_index
            const lastProduct = await db.get(
                'SELECT MAX(order_index) as max FROM products WHERE tenant_id = ?',
                [req.tenantId]
            );
            const orderIndex = (lastProduct?.max || 0) + 1;

            // Criar produto
            const productId = uuidv4();
            await db.run(`
                INSERT INTO products (id, tenant_id, category_id, name, description, price, images, is_available, is_featured, order_index, addons, image_settings, has_sizes, sizes, size_prices)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                productId,
                req.tenantId,
                categoryId,
                name,
                description || null,
                price || 0,
                JSON.stringify(images || []),
                isAvailable !== false ? 1 : 0,
                isFeatured ? 1 : 0,
                orderIndex,
                JSON.stringify(addons || []),
                JSON.stringify(imageSettings || {}),
                hasSizes ? 1 : 0,
                sizes || null,
                size_prices || null
            ]);

            const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
            product.images = JSON.parse(product.images || '[]');
            product.addons = JSON.parse(product.addons || '[]');
            product.image_settings = JSON.parse(product.image_settings || '{}');

            res.status(201).json({ success: true, product });
        } catch (error) {
            console.error('Create product error:', error);
            res.status(500).json({ error: 'Erro ao criar produto' });
        }
    });


    // ========================================
    // PUT /api/products/:id - Atualizar produto
    // ========================================
    router.put('/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            // Verificar produto
            const product = await db.get(
                'SELECT * FROM products WHERE id = ? AND tenant_id = ?',
                [id, req.tenantId]
            );

            if (!product) {
                return res.status(404).json({ error: 'Produto nao encontrado' });
            }

            // Construir query
            const fields = [];
            const params = [];

            if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
            if (updates.description !== undefined) { fields.push('description = ?'); params.push(updates.description); }
            if (updates.price !== undefined) { fields.push('price = ?'); params.push(updates.price); }
            if (updates.categoryId !== undefined) { fields.push('category_id = ?'); params.push(updates.categoryId); }
            if (updates.images !== undefined) { fields.push('images = ?'); params.push(JSON.stringify(updates.images)); }
            if (updates.isAvailable !== undefined) { fields.push('is_available = ?'); params.push(updates.isAvailable ? 1 : 0); }
            if (updates.isFeatured !== undefined) { fields.push('is_featured = ?'); params.push(updates.isFeatured ? 1 : 0); }
            if (updates.imageSettings !== undefined) { fields.push('image_settings = ?'); params.push(JSON.stringify(updates.imageSettings)); }
            if (updates.orderIndex !== undefined) { fields.push('order_index = ?'); params.push(updates.orderIndex); }
            if (updates.addons !== undefined) { fields.push('addons = ?'); params.push(JSON.stringify(updates.addons)); }

            if (fields.length > 0) {
                fields.push('updated_at = CURRENT_TIMESTAMP');
                params.push(id);

                await db.run(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, params);
            }

            const updated = await db.get('SELECT * FROM products WHERE id = ?', [id]);
            updated.images = JSON.parse(updated.images || '[]');
            updated.addons = JSON.parse(updated.addons || '[]');

            res.json({ success: true, product: updated });
        } catch (error) {
            console.error('Update product error:', error);
            res.status(500).json({ error: 'Erro ao atualizar produto' });
        }
    });

    // ========================================
    // DELETE /api/products/:id - Deletar produto
    // ========================================
    router.delete('/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { id } = req.params;

            const result = await db.run(
                'DELETE FROM products WHERE id = ? AND tenant_id = ?',
                [id, req.tenantId]
            );

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Produto nao encontrado' });
            }

            res.json({ success: true, message: 'Produto deletado' });
        } catch (error) {
            console.error('Delete product error:', error);
            res.status(500).json({ error: 'Erro ao deletar produto' });
        }
    });

    return router;
}

/**
 * Normaliza texto para busca (remove acentos, lowercase)
 */
function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9\s]/g, '') // Remove caracteres especiais
        .trim();
}

/**
 * Calcula distancia de Levenshtein entre duas strings
 */
function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // Inicializar primeira coluna
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // Inicializar primeira linha
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Preencher matriz
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substituicao
                    matrix[i][j - 1] + 1,     // insercao
                    matrix[i - 1][j] + 1      // remocao
                );
            }
        }
    }

    return matrix[b.length][a.length];
}
