#!/bin/bash
echo "🛑 Stopping all ClickHouse replicas..."
pkill -f "clickhouse-server.*replica-1" || true
pkill -f "clickhouse-server.*replica-2" || true
pkill -f "clickhouse-server.*replica-3" || true
echo "✅ All replicas stopped"
