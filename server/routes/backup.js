// ============================================================
// Rotas de Backup e Restauracao (Multi-tenant)
// ============================================================

import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function (db) {
    const router = Router();

    // Algoritmo de criptografia
    const ALGORITHM = 'aes-256-cbc';
    const IV_LENGTH = 16;

    // Funcao para criptografar dados JSON
    function encrypt(data, password) {
        const key = crypto.scryptSync(password, 'salt', 32);
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    // Funcao para descriptografar dados
    function decrypt(encryptedData, password) {
        try {
            const parts = encryptedData.split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            const key = crypto.scryptSync(password, 'salt', 32);
            const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return JSON.parse(decrypted);
        } catch (e) {
            return null;
        }
    }

    // GET /api/backup/export - Exportar dados da loja
    // ========================================
    router.get('/export', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const tenantId = req.tenantId;
            const { password } = req.query;

            if (!tenantId) {
                return res.status(400).json({ success: false, error: 'Tenant ID nao identificado' });
            }

            if (!password || password.length < 4) {
                return res.status(400).json({
                    success: false,
                    error: 'Senha obrigatoria (minimo 4 caracteres)'
                });
            }

            // Buscar todos os dados do tenant
            const tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            const categories = await db.all('SELECT * FROM categories WHERE tenant_id = ?', [tenantId]);
            const products = await db.all('SELECT * FROM products WHERE tenant_id = ?', [tenantId]);
            const orders = await db.all('SELECT * FROM orders WHERE tenant_id = ?', [tenantId]);
            const customers = await db.all('SELECT * FROM customers WHERE tenant_id = ?', [tenantId]);
            const buffetItems = await db.all('SELECT * FROM buffet_items WHERE tenant_id = ?', [tenantId]);
            const acaiAdicionais = await db.all('SELECT * FROM acai_adicionais WHERE tenant_id = ?', [tenantId]);
            const acaiConfig = await db.get('SELECT * FROM acai_config WHERE tenant_id = ?', [tenantId]);

            // Novos dados adicionados para backup completo
            const addonGroups = await db.all('SELECT * FROM addon_groups WHERE tenant_id = ?', [tenantId]);
            const addonItems = await db.all('SELECT i.* FROM addon_items i JOIN addon_groups g ON i.group_id = g.id WHERE g.tenant_id = ?', [tenantId]);
            const whatsappConfigs = await db.get('SELECT * FROM whatsapp_configs WHERE tenant_id = ?', [tenantId]);
            const coupons = await db.all('SELECT * FROM coupons WHERE tenant_id = ?', [tenantId]);
            const reviews = await db.all('SELECT * FROM reviews WHERE tenant_id = ?', [tenantId]);
            const loyaltyConfig = await db.get('SELECT * FROM loyalty_config WHERE tenant_id = ?', [tenantId]);
            const loyaltyRewards = await db.all('SELECT * FROM loyalty_rewards WHERE tenant_id = ?', [tenantId]);
            const lidMappings = await db.all('SELECT * FROM lid_phone_mappings WHERE tenant_id = ?', [tenantId]);
            const pidMappings = await db.all('SELECT * FROM pid_jid_mappings WHERE tenant_id = ?', [tenantId]);
            const productMappings = await db.all('SELECT * FROM product_mappings WHERE tenant_id = ?', [tenantId]);
            const ignoredWords = await db.all('SELECT * FROM ignored_words WHERE tenant_id = ?', [tenantId]);
            const synonyms = await db.all('SELECT * FROM synonyms WHERE tenant_id = ?', [tenantId]);
            const aiConversations = await db.all('SELECT * FROM ai_conversations WHERE tenant_id = ?', [tenantId]);

            // Coletar imagens locais como base64 (inclui logo e imagens de produtos)
            const images = {};
            const uploadsDir = path.join(__dirname, '../../public/uploads', tenantId);
            if (fs.existsSync(uploadsDir)) {
                const files = fs.readdirSync(uploadsDir);
                for (const file of files) {
                    if (/\.(jpg|jpeg|png|webp|gif|svg|ico)$/i.test(file)) {
                        try {
                            const filePath = path.join(uploadsDir, file);
                            const data = fs.readFileSync(filePath);
                            const ext = path.extname(file).slice(1).toLowerCase();
                            let mimeType = ext === 'jpg' ? 'jpeg' : ext;
                            if (ext === 'svg') mimeType = 'svg+xml';

                            images[file] = `data:image/${mimeType};base64,${data.toString('base64')}`;
                        } catch (e) {
                            console.log('Skip image:', file, e.message);
                        }
                    }
                }
            }

            const backupData = {
                version: '1.2', // Versao com backup total e suporte a icones/svg
                exportedAt: new Date().toISOString(),
                tenantId: tenantId,
                tenantName: tenant?.name || 'Unknown',
                data: {
                    tenant,
                    categories,
                    products,
                    orders,
                    customers,
                    buffetItems,
                    acaiAdicionais,
                    acaiConfig,
                    addonGroups,
                    addonItems,
                    whatsappConfigs,
                    coupons,
                    reviews,
                    loyaltyConfig,
                    loyaltyRewards,
                    lidMappings,
                    pidMappings,
                    productMappings,
                    ignoredWords,
                    synonyms,
                    aiConversations
                },
                images,
                stats: {
                    categories: categories.length,
                    products: products.length,
                    orders: orders.length,
                    customers: customers.length,
                    images: Object.keys(images).length
                }
            };

            // Criptografar dados
            const encrypted = encrypt(backupData, password);

            // Enviar como arquivo para download
            const filename = `backup_${tenant?.slug || 'loja'}_${new Date().toISOString().split('T')[0]}.dhub`;
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(encrypted);

        } catch (error) {
            console.error('Backup export error:', error);
            res.status(500).json({ success: false, error: 'Erro ao exportar backup' });
        }
    });

    // POST /api/backup/import - Importar/Restaurar backup
    // ========================================
    router.post('/import', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const tenantId = req.tenantId;

            if (!tenantId) {
                return res.status(400).json({ success: false, error: 'Tenant ID nao identificado' });
            }
            const { encryptedData, password, clearExisting } = req.body;

            if (!encryptedData || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Dados e senha obrigatorios'
                });
            }

            // Descriptografar dados
            const backupData = decrypt(encryptedData, password);

            if (!backupData) {
                return res.status(400).json({
                    success: false,
                    error: 'Senha incorreta ou arquivo corrompido'
                });
            }

            // Verificar versao do backup
            if (!backupData.version || !backupData.data) {
                return res.status(400).json({
                    success: false,
                    error: 'Formato de backup invalido'
                });
            }

            const data = backupData.data;
            let restored = { categories: 0, products: 0, buffetItems: 0, acaiAdicionais: 0, addons: 0, configs: 0, customers: 0, ai: 0 };

            // Se clearExisting, limpar dados existentes (exceto pedidos)
            if (clearExisting) {
                const tablesToClear = [
                    'products', 'categories', 'buffet_items', 'acai_adicionais', 'acai_config',
                    'addon_groups', 'whatsapp_configs', 'coupons', 'reviews', 'loyalty_config',
                    'loyalty_rewards', 'lid_phone_mappings', 'pid_jid_mappings', 'product_mappings',
                    'ignored_words', 'synonyms', 'ai_conversations'
                ];
                for (const table of tablesToClear) {
                    try {
                        await db.run(`DELETE FROM ${table} WHERE tenant_id = ?`, [tenantId]);
                    } catch (e) {
                        console.log(`Fallback: Failed to clear table ${table}:`, e.message);
                    }
                }
                try {
                    // addon_items nao tem tenant_id, sao deletados via cascata de addon_groups ou manualmente
                    await db.run('DELETE FROM addon_items WHERE group_id NOT IN (SELECT id FROM addon_groups)');
                } catch (e) {
                    console.log(`Fallback: Failed to clear addon_items:`, e.message);
                }
            }

            // 1. Restaurar Tenant Settings (Branding, Cores, etc)
            if (data.tenant) {
                try {
                    await db.run('UPDATE tenants SET business_type = ?, settings = ?, theme_id = ? WHERE id = ?',
                        [data.tenant.business_type, data.tenant.settings, data.tenant.theme_id, tenantId]);
                    restored.configs++;
                } catch (e) { console.log('Skip tenant update:', e.message); }
            }

            // 2. Restaurar Categorias
            for (const cat of (data.categories || [])) {
                try {
                    await db.run(`
                        INSERT OR REPLACE INTO categories (id, tenant_id, name, description, icon, order_index, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [cat.id, tenantId, cat.name, cat.description, cat.icon, cat.order_index, cat.is_active]);
                    restored.categories++;
                } catch (e) { console.log('Skip category:', e.message); }
            }

            // 3. Restaurar Produtos
            for (const prod of (data.products || [])) {
                try {
                    await db.run(`
                        INSERT OR REPLACE INTO products 
                        (id, tenant_id, category_id, name, description, price, images, is_available, is_featured, order_index, has_addons, addons, image_settings, nutrition_info, has_sizes, sizes, size_prices)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [prod.id, tenantId, prod.category_id, prod.name, prod.description, prod.price,
                    prod.images, prod.is_available, prod.is_featured, prod.order_index,
                    prod.has_addons, prod.addons, prod.image_settings, prod.nutrition_info,
                    prod.has_sizes, prod.sizes, prod.size_prices]);
                    restored.products++;
                } catch (e) { console.log('Skip product:', e.message); }
            }

            // 4. Restaurar Adicionais (Grupos e Itens)
            for (const group of (data.addonGroups || [])) {
                try {
                    await db.run(`INSERT OR REPLACE INTO addon_groups (id, tenant_id, product_id, category_id, name, min_selection, max_selection, order_index)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [group.id, tenantId, group.product_id || null, group.category_id || null, group.name, group.min_selection, group.max_selection, group.order_index]);
                    restored.addons++;
                } catch (e) {
                    console.error('[Backup Import] Skip addon group:', e.message);
                }
            }
            for (const item of (data.addonItems || [])) {
                try {
                    await db.run(`INSERT OR REPLACE INTO addon_items (id, group_id, name, price, is_available, order_index)
                        VALUES (?, ?, ?, ?, ?, ?)`,
                        [item.id, item.group_id, item.name, item.price, item.is_available, item.order_index]);
                } catch (e) {
                    console.error('[Backup Import] Skip addon item:', e.message);
                }
            }

            // 4b. Auto-migrar adicionais do campo JSON legado (products.addons) para addon_groups/addon_items
            // Garante que adicionais configurados por produto sejam preservados mesmo em backups antigos
            if ((data.addonGroups || []).length === 0) {
                console.log('[Backup Import] Nenhum addon_group no backup. Tentando migrar do campo JSON legado...');
                const restoredProducts = data.products || [];
                const categoryGroupMap = new Map();

                for (const prod of restoredProducts) {
                    if (!prod.has_addons || !prod.addons) continue;
                    try {
                        let addons = typeof prod.addons === 'string' ? JSON.parse(prod.addons) : prod.addons;
                        if (!Array.isArray(addons) || addons.length === 0) continue;

                        // Criar/reusar grupo por category_id do produto
                        const catKey = prod.category_id || 'geral';
                        if (!categoryGroupMap.has(catKey)) {
                            const gId = `migrated_${catKey}_${Date.now()}`;
                            await db.run(`INSERT OR IGNORE INTO addon_groups (id, tenant_id, product_id, category_id, name, min_selection, max_selection, order_index)
                                VALUES (?, ?, ?, ?, 'Adicionais', 0, 10, 1)`,
                                [gId, tenantId, null, prod.category_id || null]);
                            categoryGroupMap.set(catKey, gId);
                            restored.addons++;
                        }
                        const groupId = categoryGroupMap.get(catKey);

                        for (let idx = 0; idx < addons.length; idx++) {
                            const a = addons[idx];
                            const aName = a.name || a.nome;
                            const aPrice = parseFloat(a.price || a.preco || 0);
                            if (!aName) continue;

                            // Evitar duplicatas
                            const existing = await db.get('SELECT id FROM addon_items WHERE group_id = ? AND LOWER(name) = ?', [groupId, aName.toLowerCase()]);
                            if (!existing) {
                                const iId = `migrated_item_${groupId}_${idx}_${Date.now()}`;
                                await db.run(`INSERT INTO addon_items (id, group_id, name, price, is_available, order_index)
                                    VALUES (?, ?, ?, ?, 1, ?)`, [iId, groupId, aName, aPrice, idx]);
                                restored.addons++;
                            }
                        }
                        console.log(`[Backup Import] Migrados ${addons.length} adicionais legados do produto "${prod.name}"`);
                    } catch (e) {
                        console.error('[Backup Import] Erro ao migrar addons legados:', prod.name, e.message);
                    }
                }
            }


            for (const item of (data.buffetItems || [])) {
                try {
                    await db.run(`INSERT OR REPLACE INTO buffet_items (id, tenant_id, nome, ativo, order_index)
                        VALUES (?, ?, ?, ?, ?)`, [item.id, tenantId, item.nome, item.ativo, item.order_index]);
                    restored.buffetItems++;
                } catch (e) { }
            }
            for (const item of (data.acaiAdicionais || [])) {
                try {
                    await db.run(`INSERT OR REPLACE INTO acai_adicionais (id, tenant_id, nome, preco, categoria, ativo, order_index)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`, [item.id, tenantId, item.nome, item.preco, item.categoria, item.ativo, item.order_index]);
                    restored.acaiAdicionais++;
                } catch (e) { }
            }
            if (data.acaiConfig) {
                try {
                    await db.run(`INSERT OR REPLACE INTO acai_config (id, tenant_id, habilitado, categoria_nome)
                        VALUES (?, ?, ?, ?)`, [data.acaiConfig.id, tenantId, data.acaiConfig.habilitado, data.acaiConfig.categoria_nome]);
                } catch (e) { }
            }

            // 6. Configuracoes de WhatsApp
            if (data.whatsappConfigs) {
                try {
                    const wc = data.whatsappConfigs;
                    await db.run(`INSERT OR REPLACE INTO whatsapp_configs (id, tenant_id, welcome_message, confirmation_message, status_update_message, auto_reply_enabled)
                        VALUES (?, ?, ?, ?, ?, ?)`, [wc.id, tenantId, wc.welcome_message, wc.confirmation_message, wc.status_update_message, wc.auto_reply_enabled]);
                    restored.configs++;
                } catch (e) { }
            }

            // 7. Cupons, Fidelidade e Reviews
            for (const item of (data.coupons || [])) {
                try {
                    await db.run(`INSERT OR REPLACE INTO coupons (id, tenant_id, code, description, discount_type, discount_value, min_order_value, max_uses, uses_count, valid_from, valid_until, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [item.id, tenantId, item.code, item.description, item.discount_type, item.discount_value, item.min_order_value, item.max_uses, item.uses_count, item.valid_from, item.valid_until, item.is_active]);
                } catch (e) { }
            }
            if (data.loyaltyConfig) {
                const lc = data.loyaltyConfig;
                await db.run(`INSERT OR REPLACE INTO loyalty_config (id, tenant_id, is_enabled, points_per_real, min_points_redeem) VALUES (?, ?, ?, ?, ?)`,
                    [lc.id, tenantId, lc.is_enabled, lc.points_per_real, lc.min_points_redeem]).catch(e => { });
            }
            for (const r of (data.loyaltyRewards || [])) {
                await db.run(`INSERT OR REPLACE INTO loyalty_rewards (id, tenant_id, name, description, points_required, reward_type, reward_value, product_id, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [r.id, tenantId, r.name, r.description, r.points_required, r.reward_type, r.reward_value, r.product_id, r.is_active]).catch(e => { });
            }
            for (const r of (data.reviews || [])) {
                await db.run(`INSERT OR REPLACE INTO reviews (id, tenant_id, product_id, customer_id, customer_name, customer_phone, rating, comment, reply, reply_at, is_approved, order_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [r.id, tenantId, r.product_id, r.customer_id, r.customer_name, r.customer_phone, r.rating, r.comment, r.reply, r.reply_at, r.is_approved, r.order_id]).catch(e => { });
            }

            // 8. Mapeamentos e IA
            for (const m of (data.lidMappings || [])) {
                await db.run(`INSERT OR REPLACE INTO lid_phone_mappings (id, lid, phone, tenant_id) VALUES (?, ?, ?, ?)`, [m.id, m.lid, m.phone, tenantId]).catch(e => { });
            }
            for (const m of (data.pidMappings || [])) {
                await db.run(`INSERT OR REPLACE INTO pid_jid_mappings (id, tenant_id, pid, jid) VALUES (?, ?, ?, ?)`, [m.id, tenantId, m.pid, m.jid]).catch(e => { });
            }
            for (const m of (data.productMappings || [])) {
                await db.run(`INSERT OR REPLACE INTO product_mappings (id, tenant_id, keyword, product_id) VALUES (?, ?, ?, ?)`, [m.id, tenantId, m.keyword, m.product_id]).catch(e => { });
            }
            for (const w of (data.ignoredWords || [])) {
                await db.run(`INSERT OR REPLACE INTO ignored_words (id, tenant_id, word, reason) VALUES (?, ?, ?, ?)`, [w.id, tenantId, w.word, w.reason]).catch(e => { });
            }
            for (const s of (data.synonyms || [])) {
                await db.run(`INSERT OR REPLACE INTO synonyms (id, tenant_id, word, synonym) VALUES (?, ?, ?, ?)`, [s.id, tenantId, s.word, s.synonym]).catch(e => { });
            }
            for (const c of (data.aiConversations || [])) {
                await db.run(`INSERT OR REPLACE INTO ai_conversations (id, tenant_id, customer_phone, customer_name, messages, status, order_data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [c.id, tenantId, c.customer_phone, c.customer_name, c.messages, c.status, c.order_data]).catch(e => { });
                restored.ai++;
            }

            // 9. Clientes e Histórico (opcional restaurar se houver dados)
            for (const c of (data.customers || [])) {
                try {
                    await db.run(`INSERT OR REPLACE INTO customers (id, tenant_id, name, phone, email, address, notes, total_orders, total_spent, last_order_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [c.id, tenantId, c.name, c.phone, c.email, c.address, c.notes, c.total_orders, c.total_spent, c.last_order_at]);
                    restored.customers++;
                } catch (e) { }
            }

            // Restaurar imagens
            let restoredImages = 0;
            if (backupData.images && typeof backupData.images === 'object') {
                const uploadsDir = path.join(__dirname, '../../public/uploads', tenantId);
                if (!fs.existsSync(uploadsDir)) {
                    fs.mkdirSync(uploadsDir, { recursive: true });
                }

                for (const [filename, base64Data] of Object.entries(backupData.images)) {
                    try {
                        // Extrair dados da imagem do base64
                        const matches = base64Data.match(/^data:image\/\w+;base64,(.+)$/);
                        if (matches) {
                            const imageData = Buffer.from(matches[1], 'base64');
                            const filePath = path.join(uploadsDir, filename);
                            fs.writeFileSync(filePath, imageData);
                            restoredImages++;
                        }
                    } catch (e) {
                        console.log('Skip image restore:', filename, e.message);
                    }
                }
            }
            restored.images = restoredImages;

            res.json({
                success: true,
                message: 'Backup restaurado com sucesso!',
                restored,
                originalTenant: backupData.tenantName,
                exportedAt: backupData.exportedAt
            });

        } catch (error) {
            console.error('Backup import error:', error);
            res.status(500).json({ success: false, error: 'Erro ao importar backup' });
        }
    });

    // GET /api/backup/preview - Preview do backup (sem restaurar)
    // ========================================
    router.post('/preview', authMiddleware(db), async (req, res) => {
        try {
            const { encryptedData, password } = req.body;

            if (!encryptedData || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Dados e senha obrigatorios'
                });
            }

            const backupData = decrypt(encryptedData, password);

            if (!backupData) {
                return res.status(400).json({
                    success: false,
                    error: 'Senha incorreta ou arquivo corrompido'
                });
            }

            res.json({
                success: true,
                preview: {
                    version: backupData.version,
                    exportedAt: backupData.exportedAt,
                    tenantName: backupData.tenantName,
                    stats: backupData.stats
                }
            });

        } catch (error) {
            console.error('Backup preview error:', error);
            res.status(500).json({ success: false, error: 'Erro ao ler backup' });
        }
    });

    return router;
}
