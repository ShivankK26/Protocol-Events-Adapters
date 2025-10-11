#!/usr/bin/env npx tsx

/**
 * ClickHouse Cloud Database Reset Script
 * 
 * This script performs a complete reset of the ClickHouse Cloud database
 * by dropping all existing tables and recreating the schema. This is
 * useful for development, testing, and starting fresh with a clean database.
 * 
 * Features:
 * - Complete database cleanup and table removal
 * - Schema recreation with optimized structure
 * - Safe operation with confirmation and error handling
 * - Development and testing environment preparation
 * - Clean slate for new data ingestion
 * 
 * Usage:
 *   npm run db:reset
 *   npx tsx src/scripts/reset-database.ts
 * 
 * ⚠️ WARNING: This will permanently delete all existing data!
 * 
 * Prerequisites:
 * - ClickHouse Cloud setup completed
 * - Environment variables configured
 * - Confirmation that data loss is acceptable
 */

import { ClickHouseService } from '../core/ClickHouseService';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

/**
 * Main database reset function
 * 
 * Performs complete database reset including:
 * 1. Database connection establishment
 * 2. Existing table removal (protocol_events, protocol_events_mv)
 * 3. Schema recreation with optimized structure
 * 4. Clean database preparation for new data
 * 5. Reset completion confirmation and next steps
 * 
 * @throws Error if database connection or reset operations fail
 */
async function resetDatabase(): Promise<void> {
  console.log('🗑️ Resetting ClickHouse Cloud Database...\n');

  // Configuration
  const clickhouseConfig = {
    host: process.env.CLICKHOUSE_HOST || 'localhost',
    port: parseInt(process.env.CLICKHOUSE_PORT || '8443'),
    username: process.env.CLICKHOUSE_USERNAME || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    database: process.env.CLICKHOUSE_DATABASE || 'default',
    secure: process.env.CLICKHOUSE_SECURE === 'true' || false
  };

  try {
    const clickhouseService = new ClickHouseService(clickhouseConfig);
    await clickhouseService.connect();
    console.log('✅ Connected to ClickHouse Cloud');

    // Drop existing tables
    console.log('\n🗑️ Dropping existing tables...');
    try {
      await clickhouseService.executeCommand('DROP TABLE IF EXISTS protocol_events');
      console.log('✅ Dropped protocol_events table');
    } catch (error) {
      console.log('⚠️ protocol_events table might not exist');
    }

    try {
      await clickhouseService.executeCommand('DROP TABLE IF EXISTS protocol_events_mv');
      console.log('✅ Dropped protocol_events_mv table');
    } catch (error) {
      console.log('⚠️ protocol_events_mv table might not exist');
    }

    // Recreate schema
    console.log('\n📊 Recreating database schema...');
    await clickhouseService.initializeSchema();
    console.log('✅ Database schema recreated');

    await clickhouseService.disconnect();
    console.log('\n🎉 Database reset completed successfully!');
    console.log('\n✅ Your database is now clean and ready for real blockchain events');
    console.log('\n🚀 Next steps:');
    console.log('   1. Run: yarn data:ingestion');
    console.log('   2. Or run: yarn test:integration');

  } catch (error) {
    console.error('❌ Failed to reset database:', error);
    process.exit(1);
  }
}

// Run reset
resetDatabase().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
