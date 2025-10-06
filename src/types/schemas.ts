/**
 * Standardized schema for DEX transactions across all protocols
 * This ensures consistent data structure regardless of the source protocol
 */

export interface StandardizedEvent {
  // Core identification
  id: string;
  protocol: ProtocolType;
  version: string;
  eventType: EventType;
  timestamp: number;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  
  // Pool/Pair information
  poolAddress: string;
  token0: TokenInfo;
  token1: TokenInfo;
  
  // Event-specific data
  data: SwapEventData | LiquidityEventData | SyncEventData | InitializeEventData;
  
  // Additional metadata
  gasUsed?: string;
  gasPrice?: string;
  fee?: string;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
}

export interface SwapEventData {
  type: 'swap';
  sender: string;
  recipient: string;
  amount0In: string;
  amount1In: string;
  amount0Out: string;
  amount1Out: string;
  priceImpact?: string;
  fee?: string;
  tick?: number; // For Uniswap V3
  sqrtPriceX96?: string; // For Uniswap V3
}

export interface LiquidityEventData {
  type: 'mint' | 'burn';
  sender: string;
  owner: string;
  amount0: string;
  amount1: string;
  liquidity: string;
  tickLower?: number; // For Uniswap V3
  tickUpper?: number; // For Uniswap V3
}

export interface SyncEventData {
  type: 'sync';
  reserve0: string;
  reserve1: string;
}

export interface InitializeEventData {
  type: 'initialize';
  sqrtPriceX96: string;
  tick: number;
}

export type ProtocolType = 'uniswap-v2' | 'uniswap-v3' | 'pancakeswap-v2';
export type EventType = 'swap' | 'mint' | 'burn' | 'sync' | 'initialize' | 'collect' | 'flash';

export interface PoolInfo {
  address: string;
  protocol: ProtocolType;
  version: string;
  token0: TokenInfo;
  token1: TokenInfo;
  fee?: number; // For Uniswap V3
  tickSpacing?: number; // For Uniswap V3
  createdAt: number;
  isActive: boolean;
}

export interface FactoryEvent {
  protocol: ProtocolType;
  eventType: 'pair_created' | 'pool_created';
  token0: string;
  token1: string;
  pairAddress: string;
  fee?: number; // For Uniswap V3
  tickSpacing?: number; // For Uniswap V3
  blockNumber: number;
  transactionHash: string;
}
