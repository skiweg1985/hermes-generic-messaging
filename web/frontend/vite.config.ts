import fs from "node:fs";
import { defineConfig, loadEnv, type ServerOptions } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiProxy = env.VITE_API_PROXY || "http://127.0.0.1:8000";
  const wsProxy = apiProxy.replace(/^http/, "ws");
  const host = env.VITE_DEV_HOST || "127.0.0.1";
  const port = Number(env.VITE_DEV_PORT || "5173");
  const https = env.VITE_DEV_HTTPS === "true" || env.VITE_DEV_HTTPS === "1";
  const defaultCertPath = ".cert/localhost.pem";
  const defaultKeyPath = ".cert/localhost-key.pem";
  const certPath =
    env.VITE_DEV_SSL_CERT ||
    (fs.existsSync(defaultCertPath) ? defaultCertPath : undefined);
  const keyPath =
    env.VITE_DEV_SSL_KEY ||
    (fs.existsSync(defaultKeyPath) ? defaultKeyPath : undefined);
  const httpsOptions: ServerOptions["https"] = https
    ? certPath && keyPath
      ? {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
        }
      : true
    : undefined;

  return {
    plugins: [react()],
    server: {
      host,
      port,
      https: httpsOptions,
      proxy: {
        "/api": {
          target: apiProxy,
          secure: false,
        },
        "/ws": {
          target: wsProxy,
          secure: false,
          ws: true,
        },
      },
    },
  };
});
