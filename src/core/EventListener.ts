import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { StandardizedEvent, PoolInfo, FactoryEvent, ProtocolType, TokenInfo } from '../types/schemas';
import { 
  CONTRACT_ADDRESSES, 
  UNISWAP_V2_FACTORY_ABI, 
  UNISWAP_V2_PAIR_ABI,
  UNISWAP_V3_FACTORY_ABI, 
  UNISWAP_V3_POOL_ABI,
  PANCAKESWAP_V2_FACTORY_ABI,
  PANCAKESWAP_V2_PAIR_ABI
} from '../types/contracts';

/**
 * Configuration interface for the Protocol Event Listener
 * Defines the blockchain connection parameters and supported protocols
 */
export interface EventListenerConfig {
  rpcUrl: string;           // HTTP RPC endpoint for blockchain queries
  wsUrl?: string;           // WebSocket endpoint for real-time event listening
  chainId: number;          // Blockchain network ID (1 for Ethereum, 56 for BSC)
  protocols: ProtocolType[]; // Array of protocols to monitor (uniswap-v2, uniswap-v3, pancakeswap-v2)
}

/**
 * Main Protocol Event Listener Class
 * 
 * This is the core component that:
 * - Listens to blockchain events in real-time using WebSocket connections
 * - Standardizes events from different protocols into a unified format
 * - Dynamically discovers new pools/pairs through factory contract events
 * - Manages token information caching for performance
 * - Emits standardized events for downstream processing
 * 
 * Architecture:
 * - Uses EventEmitter pattern for loose coupling
 * - Supports multiple protocols simultaneously (Uniswap V2/V3, PancakeSwap V2)
 * - Implements fallback mechanisms for token information retrieval
 * - Handles both HTTP and WebSocket connections for reliability
 */
export class ProtocolEventListener extends EventEmitter {
  private provider: ethers.JsonRpcProvider;                    // HTTP provider for blockchain queries
  private wsProvider?: ethers.WebSocketProvider;              // WebSocket provider for real-time events
  private factoryListeners: Map<string, ethers.Contract> = new Map();  // Factory contract listeners
  private poolListeners: Map<string, ethers.Contract> = new Map();     // Individual pool contract listeners
  private knownPools: Map<string, PoolInfo> = new Map();       // Cache of discovered pools
  private tokenCache: Map<string, TokenInfo> = new Map();     // Cache of token information
  private isListening = false;                                // State tracking for listener status

  /**
   * Constructor for ProtocolEventListener
   * 
   * Initializes the listener with blockchain connection configuration
   * Sets up both HTTP and WebSocket providers for maximum reliability
   * 
   * @param config - Configuration object containing RPC URLs, chain ID, and protocols
   */
  constructor(private config: EventListenerConfig) {
    super();
    // Initialize HTTP provider for general blockchain queries
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    // Initialize WebSocket provider for real-time event listening (if available)
    if (config.wsUrl) {
      this.wsProvider = new ethers.WebSocketProvider(config.wsUrl);
    }
  }

  /**
   * Starts the protocol event listener
   * 
   * This is the main entry point that:
   * 1. Initializes factory contract listeners for dynamic pool discovery
   * 2. Sets up popular existing pools for immediate event monitoring
   * 3. Begins real-time event listening across all configured protocols
   * 
   * The listener will automatically:
   * - Detect new pools/pairs created through factory contracts
   * - Start monitoring newly discovered pools
   * - Emit standardized events for downstream processing
   * 
   * @throws Error if listener is already running
   */
  async start(): Promise<void> {
    if (this.isListening) {
      throw new Error('Listener is already running');
    }

    console.log('Starting protocol event listener...');
    
    // Initialize factory listeners for each protocol
    await this.initializeFactoryListeners();
    
    // Start listening to factory events for dynamic pool discovery
    await this.startFactoryEventListening();
    
    this.isListening = true;
    console.log('Protocol event listener started successfully');
  }

  /**
   * Stops the protocol event listener and cleans up resources
   * 
   * Performs graceful shutdown by:
   * 1. Removing all event listeners from factory and pool contracts
   * 2. Clearing internal maps and caches
   * 3. Destroying WebSocket connections
   * 4. Resetting the listening state
   * 
   * This ensures no memory leaks and proper resource cleanup
   */
  async stop(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    console.log('Stopping protocol event listener...');
    
    // Remove all listeners from factory contracts
    this.factoryListeners.forEach(contract => {
      contract.removeAllListeners();
    });
    
    // Remove all listeners from pool contracts
    this.poolListeners.forEach(contract => {
      contract.removeAllListeners();
    });
    
    // Clear all internal maps
    this.factoryListeners.clear();
    this.poolListeners.clear();
    
    // Destroy WebSocket connection if it exists
    if (this.wsProvider) {
      this.wsProvider.destroy();
    }
    
    this.isListening = false;
    console.log('Protocol event listener stopped');
  }

  /**
   * Initializes factory contract listeners for dynamic pool discovery
   * 
   * This method sets up listeners on factory contracts for each configured protocol.
   * Factory contracts emit events when new pools/pairs are created, allowing us to
   * automatically discover and start monitoring new trading pairs.
   * 
   * Process:
   * 1. Gets the chain-specific configuration (Ethereum vs BSC)
   * 2. Iterates through each configured protocol
   * 3. Sets up factory contract listeners for pool/pair creation events
   * 4. Handles errors gracefully for unsupported protocols
   */
  private async initializeFactoryListeners(): Promise<void> {
    const chainConfig = this.getChainConfig();
    
    for (const protocol of this.config.protocols) {
      const protocolConfig = (chainConfig as any)[protocol];
      if (!protocolConfig) {
        console.warn(`Protocol ${protocol} not supported on chain ${this.config.chainId}`);
        continue;
      }

      try {
        await this.setupFactoryListener(protocol, protocolConfig.factory);
      } catch (error) {
        console.error(`Failed to setup factory listener for ${protocol}:`, error);
      }
    }
  }

