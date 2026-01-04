#!/usr/bin/env npx tsx

/**
 * ClickHouse Cluster Verification Script
 * 
 * This script provides comprehensive cluster verification and monitoring
 * capabilities for the ClickHouse cluster. It performs detailed health checks,
 * replication verification, data consistency validation, and performance analysis.
 * 
 * Features:
 * - Cluster topology verification and health checks
 * - Replication status monitoring across all replicas
 * - Data consistency validation and integrity checks
 * - ClickHouse Keeper coordination service status
 * - Performance metrics and system statistics
 * - Real-time cluster monitoring and alerting
 * 
 * Usage:
 *   npm run cluster:verify
 *   npx tsx src/scripts/verify-cluster.ts
 * 
 * Prerequisites:
 * - ClickHouse cluster running and accessible
 * - Environment variables configured for cluster access
 * - Sufficient permissions for system table queries
 */

import { ClickHouseService } from '../core/ClickHouseService';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

/**
 * Cluster configuration for verification
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
 * Main cluster verification function
 * 
 * Performs comprehensive cluster verification including:
 * 1. Cluster topology and connectivity verification
 * 2. Replication status and health monitoring
 * 3. Data consistency validation across replicas
 * 4. ClickHouse Keeper coordination service status
 * 5. Performance metrics and system statistics
 * 6. Real-time monitoring and health reporting
 * 
 * @throws Error if cluster verification fails
 */
