// ============================================================
// Rotas de Temas
// ============================================================

import { Router } from 'express';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/themes - Listar todos os temas
    // ========================================
    router.get('/', async (req, res) => {
        try {
            const { businessType, premiumOnly } = req.query;

            let query = 'SELECT * FROM themes WHERE 1=1';
            const params = [];

            if (premiumOnly === 'true') {
                query += ' AND is_premium = 1';
            } else if (premiumOnly === 'false') {
                query += ' AND is_premium = 0';
            }

            const themes = await db.all(query, params);

            // Filtrar por business type se especificado
            let filtered = themes;
            if (businessType) {
                filtered = themes.filter(theme => {
                    try {
                        const types = JSON.parse(theme.business_types || '[]');
                        return types.includes('TODOS') || types.includes(businessType);
                    } catch {
                        return true;
                    }
                });
            }

            res.json(filtered);
        } catch (error) {
            console.error('Get themes error:', error);
            res.status(500).json({ error: 'Erro ao buscar temas' });
        }
    });

    // ========================================
    // GET /api/themes/:id - Detalhes do tema
    // ========================================
    router.get('/:id', async (req, res) => {
        try {
            const theme = await db.get('SELECT * FROM themes WHERE id = ?', [req.params.id]);

            if (!theme) {
                return res.status(404).json({ error: 'Tema nao encontrado' });
            }

            // Parse JSON fields
            try {
                theme.business_types = JSON.parse(theme.business_types || '[]');
                theme.css_variables = JSON.parse(theme.css_variables || '{}');
            } catch { }

            res.json(theme);
        } catch (error) {
            console.error('Get theme error:', error);
            res.status(500).json({ error: 'Erro ao buscar tema' });
        }
    });

    return router;
}
