# ClickHouse Cluster Setup Guide

This guide provides comprehensive instructions for setting up and managing a ClickHouse cluster with 3 replicas and ClickHouse Keeper for metadata management.

## 🏗️ Architecture Overview

The cluster consists of:
- **3 ClickHouse Server Replicas**: For data storage and replication
- **1 ClickHouse Keeper**: For cluster coordination and metadata management
- **Docker Compose**: For easy deployment and management

### Cluster Topology

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  ClickHouse-1   │    │  ClickHouse-2   │    │  ClickHouse-3   │
│  Port: 8123     │    │  Port: 8124     │    │  Port: 8125     │
│  TCP: 9000      │    │  TCP: 9001      │    │  TCP: 9002      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │ ClickHouse      │
                    │ Keeper          │
                    │ Port: 8126      │
                    │ ZK: 2181        │
                    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- At least 4GB RAM available
- Ports 8123-8126, 9000-9003, 9009-9011, 2181, 9234 available
- 10GB+ free disk space

### 1. Setup Cluster

```bash
# Setup the complete cluster with schema initialization
npm run clickhouse:cluster-setup
```

This command will:
- Deploy the cluster using Docker Compose
- Initialize the database schema with ReplicatedMergeTree tables
- Insert test data to verify replication
- Perform consistency checks across all replicas

### 2. Verify Cluster Health

```bash
# Verify cluster health and replication status
npm run cluster:verify
```

### 3. Start Data Ingestion

```bash
# Start ingesting blockchain events into the cluster
npm run data:ingestion
```

## 📋 Available Commands

### Cluster Management

```bash
# Setup cluster (first time)
npm run clickhouse:cluster-setup

# Start cluster
npm run cluster:start

# Stop cluster
npm run cluster:stop

# View cluster status
npm run cluster:status

# View cluster logs
npm run cluster:logs

# Verify cluster health
npm run cluster:verify
```

### Data Operations

```bash
# View database contents
npm run db:view

# Reset database
npm run db:reset

# Start data ingestion
npm run data:ingestion
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file with the following configuration for cluster mode:

```env
# ClickHouse Cluster Configuration
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=default
CLICKHOUSE_SECURE=false
CLICKHOUSE_CLUSTER_NAME=protocol_cluster
CLICKHOUSE_IS_CLUSTER=true

# Cluster Replica Configuration
CLICKHOUSE_REPLICA_1_HOST=localhost
CLICKHOUSE_REPLICA_1_PORT=8123
CLICKHOUSE_REPLICA_2_HOST=localhost
CLICKHOUSE_REPLICA_2_PORT=8124
CLICKHOUSE_REPLICA_3_HOST=localhost
CLICKHOUSE_REPLICA_3_PORT=8125
CLICKHOUSE_KEEPER_HOST=localhost
CLICKHOUSE_KEEPER_PORT=8126
```

### Cluster Configuration Files

The cluster uses the following configuration files:

- `clickhouse-configs/clickhouse-server-1.xml` - Replica 1 configuration
- `clickhouse-configs/clickhouse-server-2.xml` - Replica 2 configuration  
- `clickhouse-configs/clickhouse-server-3.xml` - Replica 3 configuration
- `clickhouse-configs/clickhouse-keeper.xml` - Keeper configuration
- `docker-compose.cluster.yml` - Docker Compose cluster definition

## 📊 Schema Design

### ReplicatedMergeTree Tables

The cluster uses ReplicatedMergeTree engine for automatic data replication:

```sql
CREATE TABLE protocol_events (
  id String,
  protocol String,
  version String,
  event_type String,
  timestamp UInt64,
  block_number UInt64,
  transaction_hash String,
  log_index UInt64,
  pool_address String,
  token0_address String,
  token0_symbol String,
  token0_decimals UInt8,
  token0_name String,
  token1_address String,
  token1_symbol String,
  token1_decimals UInt8,
  token1_name String,
  event_data String,
  gas_used String,
  gas_price String,
  fee String,
  created_at DateTime DEFAULT now()
) ENGINE = ReplicatedMergeTree(
  '/clickhouse/tables/protocol_events/{shard}', 
  '{replica}'
)
PARTITION BY toYYYYMM(toDateTime(timestamp / 1000))
ORDER BY (protocol, event_type, block_number, transaction_hash, log_index)
```

### Distributed Table

For cluster-wide operations, a distributed table is created:

```sql
CREATE TABLE protocol_events_distributed AS protocol_events
ENGINE = Distributed(protocol_cluster, default, protocol_events, rand())
```

## 🔍 Monitoring and Verification

### Cluster Health Checks

The verification script performs comprehensive health checks:

1. **Connectivity**: Tests connection to all replicas
2. **Topology**: Verifies cluster configuration and node status
3. **Replication**: Checks replication status and queue health
4. **Data Consistency**: Validates data consistency across replicas
5. **Keeper Status**: Monitors ClickHouse Keeper coordination service
6. **Performance**: Executes performance tests and metrics

### Key Metrics to Monitor

- **Replication Lag**: Monitor `absolute_delay` in replication status
- **Queue Size**: Watch `queue_size` for replication bottlenecks
- **Error Count**: Track `errors_count` for node health
- **Data Consistency**: Verify event counts match across replicas

## 🛠️ Troubleshooting

### Common Issues

#### 1. Cluster Won't Start

```bash
# Check Docker status
docker ps

