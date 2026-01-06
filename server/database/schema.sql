-- ============================================================
-- DeliveryHub SaaS - Schema SQLite
-- Autor: killsis (Lucas Larocca)
-- ============================================================

-- ============================================================
-- USUARIOS E AUTENTICACAO
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'OWNER' CHECK (role IN ('SUPER_ADMIN', 'OWNER', 'MANAGER', 'STAFF')),
    email_verified INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- PLANOS E ASSINATURAS
-- ============================================================

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    price REAL DEFAULT 0,
    interval TEXT DEFAULT 'month',
    max_products INTEGER DEFAULT 50,
    max_orders_month INTEGER DEFAULT 500,
    max_images INTEGER DEFAULT 3,
    has_whatsapp INTEGER DEFAULT 1,
    has_custom_domain INTEGER DEFAULT 0,
    has_premium_themes INTEGER DEFAULT 0,
    has_analytics INTEGER DEFAULT 0,
    has_multi_user INTEGER DEFAULT 0,
    max_users INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TEMAS
-- ============================================================

CREATE TABLE IF NOT EXISTS themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    business_types TEXT DEFAULT '[]', -- JSON array
    is_premium INTEGER DEFAULT 0,
    primary_color TEXT DEFAULT '#27ae60',
    secondary_color TEXT DEFAULT '#f39c12',
    accent_color TEXT DEFAULT '#e74c3c',
    background_color TEXT DEFAULT '#121212',
    text_color TEXT DEFAULT '#ffffff',
    font_family TEXT DEFAULT 'Inter',
    font_heading TEXT DEFAULT 'Inter',
    border_radius TEXT DEFAULT '8px',
    card_style TEXT DEFAULT 'GLASS' CHECK (card_style IN ('FLAT', 'GLASS', 'SHADOW', 'BORDERED', 'GRADIENT')),
    button_style TEXT DEFAULT 'ROUNDED' CHECK (button_style IN ('ROUNDED', 'PILL', 'SQUARE', 'OUTLINE')),
    preview_image TEXT,
    css_variables TEXT DEFAULT '{}', -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TENANTS (LOJAS)
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    business_type TEXT DEFAULT 'OUTROS' CHECK (business_type IN (
        'HAMBURGUERIA', 'PIZZARIA', 'ACAITERIA', 'RESTAURANTE', 
        'LANCHONETE', 'CAFETERIA', 'DOCERIA', 'MARMITARIA', 
        'JAPONESA', 'MEXICANA', 'ARABE', 'OUTROS'
    )),
    logo_url TEXT,
    theme_id TEXT,
    settings TEXT DEFAULT '{}', -- JSON com configs
    status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CANCELLED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id),
    FOREIGN KEY (theme_id) REFERENCES themes(id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT UNIQUE NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT DEFAULT 'TRIALING' CHECK (status IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'UNPAID')),
    trial_ends_at DATETIME,
    current_period_start DATETIME,
    current_period_end DATETIME,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    cancelled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS custom_domains (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    domain TEXT UNIQUE NOT NULL,
    verified INTEGER DEFAULT 0,
    ssl_status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- ============================================================
-- CATEGORIAS E PRODUTOS
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    order_index INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, name),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    images TEXT DEFAULT '[]', -- JSON array de URLs
    is_available INTEGER DEFAULT 1,
    is_featured INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0,
    has_addons INTEGER DEFAULT 0,
    addons TEXT DEFAULT '[]', -- JSON legado
    image_settings TEXT DEFAULT '{}', -- JSON (zoom, posicao, etc)
    nutrition_info TEXT, -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- ============================================================
-- SISTEMA ACAI/BUFFET - Adicionais
-- ============================================================

