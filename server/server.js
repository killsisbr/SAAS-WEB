// ============================================================
// DeliveryHub SaaS - Server Principal
// Autor: killsis (Lucas Larocca)
// ============================================================

import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { getCacheService } from './services/cache-service.js';
import { getBackupService } from './services/backup-service.js';
import { initWhatsAppService, getWhatsAppService } from './whatsapp-service.js';
import { getFollowUpService } from './services/follow-up.js';

// ES Modules fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ============================================================
// CONFIGURACAO EXPRESS
// ============================================================

const app = express();
const PORT = process.env.PORT || 3000;

// Confiar no proxy reverso (Nginx) para pegar IP real
app.set('trust proxy', 1);

// Middleware basico
// Middleware basico
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Seguranca
app.use(helmet({
    contentSecurityPolicy: false, // Desabilitar para desenvolvimento
    crossOriginEmbedderPolicy: false
}));

// Rate Limiting (increased for dev testing)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1000, // 1000 requests por IP (dev mode)
    message: { error: 'Muitas requisicoes. Tente novamente mais tarde.' }
});
app.use('/api/', limiter);

// Custom Domain Middleware (importado apos DB inicializar)
let domainMiddlewareInstance = null;

// Servir arquivos estaticos
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================
// BANCO DE DADOS
// ============================================================

let db;

