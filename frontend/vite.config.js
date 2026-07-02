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
    optimizeDeps: {
        exclude: ["snarkjs"],
    },
    worker: {
        format: "es",
    },
    server: {
        headers: {
            // Required for SharedArrayBuffer / snarkjs WASM in some browsers
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        },
    },
});
