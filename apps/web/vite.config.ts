import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const webPort=Number(process.env.WEB_PORT || 5173);
const apiPort=Number(process.env.API_PORT || 4317);
if (![webPort,apiPort].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535)) throw new Error('Invalid local ports');
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    strictPort: true,
    port: webPort,
    proxy: { '/api': { target:'http://127.0.0.1:'+apiPort, changeOrigin:true } }
  }
});
