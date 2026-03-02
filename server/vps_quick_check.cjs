const { Client } = require('ssh2');
const conn = new Client();

const command = 'grep -n "dayOffDates" /root/delivery-hub/server/whatsapp-service.js && pm2 logs saas-web --lines 5 --no-color';

conn.on('ready', () => {
    conn.exec(command, (err, stream) => {
        if (err) throw err;
        stream.on('close', () => {
            conn.end();
        }).on('data', (data) => {
            process.stdout.write(data);
        }).stderr.on('data', (data) => {
            process.stderr.write(data);
        });
    });
}).connect({
    host: '82.29.58.126',
    username: 'root',
    password: 'Killsis19980910#',
    readyTimeout: 20000
});
