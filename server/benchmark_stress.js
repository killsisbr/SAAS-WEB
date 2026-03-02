// ============================================================
// Benchmark de Stress - Múltiplos Clientes Simultâneos
// Testa isolamento de sessões e performance do AgentEmployee
// ============================================================

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { AgentEmployee } from './agent-employee/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === CONFIG ===
const NUM_CLIENTS = 5;           // Clientes simultâneos
const TENANT_ID = 'demo_tenant_001';
const DB_PATH = path.join(__dirname, 'database', 'deliveryhub.sqlite');

// Perfis de clientes simulados
const CLIENT_PROFILES = [
    { phone: '5541900000001', name: 'Carlos', order: 'quero um x-bacon', obs: '' },
    { phone: '5541900000002', name: 'Mariana', order: 'quero 2 x-tudo sem cebola e sem picles', obs: '' },
    { phone: '5541900000003', name: 'Pedro', order: 'quero um x-burger e uma coca lata', obs: '' },
    { phone: '5541900000004', name: 'Ana', order: 'quero um x-frango com bacon extra', obs: '' },
    { phone: '5541900000005', name: 'Lucas', order: 'quero 3 x-egg e 2 coca', obs: '' },
    { phone: '5541900000006', name: 'Julia', order: 'quero um x-salada', obs: '' },
    { phone: '5541900000007', name: 'Rafael', order: 'quero um x-calabresa e uma batata', obs: '' },
    { phone: '5541900000008', name: 'Camila', order: 'quero 2 x-bacon sem cebola', obs: '' },
];

// Fluxo de conversa de cada cliente
const CONVERSATION_STEPS = [
    // Step 0: Saudação inicial
    { msg: 'oi', label: 'GREETING' },
    // Step 1: Pedido
    { msg: null, label: 'ORDER' }, // msg será substituído pelo perfil
    // Step 2: Fechar pedido
    { msg: 'fechar', label: 'FINALIZE' },
    // Step 3: Endereço (se delivery)
    { msg: 'Rua Teste 123 Centro', label: 'ADDRESS' },
    // Step 4: Nome (se solicitado)
    { msg: null, label: 'NAME' }, // msg será substituído pelo nome do perfil
    // Step 5: Sem observação
    { msg: 'nao', label: 'OBSERVATION' },
    // Step 6: Pagamento via Pix
    { msg: 'pix', label: 'PAYMENT' },
    // Step 7: Confirmar
    { msg: 'sim', label: 'CONFIRM' },
];

// === METRICAS ===
const metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    responseTimes: [],
    errors: [],
    clientResults: {},
    startTime: null,
    endTime: null,
};

// === UTILS ===
function formatMs(ms) {
    return `${ms.toFixed(0)}ms`;
}

function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * p / 100) - 1;
    return sorted[Math.max(0, idx)];
}

// === CLIENTE SIMULADO ===
async function simulateClient(agent, profile, clientIndex) {
    const results = [];
    const clientId = `${profile.phone}@s.whatsapp.net`;
    const startTime = Date.now();

    console.log(`[Cliente ${clientIndex}] ${profile.name} iniciando atendimento...`);

    for (let stepIdx = 0; stepIdx < CONVERSATION_STEPS.length; stepIdx++) {
        const step = CONVERSATION_STEPS[stepIdx];
        let msg = step.msg;

        // Substituir msg dinâmica
        if (step.label === 'ORDER') msg = profile.order;
        if (step.label === 'NAME') msg = profile.name;

        const stepStart = Date.now();
        try {
            const response = await agent.handleMessage(clientId, msg, profile.name);
            const elapsed = Date.now() - stepStart;

            metrics.totalRequests++;
            metrics.responseTimes.push(elapsed);

            if (response.success) {
                metrics.successfulRequests++;
                results.push({
                    step: step.label,
                    msg,
                    responsePreview: response.message?.substring(0, 80) + '...',
                    timeMs: elapsed,
                    success: true
                });
            } else {
                metrics.failedRequests++;
                metrics.errors.push({ client: profile.name, step: step.label, error: response.error });
                results.push({
                    step: step.label,
                    msg,
                    error: response.error,
                    timeMs: elapsed,
                    success: false
                });
            }

            // Se a resposta indica pedido criado, podemos parar
            if (response.orderCreated) {
                console.log(`[Cliente ${clientIndex}] ${profile.name} -- PEDIDO CRIADO! #${response.orderCreated}`);
                break;
            }

            // Se a resposta contém "cardápio" e estamos no passo de pedido, não precisa fechar
            // Pequeno delay entre mensagens para simular comportamento humano
            await new Promise(r => setTimeout(r, 100 + Math.random() * 200));

        } catch (err) {
            const elapsed = Date.now() - stepStart;
            metrics.totalRequests++;
            metrics.failedRequests++;
            metrics.responseTimes.push(elapsed);
            metrics.errors.push({ client: profile.name, step: step.label, error: err.message });
            results.push({
                step: step.label,
                msg,
                error: err.message,
                timeMs: elapsed,
                success: false
            });
            // Continuar mesmo com erro
        }
    }

    const totalTime = Date.now() - startTime;
    console.log(`[Cliente ${clientIndex}] ${profile.name} finalizou em ${formatMs(totalTime)}`);

    return {
        clientName: profile.name,
        clientPhone: profile.phone,
        totalTimeMs: totalTime,
        steps: results,
    };
}

