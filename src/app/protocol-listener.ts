import { ProtocolEventListener, EventListenerConfig } from '../core/EventListener';
import { StandardizedEvent, FactoryEvent, PoolInfo } from '../types/schemas';

/**
 * Protocol Listener Application Class
 * 
 * This is the main application wrapper for the Protocol Event Listener System.
 * It provides a high-level interface for managing blockchain event listeners
 * and demonstrates best practices for real-time blockchain event tracking.
 * 
 * Core Features:
 * - Simplified API for starting/stopping blockchain listeners
 * - Built-in event handling with detailed logging
 * - Pool discovery and monitoring capabilities
 * - Error handling and recovery mechanisms
 * - Real-time event processing and analytics
 */
export class ProtocolListenerApp {
  private eventListener: ProtocolEventListener;  // Core blockchain event listener
  private isRunning = false;                     // Application state tracking

  /**
   * Constructor for ProtocolListenerApp
   * 
   * Initializes the application with blockchain network configuration and
   * sets up event handlers for processing incoming blockchain events.
   * 
   * @param config - Blockchain network configuration including RPC URLs, chain ID, and protocols
   */
  constructor(config: EventListenerConfig) {
    this.eventListener = new ProtocolEventListener(config);
    this.setupEventHandlers();
  }

  /**
   * Exposes the underlying event listener for custom handlers
   * 
   * Provides direct access to the core ProtocolEventListener for advanced
   * use cases that require custom event handling or monitoring.
   * 
   * @returns ProtocolEventListener - The core blockchain event listener instance
   */
  getEventListener(): ProtocolEventListener {
    return this.eventListener;
  }

  /**
   * Sets up event handlers for the blockchain event listener
   * 
   * Configures event handlers for all types of blockchain events:
   * - Standardized events: Trading activities (swaps, mints, burns)
   * - Factory events: New pool/pair creation events
   * - Error events: System errors and connection issues
   * 
   * This method establishes the event processing pipeline that handles
   * all incoming blockchain events must pass through.
   */
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

  /**
   * Starts the protocol event listener application
   * 
   * Initializes the blockchain event listener and begins monitoring
   * for real-time blockchain events. This method:
   * 1. Checks if the application is already running
   * 2. Starts the underlying ProtocolEventListener
   * 3. Updates the application state
   * 4. Provides startup confirmation and protocol information
   * 
   * @throws Error if the listener fails to start or is already running
   */
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

  /**
   * Stops the protocol event listener application
   * 
   * Gracefully shuts down the blockchain event listener and cleans up
   * resources. This method:
   * 1. Checks if the application is currently running
   * 2. Stops the underlying ProtocolEventListener
   * 3. Updates the application state
   * 4. Provides shutdown confirmation
   * 
   * This ensures proper resource cleanup and prevents memory leaks.
   */
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

  /**
   * Handles incoming standardized blockchain events
   * 
   * Processes standardized events from blockchain listeners and provides
   * comprehensive logging and event-specific data extraction. This method
   * demonstrates how to handle different types of blockchain events in a
   * production application.
   * 
   * Event Processing Pipeline:
   * 1. Logs basic event information (protocol, type, pool, tokens)
   * 2. Extracts event-specific data (amounts, prices, liquidity)
   * 3. Provides integration points for downstream processing
   * 
   * Integration Points:
   * - Database storage for event persistence
   * - Message queue integration for real-time processing
   * - Dashboard updates for monitoring systems
   * - Alert systems for significant events
   * 
   * @param event - The standardized blockchain event to process
   */
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

  /**
   * Logs event-specific data based on event type
   * 
   * Provides detailed logging for different types of blockchain events
   * with appropriate formatting and emojis for easy identification.
   * This method demonstrates how to extract and display meaningful
   * information from standardized blockchain events.
   * 
   * Supported Event Types:
   * - Swap: Token exchange events with input/output amounts
   * - Mint: Liquidity provision events with token amounts
   * - Burn: Liquidity removal events with token amounts
   * - Sync: Reserve update events with current reserves
   * - Initialize: Pool initialization events with price and tick data
   * 
   * @param event - The standardized event containing type-specific data
   */
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

  /**
   * Handles factory events (new pool/pair creation)
   * 
   * Processes factory events that indicate the creation of new trading
   * pools or pairs. These events are crucial for tracking protocol growth
   * and discovering new market opportunities.
   * 
   * Factory Event Information:
   * - Protocol and event type identification
   * - Token pair addresses and pool address
   * - Blockchain transaction and block details
   * - Protocol-specific metadata (fee tiers, tick spacing)
   * 
   * This method demonstrates how to handle the discovery of new trading
   * pairs and the automatic monitoring setup that follows.
   * 
   * @param event - The factory event containing pool creation information
   */
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

  /**
   * Gets all known pools currently being monitored
   * 
   * Returns an array of PoolInfo objects for all pools that the listener
   * is currently monitoring. This includes both dynamically discovered
   * pools and popular pools that were added at startup.
   * 
   * @returns Array of PoolInfo objects for all monitored pools
   */
  getKnownPools(): PoolInfo[] {
    return this.eventListener.getKnownPools();
  }

