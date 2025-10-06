# Protocol Event Adapters

A dynamic protocol-level event listener system that detects, processes, and standardizes blockchain protocol events in real time.

## 🚀 Features

- **Real-time Event Listening**: WebSocket-based event listening for instant blockchain event detection
- **Dynamic Market Discovery**: Automatically detects new pools/markets and starts tracking them
- **Multi-Protocol Support**: 
  - Uniswap V2 (Ethereum)
  - Uniswap V3 (Ethereum) 
  - PancakeSwap V2 (BSC)
- **Standardized Schema**: Unified data structure across all protocols
- **Event Normalization**: Converts protocol-specific events to standard format

## 📋 Supported Events

### Uniswap V2 & PancakeSwap V2
- `Swap`: Token swaps in liquidity pools
- `Mint`: Liquidity provision events
- `Burn`: Liquidity removal events  
- `Sync`: Reserve updates
- `PairCreated`: New pair creation (factory events)

### Uniswap V3
- `Swap`: Token swaps with concentrated liquidity
- `Mint`: Liquidity provision in price ranges
- `Burn`: Liquidity removal from price ranges
- `Initialize`: Pool initialization with starting price
- `PoolCreated`: New pool creation (factory events)

## 🛠️ Installation

1. **Clone and install dependencies:**
```bash
cd protocol-adapters
npm install
```

2. **Set up environment variables:**
```bash
cp env.example .env
# Edit .env with your RPC endpoints
```

3. **Install dependencies:**
```bash
npm install
```

## 🚀 Usage

### Quick Start

**Run Ethereum listener (Uniswap V2 & V3):**
```bash
npm run listener:ethereum
```

**Run BSC listener (PancakeSwap V2):**
```bash
npm run listener:bsc
```

**Run all listeners:**
```bash
npm run listener:all
```

### Programmatic Usage

```typescript
import { ProtocolListenerApp, createEthereumListener } from './src/app/protocol-listener';

// Create a listener
const listener = createEthereumListener();

// Start listening
await listener.start();

// Handle events
listener.on('standardizedEvent', (event) => {
  console.log('New event:', event);
});

// Stop listening
await listener.stop();
```

## 📊 Standardized Event Schema

All events are normalized to this structure:

```typescript
interface StandardizedEvent {
  id: string;                    // Unique event identifier
  protocol: ProtocolType;         // 'uniswap-v2' | 'uniswap-v3' | 'pancakeswap-v2'
  version: string;               // Protocol version
  eventType: EventType;          // 'swap' | 'mint' | 'burn' | 'sync' | 'initialize'
  timestamp: number;             // Unix timestamp
  blockNumber: number;           // Blockchain block number
  transactionHash: string;       // Transaction hash
  logIndex: number;              // Log index in transaction
  poolAddress: string;           // Pool/pair contract address
  token0: TokenInfo;             // First token information
  token1: TokenInfo;             // Second token information
  data: EventData;               // Event-specific data
}
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file with your RPC endpoints:

```env
# Ethereum Mainnet
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ETHEREUM_WS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# BSC Mainnet
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSC_WS_URL=wss://bsc-ws-node.nariox.org:443/ws
```

### Custom Configuration

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

## 🏗️ Architecture

### Core Components

1. **EventListener**: Main event listening engine
2. **Protocol Adapters**: Protocol-specific event handling
3. **Event Normalization**: Standardizes events across protocols
4. **Dynamic Discovery**: Automatically detects new pools/markets

### Event Flow

```
Factory Contract → New Pool Created → Start Pool Listening → Pool Events → Standardized Events
```

### Supported Protocols

| Protocol | Chain | Factory Events | Pool Events |
|----------|-------|----------------|-------------|
| Uniswap V2 | Ethereum | PairCreated | Swap, Mint, Burn, Sync |
| Uniswap V3 | Ethereum | PoolCreated | Swap, Mint, Burn, Initialize |
| PancakeSwap V2 | BSC | PairCreated | Swap, Mint, Burn, Sync |

## 📈 Example Output

```
📊 Standardized Event Received:
  Protocol: uniswap-v3 v3
  Event Type: swap
  Pool: 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640
  Tokens: USDC/WETH
  Block: 18500000
  TX: 0x1234...
  💱 Swap: 1000000 USDC → 0.5 WETH

🏭 Factory Event - New Pool Created:
  Protocol: uniswap-v3
  Event Type: pool_created
  Tokens: 0xA0b86a33E6... / 0xC02aaA39b2...
  Pool Address: 0x1234...
  Fee Tier: 0.3%
  ✅ Now listening to this new pool for events...
```

## 🔍 Monitoring

The system provides real-time monitoring of:

- **New Pool Discovery**: Automatically detects and starts tracking new pools
- **Event Processing**: Real-time event capture and normalization
- **Protocol Coverage**: Multi-protocol event aggregation
- **Data Standardization**: Unified event schema across protocols

## 🚨 Error Handling

The system includes robust error handling for:

- **Connection Issues**: Automatic reconnection to RPC providers
- **Event Decoding**: Graceful handling of malformed events
- **Rate Limiting**: Built-in rate limiting protection
- **Chain Reorganizations**: Handles blockchain reorganizations

## 🔧 Development

### Project Structure

```
src/
├── core/
│   └── EventListener.ts          # Main event listening engine
├── types/
│   ├── schemas.ts                # Standardized event schemas
│   └── contracts.ts              # Contract addresses and ABIs
├── app/
│   └── protocol-listener.ts      # Application wrapper
└── scripts/
    └── run-listener.ts           # CLI runner
```

### Adding New Protocols

1. Add protocol configuration to `contracts.ts`
2. Implement protocol-specific event handlers
3. Update standardized schema if needed
4. Add to supported protocols list

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Check the documentation
- Review example configurations

---

**Note**: This system is designed for real-time blockchain event monitoring. For production use, consider using reliable RPC providers and implementing proper error handling and monitoring.