// === MAIN ===
async function runBenchmark() {
    console.log('');
    console.log('='.repeat(60));
    console.log('  BENCHMARK DE STRESS - AgentEmployee');
    console.log(`  ${NUM_CLIENTS} clientes simultaneos | ${CONVERSATION_STEPS.length} passos cada`);
    console.log('='.repeat(60));
    console.log('');

    // Conectar ao banco
    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    // Criar instância do AgentEmployee
    const agent = new AgentEmployee(db, TENANT_ID, {
        employeeName: 'Ana',
        storeName: 'Brutus Burger',
        ollamaUrl: 'http://localhost:11434',
        model: 'gemma:2b'
    });

    // Inicializar
    console.log('[Benchmark] Inicializando AgentEmployee...');
    await agent.initialize();
    console.log(`[Benchmark] Produtos carregados: ${agent.products?.length || 0}`);
    console.log(`[Benchmark] Addons carregados: ${agent.addons?.length || 0}`);
    console.log('');

    // Limpar sessões anteriores dos clientes de teste
    const { resetSession } = await import('./agent-employee/services/cart-service.js');
    for (const profile of CLIENT_PROFILES.slice(0, NUM_CLIENTS)) {
        const clientId = `${profile.phone}@s.whatsapp.net`;
        try { resetSession(TENANT_ID, clientId); } catch (e) { }
    }

    // Selecionar N perfis
    const selectedProfiles = CLIENT_PROFILES.slice(0, NUM_CLIENTS);

    console.log('[Benchmark] Disparando clientes simultaneos...');
    console.log('-'.repeat(60));

    metrics.startTime = Date.now();

    // Disparar todos os clientes em PARALELO
    const clientPromises = selectedProfiles.map((profile, idx) =>
        simulateClient(agent, profile, idx + 1)
    );

    const clientResults = await Promise.all(clientPromises);

    metrics.endTime = Date.now();

    // === RELATORIO ===
    console.log('');
    console.log('='.repeat(60));
    console.log('  RELATORIO DO BENCHMARK');
    console.log('='.repeat(60));
    console.log('');

    const totalDuration = metrics.endTime - metrics.startTime;

    console.log(`Duracao total:        ${formatMs(totalDuration)}`);
    console.log(`Clientes simulados:   ${NUM_CLIENTS}`);
    console.log(`Total de requests:    ${metrics.totalRequests}`);
    console.log(`Sucesso:              ${metrics.successfulRequests} (${(metrics.successfulRequests / metrics.totalRequests * 100).toFixed(1)}%)`);
    console.log(`Falhas:               ${metrics.failedRequests} (${(metrics.failedRequests / metrics.totalRequests * 100).toFixed(1)}%)`);
    console.log('');

    if (metrics.responseTimes.length > 0) {
        console.log('--- Tempos de Resposta ---');
        console.log(`  Min:     ${formatMs(Math.min(...metrics.responseTimes))}`);
        console.log(`  Max:     ${formatMs(Math.max(...metrics.responseTimes))}`);
        console.log(`  Media:   ${formatMs(metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length)}`);
        console.log(`  P50:     ${formatMs(percentile(metrics.responseTimes, 50))}`);
        console.log(`  P95:     ${formatMs(percentile(metrics.responseTimes, 95))}`);
        console.log(`  P99:     ${formatMs(percentile(metrics.responseTimes, 99))}`);
        console.log('');
    }

    // Detalhamento por cliente
    console.log('--- Resultado por Cliente ---');
    for (const result of clientResults) {
        const success = result.steps.filter(s => s.success).length;
        const fail = result.steps.filter(s => !s.success).length;
        const avgTime = result.steps.reduce((a, s) => a + s.timeMs, 0) / result.steps.length;
        const maxStep = result.steps.reduce((a, s) => s.timeMs > a.timeMs ? s : a, result.steps[0]);

        console.log(`  ${result.clientName} (${result.clientPhone})`);
        console.log(`    Total: ${formatMs(result.totalTimeMs)} | Steps: ${success} ok, ${fail} fail | Media: ${formatMs(avgTime)} | Pico: ${formatMs(maxStep.timeMs)} (${maxStep.step})`);
    }

    // Erros
    if (metrics.errors.length > 0) {
        console.log('');
        console.log('--- Erros ---');
        for (const err of metrics.errors) {
            console.log(`  [${err.client}] ${err.step}: ${err.error}`);
        }
    }

    // Detalhamento passo a passo de cada cliente
    console.log('');
    console.log('--- Detalhamento de Steps ---');
    for (const result of clientResults) {
        console.log(`\n  >> ${result.clientName}:`);
        for (const step of result.steps) {
            const icon = step.success ? 'OK' : 'FAIL';
            const preview = step.success ? step.responsePreview : step.error;
            console.log(`     [${icon}] ${step.step} (${formatMs(step.timeMs)}) => ${preview}`);
        }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log(`  Throughput: ${(metrics.totalRequests / (totalDuration / 1000)).toFixed(1)} req/s`);
    console.log('='.repeat(60));

    await db.close();
    process.exit(0);
}

runBenchmark().catch(err => {
    console.error('BENCHMARK CRASH:', err);
    process.exit(1);
});
