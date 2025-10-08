#!/bin/bash
echo "🚀 Starting ClickHouse Replica 3..."
clickhouse-server --config-file=clickhouse-data/replica-3/config.xml --pid-file=clickhouse-data/replica-3/clickhouse-server.pid