async function initDatabase() {
    const dbPath = process.env.DATABASE_PATH || './database/deliveryhub.sqlite';
    const fullDbPath = path.join(__dirname, dbPath);

    // Criar diretorio se nao existir
    const dbDir = path.dirname(fullDbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    // Abrir conexao
    db = await open({
        filename: fullDbPath,
        driver: sqlite3.Database
    });

    // Otimizacoes SQLite para alto volume
    await db.run('PRAGMA journal_mode = WAL');
    await db.run('PRAGMA synchronous = NORMAL');
    await db.run('PRAGMA busy_timeout = 5000');
    await db.run('PRAGMA cache_size = -2000'); // ~2MB cache
    await db.run('PRAGMA temp_store = MEMORY');

    console.log('Database conectado e otimizado:', fullDbPath);

    // Sistema de Backup Automatico (diario)
    setInterval(async () => {
        try {
            const backupDir = path.join(__dirname, 'database', 'backups');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(backupDir, `backup-${timestamp}.sqlite`);

            await db.run(`VACUUM INTO ?`, [backupPath]);
            console.log('[Backup] Sucesso:', backupPath);

            // Limpar backups antigos (manter ultimos 7)
            const files = fs.readdirSync(backupDir)
                .map(f => ({ name: f, time: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
                .sort((a, b) => b.time - a.time);

            if (files.length > 7) {
                files.slice(7).forEach(f => fs.unlinkSync(path.join(backupDir, f.name)));
            }
        } catch (error) {
            console.error('[Backup] Erro:', error.message);
        }
    }, 24 * 60 * 60 * 1000); // 24h

    // Executar schema
    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        await db.exec(schema);
        console.log('Schema aplicado');
    }

    // Executar seeds APENAS se o banco estiver vazio (primeira inicializacao)
    const seedsPath = path.join(__dirname, 'database', 'seeds.sql');
    if (fs.existsSync(seedsPath)) {
        // Verificar se ja existem dados no banco
        const existingTenants = await db.get('SELECT COUNT(*) as count FROM tenants');
        if (!existingTenants || existingTenants.count === 0) {
            const seeds = fs.readFileSync(seedsPath, 'utf-8');
            await db.exec(seeds);
            console.log('Seeds aplicados (primeira inicializacao)');
        } else {
            console.log('Seeds ignorados (banco ja possui dados)');
        }
    }

    // Migrations manuais
    try {
        await db.run('ALTER TABLE orders ADD COLUMN payment_change REAL DEFAULT 0');
        console.log('Coluna payment_change adicionada');
    } catch (e) { }

    try {
        await db.run('ALTER TABLE products ADD COLUMN image_settings TEXT DEFAULT "{}"');
        console.log('Coluna image_settings adicionada');
    } catch (e) { }

    return db;
}

// Disponibilizar db global
export function getDb() {
    return db;
}

// ============================================================
// SSE (Server-Sent Events) - Tempo Real
// ============================================================

const sseClients = new Map(); // tenantId -> Set<response>

export function addSSEClient(tenantId, res) {
    if (!sseClients.has(tenantId)) {
        sseClients.set(tenantId, new Set());
    }
    sseClients.get(tenantId).add(res);
}

export function removeSSEClient(tenantId, res) {
    sseClients.get(tenantId)?.delete(res);
}

export function broadcast(tenantId, event, data) {
    const clients = sseClients.get(tenantId);
    if (clients) {
        clients.forEach(client => {
            client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        });
    }
}

// ============================================================
// ROTAS
// ============================================================

async function loadRoutes() {
    // Auth
    const authRoutes = await import('./routes/auth.js');
    app.use('/api/auth', authRoutes.default(db));

    // Tenants
    const tenantRoutes = await import('./routes/tenants.js');
    app.use('/api/tenants', tenantRoutes.default(db));

    // Themes
    const themeRoutes = await import('./routes/themes.js');
    app.use('/api/themes', themeRoutes.default(db));

    // Products
    const productRoutes = await import('./routes/products.js');
    app.use('/api/products', productRoutes.default(db));

    // Categories
    const categoryRoutes = await import('./routes/categories.js');
    app.use('/api/categories', categoryRoutes.default(db));

    // Orders
    const orderRoutes = await import('./routes/orders.js');
    app.use('/api/orders', orderRoutes.default(db, broadcast));

    // Events (SSE)
    const eventRoutes = await import('./routes/events.js');
    app.use('/api/events', eventRoutes.default(addSSEClient, removeSSEClient));

    // Subscriptions
    const subscriptionRoutes = await import('./routes/subscriptions.js');
    app.use('/api/subscriptions', subscriptionRoutes.default(db));

    // Blacklist
    const blacklistRoutes = await import('./routes/blacklist.js');
    app.use('/api/blacklist', blacklistRoutes.default(db));

    // Delivery
    const deliveryRoutes = await import('./routes/delivery.js');
    app.use('/api/delivery', deliveryRoutes.default(db));

    // Super Admin
    const superadminRoutes = await import('./routes/superadmin.js');
    app.use('/api/superadmin', superadminRoutes.default(db));

    // WhatsApp
    const whatsappRoutes = await import('./routes/whatsapp.js');
    app.use('/api/whatsapp', whatsappRoutes.default(db));

    // WhatsApp Bot (Multi-Tenant) - DESABILITADO TEMPORARIAMENTE
    // TODO: Reimplementar bot com IA futuramente
    // const whatsappBotRoutes = await import('./routes/whatsapp-bot.js');
    // app.use('/api/whatsapp-bot', whatsappBotRoutes.default(db));

    // Buffet
    const buffetRoutes = await import('./routes/buffet.js');
    app.use('/api/buffet', buffetRoutes.default(db));

    // Acai
    const acaiRoutes = await import('./routes/acai.js');
    app.use('/api/acai', acaiRoutes.default(db));

    // Product Mappings (Direct Order)
    const mappingRoutes = await import('./routes/mappings.js');
    app.use('/api/mappings', mappingRoutes.default(db));

    // Coupons
    const couponRoutes = await import('./routes/coupons.js');
    app.use('/api/coupons', couponRoutes.default(db));

    // Reports
    const reportRoutes = await import('./routes/reports.js');
    app.use('/api/reports', reportRoutes.default(db));

    // Reviews
    const reviewRoutes = await import('./routes/reviews.js');
    app.use('/api/reviews', reviewRoutes.default(db));

    // Loyalty
    const loyaltyRoutes = await import('./routes/loyalty.js');
    app.use('/api/loyalty', loyaltyRoutes.default(db));

    // Team
    const teamRoutes = await import('./routes/team.js');
    app.use('/api/team', teamRoutes.default(db));

    // Backup
    const backupRoutes = await import('./routes/backup.js');
    app.use('/api/backup', backupRoutes.default(db));

    // AI Lessons (Auto-Melhoria)
    const aiLessonsRoutes = await import('./routes/ai-lessons.js');
    app.use('/api/ai', aiLessonsRoutes.default(db));

    // Upload
    const uploadRoutes = await import('./routes/upload.js');
    app.use('/api/upload', uploadRoutes.default(db));

    // Print
    const printRoutes = await import('./routes/print.js');
    app.use('/api/print', printRoutes.default(db));

    // Push Notifications
    const pushRoutes = await import('./routes/push.js');
    app.use('/api/push', pushRoutes.default(db));

    // PIX
    const pixRoutes = await import('./routes/pix.js');
    app.use('/api/pix', pixRoutes.default(db));

    // Custom Domains
    const domainRoutes = await import('./routes/domains.js');
    app.use('/api/domains', domainRoutes.default(db));

    // Activity Logs
    const logsRoutes = await import('./routes/logs.js');
    app.use('/api/logs', logsRoutes.default(db));

    // Debug & Tools
    const debugRoutes = await import('./routes/debug.js');
    app.use('/api/debug', debugRoutes.default(db));

    // Category Addons
    const categoryAddonsRoutes = await import('./routes/category-addons.js');
    app.use('/api/category-addons', categoryAddonsRoutes.default(db));

    // Pizza Borders
    const pizzaBordersRoutes = await import('./routes/pizza-borders.js');
    app.use('/api/pizza-borders', pizzaBordersRoutes.default(db));


    // Health check
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    console.log('Rotas carregadas');
}


// ============================================================
// ROTAS ESTATICAS (PAGINAS)
// ============================================================

// Landing
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'landing', 'index.html'));
});

