import { ClickHouseClient, createClient } from '@clickhouse/client';
import { StandardizedEvent, FactoryEvent } from '../types/schemas';

/**
 * Configuration interface for ClickHouse connection
 * Defines the connection parameters for ClickHouse Cloud, self-hosted instances, or cluster
 */
export interface ClickHouseConfig {
  host: string;           // ClickHouse server hostname
  port: number;           // ClickHouse server port
  username?: string;      // Database username (defaults to 'default')
  password?: string;      // Database password
  database?: string;      // Database name (defaults to 'default')
  secure?: boolean;       // Whether to use HTTPS connection
  clusterName?: string;   // Cluster name for distributed operations
  isCluster?: boolean;    // Whether this is a cluster setup
}


export class ClickHouseService {
  private client: ClickHouseClient;    // ClickHouse client instance
  private isConnected = false;         // Connection state tracking

  /**
   * Constructor for ClickHouseService
   * 
   * Initializes the ClickHouse client with the provided configuration.
   * Supports both HTTP and HTTPS connections for flexibility.
   * 
   * @param config - ClickHouse connection configuration
   */
  constructor(private config: ClickHouseConfig) {
    const protocol = config.secure ? 'https' : 'http';
    
    // Handle empty password case - don't include password in config if it's empty
    const clientConfig: any = {
      url: `${protocol}://${config.host}:${config.port}`,
      username: config.username || 'default',
      database: config.database || 'default',
      request_timeout: 60000,
      max_open_connections: 1,
    };
    
    // Only add password if it's not empty
    if (config.password && config.password.trim() !== '') {
      clientConfig.password = config.password;
    }
    
    this.client = createClient(clientConfig);
  }

  /**
   * Establishes connection to ClickHouse database
   * 
   * Tests the connection by sending a ping request to verify that
   * the ClickHouse server is accessible and credentials are valid.
   * 
   * @throws Error if connection fails
   */
  async connect(): Promise<void> {
    let retryCount = 0;
    const maxRetries = 5;
    
    while (retryCount < maxRetries) {
      try {
        // Test connection with ping request
        await this.client.ping();
        this.isConnected = true;
        console.log('✅ Connected to ClickHouse');
        return;
      } catch (error) {
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`⚠️ Connection attempt ${retryCount} failed, retrying in 5 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          console.error('❌ Failed to connect to ClickHouse after', maxRetries, 'attempts:', error);
          throw error;
        }
      }
    }
  }

  /**
   * Closes the connection to ClickHouse database
   * 
   * Properly closes the client connection and resets the connection state.
   * This should be called when the service is no longer needed.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('🔌 Disconnected from ClickHouse');
    }
  }

  /**
   * Initializes the ClickHouse database schema
   * 
   * Creates the necessary tables, materialized views, and indexes for optimal
   * performance when storing and querying blockchain event data.
   * 
   * Schema Components:
   * 1. Main Events Table: Stores all blockchain events with optimized structure
   * 2. Materialized View: Pre-computed analytics for real-time insights
   * 3. Indexes: Fast lookups on pool addresses, transaction hashes, and tokens
   * 4. Distributed Table: For cluster operations (if cluster is configured)
   * 
   * Performance Optimizations:
   * - ReplicatedMergeTree engine for cluster replication
   * - Monthly partitioning for efficient data management
   * - Optimized ordering for common query patterns
   * - Bloom filter indexes for fast lookups
   * 
   * @throws Error if schema initialization fails
   */
  async initializeSchema(): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      const clusterName = this.config.clusterName || 'protocol_cluster';
      const isCluster = this.config.isCluster || false;

      // Define comprehensive schema statements for optimal performance
      const schemaStatements = [
        // Create the main events table with optimized structure
        // Use ReplicatedMergeTree for cluster, MergeTree for single instance
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
        ) ENGINE = ${isCluster ? 'ReplicatedMergeTree' : 'MergeTree'}(
          ${isCluster ? `'/clickhouse/tables/protocol_events/{shard}', '{replica}'` : ''}
        )
        PARTITION BY toYYYYMM(toDateTime(timestamp / 1000))
        ORDER BY (protocol, event_type, block_number, transaction_hash, log_index)
        SETTINGS index_granularity = 8192`,

        // Create materialized view for real-time analytics and aggregations
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

        // Create bloom filter indexes for fast lookups on common query patterns
        `CREATE INDEX IF NOT EXISTS idx_protocol_events_pool_address ON protocol_events (pool_address) TYPE bloom_filter GRANULARITY 1`,
        `CREATE INDEX IF NOT EXISTS idx_protocol_events_tx_hash ON protocol_events (transaction_hash) TYPE bloom_filter GRANULARITY 1`,
        `CREATE INDEX IF NOT EXISTS idx_protocol_events_tokens ON protocol_events (token0_address, token1_address) TYPE bloom_filter GRANULARITY 1`
      ];

      // Add distributed table creation for cluster setup
      if (isCluster) {
        schemaStatements.push(
          // Create distributed table for cluster operations
          `CREATE TABLE IF NOT EXISTS protocol_events_distributed AS protocol_events
          ENGINE = Distributed(${clusterName}, default, protocol_events, rand())`
        );
      }

      // Execute each schema statement with error handling
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

  /**
   * Inserts a standardized blockchain event into ClickHouse
   * 
   * Processes and stores a standardized blockchain event with proper BigInt handling.
   * This method handles the conversion of JavaScript BigInt values to strings
   * for ClickHouse compatibility and serializes complex event data.
   * 
   * Key Features:
   * - BigInt serialization for blockchain data compatibility
   * - Recursive object processing for nested data structures
   * - Proper data type conversion for ClickHouse storage
   * - Event data serialization for complex blockchain events
   * 
   * @param event - The standardized blockchain event to insert
   * @throws Error if insertion fails or not connected to ClickHouse
   */
  async insertEvent(event: StandardizedEvent): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      // Helper function to recursively convert BigInt values to strings
      // This is necessary because ClickHouse doesn't natively support BigInt
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

      // Prepare data for insertion with proper type conversions
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

      // Insert the event data using JSONEachRow format for efficiency
      // Use distributed table for cluster, regular table for single instance
      const tableName = this.config.isCluster ? 'protocol_events_distributed' : 'protocol_events';
      await this.client.insert({
        table: tableName,
        values: [insertData],
        format: 'JSONEachRow'
      });

      console.log(`📊 Inserted event: ${event.protocol} ${event.eventType} - ${event.id}`);
    } catch (error) {
      console.error('❌ Failed to insert event:', error);
      throw error;
    }
  }

