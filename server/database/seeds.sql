-- ============================================================
-- DeliveryHub SaaS - Seeds (Dados Iniciais)
-- ============================================================

-- ============================================================
-- PLANOS
-- ============================================================

INSERT OR IGNORE INTO plans (id, name, slug, price, max_products, max_orders_month, max_images, has_custom_domain, has_premium_themes, has_analytics, has_multi_user, max_users) VALUES
('plan_trial', 'Trial', 'trial', 0, 20, 100, 1, 0, 0, 0, 0, 1),
('plan_starter', 'Starter', 'starter', 49.00, 50, 500, 3, 0, 0, 0, 0, 2),
('plan_pro', 'Pro', 'pro', 99.00, 9999, 99999, 5, 1, 1, 1, 1, 5),
('plan_enterprise', 'Enterprise', 'enterprise', 199.00, 99999, 999999, 10, 1, 1, 1, 1, 999);

-- ============================================================
-- TEMAS
-- ============================================================

INSERT OR IGNORE INTO themes (id, name, slug, business_types, is_premium, primary_color, secondary_color, accent_color, background_color, text_color, card_style, button_style) VALUES
-- Temas Gratuitos
('theme_fastfood', 'Fast Food Classico', 'fast-food-classic', '["HAMBURGUERIA", "LANCHONETE"]', 0, '#E53935', '#FFC107', '#FF5722', '#1A1A1A', '#FFFFFF', 'GLASS', 'ROUNDED'),
('theme_pizza', 'Pizzaria Italiana', 'pizza-italiana', '["PIZZARIA"]', 0, '#2E7D32', '#D32F2F', '#FFA000', '#0D0D0D', '#FFFFFF', 'SHADOW', 'ROUNDED'),
('theme_acai', 'Acai Tropical', 'acai-tropical', '["ACAITERIA"]', 0, '#6B21A8', '#EC4899', '#22C55E', '#0F0F23', '#FFFFFF', 'GLASS', 'PILL'),
('theme_marmita', 'Marmita Caseira', 'marmita-caseira', '["MARMITARIA", "RESTAURANTE"]', 0, '#15803D', '#EA580C', '#84CC16', '#14532D', '#FFFFFF', 'FLAT', 'ROUNDED'),
('theme_dark', 'Dark Minimalista', 'dark-minimalist', '["TODOS"]', 0, '#6366F1', '#8B5CF6', '#A855F7', '#0F0F0F', '#FFFFFF', 'GLASS', 'ROUNDED'),

-- Temas Premium
('theme_oriental', 'Oriental Zen', 'oriental-zen', '["JAPONESA"]', 1, '#DC2626', '#0F172A', '#F59E0B', '#0C0C0C', '#FFFFFF', 'GLASS', 'SQUARE'),
('theme_mexican', 'Mexicano Fiesta', 'mexican-fiesta', '["MEXICANA"]', 1, '#16A34A', '#DC2626', '#FACC15', '#1C1917', '#FFFFFF', 'GRADIENT', 'PILL'),
('theme_cafe', 'Cafe Premium', 'cafe-premium', '["CAFETERIA", "DOCERIA"]', 1, '#78350F', '#F59E0B', '#D97706', '#1C1917', '#FEF3C7', 'SHADOW', 'ROUNDED'),
('theme_neon', 'Neon Night', 'neon-night', '["TODOS"]', 1, '#00F5FF', '#FF00FF', '#FFFF00', '#0A0A0A', '#FFFFFF', 'GLASS', 'PILL'),
('theme_elegant', 'Elegante Gold', 'elegante-gold', '["RESTAURANTE", "ARABE"]', 1, '#D4AF37', '#1A1A1A', '#C0C0C0', '#0D0D0D', '#FFFFFF', 'BORDERED', 'SQUARE');

-- ============================================================
-- DEMO: Usuario, Tenant, Categorias e Produtos
-- ============================================================

-- Usuario Demo (senha: 123456)
INSERT OR IGNORE INTO users (id, email, password_hash, name, role) VALUES
('demo_user_001', 'demo@demo.com', '$2a$10$OWuuf.WmjpcVSXzgPQc9SOQ3KAw1WhuK/Mr4ruOF6e.TI/TF3vdmC', 'Loja Demo', 'OWNER');

-- Super Admin (senha: 123456)
INSERT OR IGNORE INTO users (id, email, password_hash, name, role) VALUES
('superadmin_001', 'admin@deliveryhub.com', '$2a$10$OWuuf.WmjpcVSXzgPQc9SOQ3KAw1WhuK/Mr4ruOF6e.TI/TF3vdmC', 'Super Admin', 'SUPER_ADMIN');

