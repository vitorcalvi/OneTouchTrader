import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_TEST_API);

async function setupProducts() {
  const products = [
    {
      name: 'Fireup Trader — Pro',
      description: 'One-tap trading webapp. Live Alpaca brokerage.',
      price_cents: 2900,
      tier: 'pro',
    },
    {
      name: 'Fireup Trader — Pro + AI',
      description: 'Pro + MCP server license for Claude Desktop integration.',
      price_cents: 7900,
      tier: 'pro_ai',
    },
  ];

  for (const p of products) {
    const product = await stripe.products.create({
      name: p.name,
      description: p.description,
      metadata: { tier: p.tier },
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: p.price_cents,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { tier: p.tier },
    });
    console.log(`${p.tier}: product=${product.id} price=${price.id}`);
  }
}

setupProducts().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });