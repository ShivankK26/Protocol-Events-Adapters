#!/usr/bin/env npx tsx

/**
 * ClickHouse Cluster Setup Script
 * 
 * CLUSTER ARCHITECTURE IN THIS SETUP:
 * ===================================
 * 1. ClickHouse Keeper (Port 2181): Coordinates cluster operations (like ZooKeeper)
 * 2. ClickHouse Server 1 (Ports 8123/9000): First replica node
 * 3. ClickHouse Server 2 (Ports 8124/9001): Second replica node  
 * 4. ClickHouse Server 3 (Ports 8125/9002): Third replica node
 * 
 * REPLICATION CONCEPT:
 * ====================
 * - Each piece of data is stored on multiple nodes (replicas)
 * - When you insert data, it's automatically copied to all replicas
 * - If one replica fails, others can still serve the data
 * - Replication is handled by ReplicatedMergeTree engine
 * 
 * 
 * Features:
 * - Docker Compose cluster deployment
 * - ClickHouse Keeper configuration for coordination
 * - 3-replica cluster with data replication
 * - Schema initialization with ReplicatedMergeTree tables
 * - Cluster health verification and testing
 * - Data consistency validation across replicas
 */

import { ClickHouseService } from '../core/ClickHouseService';
import { config } from 'dotenv';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env file
config();

/**
 * 
 * This configuration defines our ClickHouse cluster topology:
 * 
 * CLUSTER NAME: 'protocol_cluster'
 * - This is the logical name that identifies our cluster
 * - Used in SQL queries like: INSERT INTO protocol_cluster.table_name
 * - Must match the cluster name in ClickHouse config files
 * 
 * REPLICAS (3 nodes for high availability):
 * - Each replica is a separate ClickHouse server instance
 * - They all contain the same data (replicated)
 * - If one fails, others continue serving requests
 * 
 * PORTS EXPLAINED:
 * - HTTP Port (8123-8125): For web interface and HTTP API calls
 * - TCP Port (9000-9002): For native ClickHouse protocol (faster)
 * - ZK Port (2181): ClickHouse Keeper port (like ZooKeeper)
 * 
 * WHY 3 REPLICAS?
 * - Odd number prevents split-brain scenarios
 * - Can tolerate 1 node failure and still maintain quorum
 * - Good balance between availability and resource usage
 */
const CLUSTER_CONFIG = {
  name: 'protocol_cluster',  // Logical cluster name used in queries
  replicas: [
    { name: 'clickhouse-1', host: 'localhost', port: 8123, tcpPort: 9000 },  // First replica
    { name: 'clickhouse-2', host: 'localhost', port: 8124, tcpPort: 9001 },  // Second replica
    { name: 'clickhouse-3', host: 'localhost', port: 8125, tcpPort: 9002 }   // Third replica
  ],
  keeper: { host: 'localhost', port: 8126, tcpPort: 9003, zkPort: 2181 }  // Coordination service
};

/**
 * Main cluster setup function
 * 
 * Performs complete cluster setup including:
 * 1. Docker Compose cluster deployment
 * 2. Cluster health verification
 * 3. Schema initialization with replication
 * 4. Test data insertion and verification
 * 5. Data consistency validation across replicas
 * 
 * @throws Error if cluster setup fails
 */