-- Tenant Demo - Hamburgueria
INSERT OR IGNORE INTO tenants (id, owner_id, name, slug, business_type, theme_id, settings, status) VALUES
('demo_tenant_001', 'demo_user_001', 'Brutus Burger', 'brutus-burger', 'HAMBURGUERIA', 'theme_fastfood', 
'{"phone":"11999999999","whatsapp":"5511999999999","address":"Rua Demo 123","deliveryFee":5,"minOrder":25}', 'ACTIVE');

-- Subscription Demo
INSERT OR IGNORE INTO subscriptions (id, tenant_id, plan_id, status, trial_ends_at, current_period_start, current_period_end) VALUES
('demo_sub_001', 'demo_tenant_001', 'plan_trial', 'TRIALING', datetime('now', '+30 days'), datetime('now'), datetime('now', '+30 days'));

-- ============================================================
-- CATEGORIAS
-- ============================================================
INSERT OR IGNORE INTO categories (id, tenant_id, name, icon, order_index, is_active) VALUES
('demo_cat_burgers', 'demo_tenant_001', 'Hamburgueres', 'fas fa-hamburger', 1, 1),
('demo_cat_marmitas', 'demo_tenant_001', 'Marmitas Buffet', 'fas fa-utensils', 2, 1),
('demo_cat_acai', 'demo_tenant_001', 'Acai e Bowls', 'fas fa-leaf', 3, 1),
('demo_cat_bebidas', 'demo_tenant_001', 'Bebidas', 'fas fa-glass-whiskey', 4, 1),
('demo_cat_sobremesas', 'demo_tenant_001', 'Sobremesas', 'fas fa-ice-cream', 5, 1);

-- ============================================================
-- PRODUTOS COM ADICIONAIS
-- ============================================================

-- HAMBURGUERES (com adicionais de queijo, bacon, etc)
INSERT OR IGNORE INTO products (id, tenant_id, category_id, name, description, price, images, is_available, order_index, has_addons, addons) VALUES
('demo_prod_001', 'demo_tenant_001', 'demo_cat_burgers', 'X-Bacon', 
'Hamburguer 180g, bacon crocante, queijo cheddar, alface e tomate', 
28.90, '["https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600"]', 1, 1, 1,
'[{"name":"Queijo Extra","price":4.00},{"name":"Bacon Extra","price":5.00},{"name":"Ovo","price":3.00},{"name":"Cebola Caramelizada","price":3.50},{"name":"Molho Especial","price":2.00}]'),

('demo_prod_002', 'demo_tenant_001', 'demo_cat_burgers', 'X-Tudo', 
'Hamburguer 180g, bacon, ovo, queijo, presunto, alface, tomate e maionese', 
35.90, '["https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600"]', 1, 2, 1,
'[{"name":"Queijo Extra","price":4.00},{"name":"Bacon Extra","price":5.00},{"name":"Ovo Extra","price":3.00},{"name":"Hamburguer Extra","price":12.00},{"name":"Cebola Roxa","price":2.50}]'),

('demo_prod_003', 'demo_tenant_001', 'demo_cat_burgers', 'Smash Burger', 
'Blend 120g smashado, cebola caramelizada, queijo derretido, molho especial', 
32.90, '["https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=600"]', 1, 3, 1,
'[{"name":"Blend Extra","price":10.00},{"name":"Queijo Cheddar","price":4.00},{"name":"Bacon Crispy","price":5.00},{"name":"Picles","price":2.00}]');

-- MARMITAS BUFFET (tamanhos e opcoes)
INSERT OR IGNORE INTO products (id, tenant_id, category_id, name, description, price, images, is_available, order_index, has_addons, addons) VALUES
('demo_prod_marmita_p', 'demo_tenant_001', 'demo_cat_marmitas', 'Marmita Pequena (P)', 
'Escolha arroz, feijao e 1 carne + 2 acompanhamentos do buffet', 
18.90, '["https://images.unsplash.com/photo-1547592180-85f173990554?w=600"]', 1, 1, 1,
'[{"name":"Frango Grelhado","price":0},{"name":"Bife Acebolado","price":2.00},{"name":"Lombo Assado","price":3.00},{"name":"Peixe Frito","price":4.00},{"name":"Salada Extra","price":2.00},{"name":"Farofa","price":1.50},{"name":"Vinagrete","price":1.00},{"name":"Ovo Frito","price":2.00}]'),

