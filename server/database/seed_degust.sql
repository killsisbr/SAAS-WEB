-- Criar tenant Degust como RESTAURANTE
INSERT OR IGNORE INTO tenants (id, owner_id, name, slug, business_type, theme_id, settings, status)
VALUES ('degust', 'demo_user_001', 'Restaurante Degust', 'degust', 'RESTAURANTE', 'theme_acai', 
'{"whatsappOrderMode":"direct","whatsapp":"5511999999999","address":"Rua do Degust, 123","allow_pickup":true,"acceptCash":true,"acceptPix":true,"acceptCard":true,"deliveryFee":7}', 'ACTIVE');

-- Criar categoria de Marmitas
INSERT OR IGNORE INTO categories (id, tenant_id, name, order_index, is_active)
VALUES ('cat_degust_marmitas', 'degust', 'Marmitas', 0, 1);

-- Criar produtos (Marmitas)
INSERT OR IGNORE INTO products (id, tenant_id, category_id, name, description, price, is_available)
VALUES ('prod_degust_p', 'degust', 'cat_degust_marmitas', 'Marmita P', '300g de comida caseira', 15.00, 1);

INSERT OR IGNORE INTO products (id, tenant_id, category_id, name, description, price, is_available)
VALUES ('prod_degust_m', 'degust', 'cat_degust_marmitas', 'Marmita M', '500g com variedade', 20.00, 1);

INSERT OR IGNORE INTO products (id, tenant_id, category_id, name, description, price, is_available)
VALUES ('prod_degust_g', 'degust', 'cat_degust_marmitas', 'Marmita G', '800g para quem tem fome', 25.00, 1);

-- Criar itens do buffet do dia
INSERT OR IGNORE INTO buffet_items (id, tenant_id, nome, ativo, order_index)
VALUES ('buff_degust_1', 'degust', 'Arroz Branco', 1, 1);

INSERT OR IGNORE INTO buffet_items (id, tenant_id, nome, ativo, order_index)
VALUES ('buff_degust_2', 'degust', 'Feijão Carioca', 1, 2);

INSERT OR IGNORE INTO buffet_items (id, tenant_id, nome, ativo, order_index)
VALUES ('buff_degust_3', 'degust', 'Frango com Quiabo', 1, 3);

INSERT OR IGNORE INTO buffet_items (id, tenant_id, nome, ativo, order_index)
VALUES ('buff_degust_4', 'degust', 'Bife Acebolado', 1, 4);

INSERT OR IGNORE INTO buffet_items (id, tenant_id, nome, ativo, order_index)
VALUES ('buff_degust_5', 'degust', 'Salada de Maionese', 1, 5);

INSERT OR IGNORE INTO buffet_items (id, tenant_id, nome, ativo, order_index)
VALUES ('buff_degust_6', 'degust', 'Macarrão ao Sugo', 1, 6);
