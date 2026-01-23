// ============================================================
// AI Reinforcement Module - Sandbox Tester
// Testa lições em ambiente isolado antes de aplicar
// ============================================================

import { AI_CONFIG, SOLUTION_TYPES } from '../config.js';

export async function runSandboxTest(db, lesson, products = []) {
    const result = {
        passed: false,
        score: 0,
        errors: [],
        warnings: [],
        details: {}
    };

    try {
        // Normalizar objeto (suporte a camelCase e snake_case)
        const type = lesson.solution_type || lesson.solutionType;
        const data = lesson.solution_data || lesson.solutionData;
        const tenantId = lesson.tenant_id || lesson.tenantId;

        console.log(`[Sandbox] 🧪 Testando lição: ${type}`);

        const solutionData = typeof data === 'string'
            ? JSON.parse(data)
            : data;

        switch (type) {
            case SOLUTION_TYPES.NEW_MAPPING:
                await testMappingSolution(db, { ...lesson, tenant_id: tenantId }, solutionData, products, result);
                break;

            case SOLUTION_TYPES.ADD_IGNORED_WORD:
                await testIgnoredWordSolution(db, lesson, solutionData, products, result);
                break;

            case SOLUTION_TYPES.ADD_SYNONYM:
                await testSynonymSolution(db, lesson, solutionData, products, result);
                break;

            default:
                result.errors.push(`Tipo de solução não suportado: ${lesson.solution_type}`);
        }

        // Calcular score final
        result.score = calculateScore(result);
        result.passed = result.score >= 0.7 && result.errors.length === 0;

        console.log(`[Sandbox] ${result.passed ? '✅' : '❌'} Score: ${(result.score * 100).toFixed(0)}%`);

    } catch (err) {
        console.error('[Sandbox] Erro no teste:', err.message);
        result.errors.push(err.message);
    }

    return result;
}

/**
 * Testar solução de mapeamento
 */
async function testMappingSolution(db, lesson, solutionData, products, result) {
    const { keyword, productId, productName } = solutionData;

    // Verificar se produto existe
    const productExists = products.some(p =>
        p.id === productId || p.id === parseInt(productId)
    );

    if (!productExists) {
        result.errors.push(`Produto ID ${productId} não encontrado no cardápio`);
        return;
    }

    // Verificar se keyword não é muito curta
    if (keyword.length < 2) {
        result.errors.push('Palavra-chave muito curta (mínimo 2 caracteres)');
        return;
    }

    // Verificar se keyword não é muito genérica
    const genericWords = ['um', 'uma', 'dois', 'duas', 'tres', 'quero', 'manda', 'por'];
    if (genericWords.includes(keyword)) {
        result.errors.push(`Palavra-chave muito genérica: "${keyword}"`);
        return;
    }

    // Verificar conflitos com outros mapeamentos
    const existingMapping = await db.get(`
        SELECT product_id FROM product_mappings 
        WHERE tenant_id = ? AND keyword = ?
    `, [lesson.tenant_id, keyword]);

    if (existingMapping && existingMapping.product_id !== productId) {
        result.warnings.push(`Já existe mapeamento para "${keyword}" → produto ${existingMapping.product_id}`);
        result.details.willReplace = true;
    }

    // Verificar se a keyword poderia causar falso positivo
    const conflictCheck = await checkForPotentialConflicts(db, lesson.tenant_id, keyword, products);
    if (conflictCheck.hasConflict) {
        result.warnings.push(conflictCheck.message);
    }

    // Passou nos testes básicos
    result.details.keyword = keyword;
    result.details.productId = productId;
    result.details.productName = productName;
}

/**
 * Testar solução de palavra ignorada
 */
