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
  private tokenCache: Map<string, TokenInfo> = new Map();
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
    
    // Extract event data properly
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
    
    // Extract event data properly
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
    // Extract event data properly - ethers.js events have different structure
    const txHash = event.transactionHash || event.hash || event.tx?.hash || `tx-${Date.now()}`;
    const logIndex = event.logIndex || event.index || event.log?.index || Date.now();
    const blockNumber = event.blockNumber || event.block || event.blockNumber || event.log?.blockNumber || 0;
    
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

    this.emit('standardizedEvent', standardizedEvent);
  }

  private async handleMintEvent(
    poolInfo: PoolInfo,
    sender: string,
    amount0: string,
    amount1: string,
    event: any
  ): Promise<void> {
    // Extract event data properly - ethers.js events have different structure
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

  private async handleBurnEvent(
    poolInfo: PoolInfo,
    sender: string,
    amount0: string,
    amount1: string,
    to: string,
    event: any
  ): Promise<void> {
    // Extract event data properly - ethers.js events have different structure
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

  private async handleSyncEvent(
    poolInfo: PoolInfo,
    reserve0: string,
    reserve1: string,
    event: any
  ): Promise<void> {
    // Extract event data properly - ethers.js events have different structure
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

  private async handleInitializeEvent(
    poolInfo: PoolInfo,
    sqrtPriceX96: string,
    tick: number,
    event: any
  ): Promise<void> {
    // Extract event data properly - ethers.js events have different structure
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
    // Extract event data properly - ethers.js events have different structure
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
    // Extract event data properly - ethers.js events have different structure
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
    // Extract event data properly - ethers.js events have different structure
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
      // Try fallback token info first
      const fallbackInfo = this.getFallbackTokenInfo(tokenAddress);
      if (fallbackInfo) {
        this.tokenCache.set(tokenAddress, fallbackInfo);
        return fallbackInfo;
      }
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
        return UNISWAP_V2_FACTORY_ABI;
      case 'uniswap-v3':
        return UNISWAP_V3_FACTORY_ABI;
      case 'pancakeswap-v2':
        return PANCAKESWAP_V2_FACTORY_ABI;
      default:
        throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }

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

  private async startFactoryEventListening(): Promise<void> {
    // This method is called after factory listeners are set up
    console.log('Factory event listening started');
    
    // Add some debugging to see if we're actually listening
    console.log('🔍 Active factory listeners:', this.factoryListeners.size);
    console.log('🔍 Known pools:', this.knownPools.size);
    
    // Add some popular existing pools to monitor for events
    await this.addPopularPools();
    
    // Log when we start listening to existing pools
    if (this.knownPools.size > 0) {
      console.log('🔍 Starting to listen to existing pools:', Array.from(this.knownPools.keys()));
    }
  }

  private async addPopularPools(): Promise<void> {
    // Add popular pool addresses with diverse token coverage
    const popularPools = [
      // Uniswap V2 - Major pairs
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
      
      // Uniswap V3 - Major pairs with different fees
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
      
      // PancakeSwap V2 - BSC pairs
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

    // Add pools and let the system discover tokens dynamically
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

  private getFallbackToken0(poolAddress: string, protocol: ProtocolType): string | null {
    // Known token0 addresses for popular pools (correct addresses)
    const fallbackTokens: { [key: string]: string } = {
      // Uniswap V2
      '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11': '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // UNI
      '0xBb2b8038a1640196FbE3e38816F3e67Cba72D940': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
      '0x2fDbAdf3C4D5A8666Bc06645B8358ab803996E28': '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
      '0x43AE24960e5534731Fc831386c07755A2dc33D47': '0x514910771AF9Ca656af840dff83E8264EcF986CA', // LINK
      
      // Uniswap V3
      '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      '0x11b815efB8f581194ae79006d24E0d814B7697F6': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801': '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // UNI
      '0xCBCdF9626bC03E24f779434178A73a0B4bad62eD': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
      
      // PancakeSwap V2
      '0x7213a321F1855CF1779f42c0CD85d3D95291D34C': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
      '0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
      '0x74E4716E431f45807DCF4f3fA29A161f9F79019e': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
      '0x61EB789d75A95CAa3fF5ed22AB22bD1b5E2b9E32': '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // CAKE
    };
    return fallbackTokens[poolAddress] || null;
  }

  private getFallbackToken1(poolAddress: string, protocol: ProtocolType): string | null {
    // Known token1 addresses for popular pools (correct addresses)
    const fallbackTokens: { [key: string]: string } = {
      // Uniswap V2
      '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852': '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
      '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0xBb2b8038a1640196FbE3e38816F3e67Cba72D940': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0x2fDbAdf3C4D5A8666Bc06645B8358ab803996E28': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0x43AE24960e5534731Fc831386c07755A2dc33D47': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      
      // Uniswap V3
      '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0x11b815efB8f581194ae79006d24E0d814B7697F6': '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
      '0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0xCBCdF9626bC03E24f779434178A73a0B4bad62eD': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      
      // PancakeSwap V2
      '0x7213a321F1855CF1779f42c0CD85d3D95291D34C': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
      '0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
      '0x74E4716E431f45807DCF4f3fA29A161f9F79019e': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0x61EB789d75A95CAa3fF5ed22AB22bD1b5E2b9E32': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    };
    return fallbackTokens[poolAddress] || null;
  }

  getKnownPools(): PoolInfo[] {
    return Array.from(this.knownPools.values());
  }

  getPoolInfo(poolAddress: string): PoolInfo | undefined {
    return this.knownPools.get(poolAddress);
  }

  private getFallbackTokenInfo(tokenAddress: string): TokenInfo | null {
    // Known token information for popular tokens
    const knownTokens: { [key: string]: TokenInfo } = {
      // Ethereum Mainnet
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': { address: tokenAddress, symbol: 'WETH', decimals: 18, name: 'Wrapped Ether' },
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': { address: tokenAddress, symbol: 'USDC', decimals: 6, name: 'USD Coin' },
      '0xdAC17F958D2ee523a2206206994597C13D831ec7': { address: tokenAddress, symbol: 'USDT', decimals: 6, name: 'Tether USD' },
      '0x6B175474E89094C44Da98b954EedeAC495271d0F': { address: tokenAddress, symbol: 'DAI', decimals: 18, name: 'Dai Stablecoin' },
      '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': { address: tokenAddress, symbol: 'WBTC', decimals: 8, name: 'Wrapped BTC' },
      '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': { address: tokenAddress, symbol: 'UNI', decimals: 18, name: 'Uniswap' },
      '0x514910771AF9Ca656af840dff83E8264EcF986CA': { address: tokenAddress, symbol: 'LINK', decimals: 18, name: 'ChainLink Token' },
      '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e': { address: tokenAddress, symbol: 'YFI', decimals: 18, name: 'yearn.finance' },
      '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F': { address: tokenAddress, symbol: 'SNX', decimals: 18, name: 'Synthetix Network Token' },
      
      // BSC Mainnet
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