('demo_prod_marmita_m', 'demo_tenant_001', 'demo_cat_marmitas', 'Marmita Media (M)', 
'Escolha arroz, feijao e 2 carnes + 3 acompanhamentos do buffet', 
24.90, '["https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600"]', 1, 2, 1,
'[{"name":"Frango Grelhado","price":0},{"name":"Bife Acebolado","price":2.00},{"name":"Lombo Assado","price":3.00},{"name":"Peixe Frito","price":4.00},{"name":"Costela","price":5.00},{"name":"Salada Extra","price":2.00},{"name":"Farofa","price":1.50},{"name":"Vinagrete","price":1.00},{"name":"Ovo Frito","price":2.00},{"name":"Batata Frita","price":3.00}]'),

('demo_prod_marmita_g', 'demo_tenant_001', 'demo_cat_marmitas', 'Marmita Grande (G)', 
'Escolha arroz, feijao e 3 carnes + 4 acompanhamentos do buffet - Serve 2 pessoas', 
34.90, '["https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600"]', 1, 3, 1,
'[{"name":"Frango Grelhado","price":0},{"name":"Bife Acebolado","price":2.00},{"name":"Lombo Assado","price":3.00},{"name":"Peixe Frito","price":4.00},{"name":"Costela","price":5.00},{"name":"Picanha","price":8.00},{"name":"Salada Completa","price":3.00},{"name":"Farofa Especial","price":2.00},{"name":"Vinagrete","price":1.00},{"name":"Ovo Frito","price":2.00},{"name":"Batata Frita","price":3.00},{"name":"Maionese","price":1.50}]');

-- ACAI E BOWLS (com adicionais de acai)
INSERT OR IGNORE INTO products (id, tenant_id, category_id, name, description, price, images, is_available, order_index, has_addons, addons) VALUES
('demo_prod_acai_300', 'demo_tenant_001', 'demo_cat_acai', 'Acai 300ml', 
'Acai puro batido na hora. Escolha seus complementos!', 
12.90, '["https://images.unsplash.com/photo-1590301157890-4810ed352733?w=600"]', 1, 1, 1,
'[{"name":"Granola","price":2.00},{"name":"Banana","price":2.00},{"name":"Morango","price":3.00},{"name":"Leite Condensado","price":2.00},{"name":"Leite em Po","price":1.50},{"name":"Paçoca","price":2.50},{"name":"Nutella","price":5.00},{"name":"Mel","price":2.00}]'),

('demo_prod_acai_500', 'demo_tenant_001', 'demo_cat_acai', 'Acai 500ml', 
'Acai puro batido na hora. Escolha seus complementos!', 
18.90, '["https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600"]', 1, 2, 1,
'[{"name":"Granola","price":2.00},{"name":"Banana","price":2.00},{"name":"Morango","price":3.00},{"name":"Kiwi","price":4.00},{"name":"Leite Condensado","price":2.00},{"name":"Leite em Po","price":1.50},{"name":"Paçoca","price":2.50},{"name":"Nutella","price":5.00},{"name":"Mel","price":2.00},{"name":"Amendoim","price":2.00},{"name":"Coco Ralado","price":2.50}]'),

('demo_prod_acai_750', 'demo_tenant_001', 'demo_cat_acai', 'Acai 750ml', 
'Acai puro batido na hora. Escolha seus complementos! Tamanho familia!', 
26.90, '["https://images.unsplash.com/photo-1611485988300-b7530defb8eb?w=600"]', 1, 3, 1,
'[{"name":"Granola","price":2.00},{"name":"Banana","price":2.00},{"name":"Morango","price":3.00},{"name":"Kiwi","price":4.00},{"name":"Manga","price":3.50},{"name":"Uva","price":3.00},{"name":"Leite Condensado","price":2.00},{"name":"Leite em Po","price":1.50},{"name":"Paçoca","price":2.50},{"name":"Nutella","price":5.00},{"name":"Mel","price":2.00},{"name":"Amendoim","price":2.00},{"name":"Coco Ralado","price":2.50},{"name":"Chocoball","price":3.00},{"name":"Flocos de Arroz","price":2.00}]'),

('demo_prod_bowl', 'demo_tenant_001', 'demo_cat_acai', 'Bowl de Acai Especial', 
'Acai na tigela com granola, banana, morango e leite condensado. Monte o seu!', 
22.90, '["https://images.unsplash.com/photo-1626074353765-517a681e40be?w=600"]', 1, 4, 1,
'[{"name":"Granola Extra","price":2.00},{"name":"Banana Extra","price":2.00},{"name":"Morango Extra","price":3.00},{"name":"Kiwi","price":4.00},{"name":"Manga","price":3.50},{"name":"Nutella","price":5.00},{"name":"Paçoca","price":2.50},{"name":"Amendoim","price":2.00},{"name":"Chia","price":3.00},{"name":"Whey Protein","price":6.00}]');