  /**
   * Sets up a factory contract listener for a specific protocol
   * 
   * Creates a contract instance and sets up event listeners for pool/pair creation events.
   * Different protocols have different event names and parameters:
   * - Uniswap V2/PancakeSwap V2: 'PairCreated' event
   * - Uniswap V3: 'PoolCreated' event (includes fee and tick spacing)
   * 
   * @param protocol - The protocol type (uniswap-v2, uniswap-v3, pancakeswap-v2)
   * @param factoryAddress - The factory contract address for the protocol
   */
  private async setupFactoryListener(protocol: ProtocolType, factoryAddress: string): Promise<void> {
    const provider = this.wsProvider || this.provider;
    const abi = this.getFactoryABI(protocol);
    
    const factoryContract = new ethers.Contract(factoryAddress, abi, provider);
    
    // Listen for new pair/pool creation events based on protocol type
    if (protocol === 'uniswap-v2' || protocol === 'pancakeswap-v2') {
      // V2 protocols use 'PairCreated' event
      factoryContract.on('PairCreated', async (token0, token1, pairAddress, event) => {
        await this.handlePairCreated(protocol, token0, token1, pairAddress, event);
      });
    } else if (protocol === 'uniswap-v3') {
      // V3 protocols use 'PoolCreated' event with additional parameters
      factoryContract.on('PoolCreated', async (token0, token1, fee, tickSpacing, poolAddress, event) => {
        await this.handlePoolCreated(protocol, token0, token1, fee, tickSpacing, poolAddress, event);
      });
    }
    
    this.factoryListeners.set(protocol, factoryContract);
    console.log(`Factory listener setup for ${protocol} at ${factoryAddress}`);
  }

  /**
   * Handles PairCreated events from V2 protocols (Uniswap V2, PancakeSwap V2)
   * 
   * When a new trading pair is created on V2 protocols, this method:
   * 1. Extracts event metadata (transaction hash, block number)
   * 2. Creates a standardized FactoryEvent object
   * 3. Emits the factory event for downstream processing
   * 4. Automatically starts listening to the new pair for trading events
   * 
   * @param protocol - The protocol that created the pair
   * @param token0 - Address of the first token in the pair
   * @param token1 - Address of the second token in the pair
   * @param pairAddress - Address of the newly created pair contract
   * @param event - The raw blockchain event object
   */
  private async handlePairCreated(
    protocol: ProtocolType,
    token0: string,
    token1: string,
    pairAddress: string,
    event: any
  ): Promise<void> {
    console.log(`New pair created: ${protocol} - ${pairAddress}`);
    
    // Extract event data with fallback handling for different event structures
    const txHash = event.transactionHash || event.hash || `tx-${Date.now()}`;
    const blockNumber = event.blockNumber || event.block || 0;
    
    const factoryEvent: FactoryEvent = {
      protocol,
      eventType: 'pair_created',
      token0,
      token1,
      pairAddress,
      blockNumber: blockNumber,
      transactionHash: txHash
    };

    // Emit the factory event for downstream processing
    this.emit('factoryEvent', factoryEvent);
    
    // Automatically start listening to this new pair for trading events
    await this.startPoolListening(protocol, pairAddress, token0, token1);
  }

  /**
   * Handles PoolCreated events from V3 protocols (Uniswap V3)
   * 
   * When a new trading pool is created on V3 protocols, this method:
   * 1. Extracts event metadata including fee and tick spacing
   * 2. Creates a standardized FactoryEvent object with V3-specific data
   * 3. Emits the factory event for downstream processing
   * 4. Automatically starts listening to the new pool for trading events
   * 
   * V3 pools have additional parameters compared to V2 pairs:
   * - fee: The trading fee tier (0.05%, 0.3%, 1%)
   * - tickSpacing: The minimum tick spacing for liquidity positions
   * 
   * @param protocol - The protocol that created the pool (uniswap-v3)
   * @param token0 - Address of the first token in the pool
   * @param token1 - Address of the second token in the pool
   * @param fee - The fee tier for the pool (in basis points)
   * @param tickSpacing - The tick spacing for the pool
   * @param poolAddress - Address of the newly created pool contract
   * @param event - The raw blockchain event object
   */
  private async handlePoolCreated(
    protocol: ProtocolType,
    token0: string,
    token1: string,
    fee: number,
    tickSpacing: number,
    poolAddress: string,
    event: any
  ): Promise<void> {
    console.log(`New pool created: ${protocol} - ${poolAddress}`);
    
    // Extract event data with fallback handling for different event structures
    const txHash = event.transactionHash || event.hash || `tx-${Date.now()}`;
    const blockNumber = event.blockNumber || event.block || 0;
    
    const factoryEvent: FactoryEvent = {
      protocol,
      eventType: 'pool_created',
      token0,
      token1,
      pairAddress: poolAddress,
      fee,
      tickSpacing,
      blockNumber: blockNumber,
      transactionHash: txHash
    };

    // Emit the factory event for downstream processing
    this.emit('factoryEvent', factoryEvent);
    
    // Automatically start listening to this new pool for trading events
    await this.startPoolListening(protocol, poolAddress, token0, token1, fee, tickSpacing);
  }

  /**
   * Starts listening to a specific pool/pair for trading events
   * 
   * This is the core method that sets up real-time event monitoring for individual pools.
   * It performs the following operations:
   * 1. Checks if already listening to avoid duplicates
   * 2. Creates a contract instance for the pool
   * 3. Retrieves token information (symbol, decimals, name)
   * 4. Stores pool metadata in the knownPools cache
   * 5. Sets up event listeners for all trading events (Swap, Mint, Burn, etc.)
   * 
   * @param protocol - The protocol type (uniswap-v2, uniswap-v3, pancakeswap-v2)
   * @param poolAddress - The address of the pool/pair contract
   * @param token0 - Address of the first token
   * @param token1 - Address of the second token
   * @param fee - Fee tier for V3 pools (optional)
   * @param tickSpacing - Tick spacing for V3 pools (optional)
   */
  private async startPoolListening(
    protocol: ProtocolType,
    poolAddress: string,
    token0: string,
    token1: string,
    fee?: number,
    tickSpacing?: number
  ): Promise<void> {
    // Prevent duplicate listeners for the same pool
    if (this.poolListeners.has(poolAddress)) {
      console.log(`Already listening to pool ${poolAddress}`);
      return;
    }

    try {
      const provider = this.wsProvider || this.provider;
      const abi = this.getPoolABI(protocol);
      
      const poolContract = new ethers.Contract(poolAddress, abi, provider);
      
      // Get token information for both tokens
      const token0Info = await this.getTokenInfo(token0);
      const token1Info = await this.getTokenInfo(token1);
      
      // Store comprehensive pool information
      const poolInfo: PoolInfo = {
        address: poolAddress,
        protocol,
        version: protocol.includes('v2') ? 'v2' : 'v3',
        token0: token0Info,
        token1: token1Info,
        fee,
        tickSpacing,
        createdAt: Date.now(),
        isActive: true
      };
      
      this.knownPools.set(poolAddress, poolInfo);
      
      // Set up event listeners for all trading events on this pool
      this.setupPoolEventListeners(poolContract, poolInfo);
      
      this.poolListeners.set(poolAddress, poolContract);
      
      console.log(`Started listening to pool ${poolAddress} (${protocol})`);
      
    } catch (error) {
      console.error(`Failed to start listening to pool ${poolAddress}:`, error);
    }
  }

