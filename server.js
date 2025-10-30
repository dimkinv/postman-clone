const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/send', async (req, res) => {
  const { url, method = 'GET', headers = {}, body } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: 'URL is required.' });
  }

  try {
    const fetchOptions = {
      method,
      headers,
    };

    if (body !== undefined && body !== null && !(method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD')) {
      fetchOptions.body = body;
    }

    const response = await fetch(url, fetchOptions);
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const buffer = await response.arrayBuffer();
    let textBody;
    try {
      textBody = Buffer.from(buffer).toString('utf8');
    } catch (err) {
      textBody = Buffer.from(buffer).toString();
    }

    res.json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: textBody,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