-- BEBIDAS
INSERT OR IGNORE INTO products (id, tenant_id, category_id, name, description, price, images, is_available, order_index, has_addons, addons) VALUES
('demo_prod_004', 'demo_tenant_001', 'demo_cat_bebidas', 'Coca-Cola 350ml', 'Refrigerante gelado', 6.00, '["https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=600"]', 1, 1, 0, '[]'),
('demo_prod_005', 'demo_tenant_001', 'demo_cat_bebidas', 'Suco Natural 500ml', 'Laranja, Limao ou Maracuja', 10.00, '["https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600"]', 1, 2, 0, '[]'),
('demo_prod_agua', 'demo_tenant_001', 'demo_cat_bebidas', 'Agua Mineral 500ml', 'Agua mineral sem gas', 4.00, '["https://images.unsplash.com/photo-1559839914-17aae19cec71?w=600"]', 1, 3, 0, '[]');

-- SOBREMESAS
INSERT OR IGNORE INTO products (id, tenant_id, category_id, name, description, price, images, is_available, order_index, has_addons, addons) VALUES
('demo_prod_006', 'demo_tenant_001', 'demo_cat_sobremesas', 'Brownie com Sorvete', 'Brownie de chocolate com bola de sorvete e calda', 18.90, '["https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600"]', 1, 1, 1,
'[{"name":"Sorvete Extra","price":4.00},{"name":"Calda de Chocolate","price":2.00},{"name":"Chantilly","price":2.50}]'),
('demo_prod_pudim', 'demo_tenant_001', 'demo_cat_sobremesas', 'Pudim de Leite', 'Pudim cremoso com calda de caramelo', 12.90, '["https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=600"]', 1, 2, 0, '[]');
-- ============================================================
-- SEED DATA - Sorveteria/Acai Client
-- Cliente: Primeiro cliente de Acai
-- ============================================================

-- Criar Tenant Sorveteria
-- Usuario Owner (senha: 123456)
INSERT OR IGNORE INTO users (id, email, password_hash, name, role) VALUES
('sorveteria_user_001', 'sorveteria@email.com', '$2a$10$OWuuf.WmjpcVSXzgPQc9SOQ3KAw1WhuK/Mr4ruOF6e.TI/TF3vdmC', 'Sorveteria Qdelicia', 'OWNER');

-- Tenant Sorveteria
INSERT OR IGNORE INTO tenants (id, owner_id, name, slug, business_type, theme_id, settings, status) VALUES
('sorveteria_001', 'sorveteria_user_001', 'Sorveteria Qdelicia', 'sorveteria-qdelicia', 'ACAITERIA', 'theme_acai', 
'{"phone":"11999999999","whatsapp":"5511999999999","address":"Rua da Sorveteria 123","deliveryFee":5,"minOrder":10}', 'ACTIVE');


-- ============================================================
-- CATEGORIAS
-- ============================================================

INSERT OR IGNORE INTO categories (id, tenant_id, name, order_index, is_active) VALUES
('sorv_cat_picoles', 'sorveteria_001', 'Picoles', 1, 1),
('sorv_cat_potes', 'sorveteria_001', 'Potes de Sorvete', 2, 1),
('sorv_cat_casquinhas', 'sorveteria_001', 'Casquinhas e Cascoes', 3, 1),
('sorv_cat_milkshakes', 'sorveteria_001', 'Milkshakes', 4, 1),
('sorv_cat_acai', 'sorveteria_001', 'Acai', 5, 1),
('sorv_cat_bebidas', 'sorveteria_001', 'Bebidas', 6, 1);

-- ============================================================
-- PRODUTOS - PICOLES
-- ============================================================

INSERT OR IGNORE INTO products (id, tenant_id, category_id, name, description, price, images, is_available, order_index, has_addons, addons) VALUES
('sorv_picole_gelo', 'sorveteria_001', 'sorv_cat_picoles', 'Picole de Gelo', 
'Refrescante picole de gelo. Sabores: uva, limao, laranja, abacaxi, acai, blue ice, melancia, tuti fruti, acerola', 
2.00, '["https://images.unsplash.com/photo-1505394033641-40c6ad1178d7?w=600"]', 1, 1, 1,
'[{"name":"Uva","price":0},{"name":"Limao","price":0},{"name":"Laranja","price":0},{"name":"Abacaxi","price":0},{"name":"Acai","price":0},{"name":"Blue Ice","price":0},{"name":"Melancia","price":0},{"name":"Tuti Fruti","price":0},{"name":"Acerola","price":0}]'),

