# Backend — Meu Cuidado Diário API

API em FastAPI com motor de automação de alertas (`APScheduler`), assistente multimodal de embalagem e bula e integração geográfica com OpenStreetMap (Overpass API).

## Endpoints Principais

- `GET /api/health` — Verificação de saúde da API.
- `POST /api/assistant/scan-box` — Scanner multimodal de foto da caixa do medicamento (extrai `nome`, `dosagem`, `quantidadeComprimidos`, `controlado`, `tipoReceita` e `resumoBula`).
- `POST /api/assistant/medication-report` — Gera o Mini-Relatório Inteligente pós-cadastro cruzando interações com os demais medicamentos do banco local e calculando o marco de 90 dias para uso contínuo.
- `GET /api/pharmacies/nearby?lat={lat}&lng={lng}&radius=3000` — Consulta farmácias e drogarias num raio de 3 km via Overpass API (OpenStreetMap) com links diretos para rotas no Google Maps e Apple Maps.
- `POST /api/alerts/evaluate` — Consolida alertas de horário de dose, estoque baixo (com gatilho GPS), renovação de receita controlada e reavaliação trimestral de 90 dias no `services/alert_automator.py`.
- `GET /api/alerts/queue` — Consulta o status do `APScheduler` e a fila ativa de alertas.
- `POST /api/alerts/subscribe` — Registra endpoints de Web Push / Webhook.
- `POST /api/alerts/export-ics` — Exporta calendário `.ics` com lembretes de doses e marco de 90 dias.
