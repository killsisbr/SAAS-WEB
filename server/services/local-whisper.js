// ============================================================
// Local Whisper Transcription Service (Offline - Zero API Keys)
// Usa @xenova/transformers (ONNX Runtime) + ffmpeg para conversao
// Modelo: whisper-small (otimo para PT-BR, ~500MB no primeiro uso)
// ============================================================

import { pipeline } from '@xenova/transformers';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurar ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// Singleton do pipeline Whisper (carrega modelo uma vez)
let whisperPipeline = null;
let isLoading = false;

/**
 * Inicializar pipeline do Whisper (lazy loading)
 * Baixa o modelo na primeira execucao (~500MB)
 */
async function getWhisperPipeline() {
    if (whisperPipeline) return whisperPipeline;
    if (isLoading) {
        // Aguardar se ja esta carregando
        while (isLoading) {
            await new Promise(r => setTimeout(r, 500));
        }
        return whisperPipeline;
    }

    isLoading = true;
    try {
        console.log('[LocalWhisper] Carregando modelo whisper-small... (primeira vez pode demorar ~2min para baixar)');
        whisperPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
            // Cachear modelo localmente
            cache_dir: path.join(__dirname, '..', '.whisper-cache'),
        });
        console.log('[LocalWhisper] ✅ Modelo whisper-small carregado com sucesso!');
        return whisperPipeline;
    } catch (err) {
        console.error('[LocalWhisper] ❌ Erro ao carregar modelo:', err.message);
        throw err;
    } finally {
        isLoading = false;
    }
}

/**
 * Converter audio OGG/Opus para WAV 16kHz mono (formato esperado pelo Whisper)
 * @param {Buffer} audioBuffer - Buffer do audio OGG
 * @returns {Promise<string>} Caminho do arquivo WAV temporario
 */
function convertToWav(audioBuffer) {
    return new Promise((resolve, reject) => {
        const tempDir = os.tmpdir();
        const inputPath = path.join(tempDir, `whisper_input_${Date.now()}.ogg`);
        const outputPath = path.join(tempDir, `whisper_output_${Date.now()}.wav`);

        // Salvar buffer como arquivo temporario
        fs.writeFileSync(inputPath, audioBuffer);

        ffmpeg(inputPath)
            .audioFrequency(16000)   // 16kHz (requisito Whisper)
            .audioChannels(1)        // Mono
            .audioCodec('pcm_s16le') // PCM 16-bit
            .format('wav')
            .on('end', () => {
                // Limpar input
                try { fs.unlinkSync(inputPath); } catch (e) { }
                resolve(outputPath);
            })
            .on('error', (err) => {
                try { fs.unlinkSync(inputPath); } catch (e) { }
                reject(new Error(`FFmpeg conversion error: ${err.message}`));
            })
            .save(outputPath);
    });
}

/**
 * Ler arquivo WAV como Float32Array normalizado
 * @param {string} wavPath - Caminho do arquivo WAV
 * @returns {Float32Array} Audio normalizado
 */
function readWavAsFloat32(wavPath) {
    const buffer = fs.readFileSync(wavPath);

    // WAV header e 44 bytes, data comeca no byte 44
    // PCM 16-bit little-endian
    const dataStart = 44;
    const samples = (buffer.length - dataStart) / 2; // 16-bit = 2 bytes por sample
    const float32 = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
        const sample = buffer.readInt16LE(dataStart + i * 2);
        float32[i] = sample / 32768.0; // Normalizar para [-1, 1]
    }

    return float32;
}

/**
 * Transcrever audio localmente usando Whisper (100% offline)
 * @param {Buffer} audioBuffer - Buffer do audio (OGG/Opus do WhatsApp)
 * @param {string} mimetype - Tipo MIME
 * @returns {Promise<string>} Texto transcrito
 */
export async function transcribeLocal(audioBuffer, mimetype) {
    if (!audioBuffer || audioBuffer.length === 0) {
        return null;
    }

    const startTime = Date.now();
    console.log(`[LocalWhisper] Iniciando transcricao local (${audioBuffer.length} bytes)...`);

    let wavPath = null;
    try {
        // 1. Converter OGG para WAV 16kHz mono
        wavPath = await convertToWav(audioBuffer);
        console.log(`[LocalWhisper] Audio convertido para WAV: ${wavPath}`);

        // 2. Carregar pipeline do Whisper
        const transcriber = await getWhisperPipeline();

        // 3. Ler WAV como Float32Array
        const audioData = readWavAsFloat32(wavPath);
        console.log(`[LocalWhisper] Samples: ${audioData.length} (~${(audioData.length / 16000).toFixed(1)}s de audio)`);

        // 4. Transcrever
        const result = await transcriber(audioData, {
            language: 'portuguese',
            task: 'transcribe',
            chunk_length_s: 30,
            stride_length_s: 5,
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const text = result.text?.trim() || '';

        console.log(`[LocalWhisper] ✅ Transcricao concluida em ${elapsed}s: "${text}"`);
        return text;

    } catch (err) {
        console.error(`[LocalWhisper] ❌ Erro:`, err.message);
        throw err;
    } finally {
        // Limpar arquivo temporario
        if (wavPath) {
            try { fs.unlinkSync(wavPath); } catch (e) { }
        }
    }
}

/**
 * Pre-carregar modelo (chamar no boot do servidor)
 */
export async function preloadWhisper() {
    try {
        await getWhisperPipeline();
    } catch (err) {
        console.warn('[LocalWhisper] Pre-load falhou (sera tentado novamente no primeiro audio):', err.message);
    }
}
