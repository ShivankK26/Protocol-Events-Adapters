import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { StandardizedEvent, PoolInfo, FactoryEvent, ProtocolType } from '../types/schemas';
import { CONTRACT_ADDRESSES } from '../types/contracts';

export interface EventListenerConfig {
  rpcUrl: string;
  wsUrl?: string;
  chainId: number;
  protocols: ProtocolType[];
}

export class ProtocolEventListener extends EventEmitter {
  private provider: ethers.JsonRpcProvider;
  private wsProvider?: ethers.WebSocketProvider;
  private factoryListeners: Map<string, ethers.Contract> = new Map();
  private poolListeners: Map<string, ethers.Contract> = new Map();
  private knownPools: Map<string, PoolInfo> = new Map();
  private isListening = false;

  constructor(private config: EventListenerConfig) {
    super();
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    if (config.wsUrl) {
      this.wsProvider = new ethers.WebSocketProvider(config.wsUrl);
    }
  }

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

  async stop(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    console.log('Stopping protocol event listener...');
    
    // Remove all listeners
    this.factoryListeners.forEach(contract => {
      contract.removeAllListeners();
    });
    
    this.poolListeners.forEach(contract => {
      contract.removeAllListeners();
    });
    
    this.factoryListeners.clear();
    this.poolListeners.clear();
    
    if (this.wsProvider) {
      this.wsProvider.destroy();
    }
    
    this.isListening = false;
    console.log('Protocol event listener stopped');
  }

