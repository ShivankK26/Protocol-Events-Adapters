import { EventEmitter } from 'events';
import { ClickHouseService } from './ClickHouseService';
import { ProtocolEventListener } from './EventListener';
import { StandardizedEvent, FactoryEvent } from '../types/schemas';

export interface DataIngestionConfig {
  clickhouse: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    database?: string;
  };
  blockchain: {
    ethereum: {
      rpcUrl: string;
      wsUrl?: string;
    };
    bsc: {
      rpcUrl: string;
      wsUrl?: string;
    };
  };
}

export class DataIngestionService extends EventEmitter {
  private clickhouseService: ClickHouseService;
  private ethereumListener: ProtocolEventListener | null = null;
  private bscListener: ProtocolEventListener | null = null;
  private isRunning = false;
  private eventBuffer: StandardizedEvent[] = [];
  private factoryEventBuffer: FactoryEvent[] = [];
  private batchSize = 100;
  private flushInterval = 5000; // 5 seconds
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private config: DataIngestionConfig) {
    super();
    this.clickhouseService = new ClickHouseService(config.clickhouse);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Data ingestion service is already running');
    }

    console.log('🚀 Starting data ingestion service...');

    try {
      // Connect to ClickHouse
      await this.clickhouseService.connect();
      await this.clickhouseService.initializeSchema();
      console.log('✅ ClickHouse connected and schema initialized');

      // Start blockchain listeners
      await this.startBlockchainListeners();

      // Start batch processing
      this.startBatchProcessing();

      this.isRunning = true;
      console.log('✅ Data ingestion service started successfully');

      // Emit startup event
      this.emit('started');

    } catch (error) {
      console.error('❌ Failed to start data ingestion service:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping data ingestion service...');

    try {
      // Stop blockchain listeners
      if (this.ethereumListener) {
        await this.ethereumListener.stop();
        this.ethereumListener = null;
      }

      if (this.bscListener) {
        await this.bscListener.stop();
        this.bscListener = null;
      }

      // Flush remaining events
      await this.flushBuffers();

      // Stop batch processing
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }

      // Disconnect from ClickHouse
      await this.clickhouseService.disconnect();

      this.isRunning = false;
      console.log('✅ Data ingestion service stopped');

      // Emit stop event
      this.emit('stopped');

    } catch (error) {
      console.error('❌ Error stopping data ingestion service:', error);
      throw error;
    }
  }

  private async startBlockchainListeners(): Promise<void> {
    // Start Ethereum listener
    this.ethereumListener = new ProtocolEventListener({
      rpcUrl: this.config.blockchain.ethereum.rpcUrl,
      wsUrl: this.config.blockchain.ethereum.wsUrl,
      chainId: 1,
      protocols: ['uniswap-v2', 'uniswap-v3']
    });

    // Start BSC listener
    this.bscListener = new ProtocolEventListener({
      rpcUrl: this.config.blockchain.bsc.rpcUrl,
      wsUrl: this.config.blockchain.bsc.wsUrl,
      chainId: 56,
      protocols: ['pancakeswap-v2']
    });

    // Set up event handlers for Ethereum
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

    // Set up event handlers for BSC
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

    // Start both listeners
    await Promise.all([
      this.ethereumListener.start(),
      this.bscListener.start()
    ]);

    console.log('✅ Blockchain listeners started');
  }

  private handleStandardizedEvent(event: StandardizedEvent): void {
    this.eventBuffer.push(event);
    
    // Emit event for real-time monitoring
    this.emit('event', event);

    // Flush if buffer is full
    if (this.eventBuffer.length >= this.batchSize) {
      this.flushEvents();
    }
  }

  private handleFactoryEvent(event: FactoryEvent): void {
    this.factoryEventBuffer.push(event);
    
    // Emit event for real-time monitoring
    this.emit('factoryEvent', event);

    // Flush if buffer is full
    if (this.factoryEventBuffer.length >= this.batchSize) {
      this.flushFactoryEvents();
    }
  }

  private startBatchProcessing(): void {
    this.flushTimer = setInterval(() => {
      this.flushBuffers();
    }, this.flushInterval);
  }

  private async flushBuffers(): Promise<void> {
    await Promise.all([
      this.flushEvents(),
      this.flushFactoryEvents()
    ]);
  }

  private async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      for (const event of eventsToFlush) {
        await this.clickhouseService.insertEvent(event);
      }
      console.log(`📊 Flushed ${eventsToFlush.length} events to ClickHouse`);
    } catch (error) {
      console.error('❌ Failed to flush events:', error);
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...eventsToFlush);
    }
  }

  private async flushFactoryEvents(): Promise<void> {
    if (this.factoryEventBuffer.length === 0) {
      return;
    }

    const eventsToFlush = [...this.factoryEventBuffer];
    this.factoryEventBuffer = [];

    try {
      for (const event of eventsToFlush) {
        await this.clickhouseService.insertFactoryEvent(event);
      }
      console.log(`🏭 Flushed ${eventsToFlush.length} factory events to ClickHouse`);
    } catch (error) {
      console.error('❌ Failed to flush factory events:', error);
      // Re-add events to buffer for retry
      this.factoryEventBuffer.unshift(...eventsToFlush);
    }
  }

  // Public methods for monitoring and analytics
  async getEventCount(): Promise<number> {
    return await this.clickhouseService.getEventCount();
  }

  async getEventsByProtocol(protocol: string, limit: number = 100): Promise<any[]> {
    return await this.clickhouseService.getEventsByProtocol(protocol, limit);
  }

  async getReplicationStatus(): Promise<any> {
    return await this.clickhouseService.getReplicationStatus();
  }

  async verifyDataConsistency(): Promise<{ replica: string; count: number }[]> {
    return await this.clickhouseService.verifyDataConsistency();
  }

  async getClusterHealth(): Promise<any> {
    return await this.clickhouseService.getClusterHealth();
  }

  async getEventStats(): Promise<any> {
    return await this.clickhouseService.getEventStats();
  }

  getBufferStatus(): { events: number; factoryEvents: number } {
    return {
      events: this.eventBuffer.length,
      factoryEvents: this.factoryEventBuffer.length
    };
  }

  isServiceRunning(): boolean {
    return this.isRunning;
  }
}
