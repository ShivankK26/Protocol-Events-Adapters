#!/usr/bin/env npx tsx

/**
 * ClickHouse Database Viewer Script
 * 
 * This script provides comprehensive database inspection and analytics
 * capabilities for the ClickHouse database. It displays database
 * structure, event statistics, recent events, and real-time analytics.
 * 
 * Features:
 * - Database table inspection and structure overview
 * - Event count statistics and distribution analysis
 * - Recent events display with detailed information
 * - Protocol-specific event statistics and analytics
 * - Real-time analytics queries and performance metrics
 * - Comprehensive database health and status reporting
 * 
 * Usage:
 *   npm run db:view
 *   npx tsx src/scripts/view-database.ts
 * 
 * Prerequisites:
 * - ClickHouse cluster setup completed
 * - Environment variables configured
 * - Database contains event data for meaningful analysis
 */

import { ClickHouseService } from '../core/ClickHouseService';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

/**
 * Main database viewer function
 * 
 * Performs comprehensive database inspection including:
 * 1. Database connection and table structure inspection
 * 2. Event count statistics and distribution analysis
 * 3. Recent events display with detailed information
 * 4. Protocol-specific analytics and performance metrics
 * 5. Real-time analytics queries and health reporting
 * 
 * @throws Error if database connection or query execution fails
 */
async function viewDatabase(): Promise<void> {
  console.log('📊 ClickHouse Database Viewer\n');

  // Configuration
  const clickhouseConfig = {
    host: process.env.CLICKHOUSE_HOST || 'localhost',
    port: parseInt(process.env.CLICKHOUSE_PORT || '8123'),
    username: process.env.CLICKHOUSE_USERNAME || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    database: process.env.CLICKHOUSE_DATABASE || 'default',
    secure: process.env.CLICKHOUSE_SECURE === 'true' || false,
    clusterName: process.env.CLICKHOUSE_CLUSTER_NAME || 'protocol_cluster',
    isCluster: process.env.CLICKHOUSE_IS_CLUSTER === 'true' || false
  };

  try {
    const clickhouseService = new ClickHouseService(clickhouseConfig);
    await clickhouseService.connect();
    console.log('✅ Connected to ClickHouse\n');

    // Show tables
    console.log('📋 Tables in database:');
    console.log('=====================');
    const tables = await clickhouseService.executeQuery('SHOW TABLES');
    tables.data.forEach((table: any) => {
      console.log(`  - ${table.name}`);
    });

    // Show event count
    console.log('\n📊 Event Statistics:');
    console.log('===================');
    const eventCount = await clickhouseService.getEventCount();
    console.log(`Total events: ${eventCount}`);

    // Show recent events
    if (eventCount > 0) {
      console.log('\n🕒 Recent Events (last 10):');
      console.log('==========================');
      const events = await clickhouseService.executeQuery(`
        SELECT 
          protocol,
          event_type,
          pool_address,
          token0_symbol,
          token1_symbol,
          block_number,
          toDateTime(timestamp / 1000) as event_time
        FROM protocol_events 
        ORDER BY timestamp DESC 
        LIMIT 10
      `);
      
      events.data.forEach((event: any, index: number) => {
        console.log(`  ${index + 1}. ${event.protocol} ${event.event_type}`);
        console.log(`     Pool: ${event.pool_address}`);
        console.log(`     Tokens: ${event.token0_symbol}/${event.token1_symbol}`);
        console.log(`     Block: ${event.block_number} | Time: ${event.event_time}`);
        console.log('');
      });
    }

    // Show event stats by protocol
    console.log('📈 Event Statistics by Protocol:');
    console.log('================================');
    const stats = await clickhouseService.getEventStats();
    stats.forEach((stat: any) => {
      console.log(`  ${stat.protocol} ${stat.event_type}: ${stat.event_count} events`);
    });

    // Show real-time analytics (direct query since materialized view might not exist)
    console.log('\n📊 Real-time Analytics:');
    console.log('======================');
    try {
      const mvData = await clickhouseService.executeQuery(`
        SELECT 
          protocol,
          event_type,
          toStartOfHour(toDateTime(timestamp / 1000)) as hour,
          count() as event_count,
          uniq(pool_address) as unique_pools,
          uniq(transaction_hash) as unique_transactions
        FROM protocol_events 
        GROUP BY protocol, event_type, hour
        ORDER BY hour DESC 
        LIMIT 5
      `);
      
      if (mvData.data.length > 0) {
        mvData.data.forEach((row: any) => {
          console.log(`  ${row.protocol} ${row.event_type} at ${row.hour}:`);
          console.log(`    Events: ${row.event_count}, Pools: ${row.unique_pools}, Transactions: ${row.unique_transactions}`);
        });
      } else {
        console.log('  No analytics data available yet');
      }
    } catch (error) {
      console.log('  Analytics query failed (table might be empty)');
    }

    await clickhouseService.disconnect();
    console.log('\n✅ Database view completed');

  } catch (error) {
    console.error('❌ Failed to view database:', error);
    process.exit(1);
  }
}

// Run the viewer
viewDatabase().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
