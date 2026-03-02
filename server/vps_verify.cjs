const { Client } = require('ssh2');
const conn = new Client();

const commands = [
    'ls -l /root/delivery-hub/server/whatsapp-service.js',
    'grep -n "dayOffDates" /root/delivery-hub/server/whatsapp-service.js',
    'ls -l /root/delivery-hub/server/services/whatsapp-bot.js',
    'grep -n "dayOffDates" /root/delivery-hub/server/services/whatsapp-bot.js',
    'ls -l /root/delivery-hub/public/store/index.html',
    'grep -n "dayOffDates" /root/delivery-hub/public/store/index.html',
    'pm2 status',
    'pm2 logs saas-web --lines 50 --no-color',
    'pm2 logs saas-whatsapp --lines 50 --no-color'
];

conn.on('ready', () => {
    console.log('[VPS] Connected for Verification');

    let current = 0;
    const runNext = () => {
        if (current >= commands.length) {
            conn.end();
            return;
        }
        const cmd = commands[current];
        console.log(`\n--- Executing: ${cmd} ---`);
        conn.exec(cmd, (err, stream) => {
            if (err) {
                console.error(err);
                current++;
                runNext();
                return;
            }
            stream.on('close', () => {
                current++;
                runNext();
            }).on('data', (data) => {
                process.stdout.write(data);
            }).stderr.on('data', (data) => {
                process.stderr.write(data);
            });
        });
    };
    runNext();
}).connect({
    host: '82.29.58.126',
    username: 'root',
    password: 'Killsis19980910#'
});
