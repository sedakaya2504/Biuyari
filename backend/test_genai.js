const { GoogleGenAI } = require('@google/genai');

try {
  console.log('GenAI:', GoogleGenAI);
  const ai = new GoogleGenAI({ apiKey: 'fake_key' });
  console.log('Success:', !!ai);
} catch (e) {
  console.error('Error:', e);
}
