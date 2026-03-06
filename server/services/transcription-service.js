
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import fetch from 'node-fetch'; // Certifique-se de que está disponível ou use o nativo do Node 18+

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Serviço de Transcrição de Áudio
 * Suporta Groq (recomendado pela velocidade) e OpenAI
 */
export class TranscriptionService {
    constructor() {
        this.groqKey = process.env.GROQ_API_KEY;
        this.openaiKey = process.env.OPENAI_API_KEY;
    }

    /**
     * Transcreve um arquivo de áudio
     * @param {Buffer} audioBuffer - Buffer do áudio
     * @param {string} mimetype - Tipo MIME (ex: 'audio/ogg; codecs=opus')
     * @returns {Promise<string>} Texto transcrito ou mensagem de erro/fallback
     */
    async transcribe(audioBuffer, mimetype) {
        if (!audioBuffer) return null;

        console.log(`[Transcription] Iniciando transcrição (${audioBuffer.length} bytes)...`);

        // 0. PRIORIDADE MÁXIMA: Whisper Local (offline, sem API key)
        try {
            const { transcribeLocal } = await import('./local-whisper.js');
            const result = await transcribeLocal(audioBuffer, mimetype);
            if (result && result.trim().length > 0) {
                return result;
            }
        } catch (err) {
            console.warn('[Transcription] Local Whisper falhou, tentando APIs...', err.message);
        }

        // 1. Tentar Groq (Distil-Whisper) - Mais rápido
        if (this.groqKey) {
            try {
                return await this.transcribeWithGroq(audioBuffer, mimetype);
            } catch (err) {
                console.error('[Transcription] Erro no Groq, tentando fallback...', err.message);
            }
        }

        // 2. Tentar OpenAI (Whisper)
        if (this.openaiKey) {
            try {
                return await this.transcribeWithOpenAI(audioBuffer, mimetype);
            } catch (err) {
                console.error('[Transcription] Erro na OpenAI:', err.message);
            }
        }

        // Fallback se todas falharem
        console.warn('[Transcription] Todas as opções de transcrição falharam.');
        return "[Áudio Recebido] (Transcrição indisponível)";
    }

    async transcribeWithGroq(audioBuffer, mimetype) {
        console.log('[Transcription] Usando Groq (distil-whisper-large-v3-en)...');

        const formData = new FormData();
        // Groq requer nome de arquivo para detectar tipo
        formData.append('file', audioBuffer, { filename: 'audio.ogg', contentType: mimetype || 'audio/ogg' });
        formData.append('model', 'whisper-large-v3'); // Multilingual - suporta PT-BR
        formData.append('response_format', 'json');
        formData.append('language', 'pt'); // Forçar português

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.groqKey}`,
                ...formData.getHeaders()
            },
            body: formData
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Groq API Error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        console.log(`[Transcription] Sucesso Groq: "${data.text}"`);
        return data.text;
    }

    async transcribeWithOpenAI(audioBuffer, mimetype) {
        console.log('[Transcription] Usando OpenAI (whisper-1)...');

        const formData = new FormData();
        formData.append('file', audioBuffer, { filename: 'audio.ogg', contentType: mimetype || 'audio/ogg' });
        formData.append('model', 'whisper-1');
        formData.append('language', 'pt');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.openaiKey}`,
                ...formData.getHeaders()
            },
            body: formData
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI API Error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        console.log(`[Transcription] Sucesso OpenAI: "${data.text}"`);
        return data.text;
    }
}
