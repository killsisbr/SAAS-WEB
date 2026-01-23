// ============================================================
// AI Reinforcement Module - Daily Analyzer
// Análise diária em batch das conversas
// ============================================================

import { AI_CONFIG, ERROR_TYPES, LESSON_STATUS } from '../config.js';
import { callGeminiJSON } from '../gemini/client.js';
import { buildSessionAnalysisPrompt, buildDailyReportPrompt } from '../gemini/prompts.js';
import {
    getPendingSessions,
    getSessionMessages,
    markSessionAnalyzed
} from '../loggers/conversation-logger.js';
import { v4 as uuidv4 } from 'uuid';
import { createLesson, canAutoApply, applyLesson } from '../processors/lesson-engine.js';
import { runSandboxTest } from '../processors/sandbox-tester.js';

/**
 * Executar análise diária de todas as conversas pendentes
 * @param {object} db - Conexão com banco de dados
 * @param {string} tenantId - ID do tenant (ou null para todos)
 */
export async function runDailyAnalysis(db, tenantId = null) {
    console.log('[DailyAnalysis] ════════════════════════════════════════');
    console.log('[DailyAnalysis] 🔍 Iniciando análise diária...');

    if (!AI_CONFIG.dailyAnalysisEnabled) {
        console.log('[DailyAnalysis] ⚠️ Análise diária desabilitada no config');
        return { skipped: true, reason: 'disabled' };
    }

    try {
        // Buscar tenants para analisar
        let tenants;
        if (tenantId) {
            tenants = [{ id: tenantId }];
        } else {
            tenants = await db.all(`
                SELECT id, name, settings FROM tenants 
                WHERE status = 'ACTIVE'
            `);
        }

        const results = [];

        for (const tenant of tenants) {
            console.log(`[DailyAnalysis] Analisando tenant: ${tenant.name || tenant.id}`);

            const result = await analyzeTenantsConversations(db, tenant.id);
            results.push({
                tenantId: tenant.id,
                tenantName: tenant.name,
                ...result
            });
        }

        console.log('[DailyAnalysis] ✅ Análise diária concluída');
        console.log('[DailyAnalysis] ════════════════════════════════════════');

        return { success: true, results };

    } catch (err) {
        console.error('[DailyAnalysis] ❌ Erro:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Analisar conversas de um tenant específico
 */
async function analyzeTenantsConversations(db, tenantId) {
    const stats = {
        sessionsAnalyzed: 0,
        errorsFound: 0,
        mappingsSuggested: 0,
        criticalSessions: []
    };

    // Buscar sessões pendentes
    const sessions = await getPendingSessions(db, tenantId, AI_CONFIG.daily.maxSessionsPerBatch);

    if (sessions.length === 0) {
        console.log(`[DailyAnalysis] Nenhuma sessão pendente para tenant ${tenantId}`);
        return stats;
    }

    console.log(`[DailyAnalysis] ${sessions.length} sessões para analisar`);

    // Carregar produtos e mapeamentos do tenant
    const products = await db.all(`
        SELECT id, name, price FROM products 
        WHERE tenant_id = ? AND is_available = 1
    `, [tenantId]);

    const mappingsRows = await db.all(`
        SELECT keyword, product_id FROM product_mappings 
        WHERE tenant_id = ?
    `, [tenantId]);

    const mappings = {};
    mappingsRows.forEach(m => { mappings[m.keyword] = m.product_id; });

    const tenant = await db.get('SELECT name FROM tenants WHERE id = ?', [tenantId]);

    // Analisar cada sessão
    for (const session of sessions) {
        try {
            const messages = await getSessionMessages(db, session.session_id);

            if (messages.length < 2) {
                // Sessão muito curta, marcar como analisada sem chamar IA
                await markSessionAnalyzed(db, session.session_id, { skipped: true, reason: 'too_short' });
                continue;
            }

            // Construir prompt e chamar Gemini
            const prompt = buildSessionAnalysisPrompt({
                sessionMessages: messages,
                products,
                mappings,
                restaurantName: tenant?.name
            });

            const result = await callGeminiJSON(prompt, { timeout: 30000 });

            if (result.error) {
                console.error(`[DailyAnalysis] Erro Gemini na sessão ${session.session_id}:`, result.error);
                continue;
            }

            const analysis = result.response;
            stats.sessionsAnalyzed++;

            // Processar erros encontrados
            if (analysis.errors && analysis.errors.length > 0) {
                stats.errorsFound += analysis.errors.length;

                for (const error of analysis.errors) {
                    await processDetectedError(db, tenantId, error, products, tenant?.settings);
                }
            }

            // Processar sugestões de mapeamento
            if (analysis.new_mappings_suggested && analysis.new_mappings_suggested.length > 0) {
                stats.mappingsSuggested += analysis.new_mappings_suggested.length;

                for (const mapping of analysis.new_mappings_suggested) {
                    await processMappingSuggestion(db, tenantId, mapping, products, tenant?.settings);
                }
            }

            // Rastrear sessões críticas
            if (analysis.session_quality === 'critical') {
                stats.criticalSessions.push({
                    sessionId: session.session_id,
                    summary: analysis.summary
                });
            }

            // Marcar sessão como analisada
            await markSessionAnalyzed(db, session.session_id, analysis);

            console.log(`[DailyAnalysis] Sessão ${session.session_id}: ${analysis.session_quality} (${analysis.errors?.length || 0} erros)`);

        } catch (err) {
            console.error(`[DailyAnalysis] Erro na sessão ${session.session_id}:`, err.message);
        }
    }

    return stats;
}

/**
 * Processar um erro detectado pela IA
 */
async function processDetectedError(db, tenantId, error, products, settings) {
    try {
        // Tentar encontrar produto esperado se mencionado
        const product = error.should_be ? findProductInList(error.should_be, products) : null;

        const lesson = await createLesson(db, {
            tenantId,
            problemType: error.error_type,
            customerInput: error.customer_said,
            expectedProductId: product?.id,
            expectedProductName: product?.name || error.should_be,
            actualOutput: error.bot_understood,
            confidence: error.confidence || 0.5,
            reason: `Detectado em análise diária: ${error.error_type}`
        });

        if (lesson && canAutoApply(lesson, settings)) {
            await autoTestAndApply(db, lesson, products, settings);
        }
    } catch (err) {
        console.error('[DailyAnalysis] Erro ao processar erro detectado:', err.message);
    }
}

/**
 * Processar uma sugestão de mapeamento
 */
async function processMappingSuggestion(db, tenantId, suggestion, products, settings) {
    try {
        const product = findProductInList(suggestion.should_map_to_product, products);

        if (!product) return;

        const lesson = await createLesson(db, {
            tenantId,
            problemType: 'PRODUCT_NOT_FOUND',
            customerInput: suggestion.keyword,
            expectedProductId: product.id,
            expectedProductName: product.name,
            confidence: 0.7,
            reason: `Sugestão IA: ${suggestion.reason}`
        });

        if (lesson && canAutoApply(lesson, settings)) {
            await autoTestAndApply(db, lesson, products, settings);
        }
    } catch (err) {
        console.error('[DailyAnalysis] Erro ao processar sugestão:', err.message);
    }
}

/**
 * Utilitário para encontrar produto em lista por nome
 */
function findProductInList(name, products) {
    if (!name) return null;
    const lowerName = name.toLowerCase();
    return products.find(p =>
        p.name.toLowerCase().includes(lowerName) ||
        lowerName.includes(p.name.toLowerCase())
    );
}

/**
 * Executar teste sandbox e aplicar se passar
 */
async function autoTestAndApply(db, lesson, products, settings) {
    console.log(`[DailyAnalysis] 🧪 Executando auto-teste para lição ${lesson.id}...`);

    const testResult = await runSandboxTest(db, lesson, products);

    if (testResult.passed) {
        console.log(`[DailyAnalysis] ✅ Passou no sandbox (Score: ${testResult.score}). Aplicando...`);
        await applyLesson(db, lesson.id, 'auto');
    } else {
        console.log(`[DailyAnalysis] ❌ Falhou no sandbox. Mantendo pendente para revisão manual.`);
    }
}

export default {
    runDailyAnalysis
};
