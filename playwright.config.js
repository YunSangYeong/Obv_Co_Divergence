import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/ui',use:{baseURL:'http://127.0.0.1:4173',launchOptions:process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{},viewport:{width:390,height:844},isMobile:true,hasTouch:true},webServer:{command:'npm run dev -- --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:false}});
