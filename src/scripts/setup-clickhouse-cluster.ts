#!/usr/bin/env npx tsx

/**
 * ClickHouse Cluster Setup Script
 * 
 * This script sets up and configures a local ClickHouse cluster with 3 replicas
 * and ClickHouse Keeper for metadata management. It provides comprehensive
 * cluster deployment, schema initialization, and verification capabilities.
 * 
 * Features:
 * - Docker Compose cluster deployment
 * - ClickHouse Keeper configuration for coordination
 * - 3-replica cluster with data replication
 * - Schema initialization with ReplicatedMergeTree tables
 * - Cluster health verification and testing
 * - Data consistency validation across replicas
 * 
 * Usage:
 *   npm run clickhouse:cluster-setup
 *   npx tsx src/scripts/setup-clickhouse-cluster.ts
 * 
 * Prerequisites:
 * - Docker and Docker Compose installed
 * - Ports 8123-8126, 9000-9003, 9009-9011, 2181, 9234 available
 * - Sufficient system resources (RAM, disk space)
 */

import { ClickHouseService } from '../core/ClickHouseService';
import { config } from 'dotenv';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env file
config();

/**
 * Cluster configuration for the 3-replica setup
 */
const CLUSTER_CONFIG = {
  name: 'protocol_cluster',
  replicas: [
    { name: 'clickhouse-1', host: 'localhost', port: 8123, tcpPort: 9000 },
    { name: 'clickhouse-2', host: 'localhost', port: 8124, tcpPort: 9001 },
    { name: 'clickhouse-3', host: 'localhost', port: 8125, tcpPort: 9002 }
  ],
  keeper: { host: 'localhost', port: 8126, tcpPort: 9003, zkPort: 2181 }
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

    // Stop any existing cluster
    console.log('🛑 Stopping any existing cluster...');
    try {
      execSync('docker-compose -f docker-compose.cluster.yml down -v', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
    } catch (error) {
      console.log('ℹ️  No existing cluster to stop');
    }

    // Start the cluster
    console.log('🚀 Starting ClickHouse cluster...');
    execSync('docker-compose -f docker-compose.cluster.yml up -d', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });

    // Wait for services to be ready
    console.log('⏳ Waiting for cluster services to be ready...');
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds

    // ==================== CLUSTER HEALTH VERIFICATION ====================
    
    console.log('\n🔍 Verifying cluster health...');
    
    // Test each replica
    for (const replica of CLUSTER_CONFIG.replicas) {
      console.log(`   Testing ${replica.name}...`);
      const replicaService = new ClickHouseService({
        host: replica.host,
        port: replica.port,
        username: 'default',
        password: '',
        database: 'default',
        secure: false,
        clusterName: CLUSTER_CONFIG.name,
        isCluster: true
      });

      try {
        await replicaService.connect();
        console.log(`   ✅ ${replica.name} is healthy`);
        await replicaService.disconnect();
      } catch (error) {
        console.error(`   ❌ ${replica.name} health check failed:`, error);
        throw error;
      }
    }

    // ==================== SCHEMA INITIALIZATION ====================
    
    console.log('\n📊 Initializing cluster schema...');
    
    // Use the first replica for schema initialization
    const primaryService = new ClickHouseService({
      host: CLUSTER_CONFIG.replicas[0].host,
      port: CLUSTER_CONFIG.replicas[0].port,
      username: 'default',
      password: '',
      database: 'default',
      secure: false,
      clusterName: CLUSTER_CONFIG.name,
      isCluster: true
    });

    await primaryService.connect();
    await primaryService.initializeSchema();
    console.log('✅ Cluster schema initialized successfully!');

    // ==================== CLUSTER INFORMATION ====================
    
    console.log('\n📋 Cluster Information:');
    console.log('========================');
    
    const clusterInfo = await primaryService.getClusterInfo();
    clusterInfo.forEach((node: any) => {
      console.log(`   ${node.cluster} - Shard ${node.shard_num}, Replica ${node.replica_num}`);
      console.log(`     Host: ${node.host_name}:${node.port}`);
      console.log(`     Status: ${node.is_local ? 'Local' : 'Remote'}`);
      console.log('');
    });

    // ==================== TEST DATA INSERTION ====================
    
    console.log('🧪 Testing data insertion and replication...');
    
    // Insert test events to verify replication
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
          amount1: '2000000000000000000'
        }
      }
    ];

    // Insert test events
    for (const event of testEvents) {
      await primaryService.insertEvent(event);
      console.log(`   ✅ Inserted test event: ${event.id}`);
    }

    // Wait for replication
    console.log('⏳ Waiting for data replication...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

    // ==================== DATA CONSISTENCY VERIFICATION ====================
    
    console.log('\n🔍 Verifying data consistency across replicas...');
    
    const consistencyResults = await primaryService.performClusterConsistencyCheck();
    console.log('📊 Cluster Consistency Results:');
    consistencyResults.forEach((result: any) => {
      console.log(`   Table: ${result.table_name}`);
      console.log(`   Total Rows: ${result.total_rows}`);
      console.log(`   Unique IDs: ${result.unique_ids}`);
      console.log(`   Time Range: ${new Date(result.min_timestamp).toISOString()} - ${new Date(result.max_timestamp).toISOString()}`);
      if (result.uniswap_v2_events) console.log(`   Uniswap V2 Events: ${result.uniswap_v2_events}`);
      if (result.uniswap_v3_events) console.log(`   Uniswap V3 Events: ${result.uniswap_v3_events}`);
      if (result.pancakeswap_v2_events) console.log(`   PancakeSwap V2 Events: ${result.pancakeswap_v2_events}`);
      console.log('');
    });

    // ==================== REPLICATION STATUS ====================
    
    console.log('📈 Replication Status:');
    console.log('======================');
    
    const replicationStatus = await primaryService.getReplicationStatus();
    if (replicationStatus.length > 0) {
      replicationStatus.forEach((status: any) => {
        console.log(`   Replica: ${status.replica_name}`);
        console.log(`   Is Leader: ${status.is_leader ? 'Yes' : 'No'}`);
        console.log(`   Is Readonly: ${status.is_readonly ? 'Yes' : 'No'}`);
        console.log(`   Queue Size: ${status.queue_size}`);
        console.log(`   Absolute Delay: ${status.absolute_delay}`);
        console.log('');
      });
    } else {
      console.log('   No replication status available (single instance mode)');
    }

    // ==================== KEEPER STATUS ====================
    
    console.log('🔐 ClickHouse Keeper Status:');
    console.log('============================');
    
    const keeperStatus = await primaryService.getKeeperStatus();
    if (keeperStatus.length > 0) {
      console.log('   Keeper is operational');
      keeperStatus.forEach((status: any) => {
        console.log(`   Node: ${status.name}`);
        console.log(`   Children: ${status.numChildren}`);
        console.log(`   Data Length: ${status.dataLength}`);
        console.log('');
      });
    } else {
      console.log('   Keeper status not available');
    }

    // ==================== CLEANUP AND COMPLETION ====================
    
    await primaryService.disconnect();
    
    console.log('🎉 ClickHouse cluster setup completed successfully!');
    console.log('\n✅ Your cluster is ready for data ingestion.');
    console.log('\n📋 Cluster Summary:');
    console.log(`   • Cluster Name: ${CLUSTER_CONFIG.name}`);
    console.log(`   • Replicas: ${CLUSTER_CONFIG.replicas.length}`);
    console.log(`   • Keeper: ${CLUSTER_CONFIG.keeper.host}:${CLUSTER_CONFIG.keeper.zkPort}`);
    console.log(`   • HTTP Ports: ${CLUSTER_CONFIG.replicas.map(r => r.port).join(', ')}`);
    console.log(`   • TCP Ports: ${CLUSTER_CONFIG.replicas.map(r => r.tcpPort).join(', ')}`);
    
    console.log('\n🚀 Next steps:');
    console.log('   1. Run: yarn data:ingestion');
    console.log('   2. Or run: yarn test:integration');
    console.log('   3. Monitor cluster: yarn cluster:status');
    
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
