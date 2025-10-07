'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [isListening, setIsListening] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [pools, setPools] = useState<any[]>([]);

  const startListener = async () => {
    try {
      setIsListening(true);
      console.log('Starting protocol event listener...');
      // In a real implementation, this would start the actual listener
      // For demo purposes, we'll simulate events
      simulateEvents();
    } catch (error) {
      console.error('Failed to start listener:', error);
      setIsListening(false);
    }
  };

  const stopListener = () => {
    setIsListening(false);
    console.log('Stopped protocol event listener');
  };

  const simulateEvents = () => {
    const eventTypes = ['swap', 'mint', 'burn', 'sync'];
    const protocols = ['uniswap-v2', 'uniswap-v3', 'pancakeswap-v2'];
    const tokens = [
      { symbol: 'WETH', name: 'Wrapped Ethereum' },
      { symbol: 'USDC', name: 'USD Coin' },
      { symbol: 'USDT', name: 'Tether USD' },
      { symbol: 'DAI', name: 'Dai Stablecoin' }
    ];

    const interval = setInterval(() => {
      if (!isListening) {
        clearInterval(interval);
        return;
      }

      const randomEvent = {
        id: Math.random().toString(36).substr(2, 9),
        protocol: protocols[Math.floor(Math.random() * protocols.length)],
        eventType: eventTypes[Math.floor(Math.random() * eventTypes.length)],
        timestamp: Date.now(),
        blockNumber: Math.floor(Math.random() * 1000000) + 18000000,
        transactionHash: '0x' + Math.random().toString(16).substr(2, 64),
        poolAddress: '0x' + Math.random().toString(16).substr(2, 40),
        token0: tokens[Math.floor(Math.random() * tokens.length)],
        token1: tokens[Math.floor(Math.random() * tokens.length)],
        data: {
          amount0: (Math.random() * 1000).toFixed(2),
          amount1: (Math.random() * 1000).toFixed(2)
        }
      };

      setEvents(prev => [randomEvent, ...prev.slice(0, 9)]);
    }, 2000);

    return () => clearInterval(interval);
  };

  useEffect(() => {
    if (isListening) {
      const cleanup = simulateEvents();
      return cleanup;
    }
  }, [isListening]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Protocol Event Adapters
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Real-time blockchain protocol event monitoring system
          </p>
          
          <div className="flex gap-4 justify-center">
            <button
              onClick={startListener}
              disabled={isListening}
              className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                isListening
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isListening ? 'Listening...' : 'Start Listener'}
            </button>
            
            <button
              onClick={stopListener}
              disabled={!isListening}
              className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                !isListening
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              Stop Listener
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Real-time Events - Split by Protocol */}
          <div className="xl:col-span-2 space-y-6">
            {/* Uniswap V2 Events */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center mb-4">
                <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <span className="text-blue-600 font-bold text-xs">U2</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900">Uniswap V2 Events</h2>
                <div className={`w-2 h-2 rounded-full ml-auto ${isListening ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
              </div>
              
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {events.filter(event => event.protocol === 'uniswap-v2').length === 0 ? (
                  <p className="text-gray-500 text-center py-4 text-sm">
                    {isListening ? 'Waiting for Uniswap V2 events...' : 'Start the listener to see events'}
                  </p>
                ) : (
                  events.filter(event => event.protocol === 'uniswap-v2').slice(0, 5).map((event, index) => (
                    <div key={event.id} className="border-l-4 border-blue-500 pl-3 py-2 bg-blue-50 rounded-r-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-blue-600 uppercase">
                          {event.eventType}
                        </span>
                        <span className="text-xs text-gray-500">
                          #{event.blockNumber}
                        </span>
                      </div>
                      <div className="text-xs text-gray-700">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{event.token0.symbol}</span>
                          <span>↔</span>
                          <span className="font-medium">{event.token1.symbol}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {event.data.amount0} {event.token0.symbol} / {event.data.amount1} {event.token1.symbol}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Uniswap V3 Events */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center mb-4">
                <div className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                  <span className="text-purple-600 font-bold text-xs">U3</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900">Uniswap V3 Events</h2>
                <div className={`w-2 h-2 rounded-full ml-auto ${isListening ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
              </div>
              
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {events.filter(event => event.protocol === 'uniswap-v3').length === 0 ? (
                  <p className="text-gray-500 text-center py-4 text-sm">
                    {isListening ? 'Waiting for Uniswap V3 events...' : 'Start the listener to see events'}
                  </p>
                ) : (
                  events.filter(event => event.protocol === 'uniswap-v3').slice(0, 5).map((event, index) => (
                    <div key={event.id} className="border-l-4 border-purple-500 pl-3 py-2 bg-purple-50 rounded-r-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-purple-600 uppercase">
                          {event.eventType}
                        </span>
                        <span className="text-xs text-gray-500">
                          #{event.blockNumber}
                        </span>
                      </div>
                      <div className="text-xs text-gray-700">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{event.token0.symbol}</span>
                          <span>↔</span>
                          <span className="font-medium">{event.token1.symbol}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {event.data.amount0} {event.token0.symbol} / {event.data.amount1} {event.token1.symbol}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* PancakeSwap V2 Events */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center mb-4">
                <div className="w-6 h-6 bg-yellow-100 rounded-lg flex items-center justify-center mr-3">
                  <span className="text-yellow-600 font-bold text-xs">P2</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900">PancakeSwap V2 Events</h2>
                <div className={`w-2 h-2 rounded-full ml-auto ${isListening ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
              </div>
              
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {events.filter(event => event.protocol === 'pancakeswap-v2').length === 0 ? (
                  <p className="text-gray-500 text-center py-4 text-sm">
                    {isListening ? 'Waiting for PancakeSwap V2 events...' : 'Start the listener to see events'}
                  </p>
                ) : (
                  events.filter(event => event.protocol === 'pancakeswap-v2').slice(0, 5).map((event, index) => (
                    <div key={event.id} className="border-l-4 border-yellow-500 pl-3 py-2 bg-yellow-50 rounded-r-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-yellow-600 uppercase">
                          {event.eventType}
                        </span>
                        <span className="text-xs text-gray-500">
                          #{event.blockNumber}
                        </span>
                      </div>
                      <div className="text-xs text-gray-700">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{event.token0.symbol}</span>
                          <span>↔</span>
                          <span className="font-medium">{event.token1.symbol}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {event.data.amount0} {event.token0.symbol} / {event.data.amount1} {event.token1.symbol}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Protocol Status - Separate cards for each version */}
          <div className="space-y-6">
            {/* Uniswap V2 */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <span className="text-blue-600 font-bold text-sm">U2</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Uniswap V2</h2>
                  <p className="text-sm text-gray-600">Ethereum</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg mb-4">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="font-medium text-sm">Active</span>
                </div>
                <span className="text-xs text-gray-600">Factory: 0x5C69...6f</span>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Events</h3>
                <div className="grid grid-cols-2 gap-1">
                  {['Swap', 'Mint', 'Burn', 'Sync'].map((eventType) => (
                    <div key={eventType} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded text-center">
                      {eventType}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Uniswap V3 */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                  <span className="text-purple-600 font-bold text-sm">U3</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Uniswap V3</h2>
                  <p className="text-sm text-gray-600">Ethereum</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg mb-4">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="font-medium text-sm">Active</span>
                </div>
                <span className="text-xs text-gray-600">Factory: 0x1F98...984</span>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Events</h3>
                <div className="grid grid-cols-2 gap-1">
                  {['Swap', 'Mint', 'Burn', 'Initialize'].map((eventType) => (
                    <div key={eventType} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded text-center">
                      {eventType}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* PancakeSwap V2 */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center mr-3">
                  <span className="text-yellow-600 font-bold text-sm">P2</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">PancakeSwap V2</h2>
                  <p className="text-sm text-gray-600">BSC</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg mb-4">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="font-medium text-sm">Active</span>
                </div>
                <span className="text-xs text-gray-600">Factory: 0xcA14...4f</span>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Events</h3>
                <div className="grid grid-cols-2 gap-1">
                  {['Swap', 'Mint', 'Burn', 'Sync'].map((eventType) => (
                    <div key={eventType} className="text-xs bg-yellow-50 text-yellow-700 px-2 py-1 rounded text-center">
                      {eventType}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}