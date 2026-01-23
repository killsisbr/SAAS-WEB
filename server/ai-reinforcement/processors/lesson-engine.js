// ============================================================
// AI Reinforcement Module - Lesson Engine
// Motor de lições: cria, valida e aplica correções
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { SOLUTION_TYPES, LESSON_STATUS, AI_CONFIG } from '../config.js';

/**
 * Criar uma lição a partir de um erro detectado
 * @param {object} db - Conexão com banco
 * @param {object} errorData - Dados do erro detectado pela IA
 * @returns {object} Lição criada
 */
export async function createLesson(db, errorData) {
    const {
        tenantId,
        problemType,
        customerInput,
        expectedProductId,
        expectedProductName,
        actualOutput,
        confidence = 0.7,
        reason = ''
    } = errorData;

    const lessonId = uuidv4();

    // Determinar tipo de solução baseado no problema
    let solutionType = SOLUTION_TYPES.NEW_MAPPING;
    let solutionData = {};

    switch (problemType) {
        case 'PRODUCT_NOT_FOUND':
            solutionType = SOLUTION_TYPES.NEW_MAPPING;
            solutionData = {
                keyword: customerInput.toLowerCase().trim(),
                productId: expectedProductId,
                productName: expectedProductName
            };
            break;

        case 'FALSE_POSITIVE':
            solutionType = SOLUTION_TYPES.ADD_IGNORED_WORD;
            solutionData = {
                word: customerInput.toLowerCase().trim()
            };
            break;

        case 'WRONG_PRODUCT':
            // Pode ser um sinônimo mapeado errado - criar novo mapeamento correto
            solutionType = SOLUTION_TYPES.NEW_MAPPING;
            solutionData = {
                keyword: customerInput.toLowerCase().trim(),
                productId: expectedProductId,
                productName: expectedProductName,
                replacesExisting: true
            };
            break;

        default:
            solutionType = SOLUTION_TYPES.CUSTOM_RULE;
            solutionData = { raw: errorData };
    }

    // Salvar lição no banco
    try {
        await db.run(`
            INSERT INTO learned_patterns (
                id, tenant_id, problem_type, customer_input,
                expected_output, actual_output, solution_type,
                solution_data, confidence, status, reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `, [
            lessonId,
            tenantId,
            problemType,
            customerInput,
            expectedProductName || expectedProductId,
            actualOutput || 'N/A',
            solutionType,
            JSON.stringify(solutionData),
            confidence,
            reason
        ]);

        console.log(`[LessonEngine] 📝 Lição criada: ${solutionType} - "${customerInput}" → ${expectedProductName || expectedProductId}`);

        return {
            id: lessonId,
            tenantId,
            problemType,
            solutionType,
            solutionData,
            confidence,
            status: LESSON_STATUS.PENDING
        };
    } catch (err) {
        console.error('[LessonEngine] Erro ao criar lição:', err.message);
        return null;
    }
}

/**
 * Aplicar uma lição (executar a correção)
 * @param {object} db - Conexão com banco
 * @param {string} lessonId - ID da lição
 * @param {string} appliedBy - Quem aplicou (admin ou auto)
 * @returns {object} Resultado da aplicação
 */
