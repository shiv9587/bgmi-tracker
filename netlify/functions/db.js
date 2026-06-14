exports.handler = async function(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const base = `${SUPABASE_URL}/rest/v1/matches`;
  const sbHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
  };

  try {
    // GET — fetch all matches
    if (event.httpMethod === "GET") {
      const res = await fetch(`${base}?order=match_num.asc`, { headers: sbHeaders });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // POST — save new match
    if (event.httpMethod === "POST") {
      const match = JSON.parse(event.body);
      const res = await fetch(base, {
        method: "POST",
        headers: { ...sbHeaders, "Prefer": "return=representation" },
        body: JSON.stringify({
          match_num: match.matchNum,
          map: match.map,
          rank: match.rank,
          place_pts: match.placePts,
          team_kills: match.teamKills,
          total_pts: match.totalPts,
          players: match.players
        })
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // DELETE — delete a match by id
    if (event.httpMethod === "DELETE") {
      const { id } = JSON.parse(event.body);
      await fetch(`${base}?id=eq.${id}`, {
        method: "DELETE",
        headers: sbHeaders
      });
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
