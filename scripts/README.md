# Scripts de Configuração do Servidor

## nginx-domain-config.sh

Configura automaticamente um domínio customizado no Nginx com SSL.

### Uso:
```bash
sudo ./nginx-domain-config.sh <dominio> <slug>
```

### Exemplo:
```bash
sudo ./nginx-domain-config.sh restaurantedegust.com degust
```

### O que faz:
1. Cria configuração Nginx em `/etc/nginx/sites-available/`
2. Ativa o site em `/etc/nginx/sites-enabled/`
3. Testa a configuração
4. Recarrega o Nginx
5. Gera certificado SSL com Certbot

### Pré-requisitos:
- Nginx instalado
- Certbot instalado: `sudo apt install certbot python3-certbot-nginx`
- DNS do domínio apontando para o servidor

---

## nginx-domain-remove.sh

Remove configuração de um domínio customizado.

### Uso:
```bash
sudo ./nginx-domain-remove.sh <dominio>
```

---

## Fluxo completo para adicionar domínio:

1. **No painel Super Admin:**
   - Acesse `/superadmin/tenants`
   - Clique no ícone ⚙️ da loja
   - Preencha o campo "Domínio Customizado"
   - Salve

2. **No DNS do domínio:**
   - Crie um registro A apontando para o IP do servidor
   - Ou CNAME apontando para `app.killsis.com`

3. **No servidor (VPS):**
   ```bash
   cd /var/www/deliveryhub/scripts
   sudo ./nginx-domain-config.sh restaurantedegust.com degust
   ```

4. **Teste:**
   - Acesse `https://restaurantedegust.com`
   - Deve redirecionar para a loja do tenant
