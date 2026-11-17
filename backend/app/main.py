from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.schemas import (
    BoxScanResponse,
    ChatRequest,
    ChatResponse,
    EvaluateAlertsRequest,
    EvaluateAlertsResponse,
    HealthResponse,
    MedicationCreate,
    MedicationMiniReportRequest,
    MedicationMiniReportResponse,
    NearbyPharmaciesResponse,
    PatientProfileContext,
    PushWebhookSubscriptionRequest,
    SchedulerStatusResponse,
)
from app.services.alert_automator import alert_automator
from app.services.assistant_service import (
    answer_bula_chat,
    generate_medication_mini_report,
    scan_medication_box,
)
from app.services.pharmacy_service import (
    find_nearby_pharmacies,
    search_pharmacies_by_location_query,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    alert_automator.start()
    try:
        yield
    finally:
        alert_automator.shutdown()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "API do Meu Cuidado Diário — Suporte Multi-Perfil (Conta Família / Dependentes), "
        "Regras Clínicas de Prescrição, Scanner Multimodal de Caixa, Mini-Mapa de Farmácias (Overpass/Leaflet) "
        "e Motor de Alertas APScheduler."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse, tags=["health"])
def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        app=settings.app_name,
        version=settings.app_version,
        timestamp=datetime.now(timezone.utc),
    )


@app.post(
    "/api/assistant/scan-box",
    response_model=BoxScanResponse,
    tags=["assistant"],
    summary="Scanner Multimodal de Caixa de Medicamento com Contexto do Perfil",
)
async def assistant_scan_box(
    request: Request,
    file: UploadFile | None = File(default=None),
    hint: str = Form(default=""),
    outrosMedicamentos: str = Form(default=""),
    perfil: str = Form(default=""),
) -> BoxScanResponse:
    image_bytes = b""
    filename = ""
    mime_type = "image/jpeg"
    outros_list: list[str] = []
    perfil_ctx: PatientProfileContext | None = None

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            hint = str(body.get("hint") or body.get("nome") or hint)
            raw_outros = body.get("outrosMedicamentos") or []
            if isinstance(raw_outros, list):
                outros_list = [str(x) for x in raw_outros]
            elif isinstance(raw_outros, str) and raw_outros.strip():
                outros_list = [x.strip() for x in raw_outros.split(",") if x.strip()]
            if body.get("perfil"):
                perfil_ctx = PatientProfileContext.model_validate(body["perfil"])
        except Exception:
            pass
    else:
        if file is not None:
            filename = file.filename or ""
            mime_type = file.content_type or "image/jpeg"
            image_bytes = await file.read()

        if outrosMedicamentos.strip():
            try:
                parsed = json.loads(outrosMedicamentos)
                if isinstance(parsed, list):
                    outros_list = [str(x) for x in parsed]
                else:
                    outros_list = [x.strip() for x in outrosMedicamentos.split(",") if x.strip()]
            except Exception:
                outros_list = [x.strip() for x in outrosMedicamentos.split(",") if x.strip()]

        if perfil.strip():
            try:
                perfil_ctx = PatientProfileContext.model_validate(json.loads(perfil))
            except Exception:
                perfil_ctx = None

    return await scan_medication_box(
        filename=filename,
        hint_text=hint,
        image_bytes=image_bytes,
        mime_type=mime_type,
        outros_medicamentos=outros_list,
        perfil=perfil_ctx,
    )


@app.post(
    "/api/assistant/medication-report",
    response_model=MedicationMiniReportResponse,
    tags=["assistant"],
    summary="Gera Mini-Relatório Inteligente com Contexto do Perfil, Condição Clínica e Origem da Prescrição",
)
async def assistant_medication_report(
    payload: MedicationMiniReportRequest,
) -> MedicationMiniReportResponse:
    return await generate_medication_mini_report(payload)


@app.post(
    "/api/assistant/chat",
    response_model=ChatResponse,
    tags=["assistant"],
    summary="Chat Assistente de Bula contextualizado com idade, peso, parentesco e condição clínica do perfil",
)
async def assistant_bula_chat(payload: ChatRequest) -> ChatResponse:
    return await answer_bula_chat(payload)


@app.get(
    "/api/pharmacies/nearby",
    response_model=NearbyPharmaciesResponse,
    tags=["pharmacies"],
    summary="Busca farmácias e drogarias próximas num raio de 3 km via Overpass API (OpenStreetMap)",
)
async def get_nearby_pharmacies(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude do usuário (GPS)"),
    lng: float = Query(..., ge=-180.0, le=180.0, description="Longitude do usuário (GPS)"),
    radius: int = Query(
        default=3000, ge=500, le=15000, description="Raio de busca em metros (padrão 3000m)"
    ),
) -> NearbyPharmaciesResponse:
    return await find_nearby_pharmacies(lat=lat, lng=lng, radius_meters=radius)


@app.get(
    "/api/pharmacies/search-location",
    response_model=NearbyPharmaciesResponse,
    tags=["pharmacies"],
    summary="Busca farmácias por bairro ou cidade quando a permissão de GPS é negada",
)
async def get_pharmacies_by_location_query(
    q: str = Query(..., min_length=2, description="Nome do bairro ou cidade"),
    radius: int = Query(default=3000, ge=500, le=15000),
) -> NearbyPharmaciesResponse:
    return await search_pharmacies_by_location_query(query=q, radius_meters=radius)


@app.post(
    "/api/alerts/evaluate",
    response_model=EvaluateAlertsResponse,
    tags=["alerts"],
    summary="Consolida alertas Multi-Perfil (doses, estoque baixo, receita, emergência e 90 dias)",
)
async def evaluate_alerts(payload: EvaluateAlertsRequest) -> EvaluateAlertsResponse:
    result = alert_automator.evaluate_medications(
        medications=payload.medicamentos,
        reference_date=payload.dataReferencia,
    )
    if payload.webhookUrl:
        await alert_automator.dispatch_webhook(result.alertas, webhook_url=payload.webhookUrl)
    return result


@app.get(
    "/api/alerts/queue",
    response_model=SchedulerStatusResponse,
    tags=["alerts"],
    summary="Status do motor APScheduler e fila consolidada de alertas",
)
def get_alert_queue() -> SchedulerStatusResponse:
    return alert_automator.get_status()


@app.post(
    "/api/alerts/subscribe",
    tags=["alerts"],
    summary="Registra inscrição de Web Push ou Webhook para envio automatizado de alertas",
)
def subscribe_alerts(payload: PushWebhookSubscriptionRequest) -> dict[str, int | str]:
    total = alert_automator.register_subscription(payload)
    return {"status": "registered", "totalSubscriptions": total}


@app.post(
    "/api/alerts/export-ics",
    tags=["alerts"],
    summary="Exporta arquivo .ics com lembretes prefixados por [Perfil] e marco de 90 dias",
)
def export_ics_calendar(medications: list[MedicationCreate]) -> Response:
    ics_content = alert_automator.generate_ics_calendar(medications)
    return Response(
        content=ics_content,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="meu-cuidado-diario.ics"',
        },
    )
