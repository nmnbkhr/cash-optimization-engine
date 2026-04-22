#!/bin/bash
# ══════════════════════════════════════════════════════
# COE — Cash Optimization Engine | Start Script
# ══════════════════════════════════════════════════════
cd "$(dirname "$0")"

echo ""
echo "  Cash Optimization Engine — Starting..."
echo ""

# Kill stale processes
kill -9 $(lsof -t -i :8000) 2>/dev/null
kill -9 $(lsof -t -i :5173) 2>/dev/null
sleep 1

# Load nvm for Node.js 22
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Start backend (conda coe env)
cd backend
conda run -n coe python -m uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Start frontend (Node 22 + Vite)
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

sleep 3

echo ""
echo "  ══════════════════════════════════════════"
echo "  COE is running"
echo "  ──────────────────────────────────────────"
echo "  Backend:   http://localhost:8000"
echo "  Frontend:  http://localhost:5173"
echo "  API Docs:  http://localhost:8000/docs"
echo "  Health:    http://localhost:8000/health"
echo "  Rates:     http://localhost:8000/api/business/rates"
echo "  ──────────────────────────────────────────"
echo "  PIDs: backend=$BACKEND_PID frontend=$FRONTEND_PID"
echo "  Run ./stop.sh to shut down"
echo "  ══════════════════════════════════════════"
echo ""

wait
