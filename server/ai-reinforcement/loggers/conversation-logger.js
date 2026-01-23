// ============================================================
// AI Reinforcement Module - Conversation Logger
// Registra histórico de todas as conversas para análise
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { AI_CONFIG } from '../config.js';

// Cache de sessões ativas (tenantId:customerId -> sessionId)
const activeSessions = new Map();
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

/**
 * Inicializar tabelas de histórico no banco de dados
 */
export async function initializeHistoryTables(db) {
    try {
        // Tabela principal de histórico de conversas
        await db.run(`
            CREATE TABLE IF NOT EXISTS conversation_history (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                customer_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                
                direction TEXT NOT NULL,
                message TEXT NOT NULL,
                message_type TEXT DEFAULT 'text',
                
                cart_state TEXT,
                cart_items TEXT,
                cart_total REAL,
                detected_actions TEXT,
                matched_products TEXT,
                response_text TEXT,
                
                was_correct BOOLEAN,
                error_type TEXT,
                ai_notes TEXT,
                
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                analyzed_at DATETIME
            )
        `);

        // Índices para performance
        await db.run(`
            CREATE INDEX IF NOT EXISTS idx_conv_session 
            ON conversation_history(tenant_id, session_id)
        `);

        await db.run(`
            CREATE INDEX IF NOT EXISTS idx_conv_customer 
            ON conversation_history(tenant_id, customer_id, timestamp)
        `);

        await db.run(`
            CREATE INDEX IF NOT EXISTS idx_conv_pending 
            ON conversation_history(analyzed_at) WHERE analyzed_at IS NULL
        `);

        // Tabela de padrões aprendidos
        await db.run(`
            CREATE TABLE IF NOT EXISTS learned_patterns (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                
                problem_type TEXT NOT NULL,
                customer_input TEXT NOT NULL,
                expected_output TEXT,
                actual_output TEXT,
                reason TEXT,
                
                solution_type TEXT NOT NULL,
                solution_data TEXT,
                confidence REAL DEFAULT 0.5,
                
                status TEXT DEFAULT 'pending',
                applied_at DATETIME,
                applied_by TEXT,
                
                occurrence_count INTEGER DEFAULT 1,
                first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(tenant_id, problem_type, customer_input)
            )
        `);

        // Migração: Adicionar colunas se não existirem (para instalações existentes)
        try {
            const columns = await db.all("PRAGMA table_info(learned_patterns)");
            const colNames = columns.map(c => c.name);

            if (!colNames.includes('created_at')) {
                await db.run("ALTER TABLE learned_patterns ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
                console.log('[AI-Logger] ✅ Coluna created_at adicionada');
            }
            if (!colNames.includes('reason')) {
                await db.run("ALTER TABLE learned_patterns ADD COLUMN reason TEXT");
                console.log('[AI-Logger] ✅ Coluna reason adicionada');
            }
            if (!colNames.includes('solution_type')) {
                await db.run("ALTER TABLE learned_patterns ADD COLUMN solution_type TEXT NOT NULL DEFAULT 'NEW_MAPPING'");
                console.log('[AI-Logger] ✅ Coluna solution_type adicionada');
            }
            if (!colNames.includes('solution_data')) {
                await db.run("ALTER TABLE learned_patterns ADD COLUMN solution_data TEXT");
                console.log('[AI-Logger] ✅ Coluna solution_data adicionada');
            }
            if (!colNames.includes('occurrence_count')) {
                await db.run("ALTER TABLE learned_patterns ADD COLUMN occurrence_count INTEGER DEFAULT 1");
                console.log('[AI-Logger] ✅ Coluna occurrence_count adicionada');
            }
        } catch (e) {
            console.error('[AI-Logger] Erro na migração de learned_patterns:', e.message);
        }

        // Tabela de palavras ignoradas por tenant
        await db.run(`
            CREATE TABLE IF NOT EXISTS ignored_words (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                word TEXT NOT NULL,
                reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, word)
            )
        `);

        await db.run(`
            CREATE INDEX IF NOT EXISTS idx_ignored_words_tenant 
            ON ignored_words(tenant_id)
        `);

        // Tabela de sinônimos por tenant
        await db.run(`
            CREATE TABLE IF NOT EXISTS synonyms (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                word TEXT NOT NULL,
                synonym TEXT NOT NULL,
                product_id TEXT, -- ID do produto mapeado para este sinônimo
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, word, synonym)
            )
        `);

        // Migração: Adicionar product_id a synonyms se não existir
        try {
            const columns = await db.all("PRAGMA table_info(synonyms)");
            if (!columns.some(c => c.name === 'product_id')) {
                await db.run("ALTER TABLE synonyms ADD COLUMN product_id TEXT");
                console.log('[AI-Logger] ✅ Coluna product_id adicionada a synonyms');
            }
        } catch (e) { }

        await db.run(`
            CREATE INDEX IF NOT EXISTS idx_synonyms_tenant 
            ON synonyms(tenant_id)
        `);

        console.log('[AI-Logger] ✅ Tabelas de histórico e auto-melhoria inicializadas');
        return true;
    } catch (err) {
        console.error('[AI-Logger] ❌ Erro ao criar tabelas:', err.message);
        return false;
    }
}

/**
 * Obter ou criar sessão para uma conversa
 */
function getOrCreateSession(tenantId, customerId) {
    const key = `${tenantId}:${customerId}`;
    const existing = activeSessions.get(key);

    if (existing && (Date.now() - existing.lastActivity) < SESSION_TIMEOUT_MS) {
        existing.lastActivity = Date.now();
        return existing.sessionId;
    }

    // Nova sessão
    const sessionId = uuidv4();
    activeSessions.set(key, {
        sessionId,
        lastActivity: Date.now()
    });

    console.log(`[AI-Logger] Nova sessão criada: ${sessionId} para ${customerId}`);
    return sessionId;
}

/**
 * Registrar mensagem do cliente (entrada)
 */
export async function logCustomerMessage(db, params) {
    if (!AI_CONFIG.loggingEnabled) return null;

    const {
        tenantId,
        customerId,
        message,
        messageType = 'text',
        cartState,
        cartItems,
        cartTotal
    } = params;

    try {
        const sessionId = getOrCreateSession(tenantId, customerId);
        const id = uuidv4();

        await db.run(`
            INSERT INTO conversation_history (
                id, tenant_id, customer_id, session_id,
                direction, message, message_type,
                cart_state, cart_items, cart_total,
                timestamp
            ) VALUES (?, ?, ?, ?, 'IN', ?, ?, ?, ?, ?, datetime('now'))
        `, [
            id,
            tenantId,
            customerId,
            sessionId,
            message,
            messageType,
            cartState,
            JSON.stringify(cartItems || []),
            cartTotal || 0
        ]);

        console.log(`[AI-Logger] 📥 Mensagem IN registrada: "${message.substring(0, 30)}..."`);
        return id;
    } catch (err) {
        console.error('[AI-Logger] Erro ao registrar mensagem IN:', err.message);
        return null;
    }
}

/**
 * Registrar resposta do bot (saída) com contexto de análise
 */
export async function logBotResponse(db, params) {
    if (!AI_CONFIG.loggingEnabled) return null;

    const {
        tenantId,
        customerId,
        responseText,
        detectedActions,
        matchedProducts,
        cartState,
        cartItems,
        cartTotal
    } = params;

    try {
        const sessionId = getOrCreateSession(tenantId, customerId);
        const id = uuidv4();

        await db.run(`
            INSERT INTO conversation_history (
                id, tenant_id, customer_id, session_id,
                direction, message, message_type,
                cart_state, cart_items, cart_total,
                detected_actions, matched_products, response_text,
                timestamp
            ) VALUES (?, ?, ?, ?, 'OUT', ?, 'text', ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
            id,
            tenantId,
            customerId,
            sessionId,
            responseText || '',
            cartState,
            JSON.stringify(cartItems || []),
            cartTotal || 0,
            JSON.stringify(detectedActions || []),
            JSON.stringify(matchedProducts || []),
            responseText
        ]);

        console.log(`[AI-Logger] 📤 Resposta OUT registrada`);
        return id;
    } catch (err) {
        console.error('[AI-Logger] Erro ao registrar resposta OUT:', err.message);
        return null;
    }
}

/**
 * Registrar interação completa (mensagem IN + resposta OUT em uma chamada)
 */
export async function logInteraction(db, params) {
    if (!AI_CONFIG.loggingEnabled) return null;

    const {
        tenantId,
        customerId,
        customerMessage,
        messageType = 'text',
        botResponse,
        detectedActions,
        matchedProducts,
        cartState,
        cartItems,
        cartTotal
    } = params;

    try {
        const sessionId = getOrCreateSession(tenantId, customerId);

        // Log mensagem do cliente
        const inId = uuidv4();
        await db.run(`
            INSERT INTO conversation_history (
                id, tenant_id, customer_id, session_id,
                direction, message, message_type,
                cart_state, cart_items, cart_total,
                detected_actions, matched_products,
                timestamp
            ) VALUES (?, ?, ?, ?, 'IN', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
            inId,
            tenantId,
            customerId,
            sessionId,
            customerMessage,
            messageType,
            cartState,
            JSON.stringify(cartItems || []),
            cartTotal || 0,
            JSON.stringify(detectedActions || []),
            JSON.stringify(matchedProducts || [])
        ]);

        // Log resposta do bot (se houver)
        let outId = null;
        if (botResponse) {
            outId = uuidv4();
            await db.run(`
                INSERT INTO conversation_history (
                    id, tenant_id, customer_id, session_id,
                    direction, message, message_type,
                    cart_state, cart_items, cart_total,
                    response_text,
                    timestamp
                ) VALUES (?, ?, ?, ?, 'OUT', ?, 'text', ?, ?, ?, ?, datetime('now'))
            `, [
                outId,
                tenantId,
                customerId,
                sessionId,
                botResponse,
                cartState,
                JSON.stringify(cartItems || []),
                cartTotal || 0,
                botResponse
            ]);
        }

        console.log(`[AI-Logger] 📝 Interação registrada: IN="${customerMessage.substring(0, 20)}..." → OUT=${botResponse ? 'sim' : 'silenciado'}`);

        return { inId, outId, sessionId };
    } catch (err) {
        console.error('[AI-Logger] Erro ao registrar interação:', err.message);
        return null;
    }
}

/**
 * Buscar sessões não analisadas (para análise diária)
 */
export async function getPendingSessions(db, tenantId, limit = 100) {
    try {
        const rows = await db.all(`
            SELECT DISTINCT session_id, customer_id, 
                   MIN(timestamp) as started_at,
                   MAX(timestamp) as ended_at,
                   COUNT(*) as message_count
            FROM conversation_history
            WHERE tenant_id = ? AND analyzed_at IS NULL
            GROUP BY session_id
            ORDER BY started_at DESC
            LIMIT ?
        `, [tenantId, limit]);

        return rows;
    } catch (err) {
        console.error('[AI-Logger] Erro ao buscar sessões pendentes:', err.message);
        return [];
    }
}

/**
 * Buscar mensagens de uma sessão específica
 */
export async function getSessionMessages(db, sessionId) {
    try {
        const rows = await db.all(`
            SELECT * FROM conversation_history
            WHERE session_id = ?
            ORDER BY timestamp ASC
        `, [sessionId]);

        return rows.map(row => ({
            ...row,
            cart_items: JSON.parse(row.cart_items || '[]'),
            detected_actions: JSON.parse(row.detected_actions || '[]'),
            matched_products: JSON.parse(row.matched_products || '[]')
        }));
    } catch (err) {
        console.error('[AI-Logger] Erro ao buscar mensagens da sessão:', err.message);
        return [];
    }
}

/**
 * Marcar sessão como analisada
 */
export async function markSessionAnalyzed(db, sessionId, analysisResult = null) {
    try {
        await db.run(`
            UPDATE conversation_history
            SET analyzed_at = datetime('now'),
                ai_notes = ?
            WHERE session_id = ?
        `, [
            analysisResult ? JSON.stringify(analysisResult) : null,
            sessionId
        ]);

        console.log(`[AI-Logger] ✅ Sessão ${sessionId} marcada como analisada`);
        return true;
    } catch (err) {
        console.error('[AI-Logger] Erro ao marcar sessão:', err.message);
        return false;
    }
}

/**
 * Limpar histórico antigo (garbage collection)
 */
export async function cleanupOldHistory(db, retentionDays = 30) {
    try {
        const result = await db.run(`
            DELETE FROM conversation_history
            WHERE timestamp < datetime('now', '-${retentionDays} days')
        `);

        console.log(`[AI-Logger] 🧹 Limpeza: ${result.changes || 0} registros removidos (>${retentionDays} dias)`);
        return result.changes || 0;
    } catch (err) {
        console.error('[AI-Logger] Erro na limpeza:', err.message);
        return 0;
    }
}

/**
 * Estatísticas do histórico
 */
export async function getHistoryStats(db, tenantId) {
    try {
        const stats = await db.get(`
            SELECT 
                COUNT(*) as total_messages,
                COUNT(DISTINCT session_id) as total_sessions,
                COUNT(DISTINCT customer_id) as unique_customers,
                SUM(CASE WHEN analyzed_at IS NOT NULL THEN 1 ELSE 0 END) as analyzed_messages,
                SUM(CASE WHEN was_correct = 0 THEN 1 ELSE 0 END) as error_count
            FROM conversation_history
            WHERE tenant_id = ?
        `, [tenantId]);

        return stats;
    } catch (err) {
        console.error('[AI-Logger] Erro ao buscar stats:', err.message);
        return null;
    }
}

export default {
    initializeHistoryTables,
    logCustomerMessage,
    logBotResponse,
    logInteraction,
    getPendingSessions,
    getSessionMessages,
    markSessionAnalyzed,
    cleanupOldHistory,
    getHistoryStats
};
