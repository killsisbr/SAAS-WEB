/**
 * 🍔 Atualiza configurações do Brutus Burger para usar Ollama no WhatsApp
 */

import sqlite3Pkg from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function updateBrutusSettings() {
    const db = await open({
        filename: path.join(__dirname, 'database', 'deliveryhub.sqlite'),
        driver: sqlite3Pkg.Database
    });

    // Buscar tenant Brutus Burger
    const tenant = await db.get(
        "SELECT * FROM tenants WHERE name LIKE '%Brutus Burger%' OR slug = 'brutus-burger'"
    );

    if (!tenant) {
        console.error('❌ Tenant Brutus Burger não encontrado.');

        // Tentar pegar o primeiro tenant ativo se não achar Brutus
        const anyTenant = await db.get("SELECT * FROM tenants WHERE status = 'ACTIVE' LIMIT 1");
        if (anyTenant) {
            console.log(`⚠️ Usando tenant alternativo: ${anyTenant.name}`);
            return updateTenant(db, anyTenant);
        }
        await db.close();
        return;
    }

    await updateTenant(db, tenant);
    await db.close();
}

async function updateTenant(db, tenant) {
    console.log(`🍔 Configurando Tenant: ${tenant.name} (${tenant.id})`);

    // Ler settings atuais com segurança
    let currentSettings = {};
    try {
        currentSettings = JSON.parse(tenant.settings || '{}');
    } catch (e) {
        console.warn('Settings inválidos, resetando.');
    }

    // Configurações obrigatórias para IA funcionar
    const newSettings = {
        ...currentSettings,

        // Ativar modo IA explicitamente (CRUCIAL)
        whatsappOrderMode: 'funcionario_ia',

        // Configurações do Robô
        aiEmployee: {
            enabled: true,
            provider: 'ollama', // Forçar uso do Ollama Local
            model: 'gemma3:4b',
            ollamaUrl: 'http://localhost:11434',
            personality: 'friendly', // 'formal', 'friendly', 'humorous'
            contextWindow: 10,
            botName: 'Ana' // Nome do atendente
        },

        // Dados da Loja para Contexto (se faltar)
        openingHours: currentSettings.openingHours || 'Seg-Dom: 18h às 23h',
        deliveryFee: currentSettings.deliveryFee || 5.00, // Float
        minOrderValue: currentSettings.minOrderValue || 20.00,
        address: currentSettings.address || 'Rua do Hambúrguer, 99, Centro',
        phone: currentSettings.phone || '11999999999',
        description: currentSettings.description || 'A melhor hamburgueria artesanal da região! 🍔🔥'
    };

    // Salvar no banco
    await db.run(
        'UPDATE tenants SET settings = ? WHERE id = ?',
        [JSON.stringify(newSettings), tenant.id]
    );

    console.log('✅ Configurações do Brutus Burger atualizadas!');
    console.log('🤖 Modo: funcionario_ia');
    console.log('🧠 Model: gemma3:4b (Ollama)');
}

updateBrutusSettings().catch(console.error);
