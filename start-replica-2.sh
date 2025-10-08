#!/bin/bash
echo "🚀 Starting ClickHouse Replica 2..."
clickhouse-server --config-file=clickhouse-data/replica-2/config.xml --pid-file=clickhouse-data/replica-2/clickhouse-server.pid
