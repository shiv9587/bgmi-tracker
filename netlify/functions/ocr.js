exports.handler = async function(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { imageBase64, mimeType } = JSON.parse(event.body);
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "API key not configured" }) };
  }

  const prompt = `You are a BGMI match result OCR engine. Extract data from this screenshot.
Return ONLY valid JSON, no markdown, no explanation.

{
  "map": "Erangel|Miramar|Sanhok|Vikendi|Nusa|Livik|Unknown",
  "rank": <number 1-20>,
  "players": [
    {"name": "<exact name as shown>", "kills": <number>}
  ]
}

Rules:
- Player names EXACTLY as shown (symbols, clan tags included)
- Max 4 players
- If map not visible: "Unknown"
- If rank not visible: 0
- If kills not visible: 0
- ONLY return JSON`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } }
            ]
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 512 }
        })
      }
    );

    const data = await response.json();
    if (data.error) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: data.error.message }) };
    }

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return { statusCode: 200, headers, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
