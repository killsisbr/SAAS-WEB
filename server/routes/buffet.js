// ============================================================
// Rotas de Buffet do Dia (Multi-tenant)
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/buffet/tenant/:tenantId - Listar itens ativos (publico)
    // ========================================
    router.get('/tenant/:tenantId', async (req, res) => {
        try {
            const { tenantId } = req.params;
            const itens = await db.all(
                'SELECT * FROM buffet_items WHERE tenant_id = ? AND ativo = 1 ORDER BY order_index, nome',
                [tenantId]
            );
            res.json({ success: true, itens });
        } catch (error) {
            console.error('Get buffet error:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar buffet' });
        }
    });

    // ========================================
    // GET /api/buffet/tenant/:tenantId/todos - Listar todos (admin)
    // ========================================
    router.get('/tenant/:tenantId/todos', async (req, res) => {
        try {
            const { tenantId } = req.params;
            const itens = await db.all(
                'SELECT * FROM buffet_items WHERE tenant_id = ? ORDER BY ativo DESC, order_index, nome',
                [tenantId]
            );
            res.json({ success: true, itens });
        } catch (error) {
            console.error('Get all buffet error:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar buffet' });
        }
    });

    // ========================================
    // POST /api/buffet - Adicionar item
    // ========================================
    router.post('/', async (req, res) => {
        try {
            const { tenantId, nome } = req.body;
            if (!tenantId || !nome || String(nome).trim() === '') {
                return res.status(400).json({ success: false, error: 'tenantId e nome sao obrigatorios' });
            }

            const id = uuidv4();
            await db.run(
                'INSERT INTO buffet_items (id, tenant_id, nome, ativo) VALUES (?, ?, ?, 1)',
                [id, tenantId, String(nome).trim()]
            );

            res.json({ success: true, item: { id, nome: String(nome).trim(), ativo: 1 } });
        } catch (error) {
            console.error('Add buffet error:', error);
            res.status(500).json({ success: false, error: 'Erro ao adicionar item' });
        }
    });

    // ========================================
    // PATCH /api/buffet/:id/toggle - Toggle ativo/inativo
    // ========================================
    router.patch('/:id/toggle', async (req, res) => {
        try {
            const { id } = req.params;
            const item = await db.get('SELECT * FROM buffet_items WHERE id = ?', [id]);
            if (!item) {
                return res.status(404).json({ success: false, error: 'Item nao encontrado' });
            }

            const novoAtivo = item.ativo ? 0 : 1;
            await db.run('UPDATE buffet_items SET ativo = ? WHERE id = ?', [novoAtivo, id]);
            res.json({ success: true, item: { ...item, ativo: novoAtivo } });
        } catch (error) {
            console.error('Toggle buffet error:', error);
            res.status(500).json({ success: false, error: 'Erro ao alternar status' });
        }
    });

    // ========================================
    // DELETE /api/buffet/:id - Remover item
    // ========================================
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const result = await db.run('DELETE FROM buffet_items WHERE id = ?', [id]);
            if (result.changes === 0) {
                return res.status(404).json({ success: false, error: 'Item nao encontrado' });
            }
            res.json({ success: true });
        } catch (error) {
            console.error('Delete buffet error:', error);
            res.status(500).json({ success: false, error: 'Erro ao remover item' });
        }
    });

    return router;
}
