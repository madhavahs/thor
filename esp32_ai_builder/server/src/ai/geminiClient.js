const config = require('../config');

async function callGeminiWithModel(modelName, systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.geminiApiKey}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: systemPrompt + '\n\n' + userPrompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function callGemini(systemPrompt, userPrompt) {
  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server/.env');
  }

  const primaryModel = config.geminiModel || 'gemini-3.1-flash-lite';
  let response;

  try {
    response = await callGeminiWithModel(primaryModel, systemPrompt, userPrompt);
    if (!response.ok && (response.status === 404 || response.status === 400) && primaryModel !== 'gemini-2.0-flash') {
      console.warn(`[GEMINI] Model ${primaryModel} returned ${response.status}. Falling back to gemini-2.0-flash...`);
      response = await callGeminiWithModel('gemini-2.0-flash', systemPrompt, userPrompt);
    }
  } catch (err) {
    if (primaryModel !== 'gemini-2.0-flash') {
      response = await callGeminiWithModel('gemini-2.0-flash', systemPrompt, userPrompt);
    } else {
      throw err;
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(rawText);
}

module.exports = { callGemini };