CREATE TABLE IF NOT EXISTS addon_groups (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    product_id TEXT,
    category_id TEXT,
    name TEXT NOT NULL,
    min_selection INTEGER DEFAULT 0,
    max_selection INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS addon_items (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price REAL DEFAULT 0,
    is_available INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    FOREIGN KEY (group_id) REFERENCES addon_groups(id) ON DELETE CASCADE
);

-- ============================================================
-- BUFFET DO DIA (para Marmitas)
-- ============================================================

CREATE TABLE IF NOT EXISTS buffet_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================
-- SISTEMA ACAI - Adicionais especificos
-- ============================================================

CREATE TABLE IF NOT EXISTS acai_adicionais (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    preco REAL DEFAULT 0,
    categoria TEXT DEFAULT 'Complementos',
    ativo INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS acai_config (
    id TEXT PRIMARY KEY,
    tenant_id TEXT UNIQUE NOT NULL,
    habilitado INTEGER DEFAULT 1,
    categoria_nome TEXT DEFAULT 'Acai',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================
-- CLIENTES E PEDIDOS
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT, -- JSON
    notes TEXT,
    total_orders INTEGER DEFAULT 0,
    total_spent REAL DEFAULT 0,
    last_order_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, phone),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT,
    order_number INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    items TEXT NOT NULL, -- JSON array
    subtotal REAL NOT NULL,
    delivery_fee REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    total REAL NOT NULL,
    delivery_type TEXT DEFAULT 'DELIVERY' CHECK (delivery_type IN ('DELIVERY', 'PICKUP')),
    address TEXT, -- JSON
    status TEXT DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 
        'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'
    )),
    observation TEXT,
    payment_method TEXT CHECK (payment_method IN ('PIX', 'CASH', 'CREDIT_CARD', 'DEBIT_CARD')),
    payment_status TEXT DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'REFUNDED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, order_number),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- ============================================================
-- BLACKLIST
-- ============================================================

CREATE TABLE IF NOT EXISTS blacklist (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, phone),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================
-- WHATSAPP CONFIG
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_configs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT UNIQUE NOT NULL,
    is_connected INTEGER DEFAULT 0,
    phone_number TEXT,
    session_data TEXT, -- JSON
    welcome_message TEXT,
    confirmation_message TEXT,
    status_update_message TEXT,
    auto_reply_enabled INTEGER DEFAULT 1,
    last_connected_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================
-- CUPONS DE DESCONTO
-- ============================================================

CREATE TABLE IF NOT EXISTS coupons (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    discount_type TEXT DEFAULT 'PERCENTAGE' CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
    discount_value REAL NOT NULL,
    min_order_value REAL DEFAULT 0,
    max_uses INTEGER DEFAULT NULL,
    uses_count INTEGER DEFAULT 0,
    valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_until DATETIME,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, code),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================
-- AVALIACOES E REVIEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    product_id TEXT,
    customer_id TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    reply TEXT,
    reply_at DATETIME,
    is_approved INTEGER DEFAULT 1,
    order_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

-- ============================================================
-- PROGRAMA DE FIDELIDADE
-- ============================================================

CREATE TABLE IF NOT EXISTS loyalty_config (
    id TEXT PRIMARY KEY,
    tenant_id TEXT UNIQUE NOT NULL,
    is_enabled INTEGER DEFAULT 0,
    points_per_real REAL DEFAULT 1,
    min_points_redeem INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS loyalty_points (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    total_earned INTEGER DEFAULT 0,
    total_redeemed INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, customer_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    points_required INTEGER NOT NULL,
    reward_type TEXT DEFAULT 'DISCOUNT' CHECK (reward_type IN ('DISCOUNT', 'PRODUCT', 'DELIVERY_FREE')),
    reward_value REAL,
    product_id TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    points INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('EARNED', 'REDEEMED', 'EXPIRED', 'ADJUSTED')),
    description TEXT,
    order_id TEXT,
    reward_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- ============================================================
-- PUSH NOTIFICATIONS (PWA)
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    customer_id TEXT,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- ============================================================
-- CONVITES DE EQUIPE (Multi-User)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_invites (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'STAFF' CHECK (role IN ('MANAGER', 'STAFF')),
    invited_by TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    accepted_at DATETIME,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tenant_users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'STAFF' CHECK (role IN ('OWNER', 'MANAGER', 'STAFF')),
    permissions TEXT DEFAULT '[]', -- JSON array
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, user_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- LOG DE ATIVIDADES (Auditoria)
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT, -- JSON
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================
-- INDICES para Performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON tenants(owner_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_reviews_tenant ON reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_customer ON loyalty_points(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant ON push_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant ON activity_logs(tenant_id, created_at);
