import { request } from 'undici';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5171';

async function apiCall(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await request(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const body = await res.body.text();
  try {
    return { status: res.statusCode, data: JSON.parse(body) };
  } catch {
    return { status: res.statusCode, data: body };
  }
}

async function floodTest() {
  console.log('=== Order Flood Test ===');
  const orders = Array.from({ length: 10 }, (_, i) => ({
    symbol: 'AAPL',
    qty: '1',
    side: 'buy',
    type: 'market',
    time_in_force: 'day'
  }));

  console.log(`Sending ${orders.length} concurrent orders...`);
  const startTime = Date.now();

  const results = await Promise.allSettled(
    orders.map((order) => apiCall('/api/alpaca/orders', {
      method: 'POST',
      body: JSON.stringify(order)
    }))
  );

  const duration = Date.now() - startTime;

  const summary = {
    total: results.length,
    fulfilled: results.filter(r => r.status === 'fulfilled').length,
    rejected: results.filter(r => r.status === 'rejected').length,
    statuses: {},
    durationMs: duration
  };

  results.forEach(r => {
    if (r.status === 'fulfilled') {
      const status = r.value.status;
      summary.statuses[status] = (summary.statuses[status] || 0) + 1;
    }
  });

  console.table(summary);
  return summary;
}

async function fullLifecycleTest() {
  console.log('\n=== Position Lifecycle Test ===');

  console.log('Step 1: Submitting test order...');
  const orderResult = await apiCall('/api/alpaca/orders', {
    method: 'POST',
    body: JSON.stringify({
      symbol: 'AAPL',
      qty: '1',
      side: 'buy',
      type: 'market',
      time_in_force: 'day'
    })
  });

  console.log(`Order status: ${orderResult.status}`);
  if (orderResult.data?.id) {
    console.log(`Order ID: ${orderResult.data.id}`);
  }

  console.log('Step 2: Waiting for position sync (5s)...');
  await new Promise(r => setTimeout(r, 5000));

  console.log('Step 3: Closing position...');
  const closeResult = await apiCall('/api/alpaca/positions/AAPL', {
    method: 'DELETE'
  });

  console.log(`Close status: ${closeResult.status}`);
  return { order: orderResult, close: closeResult };
}

async function maxOrderSizeTest() {
  console.log('\n=== Max Order Size Test ===');
  const result = await apiCall('/api/alpaca/orders', {
    method: 'POST',
    body: JSON.stringify({
      symbol: 'AAPL',
      qty: '1000000',
      side: 'buy',
      type: 'market',
      time_in_force: 'day'
    })
  });

  console.log(`Response:`, result);
  console.log(`Expected: 422 Rejected, Got: ${result.status}`);
  console.log(`Test: ${result.status === 422 ? 'PASS' : 'FAIL (server rejected with ' + result.status + ')'}`);
  return result;
}

async function main() {
  console.log('Frontend Stress Test Suite');
  console.log(`Base URL: ${BASE_URL}\n`);

  await floodTest();
  await fullLifecycleTest();
  await maxOrderSizeTest();

  console.log('\n=== All Tests Complete ===');
}

main().catch(console.error);