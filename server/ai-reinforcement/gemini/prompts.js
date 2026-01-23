// ============================================================
// AI Reinforcement Module - Gemini Prompts
// Templates de prompts para análise de conversas
// ============================================================

import { ERROR_TYPES } from '../config.js';

/**
 * Prompt para análise de uma sessão de conversa
 * @param {object} context - Contexto da análise
 * @returns {string} Prompt formatado
 */
export function buildSessionAnalysisPrompt(context) {
    const {
        sessionMessages,    // Array de mensagens da sessão
        products,           // Lista de produtos do cardápio
        mappings,           // Mapeamentos atuais
        restaurantName      // Nome do restaurante
    } = context;

    // Formatar mensagens para o prompt
    const conversationFormatted = sessionMessages.map((msg, i) => {
        const direction = msg.direction === 'IN' ? '👤 CLIENTE' : '🤖 BOT';
        const time = new Date(msg.timestamp).toLocaleTimeString('pt-BR');

        let line = `[${i + 1}] ${direction} (${time}): "${msg.message}"`;

        if (msg.direction === 'IN' && msg.detected_actions?.length > 0) {
            line += `\n    → Ações detectadas: ${JSON.stringify(msg.detected_actions)}`;
        }
        if (msg.matched_products?.length > 0) {
            line += `\n    → Produtos: ${JSON.stringify(msg.matched_products)}`;
        }

        return line;
    }).join('\n\n');

    // Formatar produtos
    const productsFormatted = products.slice(0, 50).map(p =>
        `- ${p.name} (ID: ${p.id}) - R$ ${p.price}`
    ).join('\n');

    // Formatar mapeamentos
    const mappingsFormatted = Object.entries(mappings || {}).slice(0, 30).map(([keyword, productId]) =>
        `"${keyword}" → ${productId}`
    ).join('\n');

    return `Você é um analista de qualidade de um bot de pedidos de restaurante chamado "${restaurantName || 'Restaurante'}".

Analise a seguinte sessão de conversa entre um cliente e o bot, identificando:
1. Se houve erro de reconhecimento de produto
2. Se houve erro de quantidade
3. Se o fluxo foi natural e correto
4. Se o cliente demonstrou frustração, confusão ou indicou erro
5. Sugestões de novos mapeamentos que poderiam melhorar o reconhecimento

## PRODUTOS DISPONÍVEIS NO CARDÁPIO:
${productsFormatted}

## MAPEAMENTOS ATUAIS (palavra-chave → produto):
${mappingsFormatted || 'Nenhum mapeamento personalizado'}

## SESSÃO DE CONVERSA:
${conversationFormatted}

## TIPOS DE ERRO POSSÍVEIS:
- PRODUCT_NOT_FOUND: Cliente pediu algo que não foi reconhecido
- WRONG_PRODUCT: Sistema anotou produto errado
- WRONG_QUANTITY: Quantidade detectada incorretamente
- MISSED_MODIFIER: Não detectou "sem cebola", "com bacon", etc
- FALSE_POSITIVE: Detectou produto onde não deveria (ex: saudação)
- FLOW_ERROR: Estado incorreto, resposta fora de contexto

## RESPONDA EM JSON (OBRIGATÓRIO):
{
  "session_quality": "good" | "has_issues" | "critical",
  "customer_satisfied": true | false,
  "errors": [
    {
      "message_index": 1,
      "error_type": "WRONG_PRODUCT",
      "customer_said": "texto que o cliente disse",
      "bot_understood": "o que o bot entendeu",
      "should_be": "o que deveria ser",
      "confidence": 0.9
    }
  ],
  "new_mappings_suggested": [
    {
      "keyword": "marmitex",
      "should_map_to_product": "Marmita Média",
      "reason": "Cliente usou 'marmitex' como sinônimo"
    }
  ],
  "ignored_words_suggested": [
    {
      "word": "exemplo",
      "reason": "Esta palavra causou falso positivo"
    }
  ],
  "summary": "Breve resumo da qualidade da interação"
}`;
}

/**
 * Prompt para análise rápida em tempo real (mais curto)
 */
export function buildRealtimeAnalysisPrompt(context) {
    const {
        customerMessage,
        detectedProducts,
        products
    } = context;

    const productsShort = products.slice(0, 20).map(p => p.name).join(', ');

    return `Analise rapidamente esta detecção de pedido:

MENSAGEM DO CLIENTE: "${customerMessage}"
PRODUTOS DETECTADOS: ${JSON.stringify(detectedProducts)}
PRODUTOS DISPONÍVEIS: ${productsShort}

O resultado está correto? Responda em JSON:
{
  "is_correct": true | false,
  "confidence": 0.0-1.0,
  "suggested_correction": "correção se incorreto",
  "reason": "motivo breve"
}`;
}

/**
 * Prompt para gerar relatório diário
 */
export function buildDailyReportPrompt(context) {
    const {
        totalSessions,
        analyzedSessions,
        errorsByType,
        suggestedMappings,
        criticalSessions
    } = context;

    return `Gere um relatório executivo sobre a performance do bot de pedidos:

## DADOS DO DIA:
- Total de sessões: ${totalSessions}
- Sessões analisadas: ${analyzedSessions}
- Erros por tipo: ${JSON.stringify(errorsByType)}
- Mapeamentos sugeridos: ${suggestedMappings.length}
- Sessões críticas: ${criticalSessions.length}

## SESSÕES CRÍTICAS (resumo):
${criticalSessions.slice(0, 5).map(s => `- ${s.summary}`).join('\n')}

Gere um relatório em Markdown com:
1. Resumo executivo (2-3 linhas)
2. Principais problemas identificados
3. Ações recomendadas (priorizadas)
4. Métricas de qualidade

Seja conciso e actionable.`;
}

/**
 * Prompt para sugerir correção de código
 */
export function buildCodeSuggestionPrompt(context) {
    const {
        errorType,
        customerMessage,
        expectedResult,
        actualResult,
        currentCode
    } = context;

    return `Analise este erro de reconhecimento e sugira uma correção:

TIPO DE ERRO: ${errorType}
MENSAGEM DO CLIENTE: "${customerMessage}"
RESULTADO ESPERADO: ${expectedResult}
RESULTADO ATUAL: ${actualResult}

CÓDIGO ATUAL (trecho relevante):
\`\`\`javascript
${currentCode}
\`\`\`

Sugira a correção em JSON:
{
  "solution_type": "NEW_MAPPING" | "ADD_IGNORED_WORD" | "ADJUST_LOGIC",
  "solution": {
    // detalhes da solução
  },
  "explanation": "por que esta correção resolve o problema",
  "risk_level": "low" | "medium" | "high"
}`;
}

export default {
    buildSessionAnalysisPrompt,
    buildRealtimeAnalysisPrompt,
    buildDailyReportPrompt,
    buildCodeSuggestionPrompt
};
