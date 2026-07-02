import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
    plugins: [
        react(),
        nodePolyfills({
            include: ["events", "util", "buffer"],
            globals: {
                Buffer: true,
            },
        }),
    ],
    // TAMBAHKAN BLOK DEFINE INI:
    // Saat build di Vercel, jika kode mendeteksi objek "Buffer",
    // ia akan otomatis menggunakan Uint8Array / implementasi internal browser
    define: {
        "global.Buffer": "Buffer",
    },
    optimizeDeps: {
        exclude: ["snarkjs"],
    },
    worker: {
        format: "es",
        // TAMBAHKAN PLUGIN DI SINI AGAR WORKER JUGA MENERIMA POLYFILL
        plugins: () => [
            nodePolyfills({
                include: ["buffer", "util", "events"],
                globals: { Buffer: true },
            }),
        ],
    },
    server: {
        headers: {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        },
    },
});