async function testIgnoredWordSolution(db, lesson, solutionData, products, result) {
    const { word } = solutionData;

    // Verificar se a palavra não é nome de produto real
    const matchesProduct = products.some(p =>
        p.name.toLowerCase().includes(word.toLowerCase())
    );

    if (matchesProduct) {
        result.errors.push(`"${word}" faz parte do nome de um produto - não deve ser ignorada`);
        return;
    }

    // Verificar se já está ignorada
    const existing = await db.get(`
        SELECT id FROM ignored_words 
        WHERE tenant_id = ? AND word = ?
    `, [lesson.tenant_id, word]);

    if (existing) {
        result.warnings.push(`Palavra "${word}" já está na lista de ignoradas`);
    }

    result.details.word = word;
}

/**
 * Testar solução de sinônimo
 */
async function testSynonymSolution(db, lesson, solutionData, products, result) {
    const { word, synonym } = solutionData;

    // Verificar se ambas palavras não são vazias
    if (!word || !synonym) {
        result.errors.push('Palavra ou sinônimo vazios');
        return;
    }

    // Verificar se não são iguais
    if (word.toLowerCase() === synonym.toLowerCase()) {
        result.errors.push('Palavra e sinônimo são iguais');
        return;
    }

    result.details.word = word;
    result.details.synonym = synonym;
}

/**
 * Verificar conflitos potenciais de um mapeamento
 */
async function checkForPotentialConflicts(db, tenantId, keyword, products) {
    // Verificar se a keyword é substring de outro produto
    const conflicts = products.filter(p =>
        p.name.toLowerCase().includes(keyword) &&
        p.name.toLowerCase() !== keyword
    );

    if (conflicts.length > 0) {
        return {
            hasConflict: true,
            message: `"${keyword}" é substring de: ${conflicts.map(c => c.name).join(', ')}`
        };
    }

    return { hasConflict: false };
}

/**
 * Calcular score do teste
 */
function calculateScore(result) {
    let score = 1.0;

    // Cada erro reduz 0.5
    score -= result.errors.length * 0.5;

    // Cada warning reduz 0.1
    score -= result.warnings.length * 0.1;

    return Math.max(0, Math.min(1, score));
}

/**
 * Verificar regressões após aplicar uma lição
 * @param {object} db - Conexão com banco
 * @param {object} lesson - Lição aplicada
 * @param {array} testCases - Casos de teste conhecidos
 * @returns {object} Resultado da verificação
 */
export async function checkForRegressions(db, lesson, testCases = []) {
    console.log('[Sandbox] 🔍 Verificando regressões...');

    const regressions = [];

    for (const testCase of testCases) {
        // Simular o que o bot faria agora com essa entrada
        // (Implementação simplificada - idealmente chamaria o word-analyzer real)

        const expected = testCase.expectedProductId;
        const wouldMatch = testCase.input.toLowerCase().includes(lesson.solution_data?.keyword?.toLowerCase());

        if (wouldMatch && testCase.expectedProductId !== lesson.solution_data?.productId) {
            regressions.push({
                input: testCase.input,
                expected: expected,
                wouldGet: lesson.solution_data?.productId,
                message: `Input "${testCase.input}" deveria dar ${expected}, mas vai dar ${lesson.solution_data?.productId}`
            });
        }
    }

    return {
        hasRegressions: regressions.length > 0,
        count: regressions.length,
        details: regressions
    };
}

/**
 * Executar bateria de testes para uma lição
 */
export async function runFullTestSuite(db, lesson, products, testCases = []) {
    console.log('[Sandbox] 🧪 Executando suite completa de testes...');

    // Teste básico
    const sandboxResult = await runSandboxTest(db, lesson, products);

    // Teste de regressão
    const regressionResult = await checkForRegressions(db, lesson, testCases);

    // Resultado combinado
    const finalResult = {
        passed: sandboxResult.passed && !regressionResult.hasRegressions,
        sandboxScore: sandboxResult.score,
        hasRegressions: regressionResult.hasRegressions,
        regressionCount: regressionResult.count,
        sandbox: sandboxResult,
        regressions: regressionResult
    };

    console.log(`[Sandbox] Suite completa: ${finalResult.passed ? '✅ PASSOU' : '❌ FALHOU'}`);

    return finalResult;
}

export default {
    runSandboxTest,
    checkForRegressions,
    runFullTestSuite
};