('sorv_picole_leite', 'sorveteria_001', 'sorv_cat_picoles', 'Picole de Leite', 
'Cremoso picole de leite. Sabores: chocolate, chocolate branco, morango, mamao, abacate, milho verde, menta, banana, creme, leite condensado, chiclete, nata, blue ice, coco', 
2.50, '["https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=600"]', 1, 2, 1,
'[{"name":"Chocolate","price":0},{"name":"Chocolate Branco","price":0},{"name":"Morango","price":0},{"name":"Mamao","price":0},{"name":"Abacate","price":0},{"name":"Milho Verde","price":0},{"name":"Menta","price":0},{"name":"Banana","price":0},{"name":"Creme","price":0},{"name":"Leite Condensado","price":0},{"name":"Chiclete","price":0},{"name":"Nata","price":0},{"name":"Blue Ice","price":0},{"name":"Coco","price":0}]'),

('sorv_picole_itu', 'sorveteria_001', 'sorv_cat_picoles', 'Picole Itu', 
'Classico picole Itu', 
3.00, '["https://images.unsplash.com/photo-1488900128323-21503983a07e?w=600"]', 1, 3, 0, NULL),

('sorv_picole_eskimo', 'sorveteria_001', 'sorv_cat_picoles', 'Picole Esquimo', 
'Delicioso picole Esquimo. Sabores: chocolate, chocolate branco, tentacao, brigadeiro', 
4.00, '["https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=600"]', 1, 4, 1,
'[{"name":"Chocolate","price":0},{"name":"Chocolate Branco","price":0},{"name":"Tentacao","price":0},{"name":"Brigadeiro","price":0}]'),

('sorv_picole_chokito', 'sorveteria_001', 'sorv_cat_picoles', 'Picole Chokito', 
'Irresistivel picole Chokito. Sabores: chocolate, chocolate branco', 
4.50, '["https://images.unsplash.com/photo-1560008581-09826d1de69e?w=600"]', 1, 5, 1,
'[{"name":"Chocolate","price":0},{"name":"Chocolate Branco","price":0}]'),

('sorv_moreninha', 'sorveteria_001', 'sorv_cat_picoles', 'Moreninha', 
'Classica Moreninha. Sabores: morango, chocolate, coco, flocos, abacaxi, leite condensado, creme', 
4.50, '["https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=600"]', 1, 6, 1,
'[{"name":"Morango","price":0},{"name":"Chocolate","price":0},{"name":"Coco","price":0},{"name":"Flocos","price":0},{"name":"Abacaxi","price":0},{"name":"Leite Condensado","price":0},{"name":"Creme","price":0}]'),

('sorv_paleta', 'sorveteria_001', 'sorv_cat_picoles', 'Paleta Mexicana', 
'Premium Paleta Mexicana. Sabores: ninho trufado, pacoca, morango, leite condensado, chocolate belga', 
10.00, '["https://images.unsplash.com/photo-1615478503562-ec2d8aa0e24e?w=600"]', 1, 7, 1,
'[{"name":"Ninho Trufado","price":0},{"name":"Pacoca","price":0},{"name":"Morango","price":0},{"name":"Leite Condensado","price":0},{"name":"Chocolate Belga","price":0}]');

-- ============================================================
-- PRODUTOS - POTES DE SORVETE
-- ============================================================

INSERT OR IGNORE INTO products (id, tenant_id, category_id, name, description, price, images, is_available, order_index, has_addons, addons) VALUES
('sorv_pote_200', 'sorveteria_001', 'sorv_cat_potes', 'Pote 200ml', 
'Pote de sorvete 200ml. Sabores: chocolate, morango, leite condensado, flocos, abacaxi, creme', 
3.50, '["https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600"]', 1, 1, 1,
'[{"name":"Chocolate","price":0},{"name":"Morango","price":0},{"name":"Leite Condensado","price":0},{"name":"Flocos","price":0},{"name":"Abacaxi","price":0},{"name":"Creme","price":0}]'),

('sorv_pote_400', 'sorveteria_001', 'sorv_cat_potes', 'Pote 400ml', 
'Pote de sorvete 400ml. Sabores: chocolate, morango, leite condensado, flocos, abacaxi, creme', 
7.00, '["https://images.unsplash.com/photo-1580915411954-282cb1b0d780?w=600"]', 1, 2, 1,
'[{"name":"Chocolate","price":0},{"name":"Morango","price":0},{"name":"Leite Condensado","price":0},{"name":"Flocos","price":0},{"name":"Abacaxi","price":0},{"name":"Creme","price":0}]'),