  /**
   * Sets up event listeners for a specific pool contract
   * 
   * This method configures all the event listeners for trading activities on a pool.
   * Different protocols have different event structures:
   * 
   * V2 Protocols (Uniswap V2, PancakeSwap V2):
   * - Swap: Token swaps with input/output amounts
   * - Mint: Liquidity provision events
   * - Burn: Liquidity removal events
   * - Sync: Reserve updates
   * 
   * V3 Protocols (Uniswap V3):
   * - Initialize: Pool initialization with starting price
   * - Swap: Token swaps with concentrated liquidity data
   * - Mint: Liquidity provision in price ranges
   * - Burn: Liquidity removal from price ranges
   * 
   * @param contract - The ethers contract instance for the pool
   * @param poolInfo - Pool metadata including protocol and token information
   */
  private setupPoolEventListeners(contract: ethers.Contract, poolInfo: PoolInfo): void {
    const protocol = poolInfo.protocol;
    
    if (protocol === 'uniswap-v2' || protocol === 'pancakeswap-v2') {
      // V2 protocol events - simpler structure with basic swap/liquidity events
      contract.on('Swap', async (sender, amount0In, amount1In, amount0Out, amount1Out, to, event) => {
        await this.handleSwapEvent(poolInfo, sender, amount0In, amount1In, amount0Out, amount1Out, to, event);
      });
      
      contract.on('Mint', async (sender, amount0, amount1, event) => {
        await this.handleMintEvent(poolInfo, sender, amount0, amount1, event);
      });
      
      contract.on('Burn', async (sender, amount0, amount1, to, event) => {
        await this.handleBurnEvent(poolInfo, sender, amount0, amount1, to, event);
      });
      
      contract.on('Sync', async (reserve0, reserve1, event) => {
        await this.handleSyncEvent(poolInfo, reserve0, reserve1, event);
      });
      
    } else if (protocol === 'uniswap-v3') {
      // V3 protocol events - more complex with concentrated liquidity features
      contract.on('Initialize', async (sqrtPriceX96, tick, event) => {
        await this.handleInitializeEvent(poolInfo, sqrtPriceX96, tick, event);
      });
      
      contract.on('Swap', async (sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick, event) => {
        await this.handleV3SwapEvent(poolInfo, sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick, event);
      });
      
      contract.on('Mint', async (sender, owner, tickLower, tickUpper, amount, amount0, amount1, event) => {
        await this.handleV3MintEvent(poolInfo, sender, owner, tickLower, tickUpper, amount, amount0, amount1, event);
      });
      
      contract.on('Burn', async (owner, tickLower, tickUpper, amount, amount0, amount1, event) => {
        await this.handleV3BurnEvent(poolInfo, owner, tickLower, tickUpper, amount, amount0, amount1, event);
      });
    }
  }

  /**
   * Handles Swap events from V2 protocols (Uniswap V2, PancakeSwap V2)
   * 
   * Processes token swap events and standardizes them into a unified format.
   * V2 swaps have a simple structure with input/output amounts for each token.
   * 
   * Event Structure:
   * - sender: Address that initiated the swap
   * - amount0In/amount1In: Input amounts for each token
   * - amount0Out/amount1Out: Output amounts for each token
   * - to: Address that receives the output tokens
   * 
   * @param poolInfo - Pool metadata including protocol and token information
   * @param sender - Address that initiated the swap
   * @param amount0In - Input amount of token0
   * @param amount1In - Input amount of token1
   * @param amount0Out - Output amount of token0
   * @param amount1Out - Output amount of token1
   * @param to - Address receiving the output tokens
   * @param event - Raw blockchain event object
   */
  private async handleSwapEvent(
    poolInfo: PoolInfo,
    sender: string,
    amount0In: string,
    amount1In: string,
    amount0Out: string,
    amount1Out: string,
    to: string,
    event: any
  ): Promise<void> {
    // Extract event data with robust fallback handling for different ethers.js versions
    const txHash = event.transactionHash || event.hash || event.tx?.hash || `tx-${Date.now()}`;
    const logIndex = event.logIndex || event.index || event.log?.index || Date.now();
    const blockNumber = event.blockNumber || event.block || event.blockNumber || event.log?.blockNumber || 0;
    
    // Create standardized event object
    const standardizedEvent: StandardizedEvent = {
      id: `${txHash}-${logIndex}-swap`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'swap',
      timestamp: Date.now(),
      blockNumber: blockNumber,
      transactionHash: txHash,
      logIndex: logIndex,
      poolAddress: poolInfo.address,
      token0: poolInfo.token0,
      token1: poolInfo.token1,
      data: {
        type: 'swap',
        sender,
        recipient: to,
        amount0In: amount0In.toString(),
        amount1In: amount1In.toString(),
        amount0Out: amount0Out.toString(),
        amount1Out: amount1Out.toString()
      }
    };

    // Emit the standardized event for downstream processing
    this.emit('standardizedEvent', standardizedEvent);
  }

