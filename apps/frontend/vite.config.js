import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "@acoustic-crm/shared": path.resolve(__dirname, "../../packages/shared/src"),
        },
    },
    server: {
        port: 5173,
        host: true,
    },
});