('sorv_pote_1l', 'sorveteria_001', 'sorv_cat_potes', 'Pote 1 Litro', 
'Pote de sorvete 1 litro. Sabores: chocolate, morango, leite condensado, flocos, abacaxi, creme', 
14.00, '["https://images.unsplash.com/photo-1567206563064-6f60f40a2b57?w=600"]', 1, 3, 1,
'[{"name":"Chocolate","price":0},{"name":"Morango","price":0},{"name":"Leite Condensado","price":0},{"name":"Flocos","price":0},{"name":"Abacaxi","price":0},{"name":"Creme","price":0}]'),

('sorv_pote_2l', 'sorveteria_001', 'sorv_cat_potes', 'Pote 2 Litros', 
'Pote de sorvete 2 litros. Sabores: torta alema, creme trufado, brigadeiro, napolitano, tentacao, sonho de valsa, prestigio, abacaxi, morango, chocolate, flocos', 
27.00, '["https://images.unsplash.com/photo-1579954115563-e72bf1381629?w=600"]', 1, 4, 1,
'[{"name":"Torta Alema","price":0},{"name":"Creme Trufado","price":0},{"name":"Brigadeiro","price":0},{"name":"Napolitano","price":0},{"name":"Tentacao","price":0},{"name":"Sonho de Valsa","price":0},{"name":"Prestigio","price":0},{"name":"Abacaxi","price":0},{"name":"Morango","price":0},{"name":"Chocolate","price":0},{"name":"Flocos","price":0}]'),

('sorv_pote_acai', 'sorveteria_001', 'sorv_cat_potes', 'Pote Acai', 
'Pote de acai premium', 
30.00, '["https://images.unsplash.com/photo-1590301157890-4810ed352733?w=600"]', 1, 5, 0, NULL);

-- ============================================================
-- PRODUTOS - CASQUINHAS E CASCOES
-- ============================================================

INSERT OR IGNORE INTO products (id, tenant_id, category_id, name, description, price, images, is_available, order_index, has_addons, addons) VALUES
('sorv_casquinha_1', 'sorveteria_001', 'sorv_cat_casquinhas', 'Casquinha 1 Bola', 
'Casquinha com 1 bola de sorvete. Sabores variados', 
5.00, '["https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=600"]', 1, 1, 1,
'[{"name":"Chocolate","price":0},{"name":"Morango","price":0},{"name":"Baunilha","price":0},{"name":"Chiclete","price":0},{"name":"Ovomaltine","price":0},{"name":"Flocos","price":0},{"name":"Torta Alema","price":0},{"name":"Ninho Trufado","price":0},{"name":"Creme","price":0},{"name":"Menta","price":0},{"name":"Chocomenta","price":0},{"name":"Maca Verde","price":0},{"name":"Chocobrownie","price":0},{"name":"Maracuja com Nutella","price":0},{"name":"Leite Condensado","price":0},{"name":"Coco","price":0},{"name":"Sensacao","price":0},{"name":"Iogurte Grego","price":0},{"name":"Pacoca","price":0},{"name":"Oreo","price":0}]'),

('sorv_casquinha_2', 'sorveteria_001', 'sorv_cat_casquinhas', 'Casquinha 2 Bolas', 
'Casquinha com 2 bolas de sorvete. Sabores variados', 
10.00, '["https://images.unsplash.com/photo-1567206563064-6f60f40a2b57?w=600"]', 1, 2, 1,
'[{"name":"Chocolate","price":0},{"name":"Morango","price":0},{"name":"Baunilha","price":0},{"name":"Chiclete","price":0},{"name":"Ovomaltine","price":0},{"name":"Flocos","price":0},{"name":"Torta Alema","price":0},{"name":"Ninho Trufado","price":0},{"name":"Creme","price":0},{"name":"Menta","price":0},{"name":"Chocomenta","price":0},{"name":"Maca Verde","price":0},{"name":"Chocobrownie","price":0},{"name":"Maracuja com Nutella","price":0},{"name":"Leite Condensado","price":0},{"name":"Coco","price":0},{"name":"Sensacao","price":0},{"name":"Iogurte Grego","price":0},{"name":"Pacoca","price":0},{"name":"Oreo","price":0}]'),