  /**
   * Handles Mint events from V2 protocols (liquidity provision)
   * 
   * Processes liquidity provision events when users add tokens to a pool.
   * In V2 protocols, mint events occur when liquidity is added to a pair.
   * 
   * Event Structure:
   * - sender: Address that provided the liquidity
   * - amount0/amount1: Amounts of each token added to the pool
   * 
   * Note: V2 protocols don't provide liquidity amounts in the event, so we set it to '0'
   * 
   * @param poolInfo - Pool metadata including protocol and token information
   * @param sender - Address that provided the liquidity
   * @param amount0 - Amount of token0 added to the pool
   * @param amount1 - Amount of token1 added to the pool
   * @param event - Raw blockchain event object
   */
  private async handleMintEvent(
    poolInfo: PoolInfo,
    sender: string,
    amount0: string,
    amount1: string,
    event: any
  ): Promise<void> {
    // Extract event data with robust fallback handling
    const txHash = event.transactionHash || event.hash || event.tx?.hash || `tx-${Date.now()}`;
    const logIndex = event.logIndex || event.index || event.log?.index || Date.now();
    const blockNumber = event.blockNumber || event.block || event.log?.blockNumber || 0;
    
    const standardizedEvent: StandardizedEvent = {
      id: `${txHash}-${logIndex}-mint`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'mint',
      timestamp: Date.now(),
      blockNumber: blockNumber,
      transactionHash: txHash,
      logIndex: logIndex,
      poolAddress: poolInfo.address,
      token0: poolInfo.token0,
      token1: poolInfo.token1,
      data: {
        type: 'mint',
        sender,
        owner: sender,
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        liquidity: '0' // V2 doesn't provide liquidity amount in Mint event
      }
    };

    this.emit('standardizedEvent', standardizedEvent);
  }

  /**
   * Handles Burn events from V2 protocols (liquidity removal)
   * 
   * Processes liquidity removal events when users withdraw tokens from a pool.
   * In V2 protocols, burn events occur when liquidity is removed from a pair.
   * 
   * Event Structure:
   * - sender: Address that removed the liquidity
   * - amount0/amount1: Amounts of each token removed from the pool
   * - to: Address that receives the withdrawn tokens
   * 
   * Note: V2 protocols don't provide liquidity amounts in the event, so we set it to '0'
   * 
   * @param poolInfo - Pool metadata including protocol and token information
   * @param sender - Address that removed the liquidity
   * @param amount0 - Amount of token0 removed from the pool
   * @param amount1 - Amount of token1 removed from the pool
   * @param to - Address receiving the withdrawn tokens
   * @param event - Raw blockchain event object
   */
  private async handleBurnEvent(
    poolInfo: PoolInfo,
    sender: string,
    amount0: string,
    amount1: string,
    to: string,
    event: any
  ): Promise<void> {
    // Extract event data with robust fallback handling
    const txHash = event.transactionHash || event.hash || event.tx?.hash || `tx-${Date.now()}`;
    const logIndex = event.logIndex || event.index || event.log?.index || Date.now();
    const blockNumber = event.blockNumber || event.block || event.log?.blockNumber || 0;
    
    const standardizedEvent: StandardizedEvent = {
      id: `${txHash}-${logIndex}-burn`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'burn',
      timestamp: Date.now(),
      blockNumber: blockNumber,
      transactionHash: txHash,
      logIndex: logIndex,
      poolAddress: poolInfo.address,
      token0: poolInfo.token0,
      token1: poolInfo.token1,
      data: {
        type: 'burn',
        sender,
        owner: sender,
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        liquidity: '0' // V2 doesn't provide liquidity amount in Burn event
      }
    };

    this.emit('standardizedEvent', standardizedEvent);
  }

  /**
   * Handles Sync events from V2 protocols (reserve updates)
   * 
   * Processes reserve update events that occur after swaps, mints, or burns.
   * Sync events update the internal reserves of the pair contract.
   * 
   * Event Structure:
   * - reserve0: Updated reserve amount of token0
   * - reserve1: Updated reserve amount of token1
   * 
   * These events are crucial for maintaining accurate price calculations
   * and are emitted after every state-changing operation on the pair.
   * 
   * @param poolInfo - Pool metadata including protocol and token information
   * @param reserve0 - Updated reserve amount of token0
   * @param reserve1 - Updated reserve amount of token1
   * @param event - Raw blockchain event object
   */
  private async handleSyncEvent(
    poolInfo: PoolInfo,
    reserve0: string,
    reserve1: string,
    event: any
  ): Promise<void> {
    // Extract event data with robust fallback handling
    const txHash = event.transactionHash || event.hash || event.tx?.hash || `tx-${Date.now()}`;
    const logIndex = event.logIndex || event.index || event.log?.index || Date.now();
    const blockNumber = event.blockNumber || event.block || event.log?.blockNumber || 0;
    
    const standardizedEvent: StandardizedEvent = {
      id: `${txHash}-${logIndex}-sync`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'sync',
      timestamp: Date.now(),
      blockNumber: blockNumber,
      transactionHash: txHash,
      logIndex: logIndex,
      poolAddress: poolInfo.address,
      token0: poolInfo.token0,
      token1: poolInfo.token1,
      data: {
        type: 'sync',
        reserve0: reserve0.toString(),
        reserve1: reserve1.toString()
      }
    };

    this.emit('standardizedEvent', standardizedEvent);
  }

  /**
   * Handles Initialize events from V3 protocols (pool initialization)
   * 
   * Processes pool initialization events that occur when a V3 pool is first created.
   * This event sets the initial price and tick for the pool.
   * 
   * Event Structure:
   * - sqrtPriceX96: Square root of the price in Q64.96 format
   * - tick: The initial tick for the pool
   * 
   * This event is crucial for V3 pools as it establishes the initial price point
   * and enables concentrated liquidity positions.
   * 
   * @param poolInfo - Pool metadata including protocol and token information
   * @param sqrtPriceX96 - Square root of the initial price in Q64.96 format
   * @param tick - The initial tick for the pool
   * @param event - Raw blockchain event object
   */
  private async handleInitializeEvent(
    poolInfo: PoolInfo,
    sqrtPriceX96: string,
    tick: number,
    event: any
  ): Promise<void> {
    // Extract event data with robust fallback handling
    const txHash = event.transactionHash || event.hash || event.tx?.hash || `tx-${Date.now()}`;
    const logIndex = event.logIndex || event.index || event.log?.index || Date.now();
    const blockNumber = event.blockNumber || event.block || event.log?.blockNumber || 0;
    
    const standardizedEvent: StandardizedEvent = {
      id: `${txHash}-${logIndex}-initialize`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'initialize',
      timestamp: Date.now(),
      blockNumber: blockNumber,
      transactionHash: txHash,
      logIndex: logIndex,
      poolAddress: poolInfo.address,
      token0: poolInfo.token0,
      token1: poolInfo.token1,
      data: {
        type: 'initialize',
        sqrtPriceX96: sqrtPriceX96.toString(),
        tick
      }
    };

    this.emit('standardizedEvent', standardizedEvent);
  }

