const fetch = require('node-fetch');

const PRINTIFY_TOKEN = process.env.PRINTIFY_TOKEN || process.env.printify_token;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE || process.env.shopify_store;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN || process.env.shopify_token;

async function getPrintifyShopId() {
  const res = await fetch('https://api.printify.com/v1/shops.json', {
    headers: { Authorization: `Bearer ${PRINTIFY_TOKEN}` }
  });
  const data = await res.json();
  return data[0].id;
}

async function getPrintifyProducts(shopId) {
  const res = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json?limit=100`, {
    headers: { Authorization: `Bearer ${PRINTIFY_TOKEN}` }
  });
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data || []);
}

async function getPrintifyProduct(shopId, productId) {
  const res = await fetch(`https://api.printify.com/v1/shops/${shopId}/products/${productId}.json`, {
    headers: { Authorization: `Bearer ${PRINTIFY_TOKEN}` }
  });
  return res.json();
}

async function getShopifyProduct(shopifyProductId) {
  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${shopifyProductId}.json`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
  );
  const data = await res.json();
  return data.product;
}

async function updateShopifyImageAlt(shopifyProductId, imageId, alt) {
  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${shopifyProductId}/images/${imageId}.json`,
    {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image: { id: imageId, alt } })
    }
  );
  return res.json();
}

function detectColorOption(variant) {
  const colorOption = variant.options?.find(o =>
    ['color', 'colour', 'Color', 'Colour'].includes(o.name)
  );
  return colorOption?.value || null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { shopifyProductId, printifyProductId, preview } = req.body;

  try {
    if (!PRINTIFY_TOKEN) return res.status(500).json({ error: 'PRINTIFY_TOKEN not set' });
    if (!SHOPIFY_TOKEN) return res.status(500).json({ error: 'SHOPIFY_TOKEN not set' });
    if (!SHOPIFY_STORE) return res.status(500).json({ error: 'SHOPIFY_STORE not set' });

    const t0 = Date.now();
    const shopId = await getPrintifyShopId();
    const t1 = Date.now();
    if (!shopId) return res.status(500).json({ error: 'No Printify shop found' });

        let printifyProduct;
    if (printifyProductId) {
      printifyProduct = await getPrintifyProduct(shopId, printifyProductId);
      if (!printifyProduct?.variants) {
        return res.status(500).json({ error: 'Printify product fetch failed', raw: printifyProduct });
      }
    }
    } else {
      const products = await getPrintifyProducts(shopId);
      if (!Array.isArray(products)) {
        return res.status(500).json({ error: 'Unexpected Printify products response', raw: products });
      }
      printifyProduct = products.find(p =>
        p.external?.id === shopifyProductId.toString() ||
        p.external?.id === `gid://shopify/Product/${shopifyProductId}`
      );
      if (!printifyProduct) return res.status(404).json({ error: 'Printify product not found' });
      printifyProduct = await getPrintifyProduct(shopId, printifyProduct.id);
    }
    const t2 = Date.now();

    // DEBUG — remove after confirming timings
    if (req.body.debug) {
      return res.status(200).json({
        debug: true,
        shopId,
        timings: { shopId: t1-t0, product: t2-t1 },
        productKeys: Object.keys(printifyProduct || {})
      });
    }

    const variantColorMap = {};
    for (const variant of printifyProduct.variants) {
      const color = detectColorOption(variant);
      if (color) variantColorMap[variant.id] = color;
    }

    const printifyImageColorMap = {};
    for (const img of printifyProduct.images) {
      const colors = new Set();
      for (const vid of img.variant_ids) {
        if (variantColorMap[vid]) colors.add(variantColorMap[vid]);
      }
      printifyImageColorMap[img.position] = [...colors][0] || null;
    }

    const shopifyProduct = await getShopifyProduct(shopifyProductId);
    const shopifyImages = shopifyProduct.images;

    const results = [];
    for (const shopifyImg of shopifyImages) {
      const color = printifyImageColorMap[shopifyImg.position];
      results.push({
        shopifyImageId: shopifyImg.id,
        position: shopifyImg.position,
        currentAlt: shopifyImg.alt,
        newAlt: color || null,
        src: shopifyImg.src
      });
    }

    if (preview) {
      return res.status(200).json({ preview: true, results });
    }

    const applied = [];
    for (const r of results) {
      if (r.newAlt && r.newAlt !== r.currentAlt) {
        await updateShopifyImageAlt(shopifyProductId, r.shopifyImageId, r.newAlt);
        applied.push(r);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    return res.status(200).json({ success: true, tagged: applied.length, results });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
