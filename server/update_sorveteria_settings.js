/**
 * 🛠️ Atualiza configurações da Sorveteria para usar Ollama no WhatsApp
 */

import sqlite3Pkg from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function updateSettings() {
    const db = await open({
        filename: path.join(__dirname, 'database', 'deliveryhub.sqlite'),
        driver: sqlite3Pkg.Database
    });

    // Buscar tenant da sorveteria (assumindo slug ou nome do log)
    const tenant = await db.get(
        "SELECT * FROM tenants WHERE name LIKE '%Sorveteria Qdelicia%' OR slug = 'sorveteria-qdelicia'"
    );

    if (!tenant) {
        console.error('❌ Tenant Sorveteria não encontrado.');
        await db.close();
        return;
    }

    console.log(`🍦 Tenant encontrado: ${tenant.name} (${tenant.id})`);

    // Ler settings atuais
    const currentSettings = JSON.parse(tenant.settings || '{}');

    // Atualizar com configs de AI (Ollama) e Loja
    const newSettings = {
        ...currentSettings,
        whatsappOrderMode: 'funcionario_ia', // Ativar modo IA explicitamente
        aiEmployee: { // Corrigido de aiBot para aiEmployee
            enabled: true,
            provider: 'ollama', // Forçar uso do Ollama Local
            model: 'gemma3:4b',
            ollamaUrl: 'http://localhost:11434',
            personality: 'friendly',
            contextWindow: 10 // Histórico
        },
        // Dados da Loja para Contexto
        // Dados da Loja para Contexto
        openingHours: 'Seg-Dom: 10h às 22h',
        deliveryFee: 7.50,
        minOrderValue: 20.00,
        address: 'Av. do Sorvete, 123, Centro',
        location: 'São Paulo, SP',
        phone: '11999998888',
        description: 'Os melhores sorvetes artesanais da cidade! 🍦✨'
    };

    await db.run(
        'UPDATE tenants SET settings = ? WHERE id = ?',
        [JSON.stringify(newSettings), tenant.id]
    );

    console.log('✅ Configurações atualizadas com sucesso!');
    console.log('🤖 Provider: Ollama');
    console.log('📍 Endereço: Av. do Sorvete, 123');

    await db.close();
}

updateSettings().catch(console.error);
