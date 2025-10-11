#!/usr/bin/env npx tsx

/**
 * ClickHouse Cloud Setup Script
 * 
 * This script initializes and configures a ClickHouse Cloud database for
 * storing blockchain event data. It performs comprehensive setup including
 * connection testing, schema initialization, and data validation.
 * 
 * Features:
 * - Environment variable validation and configuration
 * - ClickHouse Cloud connection testing
 * - Database schema initialization with optimized structure
 * - Test data insertion and verification
 * - Performance statistics and health checks
 * 
 * Usage:
 *   npm run clickhouse:cloud-setup
 *   npx tsx src/scripts/setup-clickhouse-cloud.ts
 * 
 * Prerequisites:
 * - ClickHouse Cloud account and service
 * - Environment variables configured in .env file
 * - Network access to ClickHouse Cloud endpoints
 */

import { ClickHouseService } from '../core/ClickHouseService';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

/**
 * Main setup function for ClickHouse Cloud
 * 
 * Performs complete initialization of the ClickHouse Cloud database including:
 * 1. Environment variable validation and configuration loading
 * 2. ClickHouse Cloud connection establishment and testing
 * 3. Database schema initialization with optimized table structures
 * 4. Test data insertion to verify system functionality
 * 5. Performance statistics and health verification
 * 6. Setup completion confirmation and next steps guidance
 * 
 * @throws Error if setup fails due to configuration or connectivity issues
 */
async function setupClickHouseCloud(): Promise<void> {
  console.log('☁️ Setting up ClickHouse Cloud...\n');

  // ==================== CONFIGURATION SETUP ====================
  
  /**
   * Load ClickHouse Cloud configuration from environment variables
   * 
   * This configuration object contains all necessary parameters for connecting
   * to ClickHouse Cloud, including host, port, credentials, and security settings.
   * It uses environment variables with sensible defaults for local development.
   */
  const clickhouseConfig = {
    host: process.env.CLICKHOUSE_HOST || 'localhost',
    port: parseInt(process.env.CLICKHOUSE_PORT || '8443'),
    username: process.env.CLICKHOUSE_USERNAME || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    database: process.env.CLICKHOUSE_DATABASE || 'default',
    secure: process.env.CLICKHOUSE_SECURE === 'true' || false
  };

  /**
   * Validate required environment variables
   * 
   * Ensures that critical configuration parameters are present before
   * attempting to connect to ClickHouse Cloud. This prevents runtime
   * failures and provides clear error messages for missing configuration.
   */
  if (!process.env.CLICKHOUSE_HOST || !process.env.CLICKHOUSE_PASSWORD) {
    console.error('❌ Missing required environment variables:');
    console.error('   CLICKHOUSE_HOST - Your ClickHouse Cloud host');
    console.error('   CLICKHOUSE_PASSWORD - Your ClickHouse Cloud password');
    console.error('\nPlease update your .env file with the correct values.');
    process.exit(1);
  }

  try {
    // ==================== CONNECTION ESTABLISHMENT ====================
    
    console.log('🔗 Connecting to ClickHouse Cloud...');
    console.log(`   Host: ${clickhouseConfig.host}`);
    console.log(`   Port: ${clickhouseConfig.port}`);
    console.log(`   Secure: ${clickhouseConfig.secure}`);
    
    /**
     * Initialize ClickHouse service with configuration
     * 
     * Creates a new ClickHouseService instance with the validated configuration
     * parameters. This service will handle all database operations including
     * connection management, schema initialization, and data operations.
     */
    const clickhouseService = new ClickHouseService(clickhouseConfig);
    
    /**
     * Test ClickHouse Cloud connection
     * 
     * Establishes connection to ClickHouse Cloud and verifies that the
     * service is accessible and credentials are valid. This is a critical
     * step that ensures the database is ready for operations.
     */
    await clickhouseService.connect();
    console.log('✅ Connected to ClickHouse Cloud successfully!');
    
    // ==================== SCHEMA INITIALIZATION ====================
    
    /**
     * Initialize database schema with optimized structure
     * 
     * Creates the necessary tables, materialized views, and indexes for
     * optimal performance when storing and querying blockchain event data.
     * This includes the main events table and analytics materialized view.
     */
    console.log('\n📊 Setting up database schema...');
    await clickhouseService.initializeSchema();
    console.log('✅ Database schema initialized successfully!');
    
    // ==================== DATA VALIDATION ====================
    
    /**
     * Test data insertion to verify system functionality
     * 
     * Inserts a test blockchain event to ensure that the database schema
     * is working correctly and that data can be stored and retrieved.
     * This validates the complete data pipeline from insertion to storage.
     */
    console.log('\n🧪 Testing data insertion...');
    /**
     * Create test blockchain event for validation
     * 
     * Generates a realistic test event that mimics the structure of actual
     * blockchain events. This includes all required fields such as protocol
     * information, token details, transaction data, and event-specific data.
     */
    const testEvent = {
      id: `test-cloud-${Date.now()}`,
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
    };

    /**
     * Insert test event to validate database functionality
     * 
     * Attempts to insert the test event into the database to verify that
     * the schema is working correctly and that data can be stored properly.
     */
    await clickhouseService.insertEvent(testEvent);
    console.log('✅ Test event inserted successfully!');
    
    // ==================== VERIFICATION AND STATISTICS ====================
    
    /**
     * Verify data insertion and get event count
     * 
     * Retrieves the total number of events in the database to confirm
     * that the test event was successfully stored.
     */
    const eventCount = await clickhouseService.getEventCount();
    console.log(`✅ Total events in database: ${eventCount}`);
    
    /**
     * Get comprehensive event statistics
     * 
     * Retrieves detailed statistics about events in the database, including
     * counts by protocol and event type. This provides insights into the
     * data distribution and validates the analytics capabilities.
     */
    const stats = await clickhouseService.getEventStats();
    console.log('\n📈 Database Statistics:');
    stats.forEach((stat: any) => {
      console.log(`   ${stat.protocol} ${stat.event_type}: ${stat.event_count} events`);
    });
    
    /**
     * Clean up connection and provide next steps
     * 
     * Properly disconnects from ClickHouse Cloud and provides guidance
     * on the next steps for using the system.
     */
    await clickhouseService.disconnect();
    
    console.log('\n🎉 ClickHouse Cloud setup completed successfully!');
    console.log('\n✅ Your cloud database is ready for data ingestion.');
    console.log('\n🚀 Next steps:');
    console.log('   1. Run: yarn data:ingestion');
    console.log('   2. Or run: yarn test:integration');
    
  } catch (error) {
    /**
     * Handle setup failures with comprehensive error reporting
     * 
     * Provides detailed error information and troubleshooting guidance
     * to help users resolve common configuration and connectivity issues.
     */
    console.error('❌ Failed to setup ClickHouse Cloud:', error);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Check your .env file has correct CLICKHOUSE_HOST and CLICKHOUSE_PASSWORD');
    console.error('   2. Verify your ClickHouse Cloud service is running');
    console.error('   3. Check your network connection');
    process.exit(1);
  }
}

/**
 * Execute the ClickHouse Cloud setup script
 * 
 * Runs the main setup function with proper error handling for
 * unhandled promise rejections and fatal errors.
 */
setupClickHouseCloud().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
