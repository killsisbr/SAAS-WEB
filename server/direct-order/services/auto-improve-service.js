// ============================================================
// Auto-Improvement Service
// Serviço para carregar palavras ignoradas e sinônimos do banco
// por tenant para o word-analyzer
// ============================================================

// Cache em memória para evitar queries repetidas
const cache = {
    ignoredWords: new Map(),  // tenantId -> { words: Set, timestamp }
    synonyms: new Map(),       // tenantId -> { map: Map<synonym, productId>, timestamp }
    TTL: 5 * 60 * 1000        // 5 minutos
};

/**
 * Carregar palavras ignoradas do banco de dados para um tenant
 * @param {Object} db - Instância do banco de dados
 * @param {string} tenantId - ID do tenant
 * @returns {Promise<Set<string>>} Set de palavras ignoradas
 */
export async function getIgnoredWords(db, tenantId) {
    // Verificar cache
    const cached = cache.ignoredWords.get(tenantId);
    if (cached && (Date.now() - cached.timestamp) < cache.TTL) {
        return cached.words;
    }

    try {
        const rows = await db.all(`
            SELECT word FROM ignored_words 
            WHERE tenant_id = ? AND is_active = 1
        `, [tenantId]);

        const words = new Set(rows.map(r => r.word.toLowerCase()));

        // Atualizar cache
        cache.ignoredWords.set(tenantId, {
            words,
            timestamp: Date.now()
        });

        return words;
    } catch (error) {
        // Tabela pode não existir ainda
        console.warn('[AutoImprove] Tabela ignored_words não encontrada:', error.message);
        return new Set();
    }
}

/**
 * Carregar sinônimos do banco de dados para um tenant
 * @param {Object} db - Instância do banco de dados
 * @param {string} tenantId - ID do tenant
 * @returns {Promise<Map<string, number>>} Map de sinônimo -> productId
 */
export async function getSynonyms(db, tenantId) {
    // Verificar cache
    const cached = cache.synonyms.get(tenantId);
    if (cached && (Date.now() - cached.timestamp) < cache.TTL) {
        return cached.map;
    }

    try {
        const rows = await db.all(`
            SELECT synonym, product_id FROM synonyms 
            WHERE tenant_id = ? AND is_active = 1
        `, [tenantId]);

        const map = new Map();
        for (const row of rows) {
            map.set(row.synonym.toLowerCase(), row.product_id);
        }

        // Atualizar cache
        cache.synonyms.set(tenantId, {
            map,
            timestamp: Date.now()
        });

        return map;
    } catch (error) {
        console.warn('[AutoImprove] Tabela synonyms não encontrada:', error.message);
        return new Map();
    }
}

/**
 * Adicionar palavra ignorada para um tenant
 * @param {Object} db - Instância do banco de dados
 * @param {string} tenantId - ID do tenant
 * @param {string} word - Palavra a ignorar
 * @param {string} reason - Motivo (opcional)
 * @returns {Promise<boolean>} Sucesso
 */
export async function addIgnoredWord(db, tenantId, word, reason = null) {
    try {
        await db.run(`
            INSERT OR REPLACE INTO ignored_words (tenant_id, word, reason, is_active, created_at)
            VALUES (?, ?, ?, 1, datetime('now'))
        `, [tenantId, word.toLowerCase(), reason]);

        // Limpar cache
        cache.ignoredWords.delete(tenantId);
        return true;
    } catch (error) {
        console.error('[AutoImprove] Erro ao adicionar palavra ignorada:', error.message);
        return false;
    }
}

/**
 * Adicionar sinônimo para um tenant
 * @param {Object} db - Instância do banco de dados
 * @param {string} tenantId - ID do tenant
 * @param {string} synonym - Sinônimo
 * @param {number} productId - ID do produto
 * @param {string} source - Origem (manual, ai_suggested)
 * @returns {Promise<boolean>} Sucesso
 */
export async function addSynonym(db, tenantId, synonym, productId, source = 'manual') {
    try {
        await db.run(`
            INSERT OR REPLACE INTO synonyms (tenant_id, synonym, product_id, source, is_active, created_at)
            VALUES (?, ?, ?, ?, 1, datetime('now'))
        `, [tenantId, synonym.toLowerCase(), productId, source]);

        // Limpar cache
        cache.synonyms.delete(tenantId);
        return true;
    } catch (error) {
        console.error('[AutoImprove] Erro ao adicionar sinônimo:', error.message);
        return false;
    }
}

/**
 * Remover palavra ignorada
 */
export async function removeIgnoredWord(db, tenantId, word) {
    try {
        await db.run(`
            UPDATE ignored_words SET is_active = 0 
            WHERE tenant_id = ? AND word = ?
        `, [tenantId, word.toLowerCase()]);

        cache.ignoredWords.delete(tenantId);
        return true;
    } catch (error) {
        console.error('[AutoImprove] Erro ao remover palavra ignorada:', error.message);
        return false;
    }
}

/**
 * Remover sinônimo
 */
export async function removeSynonym(db, tenantId, synonym) {
    try {
        await db.run(`
            UPDATE synonyms SET is_active = 0 
            WHERE tenant_id = ? AND synonym = ?
        `, [tenantId, synonym.toLowerCase()]);

        cache.synonyms.delete(tenantId);
        return true;
    } catch (error) {
        console.error('[AutoImprove] Erro ao remover sinônimo:', error.message);
        return false;
    }
}

/**
 * Limpar cache para um tenant (útil após aplicar lições)
 */
export function clearCache(tenantId) {
    cache.ignoredWords.delete(tenantId);
    cache.synonyms.delete(tenantId);
}

/**
 * Limpar todo o cache
 */
export function clearAllCache() {
    cache.ignoredWords.clear();
    cache.synonyms.clear();
}

export default {
    getIgnoredWords,
    getSynonyms,
    addIgnoredWord,
    addSynonym,
    removeIgnoredWord,
    removeSynonym,
    clearCache,
    clearAllCache
};
