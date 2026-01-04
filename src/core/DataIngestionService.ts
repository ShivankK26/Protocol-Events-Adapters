import { EventEmitter } from 'events';
import { ClickHouseService } from './ClickHouseService';
import { ProtocolEventListener } from './EventListener';
import { StandardizedEvent, FactoryEvent } from '../types/schemas';

/**
 * Configuration interface for the Data Ingestion Service
 * Defines the connection parameters for both ClickHouse and blockchain networks
 */
export interface DataIngestionConfig {
  clickhouse: {
    host: string;           // ClickHouse server hostname
    port: number;          // ClickHouse server port
    username?: string;     // Database username
    password?: string;     // Database password
    database?: string;     // Database name
    clusterName: string;   // ClickHouse cluster name
  };
  blockchain: {
    ethereum: {
      rpcUrl: string;      // Ethereum RPC endpoint
      wsUrl?: string;      // Ethereum WebSocket endpoint
    };
    bsc: {
      rpcUrl: string;      // BSC RPC endpoint
      wsUrl?: string;      // BSC WebSocket endpoint
    };
  };
}

/**
 * Data Ingestion Service Class
 * 
 * This is the main orchestration service that coordinates the entire data pipeline:
 * 
 * Core Responsibilities:
 * - Manages blockchain event listeners for multiple chains (Ethereum, BSC)
 * - Handles event buffering and batch processing for optimal performance
 * - Coordinates data storage in ClickHouse with proper error handling
 * - Provides real-time monitoring and analytics capabilities
 * 
 * Architecture:
 * - Event-driven design using EventEmitter pattern
 * - Multi-chain support (Ethereum, BSC) with protocol-specific listeners
 * - Buffered data ingestion for high-throughput scenarios
 * - Automatic retry mechanisms for failed operations
 * - Comprehensive monitoring and health checks
 * 
 * Data Flow:
 * 1. Blockchain events → Event Listeners → Event Buffers
 * 2. Buffered events → Batch processing → ClickHouse storage
 * 3. Real-time monitoring → Analytics queries → Dashboard updates
 */
export class DataIngestionService extends EventEmitter {
  private clickhouseService: ClickHouseService;           // ClickHouse database service
  private ethereumListener: ProtocolEventListener | null = null;  // Ethereum blockchain listener
  private bscListener: ProtocolEventListener | null = null;      // BSC blockchain listener
  private isRunning = false;                             // Service state tracking
  private eventBuffer: StandardizedEvent[] = [];        // Buffer for trading events
  private factoryEventBuffer: FactoryEvent[] = [];       // Buffer for factory events
  private batchSize = 100;                               // Batch size for processing
  private flushInterval = 5000;                          // Flush interval in milliseconds
  private flushTimer: NodeJS.Timeout | null = null;      // Timer for periodic flushing

  /**
   * Constructor for DataIngestionService
   * 
   * Initializes the service with configuration for ClickHouse and blockchain networks.
   * Sets up the ClickHouse service and prepares for blockchain listener initialization.
   * 
   * @param config - Configuration object containing ClickHouse and blockchain settings
   */
  constructor(private config: DataIngestionConfig) {
    super();
    this.clickhouseService = new ClickHouseService(config.clickhouse);
  }

