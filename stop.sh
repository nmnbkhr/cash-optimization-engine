#!/bin/bash
# ══════════════════════════════════════════════════════
# COE — Cash Optimization Engine | Stop Script
# ══════════════════════════════════════════════════════

echo ""
echo "  Stopping COE..."

kill -9 $(lsof -t -i :8000) 2>/dev/null
kill -9 $(lsof -t -i :5173) 2>/dev/null

sleep 1

echo ""
for port in 8000 5173; do
  if lsof -i :$port >/dev/null 2>&1; then
    echo "  WARNING: port $port still in use"
  else
    echo "  Port $port: free"
  fi
done

echo ""
echo "  COE stopped."
echo ""
