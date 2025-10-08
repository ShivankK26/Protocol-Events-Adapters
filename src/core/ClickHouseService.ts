import { ClickHouseClient, createClient } from '@clickhouse/client';
import { StandardizedEvent, FactoryEvent } from '../types/schemas';

export interface ClickHouseConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  database?: string;
  secure?: boolean;
}

export class ClickHouseService {
  private client: ClickHouseClient;
  private isConnected = false;

  constructor(private config: ClickHouseConfig) {
    const protocol = config.secure ? 'https' : 'http';
    this.client = createClient({
      host: `${protocol}://${config.host}:${config.port}`,
      username: config.username || 'default',
      password: config.password || '',
      database: config.database || 'default',
    });
  }

  async connect(): Promise<void> {
    try {
      // Test connection
      await this.client.ping();
      this.isConnected = true;
      console.log('✅ Connected to ClickHouse');
    } catch (error) {
      console.error('❌ Failed to connect to ClickHouse:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('🔌 Disconnected from ClickHouse');
    }
  }

  async initializeSchema(): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      // Define schema statements directly
      const schemaStatements = [
        // Create the main events table
        `CREATE TABLE IF NOT EXISTS protocol_events (
          id String,
          protocol String,
          version String,
          event_type String,
          timestamp UInt64,
          block_number UInt64,
          transaction_hash String,
          log_index UInt64,
          pool_address String,
          token0_address String,
          token0_symbol String,
          token0_decimals UInt8,
          token0_name String,
          token1_address String,
          token1_symbol String,
          token1_decimals UInt8,
          token1_name String,
          event_data String,
          gas_used String,
          gas_price String,
          fee String,
          created_at DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(toDateTime(timestamp / 1000))
        ORDER BY (protocol, event_type, block_number, transaction_hash, log_index)
        SETTINGS index_granularity = 8192`,

        // Create materialized view for real-time analytics
        `CREATE MATERIALIZED VIEW IF NOT EXISTS protocol_events_mv
        ENGINE = SummingMergeTree()
        PARTITION BY toYYYYMM(toDateTime(timestamp / 1000))
        ORDER BY (protocol, event_type, toStartOfHour(toDateTime(timestamp / 1000)))
        AS SELECT
          protocol,
          event_type,
          toStartOfHour(toDateTime(timestamp / 1000)) as hour,
          count() as event_count,
          uniq(pool_address) as unique_pools,
          uniq(transaction_hash) as unique_transactions
        FROM protocol_events
        GROUP BY protocol, event_type, hour`,

        // Create indexes for fast lookups
        `CREATE INDEX IF NOT EXISTS idx_protocol_events_pool_address ON protocol_events (pool_address) TYPE bloom_filter GRANULARITY 1`,
        `CREATE INDEX IF NOT EXISTS idx_protocol_events_tx_hash ON protocol_events (transaction_hash) TYPE bloom_filter GRANULARITY 1`,
        `CREATE INDEX IF NOT EXISTS idx_protocol_events_tokens ON protocol_events (token0_address, token1_address) TYPE bloom_filter GRANULARITY 1`
      ];

      for (const statement of schemaStatements) {
        try {
          await this.client.command({ query: statement });
          console.log('✅ Executed schema statement');
        } catch (error) {
          console.warn('⚠️ Schema statement failed (might already exist):', error);
        }
      }

      console.log('✅ ClickHouse schema initialized');
    } catch (error) {
      console.error('❌ Failed to initialize schema:', error);
      throw error;
    }
  }

  async insertEvent(event: StandardizedEvent): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      // Helper function to convert BigInt to string recursively
      const serializeBigInt = (obj: any): any => {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj === 'bigint') return obj.toString();
        if (Array.isArray(obj)) return obj.map(serializeBigInt);
        if (typeof obj === 'object') {
          const result: any = {};
          for (const [key, value] of Object.entries(obj)) {
            result[key] = serializeBigInt(value);
          }
          return result;
        }
        return obj;
      };

      const insertData = {
        id: event.id,
        protocol: event.protocol,
        version: event.version,
        event_type: event.eventType,
        timestamp: typeof event.timestamp === 'bigint' ? (event.timestamp as bigint).toString() : Number(event.timestamp),
        block_number: typeof event.blockNumber === 'bigint' ? (event.blockNumber as bigint).toString() : Number(event.blockNumber),
        transaction_hash: event.transactionHash,
        log_index: typeof event.logIndex === 'bigint' ? (event.logIndex as bigint).toString() : Number(event.logIndex),
        pool_address: event.poolAddress,
        token0_address: event.token0.address,
        token0_symbol: event.token0.symbol,
        token0_decimals: typeof event.token0.decimals === 'bigint' ? (event.token0.decimals as bigint).toString() : Number(event.token0.decimals),
        token0_name: event.token0.name || '',
        token1_address: event.token1.address,
        token1_symbol: event.token1.symbol,
        token1_decimals: typeof event.token1.decimals === 'bigint' ? (event.token1.decimals as bigint).toString() : Number(event.token1.decimals),
        token1_name: event.token1.name || '',
        event_data: JSON.stringify(serializeBigInt(event.data)),
        gas_used: event.gasUsed || '',
        gas_price: event.gasPrice || '',
        fee: event.fee || ''
      };

      await this.client.insert({
        table: 'protocol_events',
        values: [insertData],
        format: 'JSONEachRow'
      });

      console.log(`📊 Inserted event: ${event.protocol} ${event.eventType} - ${event.id}`);
    } catch (error) {
      console.error('❌ Failed to insert event:', error);
      throw error;
    }
  }

  async insertFactoryEvent(event: FactoryEvent): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      const insertData = {
        id: `factory-${event.transactionHash}-${Date.now()}`,
        protocol: event.protocol,
        version: event.protocol.includes('v2') ? 'v2' : 'v3',
        event_type: event.eventType,
        timestamp: Date.now(),
        block_number: typeof event.blockNumber === 'bigint' ? (event.blockNumber as bigint).toString() : Number(event.blockNumber),
        transaction_hash: event.transactionHash,
        log_index: 0,
        pool_address: event.pairAddress,
        token0_address: event.token0,
        token0_symbol: 'UNKNOWN',
        token0_decimals: 18,
        token0_name: 'Unknown Token',
        token1_address: event.token1,
        token1_symbol: 'UNKNOWN',
        token1_decimals: 18,
        token1_name: 'Unknown Token',
        event_data: JSON.stringify({
          type: event.eventType,
          fee: typeof event.fee === 'bigint' ? (event.fee as bigint).toString() : (event.fee ? Number(event.fee) : undefined),
          tickSpacing: typeof event.tickSpacing === 'bigint' ? (event.tickSpacing as bigint).toString() : (event.tickSpacing ? Number(event.tickSpacing) : undefined)
        }),
        gas_used: '',
        gas_price: '',
        fee: typeof event.fee === 'bigint' ? (event.fee as bigint).toString() : (event.fee ? Number(event.fee).toString() : '')
      };

      await this.client.insert({
        table: 'protocol_events',
        values: [insertData],
        format: 'JSONEachRow'
      });

      console.log(`🏭 Inserted factory event: ${event.protocol} ${event.eventType} - ${event.pairAddress}`);
    } catch (error) {
      console.error('❌ Failed to insert factory event:', error);
      throw error;
    }
  }

  async getEventCount(): Promise<number> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      const result = await this.client.query({
        query: 'SELECT count() as count FROM protocol_events'
      });
      const data = await result.json();
      return (data.data as any[])[0].count;
    } catch (error) {
      console.error('❌ Failed to get event count:', error);
      throw error;
    }
  }

  async getEventsByProtocol(protocol: string, limit: number = 100): Promise<any[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      const result = await this.client.query({
        query: `SELECT * FROM protocol_events WHERE protocol = '${protocol}' ORDER BY timestamp DESC LIMIT ${limit}`
      });
      const data = await result.json();
      return data.data as any[];
    } catch (error) {
      console.error('❌ Failed to get events by protocol:', error);
      throw error;
    }
  }

  async getReplicationStatus(): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      // For ClickHouse Cloud, we don't have replication tables
      // Return a simple status instead
      const result = await this.client.query({
        query: `
          SELECT 
            'cloud' as replica,
            true as is_leader,
            false as is_readonly,
            0 as absolute_delay,
            0 as queue_size,
            0 as inserts_in_queue,
            0 as merges_in_queue
        `
      });
      const data = await result.json();
      return data.data;
    } catch (error) {
      console.error('❌ Failed to get replication status:', error);
      throw error;
    }
  }

  async verifyDataConsistency(): Promise<{ replica: string; count: number }[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      // For ClickHouse Cloud, we don't have replication tables
      // Return a simple consistency check
      const result = await this.client.query({
        query: `
          SELECT 
            'cloud' as replica,
            count() as count
          FROM protocol_events
        `
      });
      const data = await result.json();
      return data.data as { replica: string; count: number }[];
    } catch (error) {
      console.error('❌ Failed to verify data consistency:', error);
      throw error;
    }
  }

  async getClusterHealth(): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      const result = await this.client.query({
        query: `
          SELECT 
            hostName() as host,
            uptime(),
            version(),
            memory_usage,
            cpu_usage
          FROM system.processes
          WHERE query_id = (SELECT query_id FROM system.processes WHERE query LIKE '%SELECT%' LIMIT 1)
        `
      });
      const data = await result.json();
      return data.data;
    } catch (error) {
      console.error('❌ Failed to get cluster health:', error);
      throw error;
    }
  }

  async getEventStats(): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      const result = await this.client.query({
        query: `
          SELECT 
            protocol,
            event_type,
            count() as event_count,
            uniq(pool_address) as unique_pools,
            uniq(transaction_hash) as unique_transactions,
            min(toDateTime(timestamp / 1000)) as first_event,
            max(toDateTime(timestamp / 1000)) as last_event
          FROM protocol_events
          GROUP BY protocol, event_type
          ORDER BY event_count DESC
        `
      });
      const data = await result.json();
      return data.data;
    } catch (error) {
      console.error('❌ Failed to get event stats:', error);
      throw error;
    }
  }

  async executeCommand(query: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      await this.client.command({ query });
    } catch (error) {
      console.error('❌ Failed to execute command:', error);
      throw error;
    }
  }

  async executeQuery(query: string): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      const result = await this.client.query({ query });
      const data = await result.json();
      return data;
    } catch (error) {
      console.error('❌ Failed to execute query:', error);
      throw error;
    }
  }
}
