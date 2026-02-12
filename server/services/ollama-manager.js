import OllamaClient from './ollama-client.js';

/**
 * Gerencia a disponibilidade de modelos Ollama
 */
class OllamaManager {
    constructor() {
        this.client = new OllamaClient();
        this.isPulling = false;
    }

    /**
     * Garante que o modelo padrão ou especificado esteja disponível
     */
    async ensureModel(modelName = 'gemma3:4b') {
        try {
            console.log(`[OllamaManager] Verificando modelo: ${modelName}`);
            const status = await this.client.healthCheck();

            if (!status.online) {
                console.error('[OllamaManager] ❌ Ollama está offline ou inacessível.');
                return false;
            }

            // Validar se o modelo exato ou a base dele existe
            const modelExists = status.models.some(m => m === modelName || m.startsWith(modelName.split(':')[0]));

            if (!modelExists) {
                console.log(`[OllamaManager] 📥 Modelo ${modelName} não encontrado. Iniciando download...`);
                this.isPulling = true;

                // Pull assíncrono para não travar o boot totalmente, 
                // mas logamos o progresso
                const result = await this.client.pullModel(modelName);

                if (result.success) {
                    console.log(`[OllamaManager] ✅ Modelo ${modelName} baixado com sucesso.`);
                    this.isPulling = false;
                    return true;
                } else {
                    console.error(`[OllamaManager] ❌ Falha ao carregar modelo ${modelName}:`, result.error);
                    this.isPulling = false;
                    return false;
                }
            }

            console.log(`[OllamaManager] ✅ Modelo ${modelName} pronto.`);
            return true;
        } catch (error) {
            console.error('[OllamaManager] Erro ao validar modelo:', error.message);
            return false;
        }
    }
}

// Singleton
const ollamaManager = new OllamaManager();

/**
 * Retorna a instância única do gerenciador Ollama
 */
export function getOllamaManager() {
    return ollamaManager;
}

export default ollamaManager;