# Check cluster logs
npm run cluster:logs

# Verify port availability
netstat -tulpn | grep -E ':(8123|8124|8125|8126|9000|9001|9002|9003|2181)'
```

#### 2. Replication Issues

```bash
# Check replication status
npm run cluster:verify

# Check individual replica logs
docker logs clickhouse-1
docker logs clickhouse-2
docker logs clickhouse-3
```

#### 3. Data Inconsistency

```bash
# Verify data consistency
npm run cluster:verify

# Check replication queue
docker exec -it clickhouse-1 clickhouse-client --query "SELECT * FROM system.replication_queue"
```

#### 4. Keeper Issues

```bash
# Check keeper status
docker logs clickhouse-keeper

# Verify keeper connectivity
docker exec -it clickhouse-1 clickhouse-client --query "SELECT * FROM system.zookeeper WHERE path = '/'"
```

### Performance Optimization

#### 1. Memory Configuration

Adjust memory settings in configuration files:

```xml
<max_memory_usage>10000000000</max_memory_usage>
<use_uncompressed_cache>1</use_uncompressed_cache>
```

#### 2. Replication Settings

Optimize replication performance:

```xml
<replication_settings>
  <replication_alter_columns_timeout>10</replication_alter_columns_timeout>
  <replication_alter_partitions_timeout>10</replication_alter_partitions_timeout>
</replication_settings>
```

## 🔄 Data Ingestion

### Using the Cluster

The cluster automatically handles data replication. When inserting data:

1. **Distributed Table**: Use `protocol_events_distributed` for cluster-wide operations
2. **Local Table**: Use `protocol_events` for single-replica operations
3. **Automatic Replication**: ReplicatedMergeTree handles data synchronization

### Example Usage

```typescript
// Cluster configuration
const clusterConfig = {
  host: 'localhost',
  port: 8123,
  username: 'default',
  password: '',
  database: 'default',
  secure: false,
  clusterName: 'protocol_cluster',
  isCluster: true
};

// Initialize service
const clickhouseService = new ClickHouseService(clusterConfig);
await clickhouseService.connect();

// Insert event (automatically replicated)
await clickhouseService.insertEvent(event);

// Query data (from any replica)
const events = await clickhouseService.getEventsByProtocol('uniswap-v2');
```

## 📈 Scaling and Production

### Production Considerations

1. **Resource Requirements**: Minimum 4GB RAM per replica
2. **Network**: Low-latency network between replicas
3. **Storage**: SSD storage recommended for performance
4. **Monitoring**: Implement comprehensive monitoring
5. **Backup**: Regular backup strategy for data protection

### Scaling Options

1. **Horizontal Scaling**: Add more replicas to existing shards
2. **Vertical Scaling**: Increase resources for existing replicas
3. **Sharding**: Distribute data across multiple shards
4. **Load Balancing**: Use load balancer for read operations

## 🔐 Security

### Production Security

1. **Authentication**: Enable password authentication
2. **Network Security**: Use VPN or private networks
3. **Encryption**: Enable TLS for data in transit
4. **Access Control**: Implement role-based access control
5. **Audit Logging**: Enable comprehensive audit logs

## 📚 Additional Resources

- [ClickHouse Documentation](https://clickhouse.com/docs/)
- [ClickHouse Cluster Guide](https://clickhouse.com/docs/architecture/cluster-deployment)
- [ReplicatedMergeTree Engine](https://clickhouse.com/docs/engines/table-engines/mergetree-family/replication)
- [ClickHouse Keeper](https://clickhouse.com/docs/operations/clickhouse-keeper)

## 🆘 Support

For issues and questions:

1. Check the troubleshooting section above
2. Review cluster logs: `npm run cluster:logs`
3. Verify cluster health: `npm run cluster:verify`
4. Check Docker and system resources
5. Review ClickHouse documentation

---

**Note**: This cluster setup is designed for development and testing. For production deployments, consider additional security, monitoring, and backup configurations.
