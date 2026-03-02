import { Client } from 'ssh2';

const conn = new Client();
const config = {
    host: '82.29.58.126',
    port: 22,
    username: 'root',
    password: 'Killsis19980910#'
};

console.log(`[CHECK] Conectando à VPS ${config.host}...`);

conn.on('ready', () => {
    console.log('[CHECK] Autenticação bem-sucedida!');

    const remotePath = '/root/killsis/SAAS-WEB';
    const commands = [
        `cd ${remotePath} && git log -n 1 --pretty=format:"%h - %s (%cr)"`,
        `cd ${remotePath} && ls -l public/admin/categorias.html`
    ];

    let current = 0;
    const executeNext = () => {
        if (current >= commands.length) {
            conn.end();
            return;
        }

        const cmd = commands[current];
        console.log(`\n[CMD] ${cmd}`);

        conn.exec(cmd, (err, stream) => {
            if (err) {
                console.error(`[ERRO] ${err.message}`);
                conn.end();
                return;
            }

            stream.on('close', (code) => {
                current++;
                executeNext();
            }).on('data', (data) => {
                process.stdout.write(data.toString());
            }).stderr.on('data', (data) => {
                process.stderr.write(data.toString());
            });
        });
    };

    executeNext();
}).on('error', (err) => {
    console.error(`[FALHA] ${err.message}`);
}).connect(config);