('sorv_cascao_1', 'sorveteria_001', 'sorv_cat_casquinhas', 'Cascao 1 Bola', 
'Cascao com 1 bola de sorvete. Sabores variados', 
6.00, '["https://images.unsplash.com/photo-1560008581-09826d1de69e?w=600"]', 1, 3, 1,
'[{"name":"Chocolate","price":0},{"name":"Morango","price":0},{"name":"Baunilha","price":0},{"name":"Chiclete","price":0},{"name":"Ovomaltine","price":0},{"name":"Flocos","price":0},{"name":"Torta Alema","price":0},{"name":"Ninho Trufado","price":0},{"name":"Creme","price":0},{"name":"Menta","price":0},{"name":"Chocomenta","price":0},{"name":"Maca Verde","price":0},{"name":"Chocobrownie","price":0},{"name":"Maracuja com Nutella","price":0},{"name":"Leite Condensado","price":0},{"name":"Coco","price":0},{"name":"Sensacao","price":0},{"name":"Iogurte Grego","price":0},{"name":"Pacoca","price":0},{"name":"Oreo","price":0}]'),

('sorv_cascao_2', 'sorveteria_001', 'sorv_cat_casquinhas', 'Cascao 2 Bolas', 
'Cascao com 2 bolas de sorvete. Sabores variados', 
15.00, '["https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=600"]', 1, 4, 1,
'[{"name":"Chocolate","price":0},{"name":"Morango","price":0},{"name":"Baunilha","price":0},{"name":"Chiclete","price":0},{"name":"Ovomaltine","price":0},{"name":"Flocos","price":0},{"name":"Torta Alema","price":0},{"name":"Ninho Trufado","price":0},{"name":"Creme","price":0},{"name":"Menta","price":0},{"name":"Chocomenta","price":0},{"name":"Maca Verde","price":0},{"name":"Chocobrownie","price":0},{"name":"Maracuja com Nutella","price":0},{"name":"Leite Condensado","price":0},{"name":"Coco","price":0},{"name":"Sensacao","price":0},{"name":"Iogurte Grego","price":0},{"name":"Pacoca","price":0},{"name":"Oreo","price":0}]');

-- ============================================================
-- PRODUTOS - MILKSHAKES
-- ============================================================

INSERT OR IGNORE INTO products (id, tenant_id, category_id, name, description, price, images, is_available, order_index, has_addons, addons) VALUES
('sorv_milk_300', 'sorveteria_001', 'sorv_cat_milkshakes', 'Milkshake 300ml', 
'Delicioso milkshake 300ml. Escolha seu sabor favorito!', 
10.00, '["https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600"]', 1, 1, 1,
'[{"name":"Chocolate","price":0},{"name":"Morango","price":0},{"name":"Baunilha","price":0},{"name":"Chiclete","price":0},{"name":"Ovomaltine","price":0},{"name":"Flocos","price":0},{"name":"Torta Alema","price":0},{"name":"Ninho Trufado","price":0},{"name":"Creme","price":0},{"name":"Menta","price":0},{"name":"Chocomenta","price":0},{"name":"Maca Verde","price":0},{"name":"Chocobrownie","price":0},{"name":"Maracuja com Nutella","price":0},{"name":"Leite Condensado","price":0},{"name":"Coco","price":0},{"name":"Sensacao","price":0},{"name":"Iogurte Grego","price":0},{"name":"Pacoca","price":0},{"name":"Oreo","price":0}]'),

('sorv_milk_400', 'sorveteria_001', 'sorv_cat_milkshakes', 'Milkshake 400ml', 
'Delicioso milkshake 400ml. Escolha seu sabor favorito!', 
15.00, '["https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600"]', 1, 2, 1,
'[{"name":"Chocolate","price":0},{"name":"Morango","price":0},{"name":"Baunilha","price":0},{"name":"Chiclete","price":0},{"name":"Ovomaltine","price":0},{"name":"Flocos","price":0},{"name":"Torta Alema","price":0},{"name":"Ninho Trufado","price":0},{"name":"Creme","price":0},{"name":"Menta","price":0},{"name":"Chocomenta","price":0},{"name":"Maca Verde","price":0},{"name":"Chocobrownie","price":0},{"name":"Maracuja com Nutella","price":0},{"name":"Leite Condensado","price":0},{"name":"Coco","price":0},{"name":"Sensacao","price":0},{"name":"Iogurte Grego","price":0},{"name":"Pacoca","price":0},{"name":"Oreo","price":0}]'),