  /**
   * Starts the data ingestion service
   * 
   * Initializes the complete data pipeline by:
   * 1. Connecting to ClickHouse and initializing schema
   * 2. Starting blockchain listeners for Ethereum and BSC
   * 3. Setting up batch processing for efficient data handling
   * 4. Emitting startup events for monitoring
   * 
   * The service will begin listening to blockchain events immediately
   * and start buffering them for batch processing to ClickHouse.
   *  
   * @throws Error if service is already running or initialization fails
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Data ingestion service is already running');
    }

    console.log('🚀 Starting data ingestion service...');

    try {
      // Connect to ClickHouse and initialize database schema
      await this.clickhouseService.connect();
      await this.clickhouseService.initializeSchema();
      console.log('✅ ClickHouse connected and schema initialized');

      // Start blockchain listeners for both Ethereum and BSC
      await this.startBlockchainListeners();

      // Start batch processing for efficient data handling
      this.startBatchProcessing();

      this.isRunning = true;
      console.log('✅ Data ingestion service started successfully');

      // Emit startup event for monitoring systems
      this.emit('started');

    } catch (error) {
      console.error('❌ Failed to start data ingestion service:', error);
      throw error;
    }
  }

  /**
   * Stops the data ingestion service gracefully
   * 
   * Performs a clean shutdown by:
   * 1. Stopping all blockchain listeners
   * 2. Flushing any remaining buffered events to ClickHouse
   * 3. Clearing batch processing timers
   * 4. Disconnecting from ClickHouse
   * 5. Emitting stop events for monitoring
   * 
   * This ensures no data loss during shutdown and proper resource cleanup.
   * 
   * @throws Error if shutdown process fails
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping data ingestion service...');

    try {
      // Stop blockchain listeners gracefully
      if (this.ethereumListener) {
        await this.ethereumListener.stop();
        this.ethereumListener = null;
      }

      if (this.bscListener) {
        await this.bscListener.stop();
        this.bscListener = null;
      }

      // Flush any remaining events to prevent data loss
      await this.flushBuffers();

      // Stop batch processing timer
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }

      // Disconnect from ClickHouse
      await this.clickhouseService.disconnect();

      this.isRunning = false;
      console.log('✅ Data ingestion service stopped');

      // Emit stop event for monitoring systems
      this.emit('stopped');

    } catch (error) {
      console.error('❌ Error stopping data ingestion service:', error);
      throw error;
    }
  }

  /**
   * Initializes and starts blockchain listeners for Ethereum and BSC
   * 
   * Sets up protocol-specific event listeners for both blockchain networks:
   * - Ethereum: Uniswap V2 and V3 protocols
   * - BSC: PancakeSwap V2 protocol
   * 
   * Each listener is configured with:
   * - Appropriate RPC and WebSocket endpoints
   * - Chain-specific protocol support
   * - Event handlers for standardized and factory events
   * - Error handling and monitoring
   * 
   * @throws Error if listener initialization fails
   */
  private async startBlockchainListeners(): Promise<void> {
    // Initialize Ethereum listener for Uniswap protocols
    this.ethereumListener = new ProtocolEventListener({
      rpcUrl: this.config.blockchain.ethereum.rpcUrl,
      wsUrl: this.config.blockchain.ethereum.wsUrl,
      chainId: 1,
      protocols: ['uniswap-v2', 'uniswap-v3']
    });

    // Initialize BSC listener for PancakeSwap protocol
    this.bscListener = new ProtocolEventListener({
      rpcUrl: this.config.blockchain.bsc.rpcUrl,
      wsUrl: this.config.blockchain.bsc.wsUrl,
      chainId: 56,
      protocols: ['pancakeswap-v2']
    });

    // Set up event handlers for Ethereum listener
    this.ethereumListener.on('standardizedEvent', (event: StandardizedEvent) => {
      this.handleStandardizedEvent(event);
    });

    this.ethereumListener.on('factoryEvent', (event: FactoryEvent) => {
      this.handleFactoryEvent(event);
    });

    this.ethereumListener.on('error', (error: any) => {
      console.error('🔴 Ethereum Listener Error:', error);
      this.emit('error', { source: 'ethereum', error });
    });

    // Set up event handlers for BSC listener
    this.bscListener.on('standardizedEvent', (event: StandardizedEvent) => {
      this.handleStandardizedEvent(event);
    });

    this.bscListener.on('factoryEvent', (event: FactoryEvent) => {
      this.handleFactoryEvent(event);
    });

    this.bscListener.on('error', (error: any) => {
      console.error('🔴 BSC Listener Error:', error);
      this.emit('error', { source: 'bsc', error });
    });

    // Start both listeners concurrently
    await Promise.all([
      this.ethereumListener.start(),
      this.bscListener.start()
    ]);

    console.log('✅ Blockchain listeners started');
  }

  /**
   * Handles incoming standardized blockchain events
   * 
   * Processes standardized events from blockchain listeners by:
   * 1. Adding them to the event buffer for batch processing
   * 2. Emitting the event for real-time monitoring
   * 3. Triggering immediate flush if buffer reaches capacity
   * 
   * This method ensures efficient data handling while maintaining
   * real-time event availability for monitoring systems.
   * 
   * @param event - The standardized blockchain event to process
   */
  private handleStandardizedEvent(event: StandardizedEvent): void {
    this.eventBuffer.push(event);
    
    // Emit event for real-time monitoring and dashboards
    this.emit('event', event);

    // Trigger immediate flush if buffer reaches capacity
    if (this.eventBuffer.length >= this.batchSize) {
      this.flushEvents();
    }
  }

  /**
   * Handles incoming factory events (pool/pair creation)
   * 
   * Processes factory events from blockchain listeners by:
   * 1. Adding them to the factory event buffer for batch processing
   * 2. Emitting the event for real-time monitoring
   * 3. Triggering immediate flush if buffer reaches capacity
   * 
   * Factory events are crucial for tracking new market opportunities
   * and protocol growth.
   * 
   * @param event - The factory event to process
   */
  private handleFactoryEvent(event: FactoryEvent): void {
    this.factoryEventBuffer.push(event);
    
    // Emit event for real-time monitoring and dashboards
    this.emit('factoryEvent', event);

    // Trigger immediate flush if buffer reaches capacity
    if (this.factoryEventBuffer.length >= this.batchSize) {
      this.flushFactoryEvents();
    }
  }

