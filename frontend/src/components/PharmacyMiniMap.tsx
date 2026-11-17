import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Compass,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  Search,
} from "lucide-react";
import type { NearbyPharmaciesResponse, NearbyPharmacy } from "../types/medication";

interface PharmacyMiniMapProps {
  pharmaciesData: NearbyPharmaciesResponse | null;
  isLoading: boolean;
  gpsStatus: "idle" | "requesting" | "granted" | "fallback" | "error";
  gpsMessage: string;
  lowStockSummary?: string;
  onRequestGps: () => void;
  onSearchByQuery: (query: string) => void;
}

export function PharmacyMiniMap({
  pharmaciesData,
  isLoading,
  gpsStatus,
  gpsMessage,
  lowStockSummary,
  onRequestGps,
  onSearchByQuery,
}: PharmacyMiniMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markerByIdRef = useRef<Map<string, L.Marker>>(new Map());

  const [selectedPharmacyId, setSelectedPharmacyId] = useState<string | null>(null);
  const [fallbackQuery, setFallbackQuery] = useState("Paulista, São Paulo");

  // Inicializa e atualiza o Mini-Mapa Leaflet quando os dados de farmácias mudam
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const originLat = pharmaciesData?.latOrigem ?? -23.561414;
    const originLng = pharmaciesData?.lngOrigem ?? -46.655881;

    if (!mapInstanceRef.current) {
      const map = L.map(container, {
        center: [originLat, originLng],
        zoom: 14,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    } else {
      mapInstanceRef.current.setView([originLat, originLng], 14);
    }

    const layerGroup = markersLayerRef.current;
    if (!layerGroup) return;

    layerGroup.clearLayers();
    markerByIdRef.current.clear();

    // 1. Marcador Azul Pulsante para a localização exata do usuário
    const userIcon = L.divIcon({
      className: "user-gps-marker",
      html: `
        <div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center;">
          <span style="position:absolute;width:22px;height:22px;border-radius:9999px;background:rgba(37,99,235,0.35);animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></span>
          <span style="position:relative;width:13px;height:13px;border-radius:9999px;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></span>
        </div>
      `,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    L.marker([originLat, originLng], { icon: userIcon })
      .bindPopup(
        `<div style="font-family:sans-serif;font-size:12px;">
          <strong>📍 Sua Localização de Referência</strong><br/>
          <span>Coordenadas: ${originLat.toFixed(4)}, ${originLng.toFixed(4)}</span>
        </div>`,
      )
      .addTo(layerGroup);

    // Circunferência de raio 3 km
    L.circle([originLat, originLng], {
      radius: pharmaciesData?.raioMetros ?? 3000,
      color: "#246b59",
      weight: 1,
      fillColor: "#246b59",
      fillOpacity: 0.05,
    }).addTo(layerGroup);

    // 2. Marcadores personalizados (ícone de cruz de farmácia) para cada drogaria/farmácia encontrada
    const list = pharmaciesData?.farmacias ?? [];
    list.forEach((farmacia, index) => {
      const pharmacyIcon = L.divIcon({
        className: "pharmacy-cross-marker",
        html: `
          <div style="width:28px;height:28px;border-radius:10px;background:#246b59;color:#ffffff;border:2px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;">
            ✚
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14],
      });

      const popupHtml = `
        <div style="font-family:sans-serif;min-width:190px;line-height:1.4;">
          <div style="font-weight:800;font-size:13px;color:#1d302c;">${farmacia.nome}</div>
          <div style="font-size:11px;color:#246b59;font-weight:700;margin-top:2px;">
            📏 Distância: ${farmacia.distanciaFormatada} (${farmacia.distanciaMetros} m)
          </div>
          <div style="font-size:11px;color:#555;margin-top:3px;">${farmacia.endereco}</div>
          ${
            farmacia.telefone
              ? `<div style="font-size:11px;color:#333;margin-top:2px;">📞 ${farmacia.telefone}</div>`
              : ""
          }
          <div style="margin-top:8px;display:flex;gap:6px;">
            <a href="${farmacia.googleMapsUrl}" target="_blank" rel="noopener noreferrer"
               style="flex:1;text-align:center;background:#246b59;color:#fff;text-decoration:none;padding:5px 8px;border-radius:7px;font-size:11px;font-weight:700;">
              🧭 Traçar Rota (Google)
            </a>
            <a href="${farmacia.appleMapsUrl}" target="_blank" rel="noopener noreferrer"
               style="text-align:center;background:#f1f5f9;color:#1e293b;text-decoration:none;padding:5px 8px;border-radius:7px;font-size:11px;font-weight:700;border:1px solid #cbd5e1;">
              Apple
            </a>
          </div>
        </div>
      `;

      const marker = L.marker([farmacia.lat, farmacia.lng], { icon: pharmacyIcon })
        .bindPopup(popupHtml)
        .addTo(layerGroup);

      marker.on("click", () => {
        setSelectedPharmacyId(farmacia.id);
      });

      markerByIdRef.current.set(farmacia.id, marker);

      if (index === 0 && !selectedPharmacyId) {
        marker.openPopup();
      }
    });

    window.setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 120);
  }, [pharmaciesData, selectedPharmacyId]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  function handleFocusPharmacyOnMap(farmacia: NearbyPharmacy) {
    setSelectedPharmacyId(farmacia.id);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([farmacia.lat, farmacia.lng], 15, { animate: true });
    }
    const marker = markerByIdRef.current.get(farmacia.id);
    if (marker) {
      marker.openPopup();
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fallbackQuery.trim()) return;
    onSearchByQuery(fallbackQuery.trim());
  }

  return (
    <section
      className={`rounded-3xl border p-5 shadow-card sm:p-6 ${
        lowStockSummary
          ? "border-amber-300 bg-amber-50/80"
          : "border-emerald-950/10 bg-white"
      }`}
      data-testid="pharmacy-minimap-section"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
              lowStockSummary ? "bg-amber-500 text-white" : "bg-mint text-forest"
            }`}
          >
            <MapPin size={21} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-ink">
                {lowStockSummary
                  ? `Alerta de Estoque Baixo (${lowStockSummary})`
                  : "📍 Mini-Mapa Interativo de Farmácias e Drogarias Próximas"}
              </h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-forest">
                GPS + Leaflet + Overpass API (3 km)
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted">
              {lowStockSummary
                ? "Estoque mínimo atingido! Veja no mini-mapa interativo as farmácias mais próximas ou busque por bairro/cidade."
                : "Visualize no mapa as drogarias num raio de 3 km, clique nos marcadores ✚ e trace a rota direta."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRequestGps}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-900 disabled:opacity-60"
          data-testid="find-nearby-pharmacies-btn"
        >
          <Compass size={15} className={isLoading ? "animate-spin" : ""} />
          📍 Farmácias Próximas (GPS)
        </button>
      </div>

      {/* Busca por Bairro / Cidade (Fallback caso permissão GPS seja negada) */}
      <form
        onSubmit={handleSearchSubmit}
        className="mt-3.5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-2"
      >
        <Search size={15} className="ml-2 text-slate-400" />
        <input
          type="text"
          value={fallbackQuery}
          onChange={(e) => setFallbackQuery(e.target.value)}
          placeholder="Sem GPS? Digite seu bairro ou cidade (ex: Paulista, São Paulo ou Copacabana)"
          className="min-w-48 flex-1 bg-transparent px-2 py-1 text-xs text-ink focus:outline-hidden"
          data-testid="pharmacy-fallback-query-input"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-xl bg-mint px-3 py-1.5 text-xs font-bold text-forest transition hover:bg-emerald-200"
          data-testid="pharmacy-fallback-search-btn"
        >
          Buscar por Bairro/Cidade
        </button>
      </form>

      {gpsMessage && (
        <p className="mt-2.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-medium text-slate-700">
          📡 {gpsMessage} {gpsStatus !== "idle" ? `[Status: ${gpsStatus}]` : ""}
        </p>
      )}

      {/* Container Visual do Mini-Mapa Leaflet (altura ~260px no mobile e 300px no desktop) */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-950/15 shadow-inner">
        <div
          ref={mapContainerRef}
          className="h-[260px] w-full sm:h-[300px]"
          data-testid="leaflet-minimap-container"
        />
      </div>

      {/* Lista de Farmácias Encontradas sincronizada com os marcadores do Mini-Mapa */}
      {pharmaciesData && pharmaciesData.farmacias.length > 0 && (
        <div
          className="mt-4 grid gap-3 sm:grid-cols-2"
          data-testid="nearby-pharmacies-list"
        >
          {pharmaciesData.farmacias.map((farmacia) => {
            const isFocused = selectedPharmacyId === farmacia.id;
            return (
              <article
                key={farmacia.id}
                onClick={() => handleFocusPharmacyOnMap(farmacia)}
                className={`flex cursor-pointer flex-col justify-between rounded-2xl border bg-white p-3.5 shadow-2xs transition ${
                  isFocused
                    ? "border-forest ring-2 ring-forest/25"
                    : "border-slate-200/80 hover:border-emerald-400"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink">✚ {farmacia.nome}</h3>
                    <span className="shrink-0 rounded-full bg-mint px-2.5 py-0.5 text-xs font-extrabold text-forest">
                      {farmacia.distanciaFormatada}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{farmacia.endereco}</p>
                  {farmacia.telefone && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                      <Phone size={11} /> {farmacia.telefone}
                    </p>
                  )}
                </div>

                <div
                  className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <a
                    href={farmacia.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-forest px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-900"
                    data-testid="google-maps-route-link"
                  >
                    <Navigation size={12} />
                    🧭 Traçar Rota (Google)
                  </a>
                  <a
                    href={farmacia.appleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100"
                    data-testid="apple-maps-route-link"
                  >
                    <ExternalLink size={12} />
                    Apple Maps
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
