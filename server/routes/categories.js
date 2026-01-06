// ============================================================
// Rotas de Categorias
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/categories/tenant/:tenantId - Listar categorias publico
    // ========================================
    router.get('/tenant/:tenantId', async (req, res) => {
        try {
            const { tenantId } = req.params;
            const categories = await db.all(`
                SELECT * FROM categories 
                WHERE tenant_id = ?
                ORDER BY order_index ASC
            `, [tenantId]);

            res.json(categories);
        } catch (error) {
            console.error('Get categories error:', error);
            res.status(500).json({ error: 'Erro ao buscar categorias' });
        }
    });

    // ========================================
    // POST /api/categories/tenant - Criar categoria (publico)
    // ========================================
    router.post('/tenant', async (req, res) => {
        try {
            const { tenantId, name, description, icon } = req.body;

            if (!tenantId || !name) {
                return res.status(400).json({ error: 'tenantId e nome sao obrigatorios' });
            }

            // Verificar nome unico no tenant
            const existing = await db.get(
                'SELECT id FROM categories WHERE tenant_id = ? AND name = ?',
                [tenantId, name]
            );

            if (existing) {
                return res.status(400).json({ error: 'Ja existe uma categoria com este nome' });
            }

            // Obter order_index
            const last = await db.get(
                'SELECT MAX(order_index) as max FROM categories WHERE tenant_id = ?',
                [tenantId]
            );
            const orderIndex = (last?.max || 0) + 1;

            // Criar
            const categoryId = uuidv4();
            await db.run(`
                INSERT INTO categories (id, tenant_id, name, description, icon, order_index)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [categoryId, tenantId, name, description || null, icon || null, orderIndex]);

            const category = await db.get('SELECT * FROM categories WHERE id = ?', [categoryId]);

            res.status(201).json({ success: true, category });
        } catch (error) {
            console.error('Create category error:', error);
            res.status(500).json({ error: 'Erro ao criar categoria' });
        }
    });

    // ========================================
    // DELETE /api/categories/tenant/:id - Deletar (publico)
    // ========================================
    router.delete('/tenant/:id', async (req, res) => {
        try {
            const { id } = req.params;

            // Verificar se tem produtos
            const products = await db.get(
                'SELECT COUNT(*) as count FROM products WHERE category_id = ?',
                [id]
            );

            if (products.count > 0) {
                return res.status(400).json({
                    error: `Nao e possivel deletar. Existem ${products.count} produtos nesta categoria.`
                });
            }

            const result = await db.run('DELETE FROM categories WHERE id = ?', [id]);

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Categoria nao encontrada' });
            }

            res.json({ success: true, message: 'Categoria deletada' });
        } catch (error) {
            console.error('Delete category error:', error);
            res.status(500).json({ error: 'Erro ao deletar categoria' });
        }
    });

    // ========================================
    // GET /api/categories - Listar categorias
    // ========================================
    router.get('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const categories = await db.all(`
                SELECT c.*, COUNT(p.id) as product_count
                FROM categories c
                LEFT JOIN products p ON p.category_id = c.id
                WHERE c.tenant_id = ?
                GROUP BY c.id
                ORDER BY c.order_index ASC
            `, [req.tenantId]);

            res.json(categories);
        } catch (error) {
            console.error('Get categories error:', error);
            res.status(500).json({ error: 'Erro ao buscar categorias' });
        }
    });

    // ========================================
    // POST /api/categories - Criar categoria
    // ========================================
    router.post('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { name, description, icon } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Nome e obrigatorio' });
            }

            // Verificar nome unico no tenant
            const existing = await db.get(
                'SELECT id FROM categories WHERE tenant_id = ? AND name = ?',
                [req.tenantId, name]
            );

            if (existing) {
                return res.status(400).json({ error: 'Ja existe uma categoria com este nome' });
            }

            // Obter order_index
            const last = await db.get(
                'SELECT MAX(order_index) as max FROM categories WHERE tenant_id = ?',
                [req.tenantId]
            );
            const orderIndex = (last?.max || 0) + 1;

            // Criar
            const categoryId = uuidv4();
            await db.run(`
                INSERT INTO categories (id, tenant_id, name, description, icon, order_index)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [categoryId, req.tenantId, name, description || null, icon || null, orderIndex]);

            const category = await db.get('SELECT * FROM categories WHERE id = ?', [categoryId]);

            res.status(201).json({ success: true, category });
        } catch (error) {
            console.error('Create category error:', error);
            res.status(500).json({ error: 'Erro ao criar categoria' });
        }
    });

    // ========================================
    // PUT /api/categories/:id - Atualizar
    // ========================================
    router.put('/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { id } = req.params;
            const { name, description, icon, isActive, orderIndex } = req.body;

            const category = await db.get(
                'SELECT * FROM categories WHERE id = ? AND tenant_id = ?',
                [id, req.tenantId]
            );

            if (!category) {
                return res.status(404).json({ error: 'Categoria nao encontrada' });
            }

            const fields = [];
            const params = [];

            if (name !== undefined) { fields.push('name = ?'); params.push(name); }
            if (description !== undefined) { fields.push('description = ?'); params.push(description); }
            if (icon !== undefined) { fields.push('icon = ?'); params.push(icon); }
            if (isActive !== undefined) { fields.push('is_active = ?'); params.push(isActive ? 1 : 0); }
            if (orderIndex !== undefined) { fields.push('order_index = ?'); params.push(orderIndex); }

            if (fields.length > 0) {
                params.push(id);
                await db.run(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, params);
            }

            const updated = await db.get('SELECT * FROM categories WHERE id = ?', [id]);
            res.json({ success: true, category: updated });
        } catch (error) {
            console.error('Update category error:', error);
            res.status(500).json({ error: 'Erro ao atualizar categoria' });
        }
    });

    // ========================================
    // DELETE /api/categories/:id - Deletar
    // ========================================
    router.delete('/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { id } = req.params;

            // Verificar se tem produtos
            const products = await db.get(
                'SELECT COUNT(*) as count FROM products WHERE category_id = ?',
                [id]
            );

            if (products.count > 0) {
                return res.status(400).json({
                    error: `Nao e possivel deletar. Existem ${products.count} produtos nesta categoria.`
                });
            }

            const result = await db.run(
                'DELETE FROM categories WHERE id = ? AND tenant_id = ?',
                [id, req.tenantId]
            );

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Categoria nao encontrada' });
            }

            res.json({ success: true, message: 'Categoria deletada' });
        } catch (error) {
            console.error('Delete category error:', error);
            res.status(500).json({ error: 'Erro ao deletar categoria' });
        }
    });

    // ========================================
    // PUT /api/categories/reorder - Reordenar
    // ========================================
    router.put('/reorder', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { order } = req.body; // [{ id: '...', index: 0 }, ...]

            if (!Array.isArray(order)) {
                return res.status(400).json({ error: 'Ordem invalida' });
            }

            for (const item of order) {
                await db.run(
                    'UPDATE categories SET order_index = ? WHERE id = ? AND tenant_id = ?',
                    [item.index, item.id, req.tenantId]
                );
            }

            res.json({ success: true, message: 'Ordem atualizada' });
        } catch (error) {
            console.error('Reorder categories error:', error);
            res.status(500).json({ error: 'Erro ao reordenar' });
        }
    });

    return router;
}
