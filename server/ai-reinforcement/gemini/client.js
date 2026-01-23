// ============================================================
// AI Reinforcement Module - Gemini API Client
// Cliente para comunicação com Google Gemini
// ============================================================

import { AI_CONFIG } from '../config.js';

// Cache para evitar chamadas repetidas
const responseCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Verificar se a API está configurada
 */
export function isGeminiConfigured() {
    return !!AI_CONFIG.geminiApiKey;
}

/**
 * Fazer chamada para Gemini API
 * @param {string} prompt - Prompt a ser enviado
 * @param {object} options - Opções adicionais
 * @returns {Promise<object>} Resposta da API
 */
export async function callGemini(prompt, options = {}) {
    if (!isGeminiConfigured()) {
        console.warn('[Gemini] API Key não configurada');
        return { error: 'API_KEY_MISSING', response: null };
    }

    const {
        temperature = 0.3,          // Baixa temperatura para respostas consistentes
        maxTokens = 2048,
        useCache = true,
        timeout = 10000             // 10 segundos
    } = options;

    // Verificar cache
    const cacheKey = `${prompt.substring(0, 100)}:${temperature}`;
    if (useCache && responseCache.has(cacheKey)) {
        const cached = responseCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
            console.log('[Gemini] Retornando resposta do cache');
            return cached.response;
        }
        responseCache.delete(cacheKey);
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${AI_CONFIG.geminiModel}:generateContent?key=${AI_CONFIG.geminiApiKey}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature,
                    maxOutputTokens: maxTokens,
                    topP: 0.95,
                    topK: 40
                },
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Gemini] Erro na API:', response.status, errorText);
            return { error: `API_ERROR_${response.status}`, response: null, details: errorText };
        }

        const data = await response.json();

        // Extrair texto da resposta
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        const result = {
            error: null,
            response: text,
            usage: {
                promptTokens: data.usageMetadata?.promptTokenCount || 0,
                responseTokens: data.usageMetadata?.candidatesTokenCount || 0
            }
        };

        // Salvar no cache
        if (useCache) {
            responseCache.set(cacheKey, {
                response: result,
                timestamp: Date.now()
            });
        }

        console.log(`[Gemini] Resposta recebida (${result.usage.responseTokens} tokens)`);
        return result;

    } catch (err) {
        if (err.name === 'AbortError') {
            console.error('[Gemini] Timeout na chamada');
            return { error: 'TIMEOUT', response: null };
        }
        console.error('[Gemini] Erro:', err.message);
        return { error: 'NETWORK_ERROR', response: null, details: err.message };
    }
}

/**
 * Fazer chamada esperando resposta em JSON
 * @param {string} prompt - Prompt que solicita JSON como resposta
 * @param {object} options - Opções adicionais
 * @returns {Promise<object>} Objeto parseado ou erro
 */
export async function callGeminiJSON(prompt, options = {}) {
    const result = await callGemini(prompt, options);

    if (result.error) {
        return result;
    }

    try {
        // Tentar extrair JSON da resposta
        let jsonText = result.response;

        // Remover markdown code blocks se houver
        const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonText = jsonMatch[1];
        }

        // Limpar possíveis caracteres extras
        jsonText = jsonText.trim();

        const parsed = JSON.parse(jsonText);

        return {
            error: null,
            response: parsed,
            usage: result.usage
        };
    } catch (parseErr) {
        console.error('[Gemini] Erro ao parsear JSON:', parseErr.message);
        console.error('[Gemini] Resposta recebida:', result.response?.substring(0, 200));
        return { error: 'JSON_PARSE_ERROR', response: null, rawResponse: result.response };
    }
}

/**
 * Limpar cache
 */
export function clearCache() {
    responseCache.clear();
    console.log('[Gemini] Cache limpo');
}

/**
 * Estatísticas do cache
 */
export function getCacheStats() {
    return {
        size: responseCache.size,
        keys: Array.from(responseCache.keys()).map(k => k.substring(0, 50) + '...')
    };
}

export default {
    isGeminiConfigured,
    callGemini,
    callGeminiJSON,
    clearCache,
    getCacheStats
};