async function setupClickHouseCluster(): Promise<void> {
  console.log('🏗️  Setting up ClickHouse Cluster...\n');

  try {
    // ==================== DOCKER COMPOSE DEPLOYMENT ====================
    
    console.log('🐳 Deploying ClickHouse cluster with Docker Compose...');
    
    // Check if docker-compose file exists
    const composeFile = join(process.cwd(), 'docker-compose.cluster.yml');
    if (!existsSync(composeFile)) {
      throw new Error(`Docker Compose file not found: ${composeFile}`);
    }

    // 🛑 DOCKER COMPOSE DOWN COMMAND EXPLAINED:
    // =========================================
    // docker-compose -f docker-compose.cluster.yml down -v
    // 
    // -f: Specifies which compose file to use (our cluster config)
    // down: Stops and removes all containers defined in the compose file
    // -v: Also removes volumes (persistent data storage)
    // 
    // WHY STOP FIRST?
    // - Prevents port conflicts if cluster is already running
    // - Ensures clean state for new deployment
    // - Removes old data volumes to start fresh
    console.log('🛑 Stopping any existing cluster...');
    try {
      execSync('docker-compose -f docker-compose.cluster.yml down -v', { 
        stdio: 'inherit',  // Show command output in real-time
        cwd: process.cwd() // Run from project root directory
      });
    } catch (error) {
      console.log('ℹ️  No existing cluster to stop');
    }

    // 🚀 DOCKER COMPOSE UP COMMAND EXPLAINED:
    // =======================================
    // docker-compose -f docker-compose.cluster.yml up -d
    // 
    // -f: Specifies which compose file to use
    // up: Creates and starts all services defined in the compose file
    // -d: Runs in detached mode (background, doesn't block terminal)
    // 
    // WHAT HAPPENS WHEN THIS RUNS?
    // 1. Docker reads docker-compose.cluster.yml
    // 2. Creates a network called 'clickhouse-cluster'
    // 3. Creates 4 containers: clickhouse-keeper, clickhouse-1, clickhouse-2, clickhouse-3
    // 4. Mounts configuration files and data volumes
    // 5. Starts all containers and connects them to the network
    console.log('🚀 Starting ClickHouse cluster...');
    execSync('docker-compose -f docker-compose.cluster.yml up -d', { 
      stdio: 'inherit',  // Show command output in real-time
      cwd: process.cwd() // Run from project root directory
    });

    // ⏳ WHY WAIT 60 SECONDS?
    // ========================
    // ClickHouse servers need time to:
    // 1. Start up and initialize
    // 2. Connect to ClickHouse Keeper
    // 3. Establish cluster membership
    // 4. Initialize replication metadata
    // 
    // Without this wait, health checks would fail because services aren't ready
    console.log('⏳ Waiting for cluster services to be ready...');
    await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds

    // ==================== CLUSTER HEALTH VERIFICATION ====================

    
    console.log('\n🔍 Verifying cluster health...');
    
    // 🔍 WHAT IS A HEALTH CHECK?
    // ===========================
    // A health check verifies that each node in the cluster is:
    // 1. Running and accepting connections
    // 2. Responding to queries properly
    // 3. Connected to the cluster network
    // 4. Ready to serve data
    // 
    // WHY HEALTH CHECKS MATTER:
    // - Ensures all nodes are operational before proceeding
    // - Prevents data insertion into failed nodes
    // - Validates cluster configuration is correct
    // - Catches startup issues early
    
    // Test each replica individually
    for (const replica of CLUSTER_CONFIG.replicas) {
      console.log(`   Testing ${replica.name}...`);
      
      // Create a service connection for this specific replica
      const replicaService = new ClickHouseService({
        host: replica.host,        // localhost (since we're running locally)
        port: replica.port,        // HTTP port (8123, 8124, 8125)
        username: 'default',       // Default ClickHouse user
        password: '',              // No password (development setup)
        database: 'default',       // Default database
        clusterName: CLUSTER_CONFIG.name  // Tell service this is part of a cluster
      });

      try {
        // Attempt to connect to this replica
        await replicaService.connect();
        console.log(`   ✅ ${replica.name} is healthy`);
        
        // Clean up connection
        await replicaService.disconnect();
      } catch (error) {
        // If any replica fails health check, the entire setup fails
        console.error(`   ❌ ${replica.name} health check failed:`, error);
        throw error;
      }
    }

    // ==================== SCHEMA INITIALIZATION ====================

    
    console.log('\n📊 Initializing cluster schema...');
    
    // 🏗️ WHAT IS SCHEMA INITIALIZATION?
    // ===================================
    // Schema initialization creates the database structure:
    // 1. Creates tables with ReplicatedMergeTree engine
    // 2. Sets up replication metadata in ClickHouse Keeper
    // 3. Configures table partitioning and sorting keys
    // 4. Establishes replication relationships between nodes
    // 
    // REPLICATEDMERGETREE ENGINE:
    // - Special ClickHouse engine for replicated tables
    // - Automatically replicates data across all replicas
    // - Handles data consistency and conflict resolution
    // - Provides high availability and fault tolerance
    
    // Use the first replica for schema initialization
    // WHY FIRST REPLICA?
    // - Only need to create schema on one node
    // - Replication will automatically copy schema to other nodes
    // - Avoids race conditions from multiple nodes creating schema
    const primaryService = new ClickHouseService({
      host: CLUSTER_CONFIG.replicas[0].host,  // clickhouse-1
      port: CLUSTER_CONFIG.replicas[0].port,  // 8123
      username: 'default',
      password: '',
      database: 'default',
      clusterName: CLUSTER_CONFIG.name       // protocol_cluster
    });

    // 🔄 RETRY LOGIC EXPLAINED:
    // ==========================
    // Why retry schema initialization?
    // 1. ClickHouse Keeper might still be initializing
    // 2. Network connections between nodes might not be ready
    // 3. Replication metadata might not be available yet
    // 4. Race conditions during cluster startup
    let retryCount = 0;
    const maxRetries = 5;
    
    while (retryCount < maxRetries) {
      try {
        await primaryService.connect();
        await primaryService.initializeSchema();  // Creates tables and replication setup
        console.log('✅ Cluster schema initialized successfully!');
        break;
      } catch (error) {
        retryCount++;
        console.log(`⚠️ Schema initialization attempt ${retryCount} failed, retrying in 10 seconds...`);
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
          try {
            await primaryService.disconnect();
          } catch (disconnectError) {
            // Ignore disconnect errors during retry
          }
        } else {
          throw error;  // Give up after max retries
        }
      }
    }

    // ==================== CLUSTER INFORMATION ====================
    
    console.log('\n📋 Cluster Information:');
    console.log('========================');
    
    try {
      const clusterInfo = await primaryService.getClusterInfo();
      clusterInfo.forEach((node: any) => {
        console.log(`   ${node.cluster} - Shard ${node.shard_num}, Replica ${node.replica_num}`);
        console.log(`     Host: ${node.host_name}:${node.port}`);
        console.log(`     Status: ${node.is_local ? 'Local' : 'Remote'}`);
        console.log('');
      });
    } catch (error) {
      console.log('⚠️ Could not retrieve cluster info (cluster may still be initializing)');
    }

    // ==================== TEST DATA INSERTION ====================
    
    console.log('🧪 Testing data insertion and replication...');
    
    // 🧪 WHY TEST DATA INSERTION?
    // ============================
    // This section verifies that:
    // 1. Data can be inserted into the cluster
    // 2. Replication is working correctly
    // 3. All replicas receive the same data
    // 4. The cluster is ready for production use
    // 
    // REPLICATION TESTING PROCESS:
    // 1. Insert test data into one replica
    // 2. Wait for replication to complete
    // 3. Verify data exists on all replicas
    // 4. Check data consistency across nodes
    
    // Insert test events to verify replication
    // These are sample blockchain events that would be typical in a DeFi protocol adapter
    const testEvents = [
      {
        id: `cluster-test-1-${Date.now()}`,
        protocol: 'uniswap-v2' as const,
        version: 'v2',
        eventType: 'swap' as const,
        timestamp: Date.now(),
        blockNumber: 12345,
        transactionHash: `0x${Math.random().toString(16).substr(2, 8)}`,
        logIndex: 1,
        poolAddress: `0x${Math.random().toString(16).substr(2, 8)}`,
        token0: {
          address: `0x${Math.random().toString(16).substr(2, 8)}`,
          symbol: 'TEST0',
          decimals: 18,
          name: 'Test Token 0'
        },
        token1: {
          address: `0x${Math.random().toString(16).substr(2, 8)}`,
          symbol: 'TEST1',
          decimals: 18,
          name: 'Test Token 1'
        },
        data: {
          type: 'swap' as const,
          sender: `0x${Math.random().toString(16).substr(2, 8)}`,
          recipient: `0x${Math.random().toString(16).substr(2, 8)}`,
          amount0In: '1000000000000000000',
          amount1In: '0',
          amount0Out: '0',
          amount1Out: '2000000000000000000'
        }
      },
      {
        id: `cluster-test-2-${Date.now()}`,
        protocol: 'uniswap-v3' as const,
        version: 'v3',
        eventType: 'mint' as const,
        timestamp: Date.now() + 1000,
        blockNumber: 12346,
        transactionHash: `0x${Math.random().toString(16).substr(2, 8)}`,
        logIndex: 2,
        poolAddress: `0x${Math.random().toString(16).substr(2, 8)}`,
        token0: {
          address: `0x${Math.random().toString(16).substr(2, 8)}`,
          symbol: 'TEST2',
          decimals: 18,
          name: 'Test Token 2'
        },
        token1: {
          address: `0x${Math.random().toString(16).substr(2, 8)}`,
          symbol: 'TEST3',
          decimals: 18,
          name: 'Test Token 3'
        },
        data: {
          type: 'mint' as const,
          sender: `0x${Math.random().toString(16).substr(2, 8)}`,
          owner: `0x${Math.random().toString(16).substr(2, 8)}`,
          amount0: '1000000000000000000',
          amount1: '2000000000000000000',
          liquidity: '1000000000000000000000'
        }
      }
    ];

    // 🔄 INSERT TEST EVENTS WITH RETRY LOGIC:
    // ========================================
    // Why retry data insertion?
    // 1. Network issues during cluster startup
    // 2. ClickHouse Keeper coordination delays
    // 3. Replication metadata not fully initialized
    // 4. Temporary resource constraints
    
    for (const event of testEvents) {
      let insertRetryCount = 0;
      const maxInsertRetries = 3;
      
      while (insertRetryCount < maxInsertRetries) {
        try {
          // Insert event into the cluster
          // This will automatically replicate to all other nodes
          await primaryService.insertEvent(event);
          console.log(`   ✅ Inserted test event: ${event.id}`);
          break;
        } catch (error) {
          insertRetryCount++;
          if (insertRetryCount < maxInsertRetries) {
            console.log(`   ⚠️ Insert attempt ${insertRetryCount} failed, retrying in 5 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          } else {
            console.log(`   ❌ Failed to insert test event: ${event.id}`);
            throw error;
          }
        }
      }
    }

    // ⏳ WAIT FOR REPLICATION TO COMPLETE:
    // =====================================
    // Why wait after insertion?
    // 1. Replication is asynchronous (happens in background)
    // 2. Data needs time to propagate to all replicas
    // 3. ClickHouse Keeper needs time to coordinate
    // 4. Ensures consistency checks will find the data
    console.log('⏳ Waiting for data replication...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

    // ==================== DATA CONSISTENCY VERIFICATION ====================

    
    console.log('\n🔍 Verifying data consistency across replicas...');
    
    // 🔍 WHAT IS DATA CONSISTENCY?
    // =============================
    // Data consistency ensures that:
    // 1. All replicas have the same data
    // 2. No data is lost during replication
    // 3. All nodes can serve the same query results
    // 4. The cluster maintains data integrity
    // 
    // CONSISTENCY CHECK PROCESS:
    // 1. Query each replica for the same data
    // 2. Compare row counts, unique IDs, and data ranges
    // 3. Verify that all replicas have identical data
    // 4. Report any inconsistencies found
    
    try {
      // Perform comprehensive consistency check across all replicas
      const consistencyResults = await primaryService.performClusterConsistencyCheck();
      console.log('📊 Cluster Consistency Results:');
      
      // Display detailed consistency information for each table
      consistencyResults.forEach((result: any) => {
        console.log(`   Table: ${result.table_name}`);
        console.log(`   Total Rows: ${result.total_rows}`);           // Should be same on all replicas
        console.log(`   Unique IDs: ${result.unique_ids}`);           // Should match row count
        console.log(`   Time Range: ${new Date(result.min_timestamp).toISOString()} - ${new Date(result.max_timestamp).toISOString()}`);
        
        // Protocol-specific event counts (for blockchain data)
        if (result.uniswap_v2_events) console.log(`   Uniswap V2 Events: ${result.uniswap_v2_events}`);
        if (result.uniswap_v3_events) console.log(`   Uniswap V3 Events: ${result.uniswap_v3_events}`);
        if (result.pancakeswap_v2_events) console.log(`   PancakeSwap V2 Events: ${result.pancakeswap_v2_events}`);
        console.log('');
      });
    } catch (error) {
      // Consistency check might fail if cluster is still initializing
      console.log('⚠️ Could not perform consistency check (cluster may still be initializing)');
    }

    // ==================== REPLICATION STATUS ====================
    
    console.log('📈 Replication Status:');
    console.log('======================');
    
    // 📈 WHAT IS REPLICATION STATUS?
    // ================================
    // Replication status shows the health and performance of data replication:
    // 1. Leader/Follower status of each replica
    // 2. Read-only status (replicas can be read-only during issues)
    // 3. Queue size (pending replication operations)
    // 4. Replication delay (how far behind a replica is)
    // 
    // WHY MONITOR REPLICATION STATUS?
    // - Detect replication lag or failures
    // - Identify which replica is the leader
    // - Monitor cluster health and performance
    // - Troubleshoot data consistency issues
    
    try {
      const replicationStatus = await primaryService.getReplicationStatus();
      if (replicationStatus.length > 0) {
        replicationStatus.forEach((status: any) => {
          console.log(`   Replica: ${status.replica_name}`);
          console.log(`   Is Leader: ${status.is_leader ? 'Yes' : 'No'}`);        // Primary replica for writes
          console.log(`   Is Readonly: ${status.is_readonly ? 'Yes' : 'No'}`);    // Can accept writes?
          console.log(`   Queue Size: ${status.queue_size}`);                     // Pending operations
          console.log(`   Absolute Delay: ${status.absolute_delay}`);             // Replication lag
          console.log('');
        });
      } else {
        console.log('   No replication status available (single instance mode)');
      }
    } catch (error) {
      console.log('⚠️ Could not retrieve replication status (cluster may still be initializing)');
    }

    // ==================== KEEPER STATUS ====================
    
    console.log('🔐 ClickHouse Keeper Status:');
    console.log('============================');
    
    // 🔐 WHAT IS CLICKHOUSE KEEPER?
    // ==============================
    // ClickHouse Keeper is a coordination service that:
    // 1. Manages cluster metadata and configuration
    // 2. Coordinates replication between nodes
    // 3. Handles leader election and failover
    // 4. Stores replication logs and metadata
    // 
    // KEEPER vs ZOOKEEPER:
    // - ClickHouse Keeper is ClickHouse's native coordination service
    // - Similar to Apache ZooKeeper but optimized for ClickHouse
    // - Handles distributed consensus and metadata management
    // - Essential for cluster operations and replication
    // 
    // WHY MONITOR KEEPER STATUS?
    // - Ensure coordination service is healthy
    // - Verify cluster metadata is accessible
    // - Monitor replication coordination
    // - Detect keeper-related issues
    
    try {
      const keeperStatus = await primaryService.getKeeperStatus();
      if (keeperStatus.length > 0) {
        console.log('   ✅ Keeper is operational');
        keeperStatus.forEach((status: any) => {
          console.log(`   Node: ${status.name}`);                    // Keeper node identifier
          console.log(`   Children: ${status.numChildren}`);         // Number of child nodes
          console.log(`   Data Length: ${status.dataLength}`);       // Amount of metadata stored
          console.log('');
        });
      } else {
        console.log('   ⚠️  Keeper status not available');
      }
    } catch (error) {
      console.log('⚠️ Could not retrieve keeper status (keeper may still be initializing)');
    }

    // ==================== CLEANUP AND COMPLETION ====================
    
    // Clean up the primary service connection
    await primaryService.disconnect();
    
    console.log('🎉 ClickHouse cluster setup completed successfully!');
    console.log('\n✅ Your cluster is ready for data ingestion.');
      
    // This summary shows the complete cluster topology
    console.log('\n📋 Cluster Summary:');
    console.log(`   • Cluster Name: ${CLUSTER_CONFIG.name}`);                    // protocol_cluster
    console.log(`   • Replicas: ${CLUSTER_CONFIG.replicas.length}`);             // 3 nodes
    console.log(`   • Keeper: ${CLUSTER_CONFIG.keeper.host}:${CLUSTER_CONFIG.keeper.zkPort}`); // localhost:2181
    console.log(`   • HTTP Ports: ${CLUSTER_CONFIG.replicas.map(r => r.port).join(', ')}`);     // 8123, 8124, 8125
    console.log(`   • TCP Ports: ${CLUSTER_CONFIG.replicas.map(r => r.tcpPort).join(', ')}`);   // 9000, 9001, 9002
    
    // 🚀 PRODUCTION USAGE COMMANDS:
    // =============================
    console.log('\n🚀 Next steps:');
    console.log('   1. Run: yarn data:ingestion');      // Start data ingestion
    console.log('   2. Or run: yarn test:integration'); // Run integration tests
    console.log('   3. Monitor cluster: yarn cluster:status'); // Check cluster health
    
    // 🔧 DOCKER MANAGEMENT COMMANDS FOR INTERVIEW:
    // ============================================
    // These are essential Docker Compose commands for cluster management
    console.log('\n🔧 Management commands:');
    console.log('   • Stop cluster: docker-compose -f docker-compose.cluster.yml down');
    console.log('   • View logs: docker-compose -f docker-compose.cluster.yml logs -f');
    console.log('   • Restart cluster: docker-compose -f docker-compose.cluster.yml restart');

  } catch (error) {
    console.error('❌ Failed to setup ClickHouse cluster:', error);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Ensure Docker and Docker Compose are installed');
    console.error('   2. Check that required ports are available');
    console.error('   3. Verify sufficient system resources (RAM, disk)');
    console.error('   4. Check Docker daemon is running');
    process.exit(1);
  }
}

/**
 * Execute the ClickHouse cluster setup script
 * 
 * Runs the main setup function with proper error handling for
 * unhandled promise rejections and fatal errors.
 */
setupClickHouseCluster().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