async function verifyCluster(): Promise<void> {
  console.log('🔍 ClickHouse Cluster Verification\n');

  try {
    // ==================== CLUSTER CONNECTIVITY ====================
    
    console.log('🔗 Testing cluster connectivity...');
    console.log('==================================');
    
    const replicaServices: ClickHouseService[] = [];
    
    for (const replica of CLUSTER_CONFIG.replicas) {
      console.log(`   Testing ${replica.name} (${replica.host}:${replica.port})...`);
      
      const service = new ClickHouseService({
        host: replica.host,
        port: replica.port,
        username: 'default',
        password: '',
        database: 'default',
        clusterName: CLUSTER_CONFIG.name
      });

      try {
        await service.connect();
        console.log(`   ✅ ${replica.name} - Connected successfully`);
        replicaServices.push(service);
      } catch (error) {
        console.error(`   ❌ ${replica.name} - Connection failed:`, error);
        throw error;
      }
    }

    // Use the first service for cluster-wide operations
    const primaryService = replicaServices[0];

    // ==================== CLUSTER TOPOLOGY ====================
    
    console.log('\n📋 Cluster Topology:');
    console.log('====================');
    
    const clusterInfo = await primaryService.getClusterInfo();
    clusterInfo.forEach((node: any) => {
      console.log(`   ${node.cluster} - Shard ${node.shard_num}, Replica ${node.replica_num}`);
      console.log(`     Host: ${node.host_name}:${node.port}`);
      console.log(`     Address: ${node.host_address}`);
      console.log(`     Local: ${node.is_local ? 'Yes' : 'No'}`);
      console.log(`     Errors: ${node.errors_count}`);
      console.log(`     Slowdowns: ${node.slowdowns_count}`);
      console.log(`     Recovery Time: ${node.estimated_recovery_time}s`);
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
        console.log(`   Absolute Delay: ${status.absolute_delay}s`);
        console.log(`   Queue Size: ${status.queue_size}`);
        console.log(`   Inserts in Queue: ${status.inserts_in_queue}`);
        console.log(`   Merges in Queue: ${status.merges_in_queue}`);
        if (status.log_max_index) console.log(`   Log Max Index: ${status.log_max_index}`);
        if (status.log_pointer) console.log(`   Log Pointer: ${status.log_pointer}`);
        if (status.total_replicas) console.log(`   Total Replicas: ${status.total_replicas}`);
        if (status.active_replicas) console.log(`   Active Replicas: ${status.active_replicas}`);
        console.log('');
      });
    } else {
      console.log('   No replication status available (single instance mode)');
    }

    // ==================== REPLICATION QUEUE STATUS ====================
    
    console.log('🔄 Replication Queue Status:');
    console.log('============================');
    
    const queueStatus = await primaryService.getReplicationQueueStatus();
    if (queueStatus.length > 0) {
      queueStatus.forEach((queue: any) => {
        console.log(`   Replica: ${queue.replica_name}`);
        console.log(`   Position: ${queue.position}`);
        console.log(`   Type: ${queue.type}`);
        console.log(`   Source Replica: ${queue.source_replica || 'N/A'}`);
        console.log(`   New Part: ${queue.new_part_name || 'N/A'}`);
        console.log(`   Create Time: ${queue.create_time}`);
        console.log('');
      });
    } else {
      console.log('   No replication queue entries found');
    }

    // ==================== DATA CONSISTENCY VERIFICATION ====================
    
    console.log('🔍 Data Consistency Verification:');
    console.log('==================================');
    
    // Get event counts from each replica
    const consistencyResults: { replica: string; count: number; details: any }[] = [];
    
    for (let i = 0; i < replicaServices.length; i++) {
      const service = replicaServices[i];
      const replica = CLUSTER_CONFIG.replicas[i];
      
      try {
        const eventCount = await service.getEventCount();
        const consistencyCheck = await service.performClusterConsistencyCheck();
        
        consistencyResults.push({
          replica: replica.name,
          count: eventCount,
          details: consistencyCheck[0] || {}
        });
        
        console.log(`   ${replica.name}: ${eventCount} events`);
        if (consistencyCheck[0]) {
          console.log(`     Unique IDs: ${consistencyCheck[0].unique_ids}`);
          console.log(`     Time Range: ${new Date(consistencyCheck[0].min_timestamp).toISOString()} - ${new Date(consistencyCheck[0].max_timestamp).toISOString()}`);
        }
      } catch (error) {
        console.error(`   ❌ ${replica.name}: Failed to get consistency data - ${error}`);
      }
    }

    // Check for consistency issues
    const counts = consistencyResults.map(r => r.count);
    const uniqueCounts = [...new Set(counts)];
    
    if (uniqueCounts.length === 1) {
      console.log('   ✅ All replicas have consistent event counts');
    } else {
      console.log('   ⚠️  Inconsistent event counts detected:');
      consistencyResults.forEach(result => {
        console.log(`     ${result.replica}: ${result.count} events`);
      });
    }

    // ==================== CLICKHOUSE KEEPER STATUS ====================
    
    console.log('\n🔐 ClickHouse Keeper Status:');
    console.log('============================');
    
    const keeperStatus = await primaryService.getKeeperStatus();
    if (keeperStatus.length > 0) {
      console.log('   ✅ Keeper is operational');
      keeperStatus.forEach((status: any) => {
        console.log(`   Node: ${status.name}`);
        console.log(`   Value: ${status.value || 'N/A'}`);
        console.log(`   Children: ${status.numChildren}`);
        console.log(`   Data Length: ${status.dataLength}`);
        console.log(`   Version: ${status.version}`);
        console.log(`   Created: ${new Date(status.ctime * 1000).toISOString()}`);
        console.log(`   Modified: ${new Date(status.mtime * 1000).toISOString()}`);
        console.log('');
      });
    } else {
      console.log('   ⚠️  Keeper status not available');
    }

    // ==================== SYSTEM HEALTH METRICS ====================
    
    console.log('📊 System Health Metrics:');
    console.log('=========================');
    
    for (let i = 0; i < replicaServices.length; i++) {
      const service = replicaServices[i];
      const replica = CLUSTER_CONFIG.replicas[i];
      
      try {
        const health = await service.getClusterHealth();
        console.log(`   ${replica.name}:`);
        if (health.length > 0) {
          const node = health[0];
          console.log(`     Host: ${node.host}`);
          console.log(`     Uptime: ${node.uptime}s`);
          console.log(`     Version: ${node.version}`);
          if (node.memory_usage) console.log(`     Memory Usage: ${node.memory_usage}`);
          if (node.cpu_usage) console.log(`     CPU Usage: ${node.cpu_usage}`);
        } else {
          console.log(`     Health data not available`);
        }
        console.log('');
      } catch (error) {
        console.error(`   ❌ ${replica.name}: Failed to get health data - ${error}`);
      }
    }

    // ==================== EVENT STATISTICS ====================
    
    console.log('📈 Event Statistics:');
    console.log('====================');
    
    const stats = await primaryService.getEventStats();
    if (stats.length > 0) {
      stats.forEach((stat: any) => {
        console.log(`   ${stat.protocol} ${stat.event_type}:`);
        console.log(`     Events: ${stat.event_count}`);
        console.log(`     Unique Pools: ${stat.unique_pools}`);
        console.log(`     Unique Transactions: ${stat.unique_transactions}`);
        console.log(`     First Event: ${stat.first_event}`);
        console.log(`     Last Event: ${stat.last_event}`);
        console.log('');
      });
    } else {
      console.log('   No event statistics available');
    }

    // ==================== PERFORMANCE TEST ====================
    
    console.log('⚡ Performance Test:');
    console.log('====================');
    
    const startTime = Date.now();
    const testQuery = `
      SELECT 
        protocol,
        event_type,
        count() as event_count,
        uniq(pool_address) as unique_pools
      FROM protocol_events
      GROUP BY protocol, event_type
      ORDER BY event_count DESC
      LIMIT 10
    `;
    
    try {
      const result = await primaryService.executeQuery(testQuery);
      const endTime = Date.now();
      const queryTime = endTime - startTime;
      
      console.log(`   Query execution time: ${queryTime}ms`);
      console.log(`   Results returned: ${result.data.length} rows`);
      
      if (result.data.length > 0) {
        console.log('   Top protocols by event count:');
        result.data.forEach((row: any, index: number) => {
          console.log(`     ${index + 1}. ${row.protocol} ${row.event_type}: ${row.event_count} events, ${row.unique_pools} pools`);
        });
      }
    } catch (error) {
      console.error(`   ❌ Performance test failed: ${error}`);
    }

    // ==================== CLEANUP ====================
    
    // Disconnect from all services
    for (const service of replicaServices) {
      await service.disconnect();
    }

    // ==================== SUMMARY ====================
    
    console.log('\n✅ Cluster Verification Summary:');
    console.log('=================================');
    console.log(`   • Cluster Name: ${CLUSTER_CONFIG.name}`);
    console.log(`   • Replicas Tested: ${replicaServices.length}/${CLUSTER_CONFIG.replicas.length}`);
    console.log(`   • Data Consistency: ${uniqueCounts.length === 1 ? '✅ Consistent' : '⚠️  Inconsistent'}`);
    console.log(`   • Keeper Status: ${keeperStatus.length > 0 ? '✅ Operational' : '⚠️  Not Available'}`);
    console.log(`   • Total Events: ${consistencyResults.reduce((sum, r) => sum + r.count, 0)}`);
    
    console.log('\n🎉 Cluster verification completed successfully!');

  } catch (error) {
    console.error('❌ Cluster verification failed:', error);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Ensure cluster is running: docker-compose -f docker-compose.cluster.yml ps');
    console.error('   2. Check cluster logs: docker-compose -f docker-compose.cluster.yml logs');
    console.error('   3. Verify network connectivity to cluster nodes');
    console.error('   4. Check ClickHouse Keeper is operational');
    process.exit(1);
  }
}

/**
 * Execute the cluster verification script
 * 
 * Runs the main verification function with proper error handling for
 * unhandled promise rejections and fatal errors.
 */
verifyCluster().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