  /**
   * Gets information about a specific pool by its address
   * 
   * Returns the PoolInfo object for a specific pool if it's being monitored.
   * This is useful for checking if a pool is already being tracked or
   * getting detailed information about a specific pool.
   * 
   * @param poolAddress - The address of the pool to look up
   * @returns PoolInfo object if found, undefined otherwise
   */
  getPoolInfo(poolAddress: string): PoolInfo | undefined {
    return this.eventListener.getPoolInfo(poolAddress);
  }

  /**
   * Checks if the protocol listener application is currently running
   * 
   * @returns boolean - True if the application is running, false otherwise
   */
  isListenerRunning(): boolean {
    return this.isRunning;
  }
}

// ==================== FACTORY FUNCTIONS FOR BLOCKCHAIN NETWORKS ====================

/**
 * Creates a pre-configured Ethereum listener for Uniswap protocols
 * 
 * This factory function provides a ready-to-use Ethereum listener configured
 * for monitoring Uniswap V2 and V3 protocols. It uses Alchemy RPC endpoints
 * for reliable blockchain connectivity.
 * 
 * Supported Protocols:
 * - Uniswap V2: Classic AMM with constant product formula
 * - Uniswap V3: Concentrated liquidity AMM with multiple fee tiers
 * 
 * @returns ProtocolListenerApp - Configured Ethereum listener instance
 */
export function createEthereumListener(): ProtocolListenerApp {
  const config: EventListenerConfig = {
    // Use your Alchemy RPC endpoints
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/xNtVh1r2f3ZC8NrB2O1qX',
    wsUrl: 'wss://eth-mainnet.g.alchemy.com/v2/xNtVh1r2f3ZC8NrB2O1qX',
    chainId: 1, // Ethereum Mainnet
    protocols: ['uniswap-v2', 'uniswap-v3'] // Listen to both Uniswap V2 and V3
  };

  return new ProtocolListenerApp(config);
}

/**
 * Creates a pre-configured BSC listener for PancakeSwap protocol
 * 
 * This factory function provides a ready-to-use BSC listener configured
 * for monitoring PancakeSwap V2 protocol. It uses Alchemy RPC endpoints
 * for reliable blockchain connectivity.
 * 
 * Supported Protocols:
 * - PancakeSwap V2: BSC's leading DEX with AMM functionality
 * 
 * @returns ProtocolListenerApp - Configured BSC listener instance
 */
export function createBSCListener(): ProtocolListenerApp {
  const config: EventListenerConfig = {
    rpcUrl: 'https://bnb-mainnet.g.alchemy.com/v2/xNtVh1r2f3ZC8NrB2O1qX',
    wsUrl: 'wss://bnb-mainnet.g.alchemy.com/v2/xNtVh1r2f3ZC8NrB2O1qX',
    chainId: 56, // BSC Mainnet
    protocols: ['pancakeswap-v2']
  };

  return new ProtocolListenerApp(config);
}

/**
 * Creates an Ethereum listener with custom configuration
 * 
 * This factory function allows for custom configuration of the Ethereum listener
 * while providing sensible defaults. It's useful for testing with different
 * RPC endpoints or protocol combinations.
 * 
 * @param customConfig - Partial configuration object to override defaults
 * @returns ProtocolListenerApp - Configured Ethereum listener with custom settings
 */
export function createEthereumListenerWithConfig(customConfig: Partial<EventListenerConfig>): ProtocolListenerApp {
  const config: EventListenerConfig = {
    rpcUrl: customConfig.rpcUrl || 'https://eth-mainnet.g.alchemy.com/v2/xNtVh1r2f3ZC8NrB2O1qX',
    wsUrl: customConfig.wsUrl || 'wss://eth-mainnet.g.alchemy.com/v2/xNtVh1r2f3ZC8NrB2O1qX',
    chainId: customConfig.chainId || 1,
    protocols: customConfig.protocols || ['uniswap-v2', 'uniswap-v3']
  };

  return new ProtocolListenerApp(config);
}

/**
 * Creates a BSC listener with custom configuration
 * 
 * This factory function allows for custom configuration of the BSC listener
 * while providing sensible defaults. It's useful for testing with different
 * RPC endpoints or protocol combinations.
 * 
 * @param customConfig - Partial configuration object to override defaults
 * @returns ProtocolListenerApp - Configured BSC listener with custom settings
 */
export function createBSCListenerWithConfig(customConfig: Partial<EventListenerConfig>): ProtocolListenerApp {
  const config: EventListenerConfig = {
    rpcUrl: customConfig.rpcUrl || 'https://bnb-mainnet.g.alchemy.com/v2/xNtVh1r2f3ZC8NrB2O1qX',
    wsUrl: customConfig.wsUrl || 'wss://bnb-mainnet.g.alchemy.com/v2/xNtVh1r2f3ZC8NrB2O1qX',
    chainId: customConfig.chainId || 56,
    protocols: customConfig.protocols || ['pancakeswap-v2']
  };

  return new ProtocolListenerApp(config);
}

// ==================== EXAMPLE USAGE AND DEMONSTRATION ====================

/**
 * Example function demonstrating how to run the protocol event listener
 * 
 * This function shows how to set up and run multiple blockchain listeners
 * simultaneously. It demonstrates:
 * - Creating listeners for different blockchain networks
 * - Starting multiple listeners concurrently
 * - Graceful shutdown handling
 * - Error handling and recovery
 * 
 * This is a complete example that can be used as a starting point for
 * building real-time blockchain event monitoring applications.
 * 
 * @throws Error if listener initialization fails
 */
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
