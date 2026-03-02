import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function updateAIConfig() {
    try {
        const db = await open({ filename: './database/deliveryhub.sqlite', driver: sqlite3.Database });
        const tenant = await db.get('SELECT id, settings FROM tenants WHERE slug = "brutus-burger"');

        if (!tenant) {
            console.log('Tenant "brutus-burger" não encontrado.');
            return;
        }

        const settings = JSON.parse(tenant.settings || '{}');
        settings.whatsappOrderMode = 'funcionario_ia';
        settings.aiEmployee = {
            enabled: true,
            employeeName: 'Ana',
            personality: 'friendly',
            ollamaUrl: 'http://127.0.0.1:11434',
            model: 'llama3:8b'
        };

        await db.run(
            'UPDATE tenants SET settings = ? WHERE id = ?',
            [JSON.stringify(settings), tenant.id]
        );

        console.log('Configurações do Funcionário IA habilitadas com sucesso no banco de dados!');
    } catch (e) {
        console.error('Erro ao atualizar banco:', e.message);
    }
}

updateAIConfig();
