# Plano de Desenvolvimento: Saas-Restaurante

## 🎯 Metas Iniciais
1. **Estabilização da Base:** Garantir que o sistema multi-tenant e o banco de dados SQLite estejam otimizados para alto volume.
2. **Refinamento da IA:** Melhorar a precisão do Gemini na identificação de múltiplos adicionais e opções complexas de cardápio (ex: Marmitas e Açaí).
3. **UX Admin:** Finalizar a visualização de avaliações e o quadro Kanban para garantir fluidez total.

## 🗺️ Roadmap (Etapas)

### Etapa 1: Infra e Otimização 
- [ ] Implementar sistema de cache em memória para produtos e configurações (reduzir I/O no SQLite).
- [ ] Configurar autosave e backup programado do banco de dados.
- [ ] Otimizar queries de relatórios em `server/routes/reports.js`.

### Etapa 2: Recuperação e Comunicação 
- [ ] Refinar o sistema de Follow-up (adicionar logs de envio e métricas de conversão).
- [ ] Melhorar o feedback visual no Painel Admin quando o bot estiver desconectado.

### Etapa 3: Inteligência de Negócio 
- [ ] Adicionar suporte a "Adicionais Obrigatórios" e "Limites de Escolha" no prompt da IA.
- [ ] Implementar sistema de Preview de GUIs em TXT para revisão rápida via terminal/agent.
- [ ] Criar dashboard de métricas avançadas (LTV, Churn, Ticket Médio).

## 🚀 Progresso Atual
- **Infra:** 80% (SQLite Schema Completo)
- **WhatsApp:** 70% (Bot IA e Link Funcionais)
- **Admin:** 75% (GUIs Principais Prontas)
- **Loja:** 90% (Checkout Funcional)
