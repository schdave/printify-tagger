module.exports = async (req, res) => {
  const { code, shop } = req.query;
  const fetch = require('node-fetch');

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code
    })
  });

  const { access_token } = await tokenRes.json();

  // Display the token so you can copy it
  res.send(`
    <html><body style="font-family:sans-serif;padding:40px">
      <h2>✅ Shopify Token Generated</h2>
      <p>Copy this token and add it to Vercel as <strong>SHOPIFY_TOKEN</strong>:</p>
      <textarea rows="4" style="width:100%;font-size:13px">${access_token}</textarea>
      <p style="color:red">⚠️ Save this immediately — close this page and it's gone.</p>
    </body></html>
  `);
};