  /**
   * Handles V3 Swap events from Uniswap V3 (concentrated liquidity swaps)
   * 
   * Processes token swap events in V3 pools with concentrated liquidity features.
   * V3 swaps have a different structure than V2 - they use signed amounts and
   * include additional price and liquidity information.
   * 
   * Event Structure:
   * - sender: Address that initiated the swap
   * - recipient: Address that receives the output tokens
   * - amount0/amount1: Signed amounts (negative = input, positive = output)
   * - sqrtPriceX96: Square root of the price after the swap
   * - liquidity: Active liquidity in the pool
   * - tick: The tick after the swap
   * 
   * @param poolInfo - Pool metadata including protocol and token information
   * @param sender - Address that initiated the swap
   * @param recipient - Address that receives the output tokens
   * @param amount0 - Signed amount of token0 (negative = input, positive = output)
   * @param amount1 - Signed amount of token1 (negative = input, positive = output)
   * @param sqrtPriceX96 - Square root of the price after the swap
   * @param liquidity - Active liquidity in the pool
   * @param tick - The tick after the swap
   * @param event - Raw blockchain event object
   */
  private async handleV3SwapEvent(
    poolInfo: PoolInfo,
    sender: string,
    recipient: string,
    amount0: string,
    amount1: string,
    sqrtPriceX96: string,
    liquidity: string,
    tick: number,
    event: any
  ): Promise<void> {
    // Extract event data with robust fallback handling
    const txHash = event.transactionHash || event.hash || event.tx?.hash || `tx-${Date.now()}`;
    const logIndex = event.logIndex || event.index || event.log?.index || Date.now();
    const blockNumber = event.blockNumber || event.block || event.log?.blockNumber || 0;
    
    const standardizedEvent: StandardizedEvent = {
      id: `${txHash}-${logIndex}-swap`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'swap',
      timestamp: Date.now(),
      blockNumber: blockNumber,
      transactionHash: txHash,
      logIndex: logIndex,
      poolAddress: poolInfo.address,
      token0: poolInfo.token0,
      token1: poolInfo.token1,
      data: {
        type: 'swap',
        sender,
        recipient,
        // Convert signed amounts to input/output format for consistency with V2
        amount0In: amount0.toString().startsWith('-') ? '0' : amount0.toString(),
        amount1In: amount1.toString().startsWith('-') ? '0' : amount1.toString(),
        amount0Out: amount0.toString().startsWith('-') ? amount0.toString().slice(1) : '0',
        amount1Out: amount1.toString().startsWith('-') ? amount1.toString().slice(1) : '0',
        sqrtPriceX96: sqrtPriceX96.toString(),
        tick
      }
    };

    this.emit('standardizedEvent', standardizedEvent);
  }

  /**
   * Handles V3 Mint events from Uniswap V3 (concentrated liquidity provision)
   * 
   * Processes liquidity provision events in V3 pools with concentrated liquidity.
   * V3 mints are more complex than V2 as they involve price ranges (ticks).
   * 
   * Event Structure:
   * - sender: Address that initiated the mint
   * - owner: Address that owns the liquidity position
   * - tickLower/tickUpper: Price range for the liquidity position
   * - amount: Amount of liquidity tokens minted
   * - amount0/amount1: Amounts of each token added
   * 
   * @param poolInfo - Pool metadata including protocol and token information
   * @param sender - Address that initiated the mint
   * @param owner - Address that owns the liquidity position
   * @param tickLower - Lower tick of the liquidity range
   * @param tickUpper - Upper tick of the liquidity range
   * @param amount - Amount of liquidity tokens minted
   * @param amount0 - Amount of token0 added to the pool
   * @param amount1 - Amount of token1 added to the pool
   * @param event - Raw blockchain event object
   */
  private async handleV3MintEvent(
    poolInfo: PoolInfo,
    sender: string,
    owner: string,
    tickLower: number,
    tickUpper: number,
    amount: string,
    amount0: string,
    amount1: string,
    event: any
  ): Promise<void> {
    // Extract event data with robust fallback handling
    const txHash = event.transactionHash || event.hash || event.tx?.hash || `tx-${Date.now()}`;
    const logIndex = event.logIndex || event.index || event.log?.index || Date.now();
    const blockNumber = event.blockNumber || event.block || event.log?.blockNumber || 0;
    
    const standardizedEvent: StandardizedEvent = {
      id: `${txHash}-${logIndex}-mint`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'mint',
      timestamp: Date.now(),
      blockNumber: blockNumber,
      transactionHash: txHash,
      logIndex: logIndex,
      poolAddress: poolInfo.address,
      token0: poolInfo.token0,
      token1: poolInfo.token1,
      data: {
        type: 'mint',
        sender,
        owner,
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        liquidity: amount.toString(),
        tickLower,
        tickUpper
      }
    };

    this.emit('standardizedEvent', standardizedEvent);
  }