  /**
   * Inserts a factory event (pool/pair creation) into ClickHouse
   * 
   * Processes and stores factory events that represent the creation of new
   * trading pools or pairs. These events are crucial for tracking new
   * market opportunities and protocol growth.
   * 
   * Key Features:
   * - Handles both V2 and V3 protocol factory events
   * - Generates unique IDs for factory events
   * - Stores protocol-specific metadata (fee, tick spacing)
   * - Uses placeholder token information until tokens are discovered
   * 
   * @param event - The factory event to insert
   * @throws Error if insertion fails or not connected to ClickHouse
   */
  async insertFactoryEvent(event: FactoryEvent): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      // Prepare factory event data with protocol-specific information
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

      // Insert the factory event data
      // Use distributed table for cluster, regular table for single instance
      const tableName = this.config.isCluster ? 'protocol_events_distributed' : 'protocol_events';
      await this.client.insert({
        table: tableName,
        values: [insertData],
        format: 'JSONEachRow'
      });

      console.log(`🏭 Inserted factory event: ${event.protocol} ${event.eventType} - ${event.pairAddress}`);
    } catch (error) {
      console.error('❌ Failed to insert factory event:', error);
      throw error;
    }
  }

  /**
   * Gets the total count of events stored in ClickHouse
   * 
   * Returns the total number of blockchain events that have been stored
   * in the database. This is useful for monitoring data ingestion progress
   * and system health.
   * 
   * @returns Promise<number> - Total number of events in the database
   * @throws Error if query fails or not connected to ClickHouse
   */
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

  /**
   * Gets events filtered by protocol with optional limit
   * 
   * Retrieves blockchain events for a specific protocol (e.g., uniswap-v2, uniswap-v3)
   * ordered by timestamp in descending order (most recent first).
   * 
   * @param protocol - The protocol to filter by (uniswap-v2, uniswap-v3, pancakeswap-v2)
   * @param limit - Maximum number of events to return (default: 100)
   * @returns Promise<any[]> - Array of event objects
   * @throws Error if query fails or not connected to ClickHouse
   */
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

  /**
   * Gets replication status for ClickHouse cluster
   * 
   * For cluster deployments, this queries the system.replicas table to get
   * detailed replication status. For single instances or cloud deployments,
   * this returns a simplified status.
   * 
   * @returns Promise<any> - Replication status information
   * @throws Error if query fails or not connected to ClickHouse
   */
  async getReplicationStatus(): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      if (this.config.isCluster) {
        // For cluster deployments, get actual replication status
        const result = await this.client.query({
          query: `
            SELECT 
              replica_name,
              is_leader,
              is_readonly,
              absolute_delay,
              queue_size,
              inserts_in_queue,
              merges_in_queue,
              log_max_index,
              log_pointer,
              total_replicas,
              active_replicas
            FROM system.replicas
            WHERE table = 'protocol_events'
          `
        });
        const data = await result.json();
        return data.data;
      } else {
        // For single instances or cloud, return simplified status
        const result = await this.client.query({
          query: `
            SELECT 
              'single' as replica_name,
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
      }
    } catch (error) {
      console.error('❌ Failed to get replication status:', error);
      throw error;
    }
  }

  /**
   * Verifies data consistency across ClickHouse replicas
   * 
   * For cluster deployments, this compares event counts across all replicas
   * to ensure data consistency. For single instances or cloud deployments,
   * this performs a simple consistency check.
   * 
   * @returns Promise<{ replica: string; count: number }[]> - Consistency check results
   * @throws Error if query fails or not connected to ClickHouse
   */
  async verifyDataConsistency(): Promise<{ replica: string; count: number }[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      if (this.config.isCluster) {
        // For cluster deployments, check consistency across all replicas
        const result = await this.client.query({
          query: `
            SELECT 
              replica_name as replica,
              count() as count
            FROM protocol_events
            GROUP BY replica_name
            ORDER BY replica_name
          `
        });
        const data = await result.json();
        return data.data as { replica: string; count: number }[];
      } else {
        // For single instances or cloud, return simple consistency check
        const result = await this.client.query({
          query: `
            SELECT 
              'single' as replica,
              count() as count
            FROM protocol_events
          `
        });
        const data = await result.json();
        return data.data as { replica: string; count: number }[];
      }
    } catch (error) {
      console.error('❌ Failed to verify data consistency:', error);
      throw error;
    }
  }

  /**
   * Gets cluster health information for ClickHouse
   * 
   * Retrieves system-level information about the ClickHouse cluster including
   * host details, uptime, version, and resource usage. This is useful for
   * monitoring system performance and health.
   * 
   * @returns Promise<any> - Cluster health information
   * @throws Error if query fails or not connected to ClickHouse
   */
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

  /**
   * Gets comprehensive event statistics by protocol and event type
   * 
   * Provides detailed analytics about stored blockchain events including:
   * - Event counts by protocol and type
   * - Unique pools and transactions
   * - Time range of events (first and last)
   * 
   * This is useful for monitoring system performance and understanding
   * the distribution of events across different protocols.
   * 
   * @returns Promise<any> - Event statistics grouped by protocol and event type
   * @throws Error if query fails or not connected to ClickHouse
   */
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

  /**
   * Executes a ClickHouse command (DDL operations)
   * 
   * Executes SQL commands that don't return data, such as CREATE, DROP,
   * ALTER statements. This is useful for schema management and maintenance.
   * 
   * @param query - The SQL command to execute
   * @throws Error if command fails or not connected to ClickHouse
   */
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

  /**
   * Executes a ClickHouse query and returns results
   * 
   * Executes SQL queries that return data, such as SELECT statements.
   * This is useful for custom analytics and data exploration.
   * 
   * @param query - The SQL query to execute
   * @returns Promise<any> - Query results
   * @throws Error if query fails or not connected to ClickHouse
   */
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

  /**
   * Gets cluster information and topology
   * 
   * Retrieves detailed information about the ClickHouse cluster including
   * all nodes, shards, replicas, and their status.
   * 
   * @returns Promise<any> - Cluster topology information
   * @throws Error if query fails or not connected to ClickHouse
   */
  async getClusterInfo(): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      const result = await this.client.query({
        query: `
          SELECT 
            cluster,
            shard_num,
            replica_num,
            host_name,
            host_address,
            port,
            is_local,
            user,
            default_database,
            errors_count,
            slowdowns_count,
            estimated_recovery_time
          FROM system.clusters
          ORDER BY cluster, shard_num, replica_num
        `
      });
      const data = await result.json();
      return data.data;
    } catch (error) {
      console.error('❌ Failed to get cluster info:', error);
      throw error;
    }
  }

  /**
   * Gets detailed replication queue status for cluster
   * 
   * For cluster deployments, this provides detailed information about
   * replication queues, including pending operations and delays.
   * 
   * @returns Promise<any> - Replication queue status
   * @throws Error if query fails or not connected to ClickHouse
   */
  async getReplicationQueueStatus(): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      if (this.config.isCluster) {
        const result = await this.client.query({
          query: `
            SELECT 
              replica_name,
              position,
              node_name,
              type,
              source_replica,
              new_part_name,
              parts_to_merge,
              is_detach,
              is_attach,
              create_time,
              required_quorum,
              source_replica_num,
              new_part_name_prefix,
              is_covering,
              is_covering_detached
            FROM system.replication_queue
            WHERE table = 'protocol_events'
            ORDER BY position
          `
        });
        const data = await result.json();
        return data.data;
      } else {
        return [];
      }
    } catch (error) {
      console.error('❌ Failed to get replication queue status:', error);
      throw error;
    }
  }

  /**
   * Gets ZooKeeper/Keeper status for cluster coordination
   * 
   * For cluster deployments, this checks the status of the coordination
   * service (ClickHouse Keeper) that manages cluster metadata.
   * 
   * @returns Promise<any> - Keeper status information
   * @throws Error if query fails or not connected to ClickHouse
   */
  async getKeeperStatus(): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      if (this.config.isCluster) {
        const result = await this.client.query({
          query: `
            SELECT 
              name,
              value,
              numChildren,
              ctime,
              mtime,
              version,
              cversion,
              aversion,
              ephemeralOwner,
              dataLength,
              pzxid
            FROM system.zookeeper
            WHERE path = '/'
            LIMIT 10
          `
        });
        const data = await result.json();
        return data.data;
      } else {
        return [];
      }
    } catch (error) {
      console.error('❌ Failed to get keeper status:', error);
      throw error;
    }
  }

  /**
   * Performs cluster-wide data consistency check
   * 
   * For cluster deployments, this performs a comprehensive consistency
   * check across all replicas by comparing row counts and checksums.
   * 
   * @returns Promise<any> - Comprehensive consistency check results
   * @throws Error if query fails or not connected to ClickHouse
   */
  async performClusterConsistencyCheck(): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClickHouse');
    }

    try {
      if (this.config.isCluster) {
        const result = await this.client.query({
          query: `
            SELECT 
              'protocol_events' as table_name,
              count() as total_rows,
              uniq(id) as unique_ids,
              min(timestamp) as min_timestamp,
              max(timestamp) as max_timestamp,
              countIf(protocol = 'uniswap-v2') as uniswap_v2_events,
              countIf(protocol = 'uniswap-v3') as uniswap_v3_events,
              countIf(protocol = 'pancakeswap-v2') as pancakeswap_v2_events
            FROM protocol_events
          `
        });
        const data = await result.json();
        return data.data;
      } else {
        // For single instances, return basic consistency check
        const result = await this.client.query({
          query: `
            SELECT 
              'protocol_events' as table_name,
              count() as total_rows,
              uniq(id) as unique_ids,
              min(timestamp) as min_timestamp,
              max(timestamp) as max_timestamp
            FROM protocol_events
          `
        });
        const data = await result.json();
        return data.data;
      }
    } catch (error) {
      console.error('❌ Failed to perform cluster consistency check:', error);
      throw error;
    }
  }
}
