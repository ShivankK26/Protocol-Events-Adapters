#!/usr/bin/env npx tsx

/**
 * Data Ingestion Service Runner Script
 * 
 * This script starts the complete data ingestion pipeline that captures
 * real-time blockchain events and stores them in ClickHouse Cloud. It
 * orchestrates the entire system including blockchain listeners, event
 * processing, and database storage.
 * 
 * Features:
 * - Multi-chain blockchain event listening (Ethereum, BSC)
 * - Real-time event processing and standardization
 * - Buffered data ingestion for optimal performance
 * - ClickHouse Cloud integration for analytics storage
 * - Comprehensive monitoring and health checks
 * - Graceful shutdown and error handling
 * 
 * Usage:
 *   npm run data:ingestion
 *   npx tsx src/scripts/run-data-ingestion.ts
 * 
 * Prerequisites:
 * - ClickHouse Cloud setup completed
 * - Environment variables configured
 * - Blockchain RPC endpoints accessible
 */

import { DataIngestionService } from '../core/DataIngestionService';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

/**
 * Main data ingestion service runner
 * 
 * Initializes and starts the complete data ingestion pipeline including:
 * 1. Configuration loading from environment variables
 * 2. DataIngestionService initialization with blockchain and database configs
 * 3. Event handler setup for monitoring and logging
 * 4. Service startup with comprehensive error handling
 * 5. Periodic status reporting and health monitoring
 * 6. Graceful shutdown handling for production deployments
 * 
 * @throws Error if service initialization or startup fails
 */
async function main() {
  console.log('🚀 Starting Protocol Event Data Ingestion Service...\n');

  // ==================== CONFIGURATION SETUP ====================
  
  /**
   * Load data ingestion configuration from environment variables
   * 
   * This configuration object contains all necessary parameters for both
   * ClickHouse Cloud connection and blockchain network access. It uses
   * environment variables with sensible defaults for development.
   */
  const ingestionConfig = {
    clickhouse: {
      host: process.env.CLICKHOUSE_HOST || 'localhost',
      port: parseInt(process.env.CLICKHOUSE_PORT || '9001'),
      username: process.env.CLICKHOUSE_USERNAME || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
      database: process.env.CLICKHOUSE_DATABASE || 'default',
      clusterName: process.env.CLICKHOUSE_CLUSTER_NAME || 'protocol_cluster'
    },
    blockchain: {
      ethereum: {
        rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
        wsUrl: process.env.ETHEREUM_WS_URL
      },
      bsc: {
        rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
        wsUrl: process.env.BSC_WS_URL
      }
    }
  };

  /**
   * Initialize the data ingestion service
   * 
   * Creates a new DataIngestionService instance with the loaded configuration.
   * This service will orchestrate the entire data pipeline from blockchain
   * event listening to ClickHouse storage.
   */
  const dataIngestionService = new DataIngestionService(ingestionConfig);

  // ==================== EVENT HANDLER SETUP ====================
  
  /**
   * Set up comprehensive event handlers for monitoring
   * 
   * Configures event listeners for all types of system events including
   * service lifecycle events, blockchain events, and error conditions.
   * This provides real-time visibility into the data ingestion pipeline.
   */
  
  // Service lifecycle event handlers
  dataIngestionService.on('started', () => {
    console.log('✅ Data ingestion service started');
  });

  dataIngestionService.on('stopped', () => {
    console.log('✅ Data ingestion service stopped');
  });

  // Blockchain event handlers for real-time monitoring
  dataIngestionService.on('event', (event) => {
    console.log(`📊 Event: ${event.protocol} ${event.eventType} - ${event.id}`);
  });

  dataIngestionService.on('factoryEvent', (event) => {
    console.log(`🏭 Factory Event: ${event.protocol} ${event.eventType} - ${event.pairAddress}`);
  });

  // Error handling for system resilience
  dataIngestionService.on('error', (error) => {
    console.error(`❌ Error from ${error.source}:`, error.error);
  });

  // ==================== SERVICE STARTUP ====================
  
  try {
    /**
     * Start the data ingestion service
     * 
     * Initializes the complete data pipeline including blockchain listeners,
     * ClickHouse connection, and event processing. This is the main entry
     * point for the data ingestion system.
     */
    await dataIngestionService.start();
    
    // ==================== MONITORING AND HEALTH CHECKS ====================
    
    /**
     * Set up periodic status reporting for production monitoring
     * 
     * Provides comprehensive system health monitoring including:
     * - Event buffer status and capacity
     * - Database event counts and storage metrics
     * - Replication status for high availability
     * - Performance indicators and system health
     */
    const statusInterval = setInterval(async () => {
      try {
        const bufferStatus = dataIngestionService.getBufferStatus();
        const eventCount = await dataIngestionService.getEventCount();
        const replicationStatus = await dataIngestionService.getReplicationStatus();
        
        console.log('\n📊 Status Report:');
        console.log(`  Events in buffer: ${bufferStatus.events} (${bufferStatus.factoryEvents} factory)`);
        console.log(`  Total events in ClickHouse: ${eventCount}`);
        console.log(`  Replication status: ${replicationStatus.length} replicas`);
        
        if (replicationStatus.length > 0) {
          replicationStatus.forEach((replica: any) => {
            console.log(`    - ${replica.replica}: ${replica.is_leader ? 'Leader' : 'Follower'}`);
          });
        }
      } catch (error) {
        console.error('❌ Status check failed:', error);
      }
    }, 30000); // Every 30 seconds

    // ==================== GRACEFUL SHUTDOWN HANDLING ====================
    
    /**
     * Set up graceful shutdown for production deployments
     * 
     * Handles SIGINT and SIGTERM signals to ensure proper cleanup of
     * resources including blockchain listeners, database connections,
     * and monitoring timers. This prevents data loss and resource leaks.
     */
    const shutdown = async () => {
      console.log('\n🛑 Shutting down data ingestion service...');
      clearInterval(statusInterval);
      await dataIngestionService.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep the process running
    console.log('\n✅ Data ingestion service is running. Press Ctrl+C to stop.');
    
    /**
     * Keep the process running indefinitely
     * 
     * Uses a promise that never resolves to keep the Node.js process
     * alive and listening for blockchain events. The process will only
     * exit when receiving shutdown signals or encountering fatal errors.
     */
    await new Promise(() => {});

  } catch (error) {
    /**
     * Handle service startup failures
     * 
     * Provides comprehensive error handling for service initialization
     * failures and ensures proper process termination with error codes.
     */
    console.error('❌ Failed to start data ingestion service:', error);
    process.exit(1);
  }
}

/**
 * Execute the data ingestion service with error handling
 * 
 * Runs the main function with proper error handling for unhandled
 * promise rejections and fatal errors that could crash the process.
 */
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