('sorv_milk_500', 'sorveteria_001', 'sorv_cat_milkshakes', 'Milkshake 500ml', 
'Delicioso milkshake 500ml. O maior e mais cremoso!', 
20.00, '["https://images.unsplash.com/photo-1553787499-6f9133242796?w=600"]', 1, 3, 1,
'[{"name":"Chocolate","price":0},{"name":"Morango","price":0},{"name":"Baunilha","price":0},{"name":"Chiclete","price":0},{"name":"Ovomaltine","price":0},{"name":"Flocos","price":0},{"name":"Torta Alema","price":0},{"name":"Ninho Trufado","price":0},{"name":"Creme","price":0},{"name":"Menta","price":0},{"name":"Chocomenta","price":0},{"name":"Maca Verde","price":0},{"name":"Chocobrownie","price":0},{"name":"Maracuja com Nutella","price":0},{"name":"Leite Condensado","price":0},{"name":"Coco","price":0},{"name":"Sensacao","price":0},{"name":"Iogurte Grego","price":0},{"name":"Pacoca","price":0},{"name":"Oreo","price":0}]');

-- ============================================================
-- PRODUTOS - BEBIDAS
-- ============================================================

INSERT OR IGNORE INTO products (id, tenant_id, category_id, name, description, price, images, is_available, order_index, has_addons, addons) VALUES
('sorv_agua', 'sorveteria_001', 'sorv_cat_bebidas', 'Agua sem Gas', 
'Agua mineral sem gas gelada', 
3.00, '["https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=600"]', 1, 1, 0, NULL),

('sorv_coca_lata', 'sorveteria_001', 'sorv_cat_bebidas', 'Coca-Cola Lata', 
'Coca-Cola lata 350ml gelada', 
5.00, '["https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600"]', 1, 2, 0, NULL),

('sorv_coca_2l', 'sorveteria_001', 'sorv_cat_bebidas', 'Coca-Cola 2 Litros', 
'Coca-Cola 2 litros', 
15.00, '["https://images.unsplash.com/photo-1624517452488-04869289c4ca?w=600"]', 1, 3, 0, NULL),

('sorv_monster', 'sorveteria_001', 'sorv_cat_bebidas', 'Monster Energy Lata', 
'Energetico Monster lata', 
12.00, '["https://images.unsplash.com/photo-1622543925917-763c34d1a86e?w=600"]', 1, 4, 0, NULL);

-- ============================================================
-- ADICIONAIS DE ACAI - Cadastrar no sistema
-- ============================================================

-- Adicionais Gratis
INSERT OR IGNORE INTO acai_adicionais (id, tenant_id, nome, preco, categoria, ativo) VALUES
('sorv_acai_banana', 'sorveteria_001', 'Banana', 0, 'Gratis', 1),
('sorv_acai_granola', 'sorveteria_001', 'Granola', 0, 'Gratis', 1),
('sorv_acai_granulado', 'sorveteria_001', 'Granulado', 0, 'Gratis', 1),
('sorv_acai_cereal', 'sorveteria_001', 'Cereal', 0, 'Gratis', 1),
('sorv_acai_chocolate', 'sorveteria_001', 'Chocolate', 0, 'Gratis', 1),
('sorv_acai_leite_cond', 'sorveteria_001', 'Leite Condensado', 0, 'Gratis', 1),
('sorv_acai_leite_po', 'sorveteria_001', 'Leite em Po', 0, 'Gratis', 1);

-- Adicionais Pagos
INSERT OR IGNORE INTO acai_adicionais (id, tenant_id, nome, preco, categoria, ativo) VALUES
('sorv_acai_amendoim', 'sorveteria_001', 'Amendoim', 2.00, 'Pagos', 1),
('sorv_acai_beijinho', 'sorveteria_001', 'Beijinho', 2.00, 'Pagos', 1),
('sorv_acai_brigadeiro', 'sorveteria_001', 'Brigadeiro', 2.00, 'Pagos', 1),
('sorv_acai_ninho', 'sorveteria_001', 'Creme Ninho', 5.00, 'Pagos', 1),
('sorv_acai_avela', 'sorveteria_001', 'Creme de Avela', 5.00, 'Pagos', 1),
('sorv_acai_chocoball', 'sorveteria_001', 'Chocoball', 2.00, 'Pagos', 1),
('sorv_acai_trento', 'sorveteria_001', 'Trento', 3.00, 'Pagos', 1),
('sorv_acai_confeti', 'sorveteria_001', 'Confeti M&M', 2.00, 'Pagos', 1),
('sorv_acai_morango', 'sorveteria_001', 'Morango', 4.00, 'Pagos', 1);

-- Config do Acai
INSERT OR IGNORE INTO acai_config (id, tenant_id, habilitado, categoria_nome) VALUES
('sorv_acai_config', 'sorveteria_001', 1, 'Acai');
