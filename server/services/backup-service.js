// ============================================================
// Backup Service - DeliveryHub SaaS
// Sistema de autosave e backup automático do SQLite
// Autor: killsis (Lucas Larocca)
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BackupService {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(__dirname, '..', 'db.sqlite');
        this.backupDir = path.join(__dirname, '..', 'backups');
        this.autosaveInterval = null;

        // Garantir que o diretório de backups existe
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }

        console.log('[BackupService] Inicializado. Diretório:', this.backupDir);
    }

    /**
     * Criar backup do banco de dados
     * @param {string} suffix - Sufixo opcional para o nome do arquivo
     * @returns {object} Informações do backup
     */
    createBackup(suffix = '') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `db_backup_${timestamp}${suffix ? '_' + suffix : ''}.sqlite`;
        const backupPath = path.join(this.backupDir, fileName);

        try {
            // Copiar arquivo do banco
            fs.copyFileSync(this.dbPath, backupPath);

            // Calcular checksum
            const fileBuffer = fs.readFileSync(backupPath);
            const checksum = crypto.createHash('md5').update(fileBuffer).digest('hex');

            const stats = fs.statSync(backupPath);

            console.log(`[BackupService] Backup criado: ${fileName} (${(stats.size / 1024).toFixed(2)} KB)`);

            return {
                success: true,
                fileName,
                path: backupPath,
                size: stats.size,
                checksum,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('[BackupService] Erro ao criar backup:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Criar backup completo em formato ZIP (Banco + Imagens)
     * @param {string} suffix - Sufixo opcional
     * @returns {Promise<object>}
     */
    async createFullZipBackup(suffix = '') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `full_backup_${timestamp}${suffix ? '_' + suffix : ''}.zip`;
        const backupPath = path.join(this.backupDir, fileName);
        const uploadsDir = path.resolve(__dirname, '..', '..', 'public', 'uploads');

        return new Promise((resolve, reject) => {
            try {
                const output = fs.createWriteStream(backupPath);
                const archive = archiver('zip', {
                    zlib: { level: 9 } // Nível de compressão máximo
                });

                output.on('close', () => {
                    const stats = fs.statSync(backupPath);
                    console.log(`[BackupService] Backup Full ZIP criado: ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
                    resolve({
                        success: true,
                        fileName,
                        path: backupPath,
                        size: stats.size,
                        timestamp: new Date().toISOString()
                    });
                });

                archive.on('error', (err) => {
                    console.error('[BackupService] Erro no archiver:', err.message);
                    resolve({ success: false, error: err.message });
                });

                archive.pipe(output);

                // Adicionar banco de dados
                if (fs.existsSync(this.dbPath)) {
                    archive.file(this.dbPath, { name: 'deliveryhub.sqlite' });
                }

                // Adicionar pasta de uploads (imagens de todos os tenants)
                if (fs.existsSync(uploadsDir)) {
                    archive.directory(uploadsDir, 'uploads');
                } else {
                    console.warn('[BackupService] Pasta de uploads não encontrada para o ZIP:', uploadsDir);
                }

                archive.finalize();
            } catch (err) {
                console.error('[BackupService] Erro fatal ao criar ZIP:', err.message);
                resolve({ success: false, error: err.message });
            }
        });
    }


    /**
     * Restaurar backup
     * @param {string} backupFileName - Nome do arquivo de backup
     * @returns {object} Resultado da restauração
     */
    restoreBackup(backupFileName) {
        const backupPath = path.join(this.backupDir, backupFileName);

        if (!fs.existsSync(backupPath)) {
            return { success: false, error: 'Arquivo de backup não encontrado' };
        }

        try {
            // Criar backup do estado atual antes de restaurar
            this.createBackup('pre_restore');

            // Restaurar
            fs.copyFileSync(backupPath, this.dbPath);

            console.log(`[BackupService] Backup restaurado: ${backupFileName}`);

            return {
                success: true,
                message: 'Backup restaurado com sucesso'
            };
        } catch (error) {
            console.error('[BackupService] Erro ao restaurar backup:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Listar backups disponíveis
     * @returns {array} Lista de backups
     */
    listBackups() {
        try {
            const files = fs.readdirSync(this.backupDir)
                .filter(f => f.endsWith('.sqlite') || f.endsWith('.zip'))
                .map(f => {
                    const filePath = path.join(this.backupDir, f);
                    const stats = fs.statSync(filePath);
                    return {
                        fileName: f,
                        size: stats.size,
                        created: stats.birthtime.toISOString()
                    };
                })
                .sort((a, b) => new Date(b.created) - new Date(a.created));

            return files;
        } catch (error) {
            console.error('[BackupService] Erro ao listar backups:', error.message);
            return [];
        }
    }

    /**
     * Limpar backups antigos (manter últimos N)
     * @param {number} keepCount - Quantidade de backups a manter
     */
    cleanOldBackups(keepCount = 7) {
        const backups = this.listBackups();

        if (backups.length <= keepCount) {
            return { removed: 0 };
        }

        const toRemove = backups.slice(keepCount);
        let removed = 0;

        for (const backup of toRemove) {
            try {
                fs.unlinkSync(path.join(this.backupDir, backup.fileName));
                removed++;
            } catch (error) {
                console.error(`[BackupService] Erro ao remover ${backup.fileName}:`, error.message);
            }
        }

        console.log(`[BackupService] Limpeza: ${removed} backups antigos removidos`);
        return { removed };
    }

    /**
     * Iniciar autosave (backup automático diário)
     * @param {number} intervalHours - Intervalo em horas (padrão 24)
     */
    startAutosave(intervalHours = 24) {
        this.stopAutosave();

        const intervalMs = intervalHours * 60 * 60 * 1000;

        // Criar backups iniciais
        this.createBackup('autosave');
        this.createFullZipBackup('autosave');

        // Agendar próximos
        this.autosaveInterval = setInterval(async () => {
            this.createBackup('autosave');
            await this.createFullZipBackup('autosave');
            this.cleanOldBackups(10); // Manter últimos 10 arquivos (5 pares de DB+ZIP)
        }, intervalMs);

        console.log(`[BackupService] Autosave iniciado (intervalo: ${intervalHours}h)`);
    }

    /**
     * Parar autosave
     */
    stopAutosave() {
        if (this.autosaveInterval) {
            clearInterval(this.autosaveInterval);
            this.autosaveInterval = null;
            console.log('[BackupService] Autosave parado');
        }
    }
}

// Singleton
let backupService = null;

export function getBackupService(dbPath) {
    if (!backupService) {
        backupService = new BackupService(dbPath);
    }
    return backupService;
}

export default BackupService;