// Onboarding
app.get('/onboarding', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'onboarding', 'index.html'));
});

// Login
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'login', 'index.html'));
});

// Admin - Redirecionar para login (que depois redireciona para /loja/{slug}/admin/)
app.get('/admin', (req, res) => {
    // Redirecionar para login - apos login sera redirecionado para /loja/{slug}/admin/
    res.redirect('/login');
});

app.get('/admin/*', (req, res) => {
    // Redirecionar para login - apos login sera redirecionado para /loja/{slug}/admin/
    res.redirect('/login');
});

// Loja Publica (por slug)
app.get('/loja/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'store', 'index.html'));
});

// Quadro de Pedidos da Loja (por slug)
app.get('/loja/:slug/quadro', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'quadro.html'));
});

// Admin da Loja (por slug) - Reutiliza o admin global
app.get('/loja/:slug/admin', (req, res) => {
    if (!req.path.endsWith('/')) return res.redirect(req.originalUrl + '/');
    res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

app.get('/loja/:slug/admin/*', (req, res) => {
    let page = req.params[0] || 'index';

    // Remover .html se já estiver presente para evitar duplicação
    if (page.endsWith('.html')) {
        page = page.slice(0, -5);
    }

    const filePath = path.join(__dirname, '..', 'public', 'admin', `${page}.html`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
    }
});


// Super Admin
app.get('/superadmin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'superadmin', 'index.html'));
});

app.get('/superadmin/*', (req, res) => {
    const page = req.params[0] || 'index';
    const filePath = path.join(__dirname, '..', 'public', 'superadmin', `${page}.html`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.sendFile(path.join(__dirname, '..', 'public', 'superadmin', 'index.html'));
    }
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    console.error('Erro:', err);
    try {
        fs.writeFileSync(path.join(__dirname, 'server_error.log'), err.stack || err.toString());
    } catch (e) { }
    res.status(500).json({ error: 'Erro interno do servidor' });
});

// ============================================================
// INICIALIZACAO
// ============================================================

async function start() {
    try {
        // Inicializar banco
        await initDatabase();

        // Carregar rotas
        await loadRoutes();

        // Inicializar serviços
        const cacheService = getCacheService();
        console.log('[Cache] Serviço inicializado');

        const backupService = getBackupService(path.join(__dirname, 'database', 'deliveryhub.sqlite'));
        backupService.startAutosave(24); // Backup diário
        console.log('[Backup] Serviço de autosave iniciado');

        // Auto-reconectar WhatsApp (apenas se habilitado via env)
        const whatsappAutoConnect = process.env.WHATSAPP_AUTO_CONNECT !== 'false';

        if (whatsappAutoConnect) {
            try {
                const whatsapp = initWhatsAppService(db, broadcast);
                await whatsapp.autoReconnectAll();
                console.log('[WhatsApp] Auto-reconnect concluído (Baileys)');

                // Follow-up DESABILITADO temporariamente
                // const followUp = getFollowUpService(db);
                // followUp.init();
                // console.log('[Follow-up] Serviço inicializado');
                console.log('[Follow-up] Serviço DESABILITADO');
            } catch (err) {
                console.warn('[WhatsApp/FollowUp] Erro na inicializacao:', err.message);
            }
        } else {
            console.log('[WhatsApp] Auto-reconnect desabilitado via WHATSAPP_AUTO_CONNECT=false');
        }

        // Inicializar módulo de IA (Reforço/Aprendizado)
        try {
            const { initializeAIModule } = await import('./ai-reinforcement/index.js');
            await initializeAIModule(db);
        } catch (err) {
            console.warn('[AI-Reinforcement] Erro na inicialização:', err.message);
        }

        // Iniciar servidor
        app.listen(PORT, () => {
            console.log('============================================================');
            console.log(`  DeliveryHub SaaS rodando em http://localhost:${PORT}`);
            console.log('============================================================');
            console.log('  Rotas disponiveis:');
            console.log('    - Landing:    http://localhost:' + PORT + '/');
            console.log('    - Onboarding: http://localhost:' + PORT + '/onboarding');
            console.log('    - Admin:      http://localhost:' + PORT + '/admin');
            console.log('    - Loja:       http://localhost:' + PORT + '/loja/:slug');
            console.log('    - SuperAdmin: http://localhost:' + PORT + '/superadmin');
            console.log('============================================================');
        });
    } catch (error) {
        console.error('Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

start();
// Restart: testando WhatsApp com Fiorella habilitado + correções Puppeteer
