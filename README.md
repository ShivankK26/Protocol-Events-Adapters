# 🚀 Protocol Event Adapters

A comprehensive blockchain event monitoring system that captures, standardizes, and stores protocol events in real-time using ClickHouse (local cluster or cloud) for analytics and data persistence.

Example of the table structure - 

<img width="1263" height="806" alt="Screenshot 2025-10-08 at 5 14 55 PM" src="https://github.com/user-attachments/assets/605a4f8f-8b44-41f3-9809-3537b5f6e049" />

## 📋 Table of Contents

- [🚀 Features](#-features)
- [🏗️ Architecture](#️-architecture)
- [⚡ Quick Start](#-quick-start)
- [📦 Installation](#-installation)
- [🔧 Configuration](#-configuration)
- [💻 Commands Reference](#-commands-reference)
- [📊 Data Schema](#-data-schema)
- [🔍 Monitoring & Analytics](#-monitoring--analytics)
- [🛠️ Troubleshooting](#️-troubleshooting)
- [📁 Project Structure](#-project-structure)
- [🤝 Contributing](#-contributing)

---

## 🚀 Features

### 🔥 Core Capabilities
- **⚡ Real-time Event Listening**: WebSocket-based event listening for instant blockchain event detection
- **🔍 Dynamic Market Discovery**: Automatically detects new pools/markets and starts tracking them
- **📊 Multi-Protocol Support**: 
  - Uniswap V2 (Ethereum)
  - Uniswap V3 (Ethereum) 
  - PancakeSwap V2 (BSC)
- **🎯 Standardized Schema**: Unified data structure across all protocols
- **🔄 Event Normalization**: Converts protocol-specific events to standard format

### ☁️ Data & Analytics
- **🗄️ ClickHouse Integration**: Real-time data storage and analytics
- **🏗️ Local Cluster Support**: 3-replica ClickHouse cluster with ClickHouse Keeper
- **☁️ Cloud-Ready**: ClickHouse Cloud support for scalable data processing
- **📈 Real-time Analytics**: Materialized views for instant insights
- **🔍 Advanced Querying**: SQL-based analytics and reporting
- **📊 Data Visualization**: Built-in dashboard and monitoring tools
- **🔄 Data Replication**: Automatic data replication across cluster nodes

---

## 🏗️ Architecture

### 📊 System Overview
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Blockchain    │    │   Event Listener │    │   ClickHouse    │
│   Networks      │───▶│   & Processor    │───▶│   Cluster/Cloud │
│                 │    │                  │    │                 │
│ • Ethereum      │    │ • Multi-Protocol │    │ • Real-time     │
│ • BSC           │    │ • Standardization│    │ • Analytics     │
│ • WebSocket     │    │ • BigInt Handling│    │ • Replication   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### 🔄 Event Flow
```
Factory Contract → New Pool Created → Start Pool Listening → Pool Events → Standardized Events → ClickHouse Storage
```

---

## ⚡ Quick Start

### 🚀 **Get Running in 3 Steps**

```bash
# 1. Install dependencies
yarn install

# 2. Setup environment
cp env.example .env
# Edit .env with your credentials

# 3. Start monitoring
yarn data:ingestion
```

### 📊 **View Your Data**
```bash
# Check what's been captured
yarn db:view

# Reset if needed
yarn db:reset
```

---

## 📦 Installation

### Prerequisites
- **Node.js** 18+ 
- **Yarn** package manager
- **Docker** and **Docker Compose** (for local cluster)
- **ClickHouse Cloud** account (optional, for cloud setup)
- **RPC Endpoints** for Ethereum and BSC

### Step-by-Step Setup

#### 1. **Clone & Install**
```bash
yarn install
```

#### 2. **Environment Configuration**
```bash
cp env.example .env
```

#### 3. **ClickHouse Setup (Choose One)**

**Option A: Local ClickHouse Cluster (Recommended)**
```bash
# Setup local ClickHouse cluster
yarn clickhouse:setup
```

**Option B: ClickHouse Cloud**
```bash
# Setup ClickHouse Cloud (requires cloud account)
yarn clickhouse:cloud-setup
```

#### 4. **Start Monitoring**
```bash
yarn data:ingestion
```

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file with your credentials:

```env
# ===========================================
# BLOCKCHAIN RPC ENDPOINTS
# ===========================================

# Ethereum Mainnet
ETHEREUM_RPC_URL=https://eth.llamarpc.com
ETHEREUM_WS_URL=wss://eth.llamarpc.com

# BSC Mainnet  
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSC_WS_URL=wss://bsc-ws-node.nariox.org:443/ws

# ===========================================
# CLICKHOUSE CONFIGURATION
# ===========================================

# For Local ClickHouse Cluster (Default)
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=default
CLICKHOUSE_SECURE=false
CLICKHOUSE_CLUSTER_NAME=protocol_cluster
CLICKHOUSE_IS_CLUSTER=false

# For ClickHouse Cloud (Alternative)
# CLICKHOUSE_HOST=abcdef.azure.clickhouse.cloud
# CLICKHOUSE_PORT=8443
# CLICKHOUSE_USERNAME=default
# CLICKHOUSE_PASSWORD=your_password_here
# CLICKHOUSE_DATABASE=default
# CLICKHOUSE_SECURE=true
# CLICKHOUSE_IS_CLUSTER=false
```

### 🔧 Custom Configuration

```typescript
import { ProtocolListenerApp } from './src/app/protocol-listener';

const config = {
  rpcUrl: 'https://your-rpc-url',
  wsUrl: 'wss://your-ws-url',
  chainId: 1, // Ethereum Mainnet
  protocols: ['uniswap-v2', 'uniswap-v3']
};

const listener = new ProtocolListenerApp(config);
```

---

## 💻 Commands Reference

### 🚀 **Core Commands**

| Command | Description | Usage |
|---------|-------------|-------|
| `yarn data:ingestion` | **Main command** - Start blockchain monitoring | `yarn data:ingestion` |
| `yarn db:view` | View database contents and statistics | `yarn db:view` |
| `yarn db:reset` | Clear all data from database | `yarn db:reset` |

### 🏗️ **ClickHouse Setup Commands**

| Command | Description | Usage |
|---------|-------------|-------|
| `yarn clickhouse:setup` | Setup local ClickHouse cluster | `yarn clickhouse:setup` |
| `yarn cluster:start` | Start ClickHouse cluster | `yarn cluster:start` |
| `yarn cluster:stop` | Stop ClickHouse cluster | `yarn cluster:stop` |
| `yarn cluster:logs` | View cluster logs | `yarn cluster:logs` |
| `yarn cluster:status` | Check cluster status | `yarn cluster:status` |
| `yarn cluster:verify` | Verify cluster health and replication | `yarn cluster:verify` |

### 🔍 **Blockchain Listener Commands**

| Command | Description | Usage |
|---------|-------------|-------|
| `yarn listener:ethereum` | Start Ethereum event listener | `yarn listener:ethereum` |
| `yarn listener:bsc` | Start BSC event listener | `yarn listener:bsc` |
| `yarn listener:all` | Start all blockchain listeners | `yarn listener:all` |

### 🛠️ **Development Commands**

| Command | Description | Usage |
|---------|-------------|-------|
| `yarn dev` | Start Next.js development server | `yarn dev` |
| `yarn build` | Build the application | `yarn build` |
| `yarn start` | Start production server | `yarn start` |
| `yarn lint` | Run ESLint | `yarn lint` |

### 📊 **Database Commands**

| Command | Description | Usage |
|---------|-------------|-------|
| `yarn db:view` | View all events and statistics | `yarn db:view` |
| `yarn db:reset` | Clear all data (use with caution) | `yarn db:reset` |

### 🔍 **Quick Start Commands**

```bash
# 1. Setup environment
cp env.example .env

# 2. Setup ClickHouse cluster
yarn clickhouse:setup

# 3. Start monitoring
yarn data:ingestion

# 4. View data
yarn db:view

# 5. Start web interface
yarn dev
```

### 🏗️ **Cluster Management Commands**

```bash
# Start cluster
yarn cluster:start

# Check cluster status
yarn cluster:status

# View cluster logs
yarn cluster:logs

# Verify cluster health
yarn cluster:verify

# Stop cluster
yarn cluster:stop
```

### 📈 **Analytics Commands**

```bash
# View recent events
yarn db:view

# Check specific protocol
# (Use ClickHouse console for advanced queries)
```

### 🗄️ **Database Access Commands**

| Command | Description | Usage |
|---------|-------------|-------|
| `yarn db:view` | **Quick database viewer** - Shows events, stats, and analytics | `yarn db:view` |
| `yarn dev` | **Web interface** - Start Next.js dashboard at localhost:3000 | `yarn dev` |

### 🔍 **Advanced Database Access**

#### **ClickHouse Console Access**
```bash
# Connect to ClickHouse directly
docker exec -it clickhouse-single clickhouse-client

# Then run SQL queries:
SHOW TABLES;
SELECT count() FROM protocol_events;
SELECT * FROM protocol_events ORDER BY timestamp DESC LIMIT 10;
SELECT protocol, count() as event_count FROM protocol_events GROUP BY protocol;
EXIT;
```

#### **HTTP API Access**
```bash
# Test connection
curl http://localhost:8123

# Run queries via HTTP
curl -X POST 'http://localhost:8123' -d 'SELECT count() FROM protocol_events'
curl -X POST 'http://localhost:8123' -d 'SELECT * FROM protocol_events LIMIT 5'
```

#### **Database Viewing Options**

**1. Quick Overview (Recommended)**
```bash
yarn db:view
```

**2. Web Dashboard**
```bash
yarn dev
# Open http://localhost:3000 in your browser
```

**3. Direct SQL Access**
```bash
docker exec -it clickhouse-single clickhouse-client
```

**4. HTTP API Queries**
```bash
curl -X POST 'http://localhost:8123' -d 'YOUR_SQL_QUERY'
```

### 📊 **What You'll See When Viewing the Database**

When you run `yarn db:view`, you'll see output like this:

```
📊 ClickHouse Database Viewer

✅ Connected to ClickHouse

📋 Tables in database:
=====================
  - protocol_events

📊 Event Statistics:
===================
Total events: 100

🕒 Recent Events (last 10):
==========================
  1. uniswap-v2 swap
     Pool: 0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852
     Tokens: WETH/USDT
     Block: 23581685 | Time: 2025-10-15 07:45:54

  2. uniswap-v2 sync
     Pool: 0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc
     Tokens: USDC/WETH
     Block: 23581685 | Time: 2025-10-15 07:45:54

📈 Event Statistics by Protocol:
================================
  uniswap-v2 sync: 59 events
  uniswap-v2 swap: 41 events

📊 Real-time Analytics:
======================
  uniswap-v2 swap at 2025-10-15 07:00:00:
    Events: 41, Pools: 3, Transactions: 40
  uniswap-v2 sync at 2025-10-15 07:00:00:
    Events: 59, Pools: 3, Transactions: 56

✅ Database view completed
```

### 🎯 **Quick Database Viewing Guide**

```bash
# 1. View database overview
yarn db:view

# 2. Start web dashboard
yarn dev
# Then open http://localhost:3000

# 3. Direct SQL access
docker exec -it clickhouse-single clickhouse-client

# 4. Test connection
curl http://localhost:8123
```

---

## 📊 Data Schema

### 🎯 **Supported Events**

#### **Uniswap V2 & PancakeSwap V2**
- `Swap`: Token swaps in liquidity pools
- `Mint`: Liquidity provision events
- `Burn`: Liquidity removal events  
- `Sync`: Reserve updates
- `PairCreated`: New pair creation (factory events)

#### **Uniswap V3**
- `Swap`: Token swaps with concentrated liquidity
- `Mint`: Liquidity provision in price ranges
- `Burn`: Liquidity removal from price ranges
- `Initialize`: Pool initialization with starting price
- `PoolCreated`: New pool creation (factory events)

### 📋 **Standardized Event Schema**

All events are normalized to this structure:

```typescript
interface StandardizedEvent {
  // Core identification
  id: string;                    // Unique event identifier
  protocol: ProtocolType;         // 'uniswap-v2' | 'uniswap-v3' | 'pancakeswap-v2'
  version: string;               // Protocol version
  eventType: EventType;          // 'swap' | 'mint' | 'burn' | 'sync' | 'initialize'
  timestamp: number;             // Unix timestamp
  blockNumber: number;           // Blockchain block number
  transactionHash: string;       // Transaction hash
  logIndex: number;              // Log index in transaction
  
  // Pool/Pair information
  poolAddress: string;           // Pool/pair contract address
  token0: TokenInfo;             // First token information
  token1: TokenInfo;             // Second token information
  
  // Event-specific data
  data: SwapEventData | LiquidityEventData | SyncEventData | InitializeEventData;
  
  // Additional metadata
  gasUsed?: string;
  gasPrice?: string;
  fee?: string;
}

interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
}
```

### 🗄️ **ClickHouse Table Schema**

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
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(timestamp / 1000))
ORDER BY (protocol, event_type, block_number, transaction_hash, log_index)
```

---

## 🔍 Monitoring & Analytics

### 📊 **Real-time Monitoring**

The system provides comprehensive monitoring:

- **📈 Event Statistics**: Real-time event counts and protocol breakdown
- **🔍 Pool Discovery**: Automatic detection of new pools and markets
- **📊 Data Consistency**: Replication status and data integrity checks
- **⚡ Performance Metrics**: Event processing rates and system health

### 📈 **Analytics Features**

- **📊 Materialized Views**: Pre-computed analytics for fast queries
- **🔍 Advanced Filtering**: Filter by protocol, event type, time range
- **📈 Real-time Dashboards**: Live event monitoring and statistics
- **🗄️ Data Export**: Export data for external analysis

### 🎯 **ClickHouse Integration**

- **🏗️ Local Cluster**: 3-replica cluster with ClickHouse Keeper for coordination
- **☁️ Cloud Scalability**: Handles high-volume event processing
- **📊 Real-time Analytics**: Materialized views for instant insights
- **🔍 Advanced Querying**: SQL-based analytics and reporting
- **📈 Data Visualization**: Built-in dashboard and monitoring tools
- **🔄 Data Replication**: Automatic replication across cluster nodes

## 📁 Project Structure

```
protocol-adapters/
├── 📁 src/
│   ├── 📁 core/
│   │   ├── EventListener.ts          # Main event listening engine
│   │   ├── ClickHouseService.ts      # ClickHouse database operations
│   │   └── DataIngestionService.ts  # Data ingestion orchestration
│   ├── 📁 types/
│   │   ├── schemas.ts                # Standardized event schemas
│   │   └── contracts.ts              # Contract addresses and ABIs
│   ├── 📁 app/
│   │   ├── protocol-listener.ts     # Application wrapper
│   │   └── page.tsx                  # Next.js UI for event display
│   └── 📁 scripts/
│       ├── run-data-ingestion.ts     # Main data ingestion script
│       ├── view-database.ts          # Database viewer script
│       ├── reset-database.ts         # Database reset script
│       ├── setup-clickhouse-cluster.ts # ClickHouse cluster setup script
│       └── verify-cluster.ts         # Cluster verification script
├── 📄 package.json                   # Dependencies and scripts
├── 📄 env.example                    # Environment variables template
├── 📄 README.md                      # This documentation
├── 📄 docker-compose.cluster.yml     # ClickHouse cluster configuration
├── 📄 CLUSTER_SETUP.md              # ClickHouse cluster setup guide
└── 📁 clickhouse-configs/            # ClickHouse configuration files
```

### 🏗️ **Architecture Components**

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| **EventListener** | Core event processing | Multi-protocol support, real-time listening |
| **ClickHouseService** | Database operations | Cloud integration, BigInt handling |
| **DataIngestionService** | Data orchestration | Event buffering, batch processing |
| **Protocol Adapters** | Protocol-specific logic | Uniswap V2/V3, PancakeSwap V2 |
| **UI Components** | Event visualization | Real-time display, statistics |

---

## 🛠️ Troubleshooting

### 🔧 **Common Issues**

#### **ClickHouse Connection Issues**
```bash
# Check if ClickHouse is running
docker ps | grep clickhouse

# Check ClickHouse logs
docker logs clickhouse-single

# Restart ClickHouse
docker restart clickhouse-single
```

#### **Authentication Errors**
```bash
# Ensure .env file has correct settings
cat .env

# Restart ClickHouse with proper environment
docker stop clickhouse-single
docker rm clickhouse-single
docker run -d --name clickhouse-single -p 8123:8123 -p 9000:9000 -e CLICKHOUSE_USER=default -e CLICKHOUSE_PASSWORD= clickhouse/clickhouse-server:latest
```

#### **Cluster Issues**
```bash
# Check cluster status
yarn cluster:status

# View cluster logs
yarn cluster:logs

# Restart cluster
yarn cluster:stop
yarn cluster:start
```

### 🏗️ **Cluster Management**

#### **Starting the Cluster**
```bash
# Start the full cluster
yarn clickhouse:setup

# Or start manually
yarn cluster:start
```

#### **Verifying Cluster Health**
```bash
# Check cluster status
yarn cluster:status

# Verify replication
yarn cluster:verify

# View cluster logs
yarn cluster:logs
```

#### **Stopping the Cluster**
```bash
# Stop cluster
yarn cluster:stop

# Stop and remove volumes
docker-compose -f docker-compose.cluster.yml down -v
```

### 🔍 **Debugging Commands**

```bash
# Test ClickHouse connection
curl http://localhost:8123

# View database contents
yarn db:view

# Check environment variables
cat .env

# View application logs
yarn data:ingestion
```

---
