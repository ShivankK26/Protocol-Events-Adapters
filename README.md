# 🚀 Protocol Event Adapters

> **A comprehensive blockchain event monitoring system that captures, standardizes, and stores protocol events in real-time using ClickHouse Cloud for analytics and data persistence.**

[![ClickHouse](https://img.shields.io/badge/ClickHouse-Cloud-blue)](https://clickhouse.cloud)
[![Ethereum](https://img.shields.io/badge/Ethereum-Mainnet-627EEA)](https://ethereum.org)
[![BSC](https://img.shields.io/badge/BSC-Mainnet-F0B90B)](https://bscscan.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org)

---

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
- **☁️ Cloud-Ready**: ClickHouse Cloud support for scalable data processing
- **📈 Real-time Analytics**: Materialized views for instant insights
- **🔍 Advanced Querying**: SQL-based analytics and reporting
- **📊 Data Visualization**: Built-in dashboard and monitoring tools

---

## 🏗️ Architecture

### 📊 System Overview
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Blockchain    │    │   Event Listener │    │   ClickHouse    │
│   Networks      │───▶│   & Processor    │───▶│     Cloud       │
│                 │    │                  │    │                 │
│ • Ethereum      │    │ • Multi-Protocol │    │ • Real-time     │
│ • BSC           │    │ • Standardization│    │ • Analytics     │
│ • WebSocket     │    │ • BigInt Handling│    │ • Materialized  │
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
- **ClickHouse Cloud** account
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

#### 3. **ClickHouse Cloud Setup**
```bash
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
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ETHEREUM_WS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# BSC Mainnet  
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSC_WS_URL=wss://bsc-ws-node.nariox.org:443/ws

# ===========================================
# CLICKHOUSE CLOUD CONFIGURATION
# ===========================================

CLICKHOUSE_HOST=abcdef.azure.clickhouse.cloud
CLICKHOUSE_PORT=8443
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=your_password_here
CLICKHOUSE_DATABASE=default
CLICKHOUSE_SECURE=true
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
| `yarn clickhouse:cloud-setup` | Initialize ClickHouse schema (one-time) | `yarn clickhouse:cloud-setup` |

### 🛠️ **Development Commands**

| Command | Description | Usage |
|---------|-------------|-------|
| `yarn dev` | Start Next.js development server | `yarn dev` |
| `yarn build` | Build the application | `yarn build` |
| `yarn test:integration` | Run integration tests | `yarn test:integration` |

### 📊 **Database Commands**

| Command | Description | Usage |
|---------|-------------|-------|
| `yarn db:view` | View all events and statistics | `yarn db:view` |
| `yarn db:reset` | Clear all data (use with caution) | `yarn db:reset` |
| `yarn clickhouse:cloud-setup` | Setup database schema | `yarn clickhouse:cloud-setup` |

### 🔍 **Monitoring Commands**

```bash
# Start real-time monitoring
yarn data:ingestion

# Check database status
yarn db:view

# Reset database (if needed)
yarn db:reset

# Setup database (one-time)
yarn clickhouse:cloud-setup
```

### 📈 **Analytics Commands**

```bash
# View recent events
yarn db:view

# Check specific protocol
# (Use ClickHouse console for advanced queries)
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

### 🎯 **ClickHouse Cloud Integration**

- **☁️ Cloud Scalability**: Handles high-volume event processing
- **📊 Real-time Analytics**: Materialized views for instant insights
- **🔍 Advanced Querying**: SQL-based analytics and reporting
- **📈 Data Visualization**: Built-in dashboard and monitoring tools

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
│       └── setup-clickhouse-cloud.ts # ClickHouse setup script
├── 📄 package.json                   # Dependencies and scripts
├── 📄 env.example                    # Environment variables template
├── 📄 README.md                      # This documentation
└── 📄 clickhouse-cloud-setup.md     # ClickHouse Cloud setup guide
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
