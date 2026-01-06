// ============================================================
// Cache Service - DeliveryHub SaaS
// Sistema de cache em memória para otimização de alto volume
// Autor: killsis (Lucas Larocca)
// ============================================================

/**
 * Cache em memória com TTL configurável por tenant.
 * Suporta 300+ pedidos/dia reduzindo I/O no SQLite.
 */
class CacheService {
    constructor() {
        // Estrutura: { tenantId: { key: { data, timestamp, ttl } } }
        this.cache = new Map();

        // TTL padrão em milissegundos (10 minutos)
        this.defaultTTL = 10 * 60 * 1000;

        // Intervalo de limpeza automática (5 minutos)
        this.cleanupInterval = null;
        this.startCleanup();

        console.log('[CacheService] Inicializado com TTL padrão de 10 minutos');
    }

    /**
     * Obter item do cache
     * @param {string} tenantId - ID do tenant
     * @param {string} key - Chave do cache (ex: 'products', 'categories')
     * @returns {any|null} Dados ou null se expirado/inexistente
     */
    get(tenantId, key) {
        const tenantCache = this.cache.get(tenantId);
        if (!tenantCache) return null;

        const item = tenantCache.get(key);
        if (!item) return null;

        // Verificar TTL
        if (Date.now() - item.timestamp > item.ttl) {
            tenantCache.delete(key);
            return null;
        }

        return item.data;
    }

    /**
     * Definir item no cache
     * @param {string} tenantId - ID do tenant
     * @param {string} key - Chave do cache
     * @param {any} data - Dados a armazenar
     * @param {number} ttl - TTL em ms (opcional, usa padrão se não informado)
     */
    set(tenantId, key, data, ttl = this.defaultTTL) {
        if (!this.cache.has(tenantId)) {
            this.cache.set(tenantId, new Map());
        }

        this.cache.get(tenantId).set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }

    /**
     * Invalidar cache específico
     * @param {string} tenantId - ID do tenant
     * @param {string} key - Chave a invalidar (opcional, se não informado limpa todo o tenant)
     */
    invalidate(tenantId, key = null) {
        if (!key) {
            this.cache.delete(tenantId);
            console.log(`[CacheService] Cache do tenant ${tenantId} invalidado`);
        } else {
            const tenantCache = this.cache.get(tenantId);
            if (tenantCache) {
                tenantCache.delete(key);
                console.log(`[CacheService] Cache '${key}' do tenant ${tenantId} invalidado`);
            }
        }
    }

    /**
     * Invalidar chave específica em todos os tenants
     * @param {string} key - Chave a invalidar globalmente
     */
    invalidateAll(key) {
        for (const [tenantId, tenantCache] of this.cache) {
            tenantCache.delete(key);
        }
        console.log(`[CacheService] Cache '${key}' invalidado globalmente`);
    }

    /**
     * Limpar entradas expiradas
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [tenantId, tenantCache] of this.cache) {
            for (const [key, item] of tenantCache) {
                if (now - item.timestamp > item.ttl) {
                    tenantCache.delete(key);
                    cleaned++;
                }
            }
            // Remover tenant se vazio
            if (tenantCache.size === 0) {
                this.cache.delete(tenantId);
            }
        }

        if (cleaned > 0) {
            console.log(`[CacheService] Limpeza: ${cleaned} entradas expiradas removidas`);
        }
    }

    /**
     * Iniciar limpeza automática
     */
    startCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        // Limpar a cada 5 minutos
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Parar limpeza automática
     */
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Estatísticas do cache
     */
    getStats() {
        let totalEntries = 0;
        const tenantStats = {};

        for (const [tenantId, tenantCache] of this.cache) {
            tenantStats[tenantId] = tenantCache.size;
            totalEntries += tenantCache.size;
        }

        return {
            totalTenants: this.cache.size,
            totalEntries,
            tenantStats
        };
    }
}

// Singleton
let cacheService = null;

export function getCacheService() {
    if (!cacheService) {
        cacheService = new CacheService();
    }
    return cacheService;
}

export default CacheService;
