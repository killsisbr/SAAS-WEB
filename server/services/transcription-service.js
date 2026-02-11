
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

        // Fallback se não houver chaves ou erros
        console.warn('[Transcription] Nenhuma API configurada ou falha na transcrição.');
        return "[Áudio Recebido] (Configure GROQ_API_KEY ou OPENAI_API_KEY para transcrição automática)";
    }

    async transcribeWithGroq(audioBuffer, mimetype) {
        console.log('[Transcription] Usando Groq (distil-whisper-large-v3-en)...');

        const formData = new FormData();
        // Groq requer nome de arquivo para detectar tipo
        formData.append('file', audioBuffer, { filename: 'audio.ogg', contentType: mimetype || 'audio/ogg' });
        formData.append('model', 'distil-whisper-large-v3-en'); // Ou 'whisper-large-v3'
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
