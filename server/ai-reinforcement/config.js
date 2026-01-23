// ============================================================
// AI Reinforcement Module - Configuration
// Configurações e toggles do sistema de IA
// ============================================================

export const AI_CONFIG = {
    // ============ TOGGLES PRINCIPAIS ============
    enabled: true,                      // Módulo ativado
    realtimeEnabled: false,             // Análise em tempo real (Fase 4)
    dailyAnalysisEnabled: false,        // Análise diária batch (Fase 2)
    loggingEnabled: true,               // Registrar histórico (Fase 1)
    autoApplyLessons: false,            // Aplicar lições automaticamente

    // ============ GEMINI API ============
    geminiApiKey: process.env.GEMINI_API_KEY || null,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    maxGeminiCallsPerDay: 1000,

    // ============ TEMPO REAL ============
    realtime: {
        maxLatencyMs: 2000,             // Timeout para não atrasar bot
        minConfidenceToIntervene: 0.7,  // Só intervém se confiança > 70%
        cooldownMinutes: 5,             // Não intervir várias vezes seguidas
        interventions: {
            wrongProduct: true,
            wrongQuantity: true,
            productNotFound: true,
            clarifyAmbiguous: false
        }
    },

    // ============ ANÁLISE DIÁRIA ============
    daily: {
        analysisHour: 3,                // 3:00 AM
        maxSessionsPerBatch: 100,       // Máximo de sessões por análise
        retentionDays: 30               // Manter histórico por 30 dias
    },

    // ============ APRENDIZADO ============
    learning: {
        minConfidenceToAutoApply: 0.85, // Confiança mínima para auto-aplicar
        maxAutoAppliesPerDay: 10,       // Limite de auto-aplicações
        minOccurrencesToLearn: 3        // Mínimo de ocorrências para validar padrão
    },

    // ============ AUTO-CORREÇÃO GRANULAR ============
    // Controla quais tipos de correção podem ser auto-aplicados
    autoCorrect: {
        mappings: true,         // Auto-aplicar novos mapeamentos de produto
        synonyms: true,         // Auto-aplicar sinônimos
        ignoredWords: false,    // Palavras ignoradas requerem aprovação manual
        thresholds: false       // Ajustes de threshold requerem aprovação manual
    },

    // ============ NOTIFICAÇÕES ============
    notifications: {
        notifyOnCriticalError: true,
        dailyReportEnabled: true,
        dailyReportTime: '08:00'
    }
};

// Tipos de erro rastreados
export const ERROR_TYPES = {
    PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',     // Não reconheceu produto
    WRONG_PRODUCT: 'WRONG_PRODUCT',             // Anotou produto errado
    WRONG_QUANTITY: 'WRONG_QUANTITY',           // Quantidade incorreta
    MISSED_MODIFIER: 'MISSED_MODIFIER',         // Não detectou modificador
    FALSE_POSITIVE: 'FALSE_POSITIVE',           // Detectou onde não deveria
    FLOW_ERROR: 'FLOW_ERROR',                   // Estado/fluxo incorreto
    SPAM_SENT: 'SPAM_SENT'                      // Enviou mensagem repetida
};

// Tipos de solução
export const SOLUTION_TYPES = {
    NEW_MAPPING: 'NEW_MAPPING',                 // Adicionar mapeamento
    ADD_IGNORED_WORD: 'ADD_IGNORED_WORD',       // Adicionar palavra ignorada
    ADD_SYNONYM: 'ADD_SYNONYM',                 // Adicionar sinônimo
    ADJUST_THRESHOLD: 'ADJUST_THRESHOLD',       // Ajustar score fuzzy
    ADD_MODIFIER: 'ADD_MODIFIER',               // Adicionar modificador
    CUSTOM_RULE: 'CUSTOM_RULE'                  // Regra especial
};

// Status de lições aprendidas
export const LESSON_STATUS = {
    PENDING: 'pending',
    APPLIED: 'applied',
    REJECTED: 'rejected',
    AUTO_APPLIED: 'auto_applied'
};

export default AI_CONFIG;
