// ============================================================
// Rotas de Sistema Acai (Multi-tenant)
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

export default function (db) {
    const router = Router();

    // ========================================
    // ADICIONAIS
    // ========================================

    // GET /api/acai/adicionais/tenant/:tenantId - Listar adicionais ativos (publico)
    router.get('/adicionais/tenant/:tenantId', async (req, res) => {
        try {
            const { tenantId } = req.params;
            const adicionais = await db.all(
                'SELECT * FROM acai_adicionais WHERE tenant_id = ? AND ativo = 1 ORDER BY categoria, order_index, nome',
                [tenantId]
            );
            res.json({ success: true, adicionais });
        } catch (error) {
            console.error('Get acai adicionais error:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar adicionais' });
        }
    });

    // GET /api/acai/adicionais/tenant/:tenantId/todos - Listar todos (admin)
    router.get('/adicionais/tenant/:tenantId/todos', async (req, res) => {
        try {
            const { tenantId } = req.params;
            const adicionais = await db.all(
                'SELECT * FROM acai_adicionais WHERE tenant_id = ? ORDER BY categoria, order_index, nome',
                [tenantId]
            );
            res.json({ success: true, adicionais });
        } catch (error) {
            console.error('Get all acai adicionais error:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar adicionais' });
        }
    });

    // POST /api/acai/adicionais - Adicionar adicional
    router.post('/adicionais', async (req, res) => {
        try {
            const { tenantId, nome, preco, categoria } = req.body;
            if (!tenantId || !nome) {
                return res.status(400).json({ success: false, error: 'tenantId e nome sao obrigatorios' });
            }

            const id = uuidv4();
            await db.run(
                'INSERT INTO acai_adicionais (id, tenant_id, nome, preco, categoria, ativo) VALUES (?, ?, ?, ?, ?, 1)',
                [id, tenantId, String(nome).trim(), preco || 0, categoria || 'Complementos']
            );

            res.json({
                success: true,
                adicional: { id, nome: String(nome).trim(), preco: preco || 0, categoria: categoria || 'Complementos', ativo: 1 }
            });
        } catch (error) {
            console.error('Add acai adicional error:', error);
            res.status(500).json({ success: false, error: 'Erro ao adicionar adicional' });
        }
    });

    // PATCH /api/acai/adicionais/:id/toggle - Toggle ativo/inativo
    router.patch('/adicionais/:id/toggle', async (req, res) => {
        try {
            const { id } = req.params;
            const item = await db.get('SELECT * FROM acai_adicionais WHERE id = ?', [id]);
            if (!item) {
                return res.status(404).json({ success: false, error: 'Adicional nao encontrado' });
            }

            const novoAtivo = item.ativo ? 0 : 1;
            await db.run('UPDATE acai_adicionais SET ativo = ? WHERE id = ?', [novoAtivo, id]);
            res.json({ success: true, adicional: { ...item, ativo: novoAtivo } });
        } catch (error) {
            console.error('Toggle acai adicional error:', error);
            res.status(500).json({ success: false, error: 'Erro ao alternar status' });
        }
    });

    // DELETE /api/acai/adicionais/:id - Remover adicional
    router.delete('/adicionais/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const result = await db.run('DELETE FROM acai_adicionais WHERE id = ?', [id]);
            if (result.changes === 0) {
                return res.status(404).json({ success: false, error: 'Adicional nao encontrado' });
            }
            res.json({ success: true });
        } catch (error) {
            console.error('Delete acai adicional error:', error);
            res.status(500).json({ success: false, error: 'Erro ao remover adicional' });
        }
    });

    // ========================================
    // CONFIG
    // ========================================

    // GET /api/acai/config/tenant/:tenantId - Obter config
    router.get('/config/tenant/:tenantId', async (req, res) => {
        try {
            const { tenantId } = req.params;
            let config = await db.get('SELECT * FROM acai_config WHERE tenant_id = ?', [tenantId]);

            if (!config) {
                // Criar config padrao
                const id = uuidv4();
                await db.run(
                    'INSERT INTO acai_config (id, tenant_id, habilitado, categoria_nome) VALUES (?, ?, 1, ?)',
                    [id, tenantId, 'Acai']
                );
                config = { id, tenant_id: tenantId, habilitado: 1, categoria_nome: 'Acai' };
            }

            res.json({ success: true, config });
        } catch (error) {
            console.error('Get acai config error:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar config' });
        }
    });

    // PUT /api/acai/config - Atualizar config
    router.put('/config', async (req, res) => {
        try {
            const { tenantId, habilitado, categoria_nome } = req.body;
            if (!tenantId) {
                return res.status(400).json({ success: false, error: 'tenantId e obrigatorio' });
            }

            let config = await db.get('SELECT * FROM acai_config WHERE tenant_id = ?', [tenantId]);

            if (!config) {
                const id = uuidv4();
                await db.run(
                    'INSERT INTO acai_config (id, tenant_id, habilitado, categoria_nome) VALUES (?, ?, ?, ?)',
                    [id, tenantId, habilitado !== undefined ? habilitado : 1, categoria_nome || 'Acai']
                );
                config = { id, tenant_id: tenantId, habilitado: habilitado !== undefined ? habilitado : 1, categoria_nome: categoria_nome || 'Acai' };
            } else {
                await db.run(
                    'UPDATE acai_config SET habilitado = ?, categoria_nome = ? WHERE tenant_id = ?',
                    [habilitado !== undefined ? habilitado : config.habilitado, categoria_nome || config.categoria_nome, tenantId]
                );
                config = { ...config, habilitado: habilitado !== undefined ? habilitado : config.habilitado, categoria_nome: categoria_nome || config.categoria_nome };
            }

            res.json({ success: true, config });
        } catch (error) {
            console.error('Update acai config error:', error);
            res.status(500).json({ success: false, error: 'Erro ao atualizar config' });
        }
    });

    return router;
}
