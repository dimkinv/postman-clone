const methodSelect = document.getElementById('method');
const urlInput = document.getElementById('url');
const bodyInput = document.getElementById('body');
const sendButton = document.getElementById('send');
const addHeaderButton = document.getElementById('add-header');
const headersContainer = document.getElementById('headers-container');
const responseStatus = document.getElementById('response-status');
const responseTime = document.getElementById('response-time');
const responseHeaders = document.getElementById('response-headers');
const responseBody = document.getElementById('response-body');
const curlInput = document.getElementById('curl-input');
const parseCurlButton = document.getElementById('parse-curl');
const exportCurlButton = document.getElementById('export-curl');
const curlOutput = document.getElementById('curl-output');
const copyCurlButton = document.getElementById('copy-curl');

function createHeaderRow(name = '', value = '') {
  const row = document.createElement('div');
  row.className = 'header-row';

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Header name';
  nameInput.value = name;

  const valueInput = document.createElement('input');
  valueInput.placeholder = 'Header value';
  valueInput.value = value;

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    headersContainer.removeChild(row);
  });

  row.append(nameInput, valueInput, removeButton);
  return row;
}

function ensureHeaderRow() {
  if (headersContainer.children.length === 0) {
    headersContainer.appendChild(createHeaderRow());
  }
}

function collectHeaders() {
  const headers = {};
  [...headersContainer.children].forEach((row) => {
    const [nameInput, valueInput] = row.querySelectorAll('input');
    const name = nameInput.value.trim();
    const value = valueInput.value;
    if (name) {
      headers[name] = value;
    }
  });
  return headers;
}

function applyHeaders(headers) {
  headersContainer.innerHTML = '';
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    ensureHeaderRow();
    return;
  }
  entries.forEach(([name, value]) => {
    headersContainer.appendChild(createHeaderRow(name, value));
  });
}

function shellEscape(value) {
  if (value === undefined || value === null) {
    return "''";
  }
  if (/^[A-Za-z0-9_\-\.:\/\?&=%@]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildCurlCommand() {
  const method = methodSelect.value;
  const url = urlInput.value.trim();
  const headers = collectHeaders();
  const body = bodyInput.value;

  if (!url) {
    return '';
  }

  const parts = ['curl'];

  Object.entries(headers).forEach(([key, value]) => {
    parts.push('-H');
    parts.push(shellEscape(`${key}: ${value}`));
  });

  if (method && method.toUpperCase() !== 'GET') {
    parts.push('-X');
    parts.push(shellEscape(method.toUpperCase()));
  }

  if (body && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
    parts.push('--data-raw');
    parts.push(shellEscape(body));
  }

  parts.push(shellEscape(url));

  return parts.join(' ');
}

function tokenizeCurl(command) {
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaping = false;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      if (inSingle) {
        current += char;
      } else {
        escaping = true;
      }
      continue;
    }

    if (char === "'") {
      if (!inDouble) {
        inSingle = !inSingle;
        continue;
      }
    }

    if (char === '"') {
      if (!inSingle) {
        inDouble = !inDouble;
        continue;
      }
    }

    if (!inSingle && !inDouble && /\s/.test(char)) {
      if (current.length) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length) {
    tokens.push(current);
  }

  return tokens;
}

function parseCurlCommand(command) {
  const tokens = tokenizeCurl(command.trim());
  if (!tokens.length || tokens[0] !== 'curl') {
    throw new Error('Command must start with "curl"');
  }

  let url = '';
  let method = 'GET';
  const headers = {};
  let body;

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    switch (token) {
      case '-X':
      case '--request': {
        i += 1;
        method = tokens[i] ? tokens[i].toUpperCase() : method;
        break;
      }
      case '-H':
      case '--header': {
        i += 1;
        const headerToken = tokens[i];
        if (headerToken) {
          const [name, ...rest] = headerToken.split(/:\s*/);
          const value = rest.join(': ');
          if (name) {
            headers[name] = value;
          }
        }
        break;
      }
      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-binary':
      case '--data-urlencode': {
        i += 1;
        body = tokens[i] || '';
        break;
      }
      case '--url': {
        i += 1;
        url = tokens[i] || url;
        break;
      }
      default: {
        if (token.startsWith('-')) {
          // Skip flag values that we do not explicitly handle.
          const next = tokens[i + 1];
          if (next && !next.startsWith('-')) {
            i += 1;
          }
        } else if (!url) {
          url = token;
        }
      }
    }
  }

  if (!url) {
    throw new Error('Unable to determine request URL from cURL command.');
  }

  if (body !== undefined) {
    try {
      body = JSON.parse(body);
      body = JSON.stringify(body, null, 2);
    } catch (err) {
      // leave as-is
    }
  }

  return {
    url,
    method,
    headers,
    body: body ?? '',
  };
}

function populateFromCurl(parsed) {
  methodSelect.value = parsed.method || 'GET';
  urlInput.value = parsed.url || '';
  bodyInput.value = parsed.body || '';
  applyHeaders(parsed.headers || {});
}

async function sendRequest() {
  const url = urlInput.value.trim();
  if (!url) {
    alert('Please enter a URL.');
    return;
  }

  const method = methodSelect.value.toUpperCase();
  const headers = collectHeaders();
  const body = bodyInput.value;
  const requestPayload = {
    url,
    method,
    headers,
  };

  if (body && method !== 'GET' && method !== 'HEAD') {
    requestPayload.body = body;
  }

  const start = performance.now();
  try {
    const response = await fetch('/api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });

    const elapsed = performance.now() - start;
    responseTime.textContent = `Time: ${elapsed.toFixed(0)} ms`;

    const payload = await response.json();

    if (!response.ok) {
      responseStatus.textContent = `${response.status} ${payload.error || response.statusText}`;
      responseHeaders.textContent = '';
      responseBody.textContent = payload.error || 'An error occurred while sending the request.';
      return;
    }

    responseStatus.textContent = `${payload.status} ${payload.statusText}`;
    responseHeaders.textContent = JSON.stringify(payload.headers, null, 2);
    responseBody.textContent = payload.body;
  } catch (error) {
    responseStatus.textContent = 'Error';
    responseTime.textContent = '';
    responseHeaders.textContent = '';
    responseBody.textContent = error.message;
  }
}

addHeaderButton.addEventListener('click', () => {
  headersContainer.appendChild(createHeaderRow());
});

sendButton.addEventListener('click', sendRequest);

exportCurlButton.addEventListener('click', () => {
  const command = buildCurlCommand();
  curlOutput.value = command;
  if (!command) {
    alert('Please provide at least a URL to export a cURL command.');
  }
});

parseCurlButton.addEventListener('click', () => {
  const command = curlInput.value.trim();
  if (!command) {
    alert('Please paste a cURL command to parse.');
    return;
  }
  try {
    const parsed = parseCurlCommand(command);
    populateFromCurl(parsed);
  } catch (error) {
    alert(error.message);
  }
});

copyCurlButton.addEventListener('click', async () => {
  const command = curlOutput.value.trim();
  if (!command) {
    alert('Nothing to copy.');
    return;
  }
  try {
    await navigator.clipboard.writeText(command);
  } catch (error) {
    alert('Unable to copy to clipboard.');
  }
});

ensureHeaderRow();
