// ============================================================
// Rotas de Upload de Imagens (Multi-tenant)
// ============================================================

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function (db) {
    const router = Router();

    // Pasta de uploads por tenant
    const uploadsDir = path.join(__dirname, '../../public/uploads');

    // Garantir que pasta existe
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Configuracao do multer
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const tenantDir = path.join(uploadsDir, req.tenantId || 'default');
            if (!fs.existsSync(tenantDir)) {
                fs.mkdirSync(tenantDir, { recursive: true });
            }
            cb(null, tenantDir);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            cb(null, `img_${uniqueSuffix}${ext}`);
        }
    });

    const fileFilter = (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo nao permitido. Use: JPEG, PNG, WebP ou GIF'), false);
        }
    };

    const upload = multer({
        storage,
        fileFilter,
        limits: {
            fileSize: 5 * 1024 * 1024 // 5MB max
        }
    });

    // ========================================
    // POST /api/upload/image - Upload de imagem
    // ========================================
    router.post('/image', upload.single('image'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'Nenhuma imagem enviada' });
            }

            // Retornar URL relativa da imagem
            const imageUrl = `/uploads/${req.tenantId || 'default'}/${req.file.filename}`;

            res.json({
                success: true,
                url: imageUrl,
                filename: req.file.filename,
                size: req.file.size
            });

        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ success: false, error: 'Erro ao fazer upload' });
        }
    });

    // ========================================
    // POST /api/upload/images - Upload multiplas imagens
    // ========================================
    router.post('/images', upload.array('images', 5), async (req, res) => {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ success: false, error: 'Nenhuma imagem enviada' });
            }

            const urls = req.files.map(file => `/uploads/${req.tenantId || 'default'}/${file.filename}`);

            res.json({
                success: true,
                urls,
                count: req.files.length
            });

        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ success: false, error: 'Erro ao fazer upload' });
        }
    });

    // ========================================
    // DELETE /api/upload/image - Deletar imagem
    // ========================================
    router.delete('/image', async (req, res) => {
        try {
            const { url } = req.body;
            if (!url) {
                return res.status(400).json({ success: false, error: 'URL obrigatoria' });
            }

            // So deletar se for uma imagem local do tenant
            if (!url.startsWith('/uploads/')) {
                return res.json({ success: true, message: 'Imagem externa, nao deletada' });
            }

            const filePath = path.join(__dirname, '../../public', url);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            res.json({ success: true, message: 'Imagem deletada' });

        } catch (error) {
            console.error('Delete error:', error);
            res.status(500).json({ success: false, error: 'Erro ao deletar imagem' });
        }
    });

    // ========================================
    // GET /api/upload/list - Listar imagens do tenant
    // ========================================
    router.get('/list', async (req, res) => {
        try {
            const tenantDir = path.join(uploadsDir, req.tenantId || 'default');

            if (!fs.existsSync(tenantDir)) {
                return res.json({ success: true, images: [] });
            }

            const files = fs.readdirSync(tenantDir);
            const images = files
                .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
                .map(f => ({
                    filename: f,
                    url: `/uploads/${req.tenantId || 'default'}/${f}`,
                    path: path.join(tenantDir, f)
                }));

            res.json({ success: true, images, count: images.length });

        } catch (error) {
            console.error('List error:', error);
            res.status(500).json({ success: false, error: 'Erro ao listar imagens' });
        }
    });

    return router;
}