export async function applyLesson(db, lessonId, appliedBy = 'admin') {
    try {
        // Buscar lição
        const lesson = await db.get('SELECT * FROM learned_patterns WHERE id = ?', [lessonId]);

        if (!lesson) {
            return { success: false, error: 'Lição não encontrada' };
        }

        if (lesson.status !== 'pending') {
            return { success: false, error: `Lição já está com status: ${lesson.status}` };
        }

        const solutionData = JSON.parse(lesson.solution_data);
        let applied = false;

        // Aplicar baseado no tipo de solução
        switch (lesson.solution_type) {
            case SOLUTION_TYPES.NEW_MAPPING:
                applied = await applyMappingSolution(db, lesson.tenant_id, solutionData);
                break;

            case SOLUTION_TYPES.ADD_IGNORED_WORD:
                applied = await applyIgnoredWordSolution(db, lesson.tenant_id, solutionData);
                break;

            case SOLUTION_TYPES.ADD_SYNONYM:
                applied = await applySynonymSolution(db, lesson.tenant_id, solutionData);
                break;

            default:
                console.warn(`[LessonEngine] Tipo de solução não suportado para auto-apply: ${lesson.solution_type}`);
                return { success: false, error: 'Tipo de solução não suportado' };
        }

        if (applied) {
            // Marcar como aplicada
            const newStatus = appliedBy === 'auto' ? LESSON_STATUS.AUTO_APPLIED : LESSON_STATUS.APPLIED;
            await db.run(`
                UPDATE learned_patterns 
                SET status = ?, applied_at = datetime('now'), applied_by = ?
                WHERE id = ?
            `, [newStatus, appliedBy, lessonId]);

            console.log(`[LessonEngine] ✅ Lição aplicada: ${lesson.solution_type} por ${appliedBy}`);
            return { success: true, solutionType: lesson.solution_type };
        }

        return { success: false, error: 'Falha na aplicação' };

    } catch (err) {
        console.error('[LessonEngine] Erro ao aplicar lição:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Aplicar solução de mapeamento
 */
async function applyMappingSolution(db, tenantId, solutionData) {
    try {
        const { keyword, productId } = solutionData;

        await db.run(`
            INSERT OR REPLACE INTO product_mappings (id, tenant_id, keyword, product_id)
            VALUES (?, ?, ?, ?)
        `, [uuidv4(), tenantId, keyword, productId]);

        console.log(`[LessonEngine] Mapeamento criado: "${keyword}" → ${productId}`);
        return true;
    } catch (err) {
        console.error('[LessonEngine] Erro ao aplicar mapeamento:', err.message);
        return false;
    }
}

/**
 * Aplicar solução de palavra ignorada
 */
async function applyIgnoredWordSolution(db, tenantId, solutionData) {
    try {
        const { word } = solutionData;

        await db.run(`
            INSERT OR REPLACE INTO ignored_words (tenant_id, word, reason, is_active, created_at)
            VALUES (?, ?, 'Adicionado por IA', 1, datetime('now'))
        `, [tenantId, word.toLowerCase()]);

        console.log(`[LessonEngine] Palavra ignorada adicionada: "${word}"`);
        return true;
    } catch (err) {
        console.error('[LessonEngine] Erro ao adicionar palavra ignorada:', err.message);
        return false;
    }
}

/**
 * Aplicar solução de sinônimo
 */
async function applySynonymSolution(db, tenantId, solutionData) {
    try {
        const { synonym, productId } = solutionData;

        await db.run(`
            INSERT OR REPLACE INTO synonyms (tenant_id, synonym, product_id, source, is_active, created_at)
            VALUES (?, ?, ?, 'ai_lesson', 1, datetime('now'))
        `, [tenantId, synonym.toLowerCase(), productId]);

        console.log(`[LessonEngine] Sinônimo criado: "${synonym}" → produto ${productId}`);
        return true;
    } catch (err) {
        console.error('[LessonEngine] Erro ao adicionar sinônimo:', err.message);
        return false;
    }
}

/**
 * Rejeitar uma lição
 */
export async function rejectLesson(db, lessonId, reason = '') {
    try {
        await db.run(`
            UPDATE learned_patterns 
            SET status = 'rejected', applied_at = datetime('now'), reason = ?
            WHERE id = ?
        `, [reason, lessonId]);

        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Listar lições pendentes de um tenant
 */
export async function getPendingLessons(db, tenantId, limit = 50) {
    try {
        return await db.all(`
            SELECT 
                id, problem_type, customer_input, expected_output,
                actual_output, solution_type, solution_data,
                confidence, created_at, occurrence_count
            FROM learned_patterns
            WHERE tenant_id = ? AND status = 'pending'
            ORDER BY occurrence_count DESC, confidence DESC
            LIMIT ?
        `, [tenantId, limit]);
    } catch (err) {
        console.error('[LessonEngine] Erro ao buscar lições:', err.message);
        return [];
    }
}

/**
 * Listar histórico de lições aplicadas
 */
export async function getLessonHistory(db, tenantId, limit = 100) {
    try {
        return await db.all(`
            SELECT 
                id, problem_type, customer_input, solution_type,
                solution_data, status, applied_at, applied_by
            FROM learned_patterns
            WHERE tenant_id = ? AND status IN ('applied', 'auto_applied', 'rejected')
            ORDER BY applied_at DESC
            LIMIT ?
        `, [tenantId, limit]);
    } catch (err) {
        console.error('[LessonEngine] Erro ao buscar histórico:', err.message);
        return [];
    }
}

/**
 * Verificar se lição pode ser auto-aplicada
 */
export function canAutoApply(lesson, tenantSettings = {}) {
    const aiSettings = tenantSettings.aiReinforcement || {};
    const autoCorrect = aiSettings.autoCorrect || {};

    // Verificar toggle global
    if (!aiSettings.autoApplyLessons) return false;

    // Verificar confiança mínima
    if (lesson.confidence < AI_CONFIG.learning.minConfidenceToAutoApply) return false;

    // Verificar toggle específico por tipo
    switch (lesson.solution_type) {
        case SOLUTION_TYPES.NEW_MAPPING:
            return autoCorrect.mappings !== false;
        case SOLUTION_TYPES.ADD_SYNONYM:
            return autoCorrect.synonyms !== false;
        case SOLUTION_TYPES.ADD_IGNORED_WORD:
            return autoCorrect.ignoredWords === true; // Precisa ser explicitamente true
        default:
            return false;
    }
}

export default {
    createLesson,
    applyLesson,
    rejectLesson,
    getPendingLessons,
    getLessonHistory,
    canAutoApply
};
