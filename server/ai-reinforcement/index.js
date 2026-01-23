// ============================================================
// AI Reinforcement Module - Entry Point
// Sistema de auto-aprendizado e melhoria contínua
// ============================================================

import { AI_CONFIG } from './config.js';
import * as conversationLogger from './loggers/conversation-logger.js';
import * as dailyAnalyzer from './analyzers/daily-analyzer.js';
import * as geminiClient from './gemini/client.js';

import { getPendingLessons } from './processors/lesson-engine.js';

// Re-exportar tudo para facilitar imports
export { AI_CONFIG } from './config.js';
export * from './loggers/conversation-logger.js';
export * from './analyzers/daily-analyzer.js';
export { isGeminiConfigured, callGemini, callGeminiJSON } from './gemini/client.js';

/**
 * Inicializar módulo de IA
 * Deve ser chamado no startup do servidor
 */
export async function initializeAIModule(db) {
    console.log('[AI-Reinforcement] ════════════════════════════════════════');
    console.log('[AI-Reinforcement] 🧠 Inicializando Módulo de IA...');

    // Verificar configuração
    console.log(`[AI-Reinforcement] Config:`);
    console.log(`  - Logging: ${AI_CONFIG.loggingEnabled ? '✅ Ativo' : '❌ Desativado'}`);
    console.log(`  - Realtime: ${AI_CONFIG.realtimeEnabled ? '✅ Ativo' : '⏳ Pendente (Fase 4)'}`);
    console.log(`  - Daily Analysis: ${AI_CONFIG.dailyAnalysisEnabled ? '✅ Ativo' : '⏳ Pendente'}`);
    console.log(`  - Auto-Apply: ${AI_CONFIG.autoApplyLessons ? '✅ Ativo' : '❌ Manual'}`);

    // Inicializar tabelas do banco
    if (AI_CONFIG.loggingEnabled) {
        await conversationLogger.initializeHistoryTables(db);
    }

    // Verificar API Key do Gemini
    if (geminiClient.isGeminiConfigured()) {
        console.log(`[AI-Reinforcement] Gemini API: ✅ Configurada (${AI_CONFIG.geminiModel})`);
    } else {
        console.log(`[AI-Reinforcement] Gemini API: ⚠️ Não configurada (defina GEMINI_API_KEY)`);
    }

    console.log('[AI-Reinforcement] ════════════════════════════════════════');
    console.log('[AI-Reinforcement] ✅ Módulo inicializado com sucesso!');

    // Agendar análise diária se habilitado
    if (AI_CONFIG.dailyAnalysisEnabled) {
        setupDailyAnalysisTimer(db);
    }

    return true;
}

/**
 * Configurar timer para análise diária (ex: 3h da manhã)
 */
function setupDailyAnalysisTimer(db) {
    const checkInterval = 30 * 60 * 1000; // Check a cada 30 min

    console.log(`[AI-Reinforcement] ⏰ Agendador de análise diária ativo (Check: 30min). Hora alvo: ${AI_CONFIG.daily.analysisHour}h`);

    setInterval(async () => {
        const now = new Date();
        const currentHour = now.getHours();

        // Se for a hora configurada (e não tiver rodado recentemente hoje)
        if (currentHour === AI_CONFIG.daily.analysisHour) {
            console.log(`[AI-Reinforcement] 🚀 Iniciando análise diária agendada...`);
            await dailyAnalyzer.runDailyAnalysis(db);
        }
    }, checkInterval);
}

/**
 * Registrar interação (wrapper simplificado)
 * Chamado pelo direct-order/index.js após processar mensagem
 */
export async function logConversation(db, params) {
    if (!AI_CONFIG.loggingEnabled) return null;

    return conversationLogger.logInteraction(db, params);
}

/**
 * Executar análise diária (wrapper)
 */
export async function runDailyAnalysis(db, tenantId = null) {
    return dailyAnalyzer.runDailyAnalysis(db, tenantId);
}

/**
 * Obter estatísticas do módulo de IA
 */
export async function getAIStats(db, tenantId) {
    const historyStats = await conversationLogger.getHistoryStats(db, tenantId);
    const pendingLessons = await getPendingLessons(db, tenantId);

    return {
        module: {
            loggingEnabled: AI_CONFIG.loggingEnabled,
            realtimeEnabled: AI_CONFIG.realtimeEnabled,
            dailyAnalysisEnabled: AI_CONFIG.dailyAnalysisEnabled,
            geminiConfigured: geminiClient.isGeminiConfigured()
        },
        history: historyStats,
        pendingPatterns: pendingLessons.length
    };
}

/**
 * Limpeza periódica (chamar via CRON)
 */
export async function runCleanup(db) {
    console.log('[AI-Reinforcement] 🧹 Executando limpeza periódica...');

    const deleted = await conversationLogger.cleanupOldHistory(db, AI_CONFIG.daily.retentionDays);

    console.log(`[AI-Reinforcement] Limpeza concluída: ${deleted} registros removidos`);
    return deleted;
}

export default {
    initializeAIModule,
    logConversation,
    runDailyAnalysis,
    getAIStats,
    runCleanup,
    AI_CONFIG
};
