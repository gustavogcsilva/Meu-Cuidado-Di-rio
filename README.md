# Meu Cuidado Diário

Aplicação PWA offline-first para gestão inteligente de medicamentos, controle de doses e estoque por foto da caixa, calendário unificado, geolocalização de farmácias próximas e assistente de bula com IA.

O monorepo é dividido em:
- `frontend/` — React 18, TypeScript, Vite, Tailwind CSS, PWA (`manifest.json` + Service Worker) e persistência local com Dexie/IndexedDB.
- `backend/` — FastAPI, Pydantic v2, `APScheduler` (`services/alert_automator.py`), scanner multimodal de caixa (`POST /api/assistant/scan-box`), mini-relatório pós-cadastro com cruzamento de interações (`POST /api/assistant/medication-report`) e busca de farmácias próximas via Overpass API / OpenStreetMap (`GET /api/pharmacies/nearby`).

---

## Como Executar (Backend + Frontend)

### 1. Executar o Backend (FastAPI + APScheduler)

No PowerShell, a partir da raiz do projeto:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

- API disponível em: `http://127.0.0.1:8000`
- Documentação Swagger / OpenAPI: `http://127.0.0.1:8000/docs`

### 2. Executar o Frontend (Vite + React PWA)

Em outro terminal PowerShell, a partir da raiz do projeto:

```powershell
cd frontend
npm run dev
```

- Acesse no navegador: `http://localhost:5173`

---

## Funcionalidades Implementadas na Etapa 2

1. **Identidade "Meu Cuidado Diário" e Layout Split-View Responsivo:**
   - Renomeação completa da aplicação, títulos, cabeçalhos e `manifest.json` para **Meu Cuidado Diário**.
   - **Relógio Digital em Tempo Real** no topo com data por extenso e hora exata com segundos (`HH:MM:SS`).
   - **Desktop (`lg:`):** Grade dividida (`split-view`) exibindo o **Dashboard de Doses/Estoque** e o **Calendário Unificado** lado a lado.
   - **Mobile:** Barra de alternância rápida (`Tudo Integrado`, `Doses & Estoque`, `Calendário`) mantendo o relógio digital no topo e o calendário compacto acessível sem quebrar o layout.
2. **Pop-up Automático de Mini-Relatório Inteligente Pós-Cadastro (`POST /api/assistant/medication-report`):**
   - Ao salvar qualquer nova medicação (ex: *Clonazepam* ou *Buscopan*), abre automaticamente o modal com resumo direto ("Para que serve"), alertas principais, cruzamento de interações com os medicamentos já cadastrados no IndexedDB e efeitos colaterais comuns.
   - Destaca o alerta de não interrupção abrupta para medicamentos de **uso contínuo** e agenda a **Reavaliação Trimestral de 3 Meses (90 dias)**.
3. **Scanner Multimodal de Caixa (`POST /api/assistant/scan-box` — Zero Digitação):**
   - Botão **📷 Fotografar Caixa** no cadastro de **Novo Medicamento** (preenche e salva automaticamente com a quantidade de comprimidos da caixa) e em **+ Repor Estoque** nos cartões de medicamentos (lê a quantidade da caixa e soma automaticamente ao `estoqueAtual`).
4. **Geolocalização (GPS) & Farmácias Próximas (`GET /api/pharmacies/nearby`):**
   - Solicita permissão `navigator.geolocation` quando há estoque baixo ou ao clicar em **Buscar Farmácias Próximas**, consulta a **Overpass API (OpenStreetMap)** num raio de 3 km e exibe distância aproximada e botões diretos de rota para **Google Maps** e **Apple Maps**.
5. **Motor de Automação de Envios de Alerta (`backend/services/alert_automator.py`):**
   - Fila e agendador `APScheduler` com suporte a Web Push / Webhook e exportação `.ics` consolidando lembretes de dose, estoque baixo, renovação de receita controlada e reavaliação médica de 90 dias.
