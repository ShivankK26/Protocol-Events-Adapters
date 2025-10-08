#!/bin/bash
echo "🚀 Starting ClickHouse Replica 1..."
clickhouse-server --config-file=clickhouse-data/replica-1/config.xml --pid-file=clickhouse-data/replica-1/clickhouse-server.pid
