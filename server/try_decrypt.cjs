const crypto = require('crypto');
const fs = require('fs');

const backupPath = 'd:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/backup_qdeliciasorveteria_2026-03-02.dhub';
let encryptedData;
try {
    encryptedData = fs.readFileSync(backupPath, 'utf8');
} catch (e) {
    console.error('Erro ao ler arquivo', e);
    process.exit(1);
}

const ALGORITHM = 'aes-256-cbc';

function decrypt(encryptedText, password) {
    try {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const key = crypto.scryptSync(password, 'salt', 32);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (e) {
        return null;
    }
}

const passwordsToTry = [
    '1234', '123456', 'qdelicia', 'qdeliciasorveteria', 'qdeliciasorveteria@gmail.com',
    'sorveteria', 'admin', 'password', 'loja', '12345', 'Qdelicia', 'Qdeliciasorveteria',
    'qdelicia123', 'qdelicia@123', 'qdelicia1234'
];

let found = false;

for (let p of passwordsToTry) {
    const res = decrypt(encryptedData, p);
    if (res && res.version) {
        console.log('--- SUCESSO! ---');
        console.log('A senha correta e:', p);
        console.log('Versao do backup:', res.version);
        console.log('Tenant:', res.tenantName);
        fs.writeFileSync('d:/VENDA/IZAQUE CAMPESTRE/Saas-Restaurante/server/database/backup_data_decrypted.json', JSON.stringify(res, null, 2));
        console.log('Dados salvos em backup_data_decrypted.json');
        found = true;
        break;
    }
}

if (!found) {
    console.log('Nenhuma senha funcionou. Precisa pedir ao usuario.');
}