  /**
   * Handles V3 Burn events from Uniswap V3 (concentrated liquidity removal)
   * 
   * Processes liquidity removal events in V3 pools with concentrated liquidity.
   * V3 burns are more complex than V2 as they involve price ranges (ticks).
   * 
   * Event Structure:
   * - owner: Address that owns the liquidity position
   * - tickLower/tickUpper: Price range for the liquidity position
   * - amount: Amount of liquidity tokens burned
   * - amount0/amount1: Amounts of each token removed
   * 
   * @param poolInfo - Pool metadata including protocol and token information
   * @param owner - Address that owns the liquidity position
   * @param tickLower - Lower tick of the liquidity range
   * @param tickUpper - Upper tick of the liquidity range
   * @param amount - Amount of liquidity tokens burned
   * @param amount0 - Amount of token0 removed from the pool
   * @param amount1 - Amount of token1 removed from the pool
   * @param event - Raw blockchain event object
   */
  private async handleV3BurnEvent(
    poolInfo: PoolInfo,
    owner: string,
    tickLower: number,
    tickUpper: number,
    amount: string,
    amount0: string,
    amount1: string,
    event: any
  ): Promise<void> {
    // Extract event data with robust fallback handling
    const txHash = event.transactionHash || event.hash || event.tx?.hash || `tx-${Date.now()}`;
    const logIndex = event.logIndex || event.index || event.log?.index || Date.now();
    const blockNumber = event.blockNumber || event.block || event.log?.blockNumber || 0;
    
    const standardizedEvent: StandardizedEvent = {
      id: `${txHash}-${logIndex}-burn`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'burn',
      timestamp: Date.now(),
      blockNumber: blockNumber,
      transactionHash: txHash,
      logIndex: logIndex,
      poolAddress: poolInfo.address,
      token0: poolInfo.token0,
      token1: poolInfo.token1,
      data: {
        type: 'burn',
        sender: owner,
        owner,
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        liquidity: amount.toString(),
        tickLower,
        tickUpper
      }
    };

    this.emit('standardizedEvent', standardizedEvent);
  }

  /**
   * Retrieves token information (symbol, decimals, name) for a given token address
   * 
   * This method attempts to fetch token metadata from the blockchain using the ERC20 standard.
   * It implements a robust fallback system to handle cases where token contracts don't
   * implement all standard functions or when RPC calls fail.
   * 
   * Fallback Strategy:
   * 1. Try to fetch from blockchain using ERC20 functions
   * 2. If that fails, check the fallback token database
   * 3. If no fallback exists, return default values
   * 
   * @param tokenAddress - The contract address of the token
   * @returns Promise<TokenInfo> - Token information including symbol, decimals, and name
   */
  private async getTokenInfo(tokenAddress: string): Promise<any> {
    try {
      // Create a contract instance with ERC20 standard functions
      const tokenContract = new ethers.Contract(tokenAddress, [
        'function symbol() view returns (string)', 
        'function decimals() view returns (uint8)', 
        'function name() view returns (string)'
      ], this.provider);
      
      // Fetch all token information in parallel for efficiency
      const [symbol, decimals, name] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.name().catch(() => 'Unknown') // Gracefully handle missing name function
      ]);
      
