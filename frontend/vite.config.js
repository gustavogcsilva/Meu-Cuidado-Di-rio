import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            manifestFilename: "manifest.json",
            devOptions: {
                enabled: true,
                type: "module",
            },
            includeAssets: [
                "icons/medicamentos.svg",
                "icons/medicamentos-192.png",
                "icons/medicamentos-512.png",
            ],
            manifest: {
                name: "Meu Cuidado Diário",
                short_name: "Meu Cuidado Diário",
                description: "Meu Cuidado Diário — Gestão inteligente de medicamentos, calendário unificado e assistente de bula.",
                theme_color: "#246b59",
                background_color: "#f5f8f6",
                display: "standalone",
                orientation: "any",
                lang: "pt-BR",
                icons: [
                    {
                        src: "/icons/medicamentos.svg",
                        sizes: "any",
                        type: "image/svg+xml",
                        purpose: "any maskable",
                    },
                    {
                        src: "/icons/medicamentos-192.png",
                        sizes: "192x192",
                        type: "image/png",
                        purpose: "any",
                    },
                    {
                        src: "/icons/medicamentos-512.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "any maskable",
                    },
                ],
            },
            workbox: {
                navigateFallback: "/index.html",
                globPatterns: ["**/*.{js,css,html,svg,ico,png,woff2,json}"],
            },
        }),
    ],
});
