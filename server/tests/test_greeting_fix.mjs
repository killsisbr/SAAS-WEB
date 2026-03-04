
import WhatsAppService from '../whatsapp-service.js';

async function runTest() {
    console.log("--- TESTE DE VERIFICAÇÃO: Gatilhos de Saudação ---");

    // Mock DB
    const mockDb = {
        get: async (query, params) => {
            if (query.includes('FROM tenants')) {
                return {
                    id: 'tenant1',
                    name: 'Loja Teste',
                    settings: JSON.stringify({
                        whatsappBotEnabled: true,
                        whatsappOrderMode: 'link',
                        triggers: []
                    })
                };
            }
            return null;
        }
    };

    // Mock Socket
    const mockSock = {
        sendMessage: async (jid, content) => {
            console.log(`[MOCK SOCK] Mensagem enviada para ${jid}:`, content.text || content);
            return { key: { id: 'msg123' } };
        },
        presenceUpdate: async () => { }
    };

    const service = new WhatsAppService(mockDb, null);
    const tenantId = 'tenant1';
    const settings = { whatsappOrderMode: 'link' };
    const jid = '5511999999999@s.whatsapp.net';
    const pushName = 'Cliente Teste';

    // Helper para simular mensagem
    const simulateMsg = async (text) => {
        const msg = {
            key: { remoteJid: jid, fromMe: false },
            message: { conversation: text },
            pushName: pushName
        };
        await service.handleMessage(tenantId, msg, settings, mockSock);
    };

    console.log("\nEscenário 1: Primeira mensagem 'oi' (Deve responder)");
    await simulateMsg("oi");

    console.log("\nEscenário 2: Segunda mensagem 'oi' imediata (Deve ignorar via Anti-Dup)");
    await simulateMsg("oi");

    console.log("\nEscenário 3: Mensagem 'ajuda' (Deve responder)");
    // Forçar limpeza do anti-dup para teste
    service.recentMessages.clear();
    await simulateMsg("ajuda");

    console.log("\nEscenário 4: Mensagem que não é saudação nem trigger (Deve ignorar se welcome já enviado hoje)");
    // Marcar welcome como enviado hoje (há 1 hora)
    service.welcomeLogs.set(tenantId, { [jid]: Date.now() - 3600000 });
    await simulateMsg("quero uma pizza");

    console.log("\n--- TESTE FINALIZADO ---");
}

runTest().catch(console.error);