      return {
        address: tokenAddress,
        symbol,
        decimals,
        name
      };
    } catch (error) {
      console.warn(`Failed to get token info for ${tokenAddress}:`, error);
      
      // Try fallback token info from our known tokens database
      const fallbackInfo = this.getFallbackTokenInfo(tokenAddress);
      if (fallbackInfo) {
        this.tokenCache.set(tokenAddress, fallbackInfo);
        return fallbackInfo;
      }
      
      // Return default values if all else fails
      return {
        address: tokenAddress,
        symbol: 'UNKNOWN',
        decimals: 18,
        name: 'Unknown Token'
      };
    }
  }

  /**
   * Gets the chain-specific configuration for contract addresses
   * 
   * Returns the appropriate contract addresses based on the configured chain ID.
   * This allows the listener to work across different blockchain networks.
   * 
   * @returns Contract addresses configuration for the current chain
   */
  private getChainConfig() {
    switch (this.config.chainId) {
      case 1: // Ethereum Mainnet
        return CONTRACT_ADDRESSES.ethereum;
      case 56: // BSC Mainnet
        return CONTRACT_ADDRESSES.bsc;
      default:
        return CONTRACT_ADDRESSES.ethereum;
    }
  }

  /**
   * Gets the factory contract ABI for a specific protocol
   * 
   * Returns the appropriate ABI based on the protocol type.
   * Factory contracts are used to listen for new pool/pair creation events.
   * 
   * @param protocol - The protocol type (uniswap-v2, uniswap-v3, pancakeswap-v2)
   * @returns Array of ABI function signatures for the factory contract
   * @throws Error if protocol is not supported
   */
  private getFactoryABI(protocol: ProtocolType): string[] {
    switch (protocol) {
      case 'uniswap-v2':
        return UNISWAP_V2_FACTORY_ABI;
      case 'uniswap-v3':
        return UNISWAP_V3_FACTORY_ABI;
      case 'pancakeswap-v2':
        return PANCAKESWAP_V2_FACTORY_ABI;
      default:
        throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }

  /**
   * Gets the pool/pair contract ABI for a specific protocol
   * 
   * Returns the appropriate ABI based on the protocol type.
   * Pool contracts are used to listen for trading events (swaps, mints, burns).
   * 
   * @param protocol - The protocol type (uniswap-v2, uniswap-v3, pancakeswap-v2)
   * @returns Array of ABI function signatures for the pool contract
   * @throws Error if protocol is not supported
   */
  private getPoolABI(protocol: ProtocolType): string[] {
    switch (protocol) {
      case 'uniswap-v2':
        return UNISWAP_V2_PAIR_ABI;
      case 'uniswap-v3':
        return UNISWAP_V3_POOL_ABI;
      case 'pancakeswap-v2':
        return PANCAKESWAP_V2_PAIR_ABI;
      default:
        throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }

  /**
   * Starts factory event listening and adds popular pools for immediate monitoring
   * 
   * This method is called after factory listeners are set up and performs two key functions:
   * 1. Adds popular existing pools to start monitoring immediately
   * 2. Provides debugging information about the listener state
   * 
   * The system monitors both:
   * - New pools created through factory events (dynamic discovery)
   * - Popular existing pools (immediate coverage)
   */
  private async startFactoryEventListening(): Promise<void> {
    console.log('Factory event listening started');
    
    // Add debugging information to verify listener setup
    console.log('🔍 Active factory listeners:', this.factoryListeners.size);
    console.log('🔍 Known pools:', this.knownPools.size);
    
    // Add popular existing pools to monitor for events immediately
    await this.addPopularPools();
    
    // Log the pools we're now monitoring
    if (this.knownPools.size > 0) {
      console.log('🔍 Starting to listen to existing pools:', Array.from(this.knownPools.keys()));
    }
  }

  /**
   * Adds popular existing pools to start monitoring immediately
   * 
   * This method adds well-known, high-volume pools to the monitoring system
   * to ensure immediate event coverage. It includes pools from all supported
   * protocols with diverse token coverage for comprehensive monitoring.
   * 
   * Popular Pools Included:
   * - Uniswap V2: Major pairs like WETH/USDC, WETH/USDT, UNI/WETH, WBTC/WETH
   * - Uniswap V3: High-volume pools with different fee tiers (0.05%, 0.3%)
   * - PancakeSwap V2: BSC pairs like WBNB/BUSD, WBNB/WETH, CAKE/WBNB
   * 
   * The system dynamically discovers token information for each pool and
   * starts monitoring them for trading events.
   */
  private async addPopularPools(): Promise<void> {
    // Define popular pool addresses with diverse token coverage
    const popularPools = [
      // Uniswap V2 - Major pairs with high trading volume
      {
        protocol: 'uniswap-v2' as ProtocolType,
        address: '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc' // WETH/USDC
      },
      {
        protocol: 'uniswap-v2' as ProtocolType,
        address: '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852' // WETH/USDT
      },
      {
        protocol: 'uniswap-v2' as ProtocolType,
        address: '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11' // UNI/WETH
      },
      {
        protocol: 'uniswap-v2' as ProtocolType,
        address: '0xBb2b8038a1640196FbE3e38816F3e67Cba72D940' // WBTC/WETH
      },
      {
        protocol: 'uniswap-v2' as ProtocolType,
        address: '0x2fDbAdf3C4D5A8666Bc06645B8358ab803996E28' // DAI/WETH
      },
      {
        protocol: 'uniswap-v2' as ProtocolType,
        address: '0x43AE24960e5534731Fc831386c07755A2dc33D47' // LINK/WETH
      },
      
      // Uniswap V3 - Major pairs with different fee tiers
      {
        protocol: 'uniswap-v3' as ProtocolType,
        address: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640' // WETH/USDC 0.05%
      },
      {
        protocol: 'uniswap-v3' as ProtocolType,
        address: '0x11b815efB8f581194ae79006d24E0d814B7697F6' // WETH/USDT 0.05%
      },
      {
        protocol: 'uniswap-v3' as ProtocolType,
        address: '0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801' // UNI/WETH 0.3%
      },
      {
        protocol: 'uniswap-v3' as ProtocolType,
        address: '0xCBCdF9626bC03E24f779434178A73a0B4bad62eD' // WBTC/WETH 0.3%
      },
      
      // PancakeSwap V2 - BSC pairs with high trading volume
      {
        protocol: 'pancakeswap-v2' as ProtocolType,
        address: '0x7213a321F1855CF1779f42c0CD85d3D95291D34C' // WBNB/BUSD
      },
      {
        protocol: 'pancakeswap-v2' as ProtocolType,
        address: '0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16' // WBNB/BUSD (different pool)
      },
      {
        protocol: 'pancakeswap-v2' as ProtocolType,
        address: '0x74E4716E431f45807DCF4f3fA29A161f9F79019e' // WBNB/WETH
      },
      {
        protocol: 'pancakeswap-v2' as ProtocolType,
        address: '0x61EB789d75A95CAa3fF5ed22AB22bD1b5E2b9E32' // CAKE/WBNB
      }
    ];

    console.log('🔍 Adding popular pools to monitor...');

    // Add each pool and dynamically discover token information
    for (const pool of popularPools) {
      try {
        // Get token addresses from the pool contract
        const token0 = await this.getToken0FromPool(pool.address, pool.protocol);
        const token1 = await this.getToken1FromPool(pool.address, pool.protocol);
        
        if (token0 && token1) {
          await this.startPoolListening(pool.protocol, pool.address, token0, token1);
        }
      } catch (error) {
        console.warn(`Failed to get tokens for pool ${pool.address}:`, error);
      }
    }

    console.log('🔍 Added popular pools, now monitoring:', this.knownPools.size, 'pools');
  }

  /**
   * Gets the first token address from a pool contract
   * 
   * Attempts to call the token0() function on the pool contract to get the first token address.
   * If the call fails, it falls back to a hardcoded database of known token addresses.
   * 
   * @param poolAddress - The address of the pool contract
   * @param protocol - The protocol type (uniswap-v2, uniswap-v3, pancakeswap-v2)
   * @returns Promise<string | null> - The token0 address or null if not found
   */
  private async getToken0FromPool(poolAddress: string, protocol: ProtocolType): Promise<string | null> {
    try {
      const poolContract = new ethers.Contract(poolAddress, this.getPoolABI(protocol), this.provider);
      const token0 = await poolContract.token0();
      console.log(`✅ Got token0 for ${poolAddress}: ${token0}`);
      return token0;
    } catch (error) {
      console.warn(`❌ Failed to get token0 for pool ${poolAddress}:`, error);
      // Return fallback token addresses for known pools
      return this.getFallbackToken0(poolAddress, protocol);
    }
  }

  /**
   * Gets the second token address from a pool contract
   * 
   * Attempts to call the token1() function on the pool contract to get the second token address.
   * If the call fails, it falls back to a hardcoded database of known token addresses.
   * 
   * @param poolAddress - The address of the pool contract
   * @param protocol - The protocol type (uniswap-v2, uniswap-v3, pancakeswap-v2)
   * @returns Promise<string | null> - The token1 address or null if not found
   */
  private async getToken1FromPool(poolAddress: string, protocol: ProtocolType): Promise<string | null> {
    try {
      const poolContract = new ethers.Contract(poolAddress, this.getPoolABI(protocol), this.provider);
      const token1 = await poolContract.token1();
      console.log(`✅ Got token1 for ${poolAddress}: ${token1}`);
      return token1;
    } catch (error) {
      console.warn(`❌ Failed to get token1 for pool ${poolAddress}:`, error);
      // Return fallback token addresses for known pools
      return this.getFallbackToken1(poolAddress, protocol);
    }
  }

  /**
   * Gets fallback token0 address for known popular pools
   * 
   * This method provides hardcoded token0 addresses for popular pools when
   * when the blockchain call fails. This ensures the system can still
   * function even when RPC endpoints are unreliable.
   * 
   * @param poolAddress - The address of the pool contract
   * @param protocol - The protocol type (not used in this implementation)
   * @returns string | null - The fallback token0 address or null if not found
   */
  private getFallbackToken0(poolAddress: string, protocol: ProtocolType): string | null {
    // Known token0 addresses for popular pools (correct addresses)
    const fallbackTokens: { [key: string]: string } = {
      // Uniswap V2 - Major pairs
      '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11': '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // UNI
      '0xBb2b8038a1640196FbE3e38816F3e67Cba72D940': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
      '0x2fDbAdf3C4D5A8666Bc06645B8358ab803996E28': '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
      '0x43AE24960e5534731Fc831386c07755A2dc33D47': '0x514910771AF9Ca656af840dff83E8264EcF986CA', // LINK
      
      // Uniswap V3 - Major pairs with different fee tiers
      '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      '0x11b815efB8f581194ae79006d24E0d814B7697F6': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801': '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // UNI
      '0xCBCdF9626bC03E24f779434178A73a0B4bad62eD': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
      
      // PancakeSwap V2 - BSC pairs
      '0x7213a321F1855CF1779f42c0CD85d3D95291D34C': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
      '0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
      '0x74E4716E431f45807DCF4f3fA29A161f9F79019e': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
      '0x61EB789d75A95CAa3fF5ed22AB22bD1b5E2b9E32': '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // CAKE
    };
    return fallbackTokens[poolAddress] || null;
  }

  /**
   * Gets fallback token1 address for known popular pools
   * 
   * This method provides hardcoded token1 addresses for popular pools when
   * the blockchain call fails. This ensures the system can still
   * function even when RPC endpoints are unreliable.
   * 
   * @param poolAddress - The address of the pool contract
   * @param protocol - The protocol type (not used in this implementation)
   * @returns string | null - The fallback token1 address or null if not found
   */
  private getFallbackToken1(poolAddress: string, protocol: ProtocolType): string | null {
    // Known token1 addresses for popular pools (correct addresses)
    const fallbackTokens: { [key: string]: string } = {
      // Uniswap V2 - Major pairs
      '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852': '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
      '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0xBb2b8038a1640196FbE3e38816F3e67Cba72D940': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0x2fDbAdf3C4D5A8666Bc06645B8358ab803996E28': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0x43AE24960e5534731Fc831386c07755A2dc33D47': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      
      // Uniswap V3 - Major pairs with different fee tiers
      '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0x11b815efB8f581194ae79006d24E0d814B7697F6': '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
      '0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0xCBCdF9626bC03E24f779434178A73a0B4bad62eD': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      
      // PancakeSwap V2 - BSC pairs
      '0x7213a321F1855CF1779f42c0CD85d3D95291D34C': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
      '0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
      '0x74E4716E431f45807DCF4f3fA29A161f9F79019e': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0x61EB789d75A95CAa3fF5ed22AB22bD1b5E2b9E32': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    };
    return fallbackTokens[poolAddress] || null;
  }

  /**
   * Gets all known pools that are currently being monitored
   * 
   * Returns an array of PoolInfo objects for all pools that the listener
   * is currently monitoring. This includes both dynamically discovered
   * pools and popular pools that were added at startup.
   * 
   * @returns Array of PoolInfo objects for all monitored pools
   */
  getKnownPools(): PoolInfo[] {
    return Array.from(this.knownPools.values());
  }

  /**
   * Gets information about a specific pool by its address
   * 
   * Returns the PoolInfo object for a specific pool if it's being monitored.
   * This is useful for checking if a pool is already being tracked.
   * 
   * @param poolAddress - The address of the pool to look up
   * @returns PoolInfo object if found, undefined otherwise
   */
  getPoolInfo(poolAddress: string): PoolInfo | undefined {
    return this.knownPools.get(poolAddress);
  }

  /**
   * Gets fallback token information for known popular tokens
   * 
   * This method provides hardcoded token information (symbol, decimals, name)
   * for popular tokens when blockchain calls fail. This ensures the system
   * can still function even when RPC endpoints are unreliable.
   * 
   * @param tokenAddress - The address of the token to look up
   * @returns TokenInfo object if found, null otherwise
   */
  private getFallbackTokenInfo(tokenAddress: string): TokenInfo | null {
    // Known token information for popular tokens across different networks
    const knownTokens: { [key: string]: TokenInfo } = {
      // Ethereum Mainnet - Major tokens
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': { address: tokenAddress, symbol: 'WETH', decimals: 18, name: 'Wrapped Ether' },
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': { address: tokenAddress, symbol: 'USDC', decimals: 6, name: 'USD Coin' },
      '0xdAC17F958D2ee523a2206206994597C13D831ec7': { address: tokenAddress, symbol: 'USDT', decimals: 6, name: 'Tether USD' },
      '0x6B175474E89094C44Da98b954EedeAC495271d0F': { address: tokenAddress, symbol: 'DAI', decimals: 18, name: 'Dai Stablecoin' },
      '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': { address: tokenAddress, symbol: 'WBTC', decimals: 8, name: 'Wrapped BTC' },
      '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': { address: tokenAddress, symbol: 'UNI', decimals: 18, name: 'Uniswap' },
      '0x514910771AF9Ca656af840dff83E8264EcF986CA': { address: tokenAddress, symbol: 'LINK', decimals: 18, name: 'ChainLink Token' },
      '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e': { address: tokenAddress, symbol: 'YFI', decimals: 18, name: 'yearn.finance' },
      '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F': { address: tokenAddress, symbol: 'SNX', decimals: 18, name: 'Synthetix Network Token' },
      
      // BSC Mainnet - Major tokens
      '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c': { address: tokenAddress, symbol: 'WBNB', decimals: 18, name: 'Wrapped BNB' },
      '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56': { address: tokenAddress, symbol: 'BUSD', decimals: 18, name: 'BUSD Token' },
      '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82': { address: tokenAddress, symbol: 'CAKE', decimals: 18, name: 'PancakeSwap Token' },
      '0x2170Ed0880ac9A755fd29B2688956BD959F933F8': { address: tokenAddress, symbol: 'ETH', decimals: 18, name: 'Ethereum Token' },
      '0x55d398326f99059fF775485246999027B3197955': { address: tokenAddress, symbol: 'USDT', decimals: 18, name: 'Tether USD' },
      '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c': { address: tokenAddress, symbol: 'BTCB', decimals: 18, name: 'Bitcoin BEP2' },
    };
    return knownTokens[tokenAddress] || null;
  }
}
