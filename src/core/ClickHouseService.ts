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
      // Read and execute schema
      const fs = await import('fs');
      const path = await import('path');
      const schemaPath = path.join(process.cwd(), 'clickhouse-config', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      // Split schema into individual statements
      const statements = schema
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
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
      const insertData = {
        id: event.id,
        protocol: event.protocol,
        version: event.version,
        event_type: event.eventType,
        timestamp: event.timestamp,
        block_number: event.blockNumber,
        transaction_hash: event.transactionHash,
        log_index: event.logIndex,
        pool_address: event.poolAddress,
        token0_address: event.token0.address,
        token0_symbol: event.token0.symbol,
        token0_decimals: event.token0.decimals,
        token0_name: event.token0.name || '',
        token1_address: event.token1.address,
        token1_symbol: event.token1.symbol,
        token1_decimals: event.token1.decimals,
        token1_name: event.token1.name || '',
        event_data: JSON.stringify(event.data),
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
        block_number: event.blockNumber,
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
          fee: event.fee,
          tickSpacing: event.tickSpacing
        }),
        gas_used: '',
        gas_price: '',
        fee: event.fee?.toString() || ''
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
      return data.data[0].count;
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
      return data.data;
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
      const result = await this.client.query({
        query: `
          SELECT 
            replica,
            is_leader,
            is_readonly,
            absolute_delay,
            queue_size,
            inserts_in_queue,
            merges_in_queue
          FROM system.replicas
          WHERE database = 'default' AND table = 'protocol_events'
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
      const result = await this.client.query({
        query: `
          SELECT 
            replica,
            count() as count
          FROM system.replicas
          WHERE database = 'default' AND table = 'protocol_events'
          GROUP BY replica
        `
      });
      const data = await result.json();
      return data.data;
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
}
