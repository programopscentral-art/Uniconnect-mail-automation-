# UniConnect Production Startup Script
# This script starts both the SvelteKit App and the BullMQ Worker in production mode.

$env:NODE_ENV = "production"
$env:PORT = "3000" # Running on 3000 to avoid conflict with dev server on 3001

Write-Host "🚀 Starting UniConnect App on http://localhost:3000..." -ForegroundColor Cyan
Start-Process node -ArgumentList "apps/app/build/index.js" -NoNewWindow

Write-Host "⚙️ Starting Background Worker..." -ForegroundColor Yellow
Start-Process node -ArgumentList "apps/worker/dist/index.js" -NoNewWindow

Write-Host "✅ Production services started. You can now access the app at http://localhost:3000" -ForegroundColor Green
Write-Host "Note: In production, ensure your .env has the correct PUBLIC_BASE_URL for email tracking." -ForegroundColor Gray
