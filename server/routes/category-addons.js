import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function categoryAddonsRoutes(db) {
    const router = express.Router();

    // ============================================================
    // ROTAS PUBLICAS - Buscar adicionais por categoria
    // ============================================================

    // GET /api/category-addons/category/:categoryId - Buscar adicionais de uma categoria
    router.get('/category/:categoryId', async (req, res) => {
        try {
            const { categoryId } = req.params;

            // Buscar grupos de adicionais da categoria
            const groups = await db.all(
                `SELECT * FROM addon_groups 
                 WHERE category_id = ? 
                 ORDER BY order_index`,
                [categoryId]
            );

            // Para cada grupo, buscar os itens
            for (const group of groups) {
                group.items = await db.all(
                    `SELECT * FROM addon_items 
                     WHERE group_id = ? AND is_available = 1
                     ORDER BY order_index`,
                    [group.id]
                );
            }

            res.json({ groups });
        } catch (error) {
            console.error('Erro ao buscar adicionais da categoria:', error);
            res.status(500).json({ error: 'Erro ao buscar adicionais' });
        }
    });

    // ============================================================
    // ROTAS AUTENTICADAS - CRUD de adicionais
    // ============================================================

    // GET /api/category-addons/tenant - Listar todas as categorias com seus adicionais
    router.get('/tenant', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const tenantId = req.tenantId;

            // Buscar todas as categorias do tenant
            const categories = await db.all(
                `SELECT * FROM categories WHERE tenant_id = ? AND is_active = 1 ORDER BY order_index`,
                [tenantId]
            );

            // Para cada categoria, buscar grupos e itens
            for (const cat of categories) {
                cat.addonGroups = await db.all(
                    `SELECT * FROM addon_groups WHERE category_id = ? ORDER BY order_index`,
                    [cat.id]
                );

                for (const group of cat.addonGroups) {
                    group.items = await db.all(
                        `SELECT * FROM addon_items WHERE group_id = ? ORDER BY order_index`,
                        [group.id]
                    );
                }
            }

            res.json({ categories });
        } catch (error) {
            console.error('Erro ao listar adicionais:', error);
            res.status(500).json({ error: 'Erro ao listar adicionais' });
        }
    });

    // POST /api/category-addons/groups - Criar grupo de adicionais
    router.post('/groups', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const tenantId = req.tenantId;
            const { categoryId, name, minSelection = 0, maxSelection = 10 } = req.body;

            if (!categoryId || !name) {
                return res.status(400).json({ error: 'Categoria e nome sao obrigatorios' });
            }

            const id = uuidv4();

            // Pegar ultimo order_index
            const lastGroup = await db.get(
                `SELECT MAX(order_index) as maxOrder FROM addon_groups WHERE category_id = ?`,
                [categoryId]
            );

            const orderIndex = (lastGroup?.maxOrder || 0) + 1;

            await db.run(
                `INSERT INTO addon_groups (id, tenant_id, product_id, category_id, name, min_selection, max_selection, order_index)
                 VALUES (?, ?, '', ?, ?, ?, ?, ?)`,
                [id, tenantId, categoryId, name, minSelection, maxSelection, orderIndex]
            );

            res.json({
                success: true,
                group: { id, tenantId, categoryId, name, minSelection, maxSelection, orderIndex, items: [] }
            });
        } catch (error) {
            console.error('Erro ao criar grupo:', error);
            res.status(500).json({ error: 'Erro ao criar grupo' });
        }
    });

    // PUT /api/category-addons/groups/:groupId - Atualizar grupo
    router.put('/groups/:groupId', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { groupId } = req.params;
            const { name, minSelection, maxSelection } = req.body;

            await db.run(
                `UPDATE addon_groups SET name = ?, min_selection = ?, max_selection = ? WHERE id = ?`,
                [name, minSelection, maxSelection, groupId]
            );

            res.json({ success: true });
        } catch (error) {
            console.error('Erro ao atualizar grupo:', error);
            res.status(500).json({ error: 'Erro ao atualizar grupo' });
        }
    });

    // DELETE /api/category-addons/groups/:groupId - Remover grupo
    router.delete('/groups/:groupId', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { groupId } = req.params;

            // Remover itens primeiro
            await db.run(`DELETE FROM addon_items WHERE group_id = ?`, [groupId]);

            // Remover grupo
            await db.run(`DELETE FROM addon_groups WHERE id = ?`, [groupId]);

            res.json({ success: true });
        } catch (error) {
            console.error('Erro ao remover grupo:', error);
            res.status(500).json({ error: 'Erro ao remover grupo' });
        }
    });

    // POST /api/category-addons/groups/:groupId/items - Adicionar item ao grupo
    router.post('/groups/:groupId/items', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { groupId } = req.params;
            const { name, price = 0 } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Nome e obrigatorio' });
            }

            const id = uuidv4();

            // Pegar ultimo order_index
            const lastItem = await db.get(
                `SELECT MAX(order_index) as maxOrder FROM addon_items WHERE group_id = ?`,
                [groupId]
            );

            const orderIndex = (lastItem?.maxOrder || 0) + 1;

            await db.run(
                `INSERT INTO addon_items (id, group_id, name, price, is_available, order_index)
                 VALUES (?, ?, ?, ?, 1, ?)`,
                [id, groupId, name, price, orderIndex]
            );

            res.json({
                success: true,
                item: { id, groupId, name, price, isAvailable: 1, orderIndex }
            });
        } catch (error) {
            console.error('Erro ao adicionar item:', error);
            res.status(500).json({ error: 'Erro ao adicionar item' });
        }
    });

    // PUT /api/category-addons/items/:itemId - Atualizar item
    router.put('/items/:itemId', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { itemId } = req.params;
            const { name, price, isAvailable } = req.body;

            await db.run(
                `UPDATE addon_items SET name = ?, price = ?, is_available = ? WHERE id = ?`,
                [name, price, isAvailable ? 1 : 0, itemId]
            );

            res.json({ success: true });
        } catch (error) {
            console.error('Erro ao atualizar item:', error);
            res.status(500).json({ error: 'Erro ao atualizar item' });
        }
    });

    // PATCH /api/category-addons/items/:itemId/toggle - Toggle disponibilidade
    router.patch('/items/:itemId/toggle', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { itemId } = req.params;
            const { is_available } = req.body;

            await db.run(
                `UPDATE addon_items SET is_available = ? WHERE id = ?`,
                [is_available ? 1 : 0, itemId]
            );

            res.json({ success: true });
        } catch (error) {
            console.error('Erro ao atualizar disponibilidade:', error);
            res.status(500).json({ error: 'Erro ao atualizar disponibilidade' });
        }
    });

    // DELETE /api/category-addons/items/:itemId - Remover item
    router.delete('/items/:itemId', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { itemId } = req.params;

            await db.run(`DELETE FROM addon_items WHERE id = ?`, [itemId]);

            res.json({ success: true });
        } catch (error) {
            console.error('Erro ao remover item:', error);
            res.status(500).json({ error: 'Erro ao remover item' });
        }
    });

    // ============================================================
    // MIGRACAO - Importar adicionais dos produtos para categoria
    // ============================================================

    // POST /api/category-addons/migrate/:categoryId - Migrar adicionais dos produtos de uma categoria
    router.post('/migrate/:categoryId', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const tenantId = req.tenantId;
            const { categoryId } = req.params;

            // Buscar todos os produtos dessa categoria que tem adicionais
            const products = await db.all(
                `SELECT id, name, addons FROM products 
                 WHERE tenant_id = ? AND category_id = ? AND has_addons = 1 AND addons IS NOT NULL`,
                [tenantId, categoryId]
            );

            if (products.length === 0) {
                return res.json({ success: true, message: 'Nenhum produto com adicionais encontrado', migrated: 0 });
            }

            // Coletar todos os adicionais unicos
            const uniqueAddons = new Map();

            for (const product of products) {
                try {
                    let addons = product.addons;
                    if (typeof addons === 'string') {
                        addons = JSON.parse(addons);
                    }
                    if (Array.isArray(addons)) {
                        for (const addon of addons) {
                            const name = addon.name || addon.nome;
                            const price = parseFloat(addon.price || addon.preco || 0);
                            if (name && !uniqueAddons.has(name.toLowerCase())) {
                                uniqueAddons.set(name.toLowerCase(), { name, price });
                            }
                        }
                    }
                } catch (e) {
                    console.error('Erro ao parsear addons do produto:', product.id, e);
                }
            }

            if (uniqueAddons.size === 0) {
                return res.json({ success: true, message: 'Nenhum adicional valido encontrado', migrated: 0 });
            }

            // Verificar se ja existe um grupo para essa categoria
            let group = await db.get(
                `SELECT * FROM addon_groups WHERE category_id = ? AND tenant_id = ? LIMIT 1`,
                [categoryId, tenantId]
            );

            // Se nao existe, criar um grupo padrao
            if (!group) {
                const groupId = uuidv4();
                await db.run(
                    `INSERT INTO addon_groups (id, tenant_id, product_id, category_id, name, min_selection, max_selection, order_index)
                     VALUES (?, ?, '', ?, 'Adicionais', 0, 10, 1)`,
                    [groupId, tenantId, categoryId]
                );
                group = { id: groupId };
            }

            // Adicionar os adicionais ao grupo (evitando duplicatas)
            let migrated = 0;
            for (const [key, addon] of uniqueAddons) {
                // Verificar se ja existe
                const existing = await db.get(
                    `SELECT id FROM addon_items WHERE group_id = ? AND LOWER(name) = ?`,
                    [group.id, key]
                );

                if (!existing) {
                    const itemId = uuidv4();
                    await db.run(
                        `INSERT INTO addon_items (id, group_id, name, price, is_available, order_index)
                         VALUES (?, ?, ?, ?, 1, ?)`,
                        [itemId, group.id, addon.name, addon.price, migrated + 1]
                    );
                    migrated++;
                }
            }

            res.json({
                success: true,
                message: `${migrated} adicionais migrados para a categoria`,
                migrated,
                groupId: group.id
            });
        } catch (error) {
            console.error('Erro ao migrar adicionais:', error);
            res.status(500).json({ error: 'Erro ao migrar adicionais' });
        }
    });

    // GET /api/category-addons/products/:categoryId - Ver adicionais dos produtos de uma categoria (preview)
    router.get('/products/:categoryId', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const tenantId = req.tenantId;
            const { categoryId } = req.params;

            // Buscar produtos com adicionais
            const products = await db.all(
                `SELECT id, name, addons FROM products 
                 WHERE tenant_id = ? AND category_id = ? AND has_addons = 1 AND addons IS NOT NULL`,
                [tenantId, categoryId]
            );

            // Parsear adicionais
            const result = [];
            for (const product of products) {
                try {
                    let addons = product.addons;
                    if (typeof addons === 'string') {
                        addons = JSON.parse(addons);
                    }
                    if (Array.isArray(addons) && addons.length > 0) {
                        result.push({
                            productId: product.id,
                            productName: product.name,
                            addons: addons.map(a => ({
                                name: a.name || a.nome,
                                price: parseFloat(a.price || a.preco || 0)
                            }))
                        });
                    }
                } catch (e) {
                    console.error('Erro ao parsear addons:', product.id, e);
                }
            }

            res.json({ products: result });
        } catch (error) {
            console.error('Erro ao buscar adicionais dos produtos:', error);
            res.status(500).json({ error: 'Erro ao buscar adicionais' });
        }
    });

    // ============================================================
    // MIGRACAO - Importar itens do BUFFET para categoria
    // ============================================================

    // POST /api/category-addons/migrate-buffet/:categoryId - Migrar itens do buffet
    router.post('/migrate-buffet/:categoryId', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const tenantId = req.tenantId;
            const { categoryId } = req.params;

            // Buscar itens do buffet do tenant
            const buffetItems = await db.all(
                `SELECT id, nome FROM buffet_items WHERE tenant_id = ? AND ativo = 1 ORDER BY order_index`,
                [tenantId]
            );

            if (buffetItems.length === 0) {
                return res.json({ success: true, message: 'Nenhum item de buffet encontrado', migrated: 0 });
            }

            // Verificar se ja existe um grupo para essa categoria
            let group = await db.get(
                `SELECT * FROM addon_groups WHERE category_id = ? AND tenant_id = ? LIMIT 1`,
                [categoryId, tenantId]
            );

            // Se nao existe, criar um grupo para buffet
            if (!group) {
                const groupId = uuidv4();
                await db.run(
                    `INSERT INTO addon_groups (id, tenant_id, product_id, category_id, name, min_selection, max_selection, order_index)
                     VALUES (?, ?, '', ?, 'Itens do Buffet', 0, 20, 1)`,
                    [groupId, tenantId, categoryId]
                );
                group = { id: groupId };
            }

            // Adicionar os itens do buffet ao grupo (evitando duplicatas)
            let migrated = 0;
            for (const item of buffetItems) {
                // Verificar se ja existe
                const existing = await db.get(
                    `SELECT id FROM addon_items WHERE group_id = ? AND LOWER(name) = ?`,
                    [group.id, item.nome.toLowerCase()]
                );

                if (!existing) {
                    const itemId = uuidv4();
                    await db.run(
                        `INSERT INTO addon_items (id, group_id, name, price, is_available, order_index)
                         VALUES (?, ?, ?, 0, 1, ?)`,
                        [itemId, group.id, item.nome, migrated + 1]
                    );
                    migrated++;
                }
            }

            res.json({
                success: true,
                message: `${migrated} itens de buffet importados para a categoria`,
                migrated,
                groupId: group.id
            });
        } catch (error) {
            console.error('Erro ao migrar itens do buffet:', error);
            res.status(500).json({ error: 'Erro ao migrar itens do buffet' });
        }
    });

    // GET /api/category-addons/buffet - Ver itens do buffet disponiveis
    router.get('/buffet', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const tenantId = req.tenantId;

            const buffetItems = await db.all(
                `SELECT id, nome, ativo FROM buffet_items WHERE tenant_id = ? ORDER BY order_index`,
                [tenantId]
            );

            res.json({ items: buffetItems });
        } catch (error) {
            console.error('Erro ao buscar itens do buffet:', error);
            res.status(500).json({ error: 'Erro ao buscar itens do buffet' });
        }
    });

    return router;
}