  /**
   * Starts the batch processing timer
   * 
   * Sets up a periodic timer to flush buffered events to ClickHouse
   * at regular intervals. This ensures data is persisted even when
   * the buffer doesn't reach capacity.
   */
  private startBatchProcessing(): void {
    this.flushTimer = setInterval(() => {
      this.flushBuffers();
    }, this.flushInterval);
  }

  /**
   * Flushes both event buffers to ClickHouse concurrently
   * 
   * Processes both standardized events and factory events in parallel
   * for optimal performance. This method is called by the batch processing
   * timer and when buffers reach capacity.
   */
  private async flushBuffers(): Promise<void> {
    await Promise.all([
      this.flushEvents(),
      this.flushFactoryEvents()
    ]);
  }

  /**
   * Flushes standardized events buffer to ClickHouse
   * 
   * Processes all buffered standardized events and inserts them into
   * ClickHouse. Implements retry logic by re-adding failed events
   * back to the buffer for subsequent attempts.
   * 
   * @throws Error if ClickHouse insertion fails (events are re-buffered)
   */
  private async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    // Create a copy of events to flush and clear the buffer
    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      // Insert each event into ClickHouse
      for (const event of eventsToFlush) {
        await this.clickhouseService.insertEvent(event);
      }
      console.log(`📊 Flushed ${eventsToFlush.length} events to ClickHouse`);
    } catch (error) {
      console.error('❌ Failed to flush events:', error);
      // Re-add events to buffer for retry on next flush cycle
      this.eventBuffer.unshift(...eventsToFlush);
    }
  }

  /**
   * Flushes factory events buffer to ClickHouse
   * 
   * Processes all buffered factory events and inserts them into
   * ClickHouse. Implements retry logic by re-adding failed events
   * back to the buffer for subsequent attempts.
   * 
   * @throws Error if ClickHouse insertion fails (events are re-buffered)
   */
  private async flushFactoryEvents(): Promise<void> {
    if (this.factoryEventBuffer.length === 0) {
      return;
    }

    // Create a copy of events to flush and clear the buffer
    const eventsToFlush = [...this.factoryEventBuffer];
    this.factoryEventBuffer = [];

    try {
      // Insert each factory event into ClickHouse
      for (const event of eventsToFlush) {
        await this.clickhouseService.insertFactoryEvent(event);
      }
      console.log(`🏭 Flushed ${eventsToFlush.length} factory events to ClickHouse`);
    } catch (error) {
      console.error('❌ Failed to flush factory events:', error);
      // Re-add events to buffer for retry on next flush cycle
      this.factoryEventBuffer.unshift(...eventsToFlush);
    }
  }

  // ==================== PUBLIC MONITORING AND ANALYTICS METHODS ====================

  /**
   * Gets the total count of events stored in ClickHouse
   * 
   * @returns Promise<number> - Total number of events in the database
   */
  async getEventCount(): Promise<number> {
    return await this.clickhouseService.getEventCount();
  }

  /**
   * Gets events filtered by protocol with optional limit
   * 
   * @param protocol - The protocol to filter by (uniswap-v2, uniswap-v3, pancakeswap-v2)
   * @param limit - Maximum number of events to return (default: 100)
   * @returns Promise<any[]> - Array of event objects
   */
  async getEventsByProtocol(protocol: string, limit: number = 100): Promise<any[]> {
    return await this.clickhouseService.getEventsByProtocol(protocol, limit);
  }

  /**
   * Gets replication status for ClickHouse cluster
   * 
   * @returns Promise<any> - Replication status information
   */
  async getReplicationStatus(): Promise<any> {
    return await this.clickhouseService.getReplicationStatus();
  }

  /**
   * Verifies data consistency across ClickHouse replicas
   * 
   * @returns Promise<{ replica: string; count: number }[]> - Consistency check results
   */
  async verifyDataConsistency(): Promise<{ replica: string; count: number }[]> {
    return await this.clickhouseService.verifyDataConsistency();
  }

  /**
   * Gets cluster health information for ClickHouse
   * 
   * @returns Promise<any> - Cluster health information
   */
  async getClusterHealth(): Promise<any> {
    return await this.clickhouseService.getClusterHealth();
  }

  /**
   * Gets comprehensive event statistics by protocol and event type
   * 
   * @returns Promise<any> - Event statistics grouped by protocol and event type
   */
  async getEventStats(): Promise<any> {
    return await this.clickhouseService.getEventStats();
  }

  /**
   * Gets the current status of event buffers
   * 
   * Returns the number of events currently buffered in memory,
   * which is useful for monitoring system performance and
   * understanding data flow.
   * 
   * @returns Object containing buffer sizes for events and factory events
   */
  getBufferStatus(): { events: number; factoryEvents: number } {
    return {
      events: this.eventBuffer.length,
      factoryEvents: this.factoryEventBuffer.length
    };
  }

  /**
   * Checks if the data ingestion service is currently running
   * 
   * @returns boolean - True if service is running, false otherwise
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }
}
