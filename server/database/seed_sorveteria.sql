-- ============================================================
-- SEED DATA - Sorveteria/Acai Client
-- Cliente: Primeiro cliente de Acai
-- ============================================================

-- Criar Tenant
INSERT OR IGNORE INTO tenants (id, name, slug, email, phone, plan_id, theme_id, status, trial_ends_at) VALUES
('sorveteria_001', 'Sorveteria Campestre', 'sorveteria-campestre', 'sorveteria@email.com', '11999999999', 'plan_premium', 'theme_modern', 'active', datetime('now', '+30 days'));

-- Usuario Owner
INSERT OR IGNORE INTO users (id, email, password_hash, name, role) VALUES
('sorveteria_user_001', 'sorveteria@email.com', '$2a$10$OWuuf.WmjpcVSXzgPQc9SOQ3KAw1WhuK/Mr4ruOF6e.TI/TF3vdmC', 'Sorveteria Campestre', 'OWNER');

-- Vincular usuario ao tenant
INSERT OR IGNORE INTO user_tenants (user_id, tenant_id, role) VALUES
('sorveteria_user_001', 'sorveteria_001', 'OWNER');

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

-- Configuracoes da loja
INSERT OR IGNORE INTO store_settings (id, tenant_id, store_name, primary_color, whatsapp_number, is_open) VALUES
('sorv_settings', 'sorveteria_001', 'Sorveteria Campestre', '#8b5cf6', '11999999999', 1);

COMMIT;