  private async initializeFactoryListeners(): Promise<void> {
    const chainConfig = this.getChainConfig();
    
    for (const protocol of this.config.protocols) {
      const protocolConfig = chainConfig[protocol];
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

  private async setupFactoryListener(protocol: ProtocolType, factoryAddress: string): Promise<void> {
    const provider = this.wsProvider || this.provider;
    const abi = this.getFactoryABI(protocol);
    
    const factoryContract = new ethers.Contract(factoryAddress, abi, provider);
    
    // Listen for new pair/pool creation events
    if (protocol === 'uniswap-v2' || protocol === 'pancakeswap-v2') {
      factoryContract.on('PairCreated', async (token0, token1, pairAddress, event) => {
        await this.handlePairCreated(protocol, token0, token1, pairAddress, event);
      });
    } else if (protocol === 'uniswap-v3') {
      factoryContract.on('PoolCreated', async (token0, token1, fee, tickSpacing, poolAddress, event) => {
        await this.handlePoolCreated(protocol, token0, token1, fee, tickSpacing, poolAddress, event);
      });
    }
    
    this.factoryListeners.set(protocol, factoryContract);
    console.log(`Factory listener setup for ${protocol} at ${factoryAddress}`);
  }

  private async handlePairCreated(
    protocol: ProtocolType,
    token0: string,
    token1: string,
    pairAddress: string,
    event: any
  ): Promise<void> {
    console.log(`New pair created: ${protocol} - ${pairAddress}`);
    
    const factoryEvent: FactoryEvent = {
      protocol,
      eventType: 'pair_created',
      token0,
      token1,
      pairAddress,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash
    };

    this.emit('factoryEvent', factoryEvent);
    
    // Start listening to this new pair
    await this.startPoolListening(protocol, pairAddress, token0, token1);
  }

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
    
    const factoryEvent: FactoryEvent = {
      protocol,
      eventType: 'pool_created',
      token0,
      token1,
      pairAddress: poolAddress,
      fee,
      tickSpacing,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash
    };

    this.emit('factoryEvent', factoryEvent);
    
    // Start listening to this new pool
    await this.startPoolListening(protocol, poolAddress, token0, token1, fee, tickSpacing);
  }

  private async startPoolListening(
    protocol: ProtocolType,
    poolAddress: string,
    token0: string,
    token1: string,
    fee?: number,
    tickSpacing?: number
  ): Promise<void> {
    if (this.poolListeners.has(poolAddress)) {
      console.log(`Already listening to pool ${poolAddress}`);
      return;
    }

    try {
      const provider = this.wsProvider || this.provider;
      const abi = this.getPoolABI(protocol);
      
      const poolContract = new ethers.Contract(poolAddress, abi, provider);
      
      // Get token information
      const token0Info = await this.getTokenInfo(token0);
      const token1Info = await this.getTokenInfo(token1);
      
      // Store pool information
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
      
      // Set up event listeners for this pool
      this.setupPoolEventListeners(poolContract, poolInfo);
      
      this.poolListeners.set(poolAddress, poolContract);
      
      console.log(`Started listening to pool ${poolAddress} (${protocol})`);
      
    } catch (error) {
      console.error(`Failed to start listening to pool ${poolAddress}:`, error);
    }
  }

  private setupPoolEventListeners(contract: ethers.Contract, poolInfo: PoolInfo): void {
    const protocol = poolInfo.protocol;
    
    if (protocol === 'uniswap-v2' || protocol === 'pancakeswap-v2') {
      // V2 events
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
      // V3 events
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

  // Event handlers for different event types
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
    const standardizedEvent: StandardizedEvent = {
      id: `${event.transactionHash}-${event.logIndex}`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'swap',
      timestamp: Date.now(),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
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

    this.emit('standardizedEvent', standardizedEvent);
  }

  private async handleMintEvent(
    poolInfo: PoolInfo,
    sender: string,
    amount0: string,
    amount1: string,
    event: any
  ): Promise<void> {
    const standardizedEvent: StandardizedEvent = {
      id: `${event.transactionHash}-${event.logIndex}`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'mint',
      timestamp: Date.now(),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
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

  private async handleBurnEvent(
    poolInfo: PoolInfo,
    sender: string,
    amount0: string,
    amount1: string,
    to: string,
    event: any
  ): Promise<void> {
    const standardizedEvent: StandardizedEvent = {
      id: `${event.transactionHash}-${event.logIndex}`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'burn',
      timestamp: Date.now(),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
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

  private async handleSyncEvent(
    poolInfo: PoolInfo,
    reserve0: string,
    reserve1: string,
    event: any
  ): Promise<void> {
    const standardizedEvent: StandardizedEvent = {
      id: `${event.transactionHash}-${event.logIndex}`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'sync',
      timestamp: Date.now(),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
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

  private async handleInitializeEvent(
    poolInfo: PoolInfo,
    sqrtPriceX96: string,
    tick: number,
    event: any
  ): Promise<void> {
    const standardizedEvent: StandardizedEvent = {
      id: `${event.transactionHash}-${event.logIndex}`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'initialize',
      timestamp: Date.now(),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
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
    const standardizedEvent: StandardizedEvent = {
      id: `${event.transactionHash}-${event.logIndex}`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'swap',
      timestamp: Date.now(),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
      poolAddress: poolInfo.address,
      token0: poolInfo.token0,
      token1: poolInfo.token1,
      data: {
        type: 'swap',
        sender,
        recipient,
        amount0In: amount0.startsWith('-') ? '0' : amount0,
        amount1In: amount1.startsWith('-') ? '0' : amount1,
        amount0Out: amount0.startsWith('-') ? amount0.slice(1) : '0',
        amount1Out: amount1.startsWith('-') ? amount1.slice(1) : '0',
        sqrtPriceX96: sqrtPriceX96.toString(),
        tick
      }
    };

    this.emit('standardizedEvent', standardizedEvent);
  }

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
    const standardizedEvent: StandardizedEvent = {
      id: `${event.transactionHash}-${event.logIndex}`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'mint',
      timestamp: Date.now(),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
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
    const standardizedEvent: StandardizedEvent = {
      id: `${event.transactionHash}-${event.logIndex}`,
      protocol: poolInfo.protocol,
      version: poolInfo.version,
      eventType: 'burn',
      timestamp: Date.now(),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
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

  private async getTokenInfo(tokenAddress: string): Promise<any> {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, ['function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function name() view returns (string)'], this.provider);
      
      const [symbol, decimals, name] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.name().catch(() => 'Unknown')
      ]);
      
      return {
        address: tokenAddress,
        symbol,
        decimals,
        name
      };
    } catch (error) {
      console.warn(`Failed to get token info for ${tokenAddress}:`, error);
      return {
        address: tokenAddress,
        symbol: 'UNKNOWN',
        decimals: 18,
        name: 'Unknown Token'
      };
    }
  }

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

  private getFactoryABI(protocol: ProtocolType): string[] {
    switch (protocol) {
      case 'uniswap-v2':
        return ['event PairCreated(address indexed token0, address indexed token1, address pair, uint)'];
      case 'uniswap-v3':
        return ['event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'];
      case 'pancakeswap-v2':
        return ['event PairCreated(address indexed token0, address indexed token1, address pair, uint)'];
      default:
        throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }

  private getPoolABI(protocol: ProtocolType): string[] {
    switch (protocol) {
      case 'uniswap-v2':
        return [
          'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
          'event Mint(address indexed sender, uint amount0, uint amount1)',
          'event Burn(address indexed sender, uint amount0, uint amount1, address indexed to)',
          'event Sync(uint112 reserve0, uint112 reserve1)'
        ];
      case 'uniswap-v3':
        return [
          'event Initialize(uint160 sqrtPriceX96, int24 tick)',
          'event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)',
          'event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)',
          'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
        ];
      case 'pancakeswap-v2':
        return [
          'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
          'event Mint(address indexed sender, uint amount0, uint amount1)',
          'event Burn(address indexed sender, uint amount0, uint amount1, address indexed to)',
          'event Sync(uint112 reserve0, uint112 reserve1)'
        ];
      default:
        throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }

  private async startFactoryEventListening(): Promise<void> {
    // This method is called after factory listeners are set up
    console.log('Factory event listening started');
  }

  getKnownPools(): PoolInfo[] {
    return Array.from(this.knownPools.values());
  }

  getPoolInfo(poolAddress: string): PoolInfo | undefined {
    return this.knownPools.get(poolAddress);
  }
}
