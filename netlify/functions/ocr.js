exports.handler = async function(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const { imageBase64, mimeType } = JSON.parse(event.body);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "API key not configured" }) };

  const prompt = `You are a BGMI match result OCR engine. Extract data from this screenshot.
Return ONLY valid JSON, no markdown, no explanation.

{
  "map": "Erangel|Miramar|Rondo|Unknown",
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
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://team-analysis.netlify.app",
        "X-Title": "BGMI Match Tracker"
      },
      body: JSON.stringify({
        model: "google/gemma-4-31b-it:free",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
          ]
        }],
        temperature: 0,
        max_tokens: 512
      })
    });

    const data = await response.json();
    if (data.error) return { statusCode: 400, headers, body: JSON.stringify({ error: data.error.message }) };

    const raw = data.choices?.[0]?.message?.content || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
