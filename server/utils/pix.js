// ============================================================
// Utilitario PIX - Gerador de QR Code
// ============================================================

import QRCode from 'qrcode';

/**
 * Gera o payload PIX no formato EMV
 * @param {Object} params 
 * @returns {string} Payload PIX
 */
export function generatePixPayload(params) {
    const {
        pixKey,
        pixKeyType = 'PHONE', // PHONE, EMAIL, CPF, CNPJ, EVP
        merchantName,
        merchantCity,
        amount,
        txId,
        description
    } = params;

    // Helpers para formatar campos EMV
    const formatField = (id, value) => {
        const len = value.length.toString().padStart(2, '0');
        return id + len + value;
    };

    // Payload Format Indicator
    let payload = formatField('00', '01');

    // Merchant Account Information (PIX)
    let mai = formatField('00', 'br.gov.bcb.pix');

    // Chave PIX
    mai += formatField('01', pixKey);

    // Descricao (opcional)
    if (description) {
        mai += formatField('02', description.substring(0, 72));
    }

    payload += formatField('26', mai);

    // Merchant Category Code
    payload += formatField('52', '0000');

    // Transaction Currency (BRL = 986)
    payload += formatField('53', '986');

    // Transaction Amount (opcional)
    if (amount && amount > 0) {
        payload += formatField('54', amount.toFixed(2));
    }

    // Country Code
    payload += formatField('58', 'BR');

    // Merchant Name
    const cleanName = merchantName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .substring(0, 25);
    payload += formatField('59', cleanName);

    // Merchant City
    const cleanCity = merchantCity
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .substring(0, 15);
    payload += formatField('60', cleanCity);

    // Additional Data Field Template
    if (txId) {
        const adft = formatField('05', txId.substring(0, 25));
        payload += formatField('62', adft);
    }

    // CRC16 placeholder
    payload += '6304';

    // Calcular CRC16
    const crc = calculateCRC16(payload);
    payload = payload.slice(0, -4) + '6304' + crc;

    return payload;
}

/**
 * Calcula CRC16 CCITT-FALSE
 */
function calculateCRC16(payload) {
    const polynomial = 0x1021;
    let crc = 0xFFFF;

    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ polynomial;
            } else {
                crc = crc << 1;
            }
        }
    }

    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Gera QR Code como data URL
 */
export async function generatePixQRCode(payload) {
    try {
        const qrCode = await QRCode.toDataURL(payload, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        return qrCode;
    } catch (error) {
        console.error('Erro ao gerar QR Code:', error);
        throw error;
    }
}

/**
 * Gera payload + QR Code completo
 */
export async function generatePixComplete(params) {
    const payload = generatePixPayload(params);
    const qrCode = await generatePixQRCode(payload);

    return {
        payload,
        qrCode,
        copyPaste: payload
    };
}
