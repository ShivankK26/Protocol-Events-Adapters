# ClickHouse Cloud Setup Guide

## 🚀 Quick Setup with ClickHouse Cloud

### 1. Create ClickHouse Cloud Account
1. Go to [console.clickhouse.cloud](https://console.clickhouse.cloud)
2. Sign up for a free account
3. Create a new service (you get 30 days free trial)

### 2. Get Connection Details
From your ClickHouse Cloud console:
1. Go to your service
2. Click on "Connect" 
3. Copy the connection details:
   - **Host**: `your-service.clickhouse.cloud`
   - **Port**: `8443` (HTTPS) or `9440` (Native)
   - **Username**: `default`
   - **Password**: `your-password`
   - **Database**: `default`

### 3. Update Environment Variables
Create/update your `.env` file:

```env
# ClickHouse Cloud Configuration
CLICKHOUSE_HOST=your-service.clickhouse.cloud
CLICKHOUSE_PORT=8443
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=your-password
CLICKHOUSE_DATABASE=default
CLICKHOUSE_SECURE=true

# Blockchain RPC URLs
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ETHEREUM_WS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSC_WS_URL=wss://bsc-ws-node.nariox.org:443/ws
```

### 4. Run the Setup
```bash
# Install dependencies
yarn install

# Set up schema in ClickHouse Cloud
yarn clickhouse:cloud-setup

# Start data ingestion
yarn data:ingestion
```

## ✅ Benefits of ClickHouse Cloud
- **No local setup required**
- **Managed infrastructure**
- **Automatic scaling**
- **Built-in monitoring**
- **Free tier available**
- **High availability**

## 🔧 Cloud-Specific Configuration

The system will automatically detect cloud configuration and:
- Use HTTPS connection
- Skip local cluster setup
- Connect directly to your cloud service
- Set up schema automatically
