/**
 * Ollama Client - Cliente para API do Ollama
 * Permite usar LLMs locais para auto-atendimento via WhatsApp
 */

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3:8b';

class OllamaClient {
    constructor(options = {}) {
        this.baseUrl = options.url || DEFAULT_OLLAMA_URL;
        this.model = options.model || DEFAULT_MODEL;
        this.timeout = options.timeout || 60000;
    }

    /**
     * Verifica se o Ollama está online e o modelo está disponível
     */
    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) {
                return { online: false, error: 'Ollama não está respondendo' };
            }

            const data = await response.json();
            const models = data.models || [];
            const modelExists = models.some(m => m.name === this.model || m.name.startsWith(this.model.split(':')[0]));

            return {
                online: true,
                models: models.map(m => m.name),
                modelAvailable: modelExists,
                currentModel: this.model
            };
        } catch (error) {
            return {
                online: false,
                error: error.message || 'Erro ao conectar com Ollama'
            };
        }
    }

    /**
     * Gera resposta usando o modelo Ollama
     * @param {string} prompt - Prompt do sistema
     * @param {Array} messages - Histórico de mensagens [{role: 'user'|'assistant', content: '...'}]
     * @param {Object} options - Opções adicionais
     */
    async generateResponse(prompt, messages = [], options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(this.timeout),
                body: JSON.stringify({
                    model: options.model || this.model,
                    messages: [
                        { role: 'system', content: prompt },
                        ...messages
                    ],
                    stream: false,
                    options: {
                        temperature: options.temperature || 0.7,
                        num_predict: options.maxTokens || 500,
                        top_p: options.topP || 0.9
                    }
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Ollama error: ${error}`);
            }

            const data = await response.json();
            return {
                success: true,
                content: data.message?.content || '',
                model: data.model,
                totalDuration: data.total_duration,
                promptTokens: data.prompt_eval_count,
                responseTokens: data.eval_count
            };
        } catch (error) {
            console.error('[Ollama] Erro ao gerar resposta:', error);
            return {
                success: false,
                error: error.message || 'Erro ao gerar resposta',
                content: null
            };
        }
    }

    /**
     * Gera resposta com streaming (para respostas longas)
     * @param {string} prompt - Prompt do sistema
     * @param {Array} messages - Histórico de mensagens
     * @param {Function} onChunk - Callback para cada chunk recebido
     */
    async generateResponseStream(prompt, messages = [], onChunk) {
        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'system', content: prompt },
                        ...messages
                    ],
                    stream: true
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama error: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.message?.content) {
                            fullContent += data.message.content;
                            if (onChunk) onChunk(data.message.content);
                        }
                    } catch (e) {
                        // Ignorar linhas inválidas
                    }
                }
            }

            return { success: true, content: fullContent };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Lista modelos disponíveis no Ollama
     */
    async listModels() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            const data = await response.json();
            return data.models || [];
        } catch (error) {
            console.error('[Ollama] Erro ao listar modelos:', error);
            return [];
        }
    }

    /**
     * Baixa um modelo do Ollama (pode demorar)
     */
    async pullModel(modelName) {
        try {
            const response = await fetch(`${this.baseUrl}/api/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelName })
            });

            if (!response.ok) {
                throw new Error('Erro ao baixar modelo');
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Atualiza configurações
     */
    configure(options) {
        if (options.url) this.baseUrl = options.url;
        if (options.model) this.model = options.model;
        if (options.timeout) this.timeout = options.timeout;
    }
}

export default OllamaClient;
