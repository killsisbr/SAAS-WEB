// ============================================================
// AI Lessons API Routes
// Endpoints para gerenciar lições de auto-melhoria
// ============================================================

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import {
    getPendingLessons,
    getLessonHistory,
    applyLesson,
    rejectLesson,
    canAutoApply
} from '../ai-reinforcement/processors/lesson-engine.js';
import { runSandboxTest } from '../ai-reinforcement/processors/sandbox-tester.js';

export default function (db) {
    const router = Router();

    // Aplicar autenticação e tenant em todas as rotas
    router.use(authMiddleware(db), tenantMiddleware(db));

    /**
     * GET /api/ai/lessons
     * Lista lições pendentes do tenant
     */
    router.get('/lessons', async (req, res) => {
        try {
            const tenantId = req.tenantId;
            const { limit = 50 } = req.query;

            const lessons = await getPendingLessons(db, tenantId, parseInt(limit));

            // Parse solution_data JSON
            const formatted = lessons.map(l => ({
                ...l,
                solution_data: JSON.parse(l.solution_data || '{}')
            }));

            res.json({
                success: true,
                count: formatted.length,
                lessons: formatted
            });
        } catch (err) {
            console.error('[AI-Lessons] Erro ao listar:', err.message);
            res.status(500).json({ error: 'Erro ao listar lições' });
        }
    });

    /**
     * GET /api/ai/lessons/history
     * Histórico de lições aplicadas/rejeitadas
     */
    router.get('/lessons/history', async (req, res) => {
        try {
            const tenantId = req.tenantId;
            const { limit = 100 } = req.query;

            const history = await getLessonHistory(db, tenantId, parseInt(limit));

            const formatted = history.map(l => ({
                ...l,
                solution_data: JSON.parse(l.solution_data || '{}')
            }));

            res.json({
                success: true,
                count: formatted.length,
                lessons: formatted
            });
        } catch (err) {
            console.error('[AI-Lessons] Erro ao buscar histórico:', err.message);
            res.status(500).json({ error: 'Erro ao buscar histórico' });
        }
    });

    /**
     * GET /api/ai/lessons/:id
     * Detalhes de uma lição específica
     */
    router.get('/lessons/:id', async (req, res) => {
        try {
            const { id } = req.params;

            const lesson = await db.get(
                'SELECT * FROM learned_patterns WHERE id = ?',
                [id]
            );

            if (!lesson) {
                return res.status(404).json({ error: 'Lição não encontrada' });
            }

            res.json({
                ...lesson,
                solution_data: JSON.parse(lesson.solution_data || '{}')
            });
        } catch (err) {
            console.error('[AI-Lessons] Erro ao buscar lição:', err.message);
            res.status(500).json({ error: 'Erro ao buscar lição' });
        }
    });

    /**
     * POST /api/ai/lessons/:id/test
     * Executar teste sandbox para uma lição
     */
    router.post('/lessons/:id/test', async (req, res) => {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;

            // Buscar lição
            const lesson = await db.get(
                'SELECT * FROM learned_patterns WHERE id = ?',
                [id]
            );

            if (!lesson) {
                return res.status(404).json({ error: 'Lição não encontrada' });
            }

            // Buscar produtos do tenant para o teste
            const products = await db.all(
                'SELECT id, name, price FROM products WHERE tenant_id = ? AND is_available = 1',
                [tenantId]
            );

            // Executar sandbox test
            const result = await runSandboxTest(db, {
                ...lesson,
                tenant_id: tenantId
            }, products);

            res.json({
                success: true,
                testResult: result
            });
        } catch (err) {
            console.error('[AI-Lessons] Erro no teste sandbox:', err.message);
            res.status(500).json({ error: 'Erro ao executar teste' });
        }
    });

    /**
     * POST /api/ai/lessons/:id/apply
     * Aplicar lição manualmente (aprovação do admin)
     */
    router.post('/lessons/:id/apply', async (req, res) => {
        try {
            const { id } = req.params;
            const userName = req.user?.name || 'admin';

            const result = await applyLesson(db, id, userName);

            if (result.success) {
                res.json({
                    success: true,
                    message: 'Lição aplicada com sucesso!',
                    solutionType: result.solutionType
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: result.error
                });
            }
        } catch (err) {
            console.error('[AI-Lessons] Erro ao aplicar:', err.message);
            res.status(500).json({ error: 'Erro ao aplicar lição' });
        }
    });

    /**
     * POST /api/ai/lessons/:id/reject
     * Rejeitar uma lição
     */
    router.post('/lessons/:id/reject', async (req, res) => {
        try {
            const { id } = req.params;
            const { reason } = req.body;

            const result = await rejectLesson(db, id, reason);

            if (result.success) {
                res.json({
                    success: true,
                    message: 'Lição rejeitada'
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: result.error
                });
            }
        } catch (err) {
            console.error('[AI-Lessons] Erro ao rejeitar:', err.message);
            res.status(500).json({ error: 'Erro ao rejeitar lição' });
        }
    });

    /**
     * GET /api/ai/stats
     * Estatísticas do módulo de IA
     */
    router.get('/stats', async (req, res) => {
        try {
            const tenantId = req.tenantId;

            // Contar mensagens de hoje
            const todayStats = await db.get(`
                SELECT COUNT(*) as messages_today
                FROM conversation_history
                WHERE tenant_id = ? 
                AND date(timestamp) = date('now')
            `, [tenantId]);

            // Contar pendentes
            const pendingStats = await db.get(`
                SELECT COUNT(*) as pending_count
                FROM learned_patterns
                WHERE tenant_id = ? AND status = 'pending'
            `, [tenantId]);

            // Contar aplicadas
            const appliedStats = await db.get(`
                SELECT COUNT(*) as applied_count
                FROM learned_patterns
                WHERE tenant_id = ? AND status IN ('applied', 'auto_applied')
            `, [tenantId]);

            res.json({
                success: true,
                stats: {
                    messagesToday: todayStats?.messages_today || 0,
                    pendingLessons: pendingStats?.pending_count || 0,
                    appliedLessons: appliedStats?.applied_count || 0
                }
            });
        } catch (err) {
            console.error('[AI-Lessons] Erro ao buscar stats:', err.message);
            res.status(500).json({ error: 'Erro ao buscar estatísticas' });
        }
    });

    return router;
}
