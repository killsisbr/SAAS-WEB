import { Client } from 'ssh2';
import fs from 'fs';

const conn = new Client();
const config = {
    host: '82.25.71.101',
    port: 22,
    username: 'root',
    password: 'Killsis19980910#'
};

console.log(`Conectando ao host ${config.host}...`);

conn.on('ready', () => {
    console.log('Conexão SSH estabelecida!');

    const commands = [
        'cd /var/www/Saas-Restaurante && git pull origin main',
        'cd /var/www/Saas-Restaurante/server && node -e "const sqlite3 = require(\'sqlite3\'); const { open } = require(\'sqlite\'); (async () => { const db = await open({ filename: \'./database/deliveryhub.sqlite\', driver: sqlite3.Database }); await db.exec(\'CREATE TABLE IF NOT EXISTS addon_groups_bk AS SELECT * FROM addon_groups;\'); await db.exec(\'DROP TABLE IF EXISTS addon_groups;\'); await db.exec(\'CREATE TABLE addon_groups (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, product_id TEXT, category_id TEXT, name TEXT NOT NULL, min_selection INTEGER DEFAULT 0, max_selection INTEGER DEFAULT 1, order_index INTEGER DEFAULT 0, FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE, FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE, FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE);\'); await db.exec(\'INSERT OR IGNORE INTO addon_groups SELECT * FROM addon_groups_bk;\'); await db.exec(\'DROP TABLE IF EXISTS addon_groups_bk;\'); console.log(\'Schema addon_groups corrigido!\'); process.exit(); })();"',
        'pm2 restart all'
    ];

    let currentCommand = 0;

    const runNext = () => {
        if (currentCommand >= commands.length) {
            console.log('Todos os comandos executados com sucesso!');
            conn.end();
            return;
        }

        const cmd = commands[currentCommand];
        console.log(`Executando: ${cmd}`);

        conn.exec(cmd, (err, stream) => {
            if (err) {
                console.error(`Erro ao executar comando: ${err}`);
                conn.end();
                return;
            }

            stream.on('close', (code, signal) => {
                console.log(`Comando finalizado com código ${code}`);
                if (code !== 0) {
                    console.error('Falha detectada, interrompendo deploy.');
                    conn.end();
                } else {
                    currentCommand++;
                    runNext();
                }
            }).on('data', (data) => {
                process.stdout.write(data.toString());
            }).stderr.on('data', (data) => {
                process.stderr.write(data.toString());
            });
        });
    };

    runNext();
}).on('error', (err) => {
    console.error('ERRO DE CONEXÃO:', err.message);
}).connect(config);
