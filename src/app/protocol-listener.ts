import { ProtocolEventListener, EventListenerConfig } from '../core/EventListener';
import { StandardizedEvent, FactoryEvent, PoolInfo } from '../types/schemas';

/**
 * Main application class for the Protocol Event Listener System
 * This demonstrates how to use the event listener for real-time blockchain event tracking
 */
export class ProtocolListenerApp {
  private eventListener: ProtocolEventListener;
  private isRunning = false;

  constructor(config: EventListenerConfig) {
    this.eventListener = new ProtocolEventListener(config);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle standardized events from all protocols
    this.eventListener.on('standardizedEvent', (event: StandardizedEvent) => {
      this.handleStandardizedEvent(event);
    });

    // Handle factory events (new pool/pair creation)
    this.eventListener.on('factoryEvent', (event: FactoryEvent) => {
      this.handleFactoryEvent(event);
    });

    // Handle errors
    this.eventListener.on('error', (error: Error) => {
      console.error('Event listener error:', error);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Protocol listener app is already running');
      return;
    }

    try {
      console.log('Starting Protocol Event Listener System...');
      await this.eventListener.start();
      this.isRunning = true;
      console.log('✅ Protocol Event Listener System started successfully');
      console.log('🔍 Listening for events from:', this.eventListener['config'].protocols);
    } catch (error) {
      console.error('Failed to start protocol listener:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      console.log('Stopping Protocol Event Listener System...');
      await this.eventListener.stop();
      this.isRunning = false;
      console.log('✅ Protocol Event Listener System stopped');
    } catch (error) {
      console.error('Error stopping protocol listener:', error);
    }
  }

  private handleStandardizedEvent(event: StandardizedEvent): void {
    console.log('\n📊 Standardized Event Received:');
    console.log(`  Protocol: ${event.protocol} ${event.version}`);
    console.log(`  Event Type: ${event.eventType}`);
    console.log(`  Pool: ${event.poolAddress}`);
    console.log(`  Tokens: ${event.token0.symbol}/${event.token1.symbol}`);
    console.log(`  Block: ${event.blockNumber}`);
    console.log(`  TX: ${event.transactionHash}`);
    
    // Log event-specific data
    this.logEventData(event);
    
    // Here you would typically:
    // 1. Store the event in a database
    // 2. Send to a message queue
    // 3. Update real-time dashboards
    // 4. Trigger alerts or notifications
  }

  private logEventData(event: StandardizedEvent): void {
    switch (event.data.type) {
      case 'swap':
        console.log(`  💱 Swap: ${event.data.amount0In} ${event.token0.symbol} → ${event.data.amount1Out} ${event.token1.symbol}`);
        break;
      case 'mint':
        console.log(`  ➕ Liquidity Added: ${event.data.amount0} ${event.token0.symbol} + ${event.data.amount1} ${event.token1.symbol}`);
        break;
      case 'burn':
        console.log(`  ➖ Liquidity Removed: ${event.data.amount0} ${event.token0.symbol} + ${event.data.amount1} ${event.token1.symbol}`);
        break;
      case 'sync':
        console.log(`  🔄 Reserves Updated: ${event.data.reserve0} ${event.token0.symbol} / ${event.data.reserve1} ${event.token1.symbol}`);
        break;
      case 'initialize':
        console.log(`  🚀 Pool Initialized: Price ${event.data.sqrtPriceX96}, Tick ${event.data.tick}`);
        break;
    }
  }

  private handleFactoryEvent(event: FactoryEvent): void {
    console.log('\n🏭 Factory Event - New Pool/Pair Created:');
    console.log(`  Protocol: ${event.protocol}`);
    console.log(`  Event Type: ${event.eventType}`);
    console.log(`  Tokens: ${event.token0} / ${event.token1}`);
    console.log(`  Pool Address: ${event.pairAddress}`);
    console.log(`  Block: ${event.blockNumber}`);
    console.log(`  TX: ${event.transactionHash}`);
    
    if (event.fee) {
      console.log(`  Fee Tier: ${event.fee / 10000}%`);
    }
    if (event.tickSpacing) {
      console.log(`  Tick Spacing: ${event.tickSpacing}`);
    }
    
    console.log('  ✅ Now listening to this new pool for events...');
  }

  getKnownPools(): PoolInfo[] {
    return this.eventListener.getKnownPools();
  }

  getPoolInfo(poolAddress: string): PoolInfo | undefined {
    return this.eventListener.getPoolInfo(poolAddress);
  }

  isListenerRunning(): boolean {
    return this.isRunning;
  }
}

// Example usage and configuration
export function createEthereumListener(): ProtocolListenerApp {
  const config: EventListenerConfig = {
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
    wsUrl: process.env.ETHEREUM_WS_URL || 'wss://eth-mainnet.g.alchemy.com/v2/demo',
    chainId: 1, // Ethereum Mainnet
    protocols: ['uniswap-v2', 'uniswap-v3'] // Listen to both Uniswap V2 and V3
  };

  return new ProtocolListenerApp(config);
}

export function createBSCListener(): ProtocolListenerApp {
  const config: EventListenerConfig = {
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
    wsUrl: process.env.BSC_WS_URL || 'wss://bsc-ws-node.nariox.org:443/ws',
    chainId: 56, // BSC Mainnet
    protocols: ['pancakeswap-v2']
  };

  return new ProtocolListenerApp(config);
}

// Example of how to run the listener
export async function runExample(): Promise<void> {
  console.log('🚀 Starting Protocol Event Listener Example...\n');
  
  // Create listeners for different chains
  const ethereumListener = createEthereumListener();
  const bscListener = createBSCListener();
  
  try {
    // Start Ethereum listener (Uniswap V2 & V3)
    console.log('Starting Ethereum listener (Uniswap V2 & V3)...');
    await ethereumListener.start();
    
    // Start BSC listener (PancakeSwap V2)
    console.log('Starting BSC listener (PancakeSwap V2)...');
    await bscListener.start();
    
    console.log('\n✅ All listeners started successfully!');
    console.log('📡 Listening for real-time blockchain events...');
    console.log('Press Ctrl+C to stop\n');
    
    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down listeners...');
      await ethereumListener.stop();
      await bscListener.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start listeners:', error);
    process.exit(1);
  }
}

// Export the main function for use in other files
export { runExample as startProtocolListener };
