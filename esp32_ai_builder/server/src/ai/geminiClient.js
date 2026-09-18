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
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!rawText) {
    throw new Error('Empty response received from Gemini API');
  }

  // 1. Direct JSON parse
  try {
    const parsed = JSON.parse(rawText);
    parsed.sketch_code = parsed.sketch_code || parsed.code || parsed.sketch || '';
    return parsed;
  } catch (e) {}

  // 2. Extract JSON from markdown fences (```json ... ```)
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      parsed.sketch_code = parsed.sketch_code || parsed.code || parsed.sketch || '';
      return parsed;
    } catch (e) {}
  }

  // 3. Extract C++ sketch code from markdown code fences (```cpp ... ```)
  const codeMatch = rawText.match(/```(?:cpp|c\+\+|arduino)?\s*([\s\S]*?)\s*```/i);
  if (codeMatch) {
    return {
      project_name: 'ESP32_AI_Project',
      description: 'AI Generated C++ Sketch',
      required_libraries: [],
      sketch_code: codeMatch[1].trim()
    };
  }

  // 4. Raw C++ text fallback if model responded directly with code
  if (rawText.includes('setup()') || rawText.includes('loop()') || rawText.includes('#include')) {
    return {
      project_name: 'ESP32_AI_Project',
      description: 'AI Generated C++ Sketch',
      required_libraries: [],
      sketch_code: rawText.trim()
    };
  }

  throw new Error(`Failed to parse AI response: ${rawText.slice(0, 150)}`);
}

module.exports = { callGemini };
