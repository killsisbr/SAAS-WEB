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

            // Coletar imagens locais como base64
            const images = {};
            const uploadsDir = path.join(__dirname, '../../public/uploads', tenantId);
            if (fs.existsSync(uploadsDir)) {
                const files = fs.readdirSync(uploadsDir);
                for (const file of files) {
                    if (/\.(jpg|jpeg|png|webp|gif)$/i.test(file)) {
                        try {
                            const filePath = path.join(uploadsDir, file);
                            const data = fs.readFileSync(filePath);
                            const ext = path.extname(file).slice(1).toLowerCase();
                            const mimeType = ext === 'jpg' ? 'jpeg' : ext;
                            images[file] = `data:image/${mimeType};base64,${data.toString('base64')}`;
                        } catch (e) {
                            console.log('Skip image:', file, e.message);
                        }
                    }
                }
            }

            const backupData = {
                version: '1.1', // Versao com suporte a imagens
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
                    acaiConfig
                },
                images, // Imagens em base64
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
            let restored = { categories: 0, products: 0, buffetItems: 0, acaiAdicionais: 0 };

            // Se clearExisting, limpar dados existentes (exceto pedidos)
            if (clearExisting) {
                await db.run('DELETE FROM products WHERE tenant_id = ?', [tenantId]);
                await db.run('DELETE FROM categories WHERE tenant_id = ?', [tenantId]);
                await db.run('DELETE FROM buffet_items WHERE tenant_id = ?', [tenantId]);
                await db.run('DELETE FROM acai_adicionais WHERE tenant_id = ?', [tenantId]);
            }

            // Restaurar categorias
            for (const cat of (data.categories || [])) {
                try {
                    await db.run(`
                        INSERT OR REPLACE INTO categories (id, tenant_id, name, order_index, is_active)
                        VALUES (?, ?, ?, ?, ?)
                    `, [cat.id, tenantId, cat.name, cat.order_index, cat.is_active]);
                    restored.categories++;
                } catch (e) { console.log('Skip category:', e.message); }
            }

            // Restaurar produtos
            for (const prod of (data.products || [])) {
                try {
                    await db.run(`
                        INSERT OR REPLACE INTO products 
                        (id, tenant_id, category_id, name, description, price, images, is_available, order_index, has_addons, addons)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [prod.id, tenantId, prod.category_id, prod.name, prod.description,
                    prod.price, prod.images, prod.is_available, prod.order_index,
                    prod.has_addons, prod.addons]);
                    restored.products++;
                } catch (e) { console.log('Skip product:', e.message); }
            }

            // Restaurar buffet items
            for (const item of (data.buffetItems || [])) {
                try {
                    await db.run(`
                        INSERT OR REPLACE INTO buffet_items (id, tenant_id, nome, ativo, order_index)
                        VALUES (?, ?, ?, ?, ?)
                    `, [item.id, tenantId, item.nome, item.ativo, item.order_index]);
                    restored.buffetItems++;
                } catch (e) { console.log('Skip buffet item:', e.message); }
            }

            // Restaurar adicionais acai
            for (const item of (data.acaiAdicionais || [])) {
                try {
                    await db.run(`
                        INSERT OR REPLACE INTO acai_adicionais (id, tenant_id, nome, preco, categoria, ativo, order_index)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [item.id, tenantId, item.nome, item.preco, item.categoria, item.ativo, item.order_index]);
                    restored.acaiAdicionais++;
                } catch (e) { console.log('Skip acai adicional:', e.message); }
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
