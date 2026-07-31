// Falls back to resolving the Place ID automatically via Text Search when
// GOOGLE_PLACE_ID isn't set, since the business name reliably matches only one
// listing (confirmed against kgmid /g/11zd74q2dq during setup).
async function resolvePlaceId(apiKey) {
  const query = process.env.GOOGLE_BUSINESS_QUERY || "RGC Networks, Caracas, Venezuela";
  const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    },
    body: JSON.stringify({ textQuery: query }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.places?.[0]?.id || null;
}

exports.handler = async () => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  let placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing GOOGLE_PLACES_API_KEY" }),
    };
  }

  try {
    if (!placeId) {
      placeId = await resolvePlaceId(apiKey);
      if (!placeId) {
        return {
          statusCode: 502,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Could not resolve place ID from business name search" }),
        };
      }
    }

    const resp = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,displayName,rating,userRatingCount,reviews",
      },
    });

    if (!resp.ok) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Upstream error", status: resp.status }),
      };
    }

    const data = await resp.json();

    const payload = {
      rating: data.rating ?? null,
      userRatingCount: data.userRatingCount ?? null,
      reviews: (data.reviews || []).slice(0, 5).map((r) => ({
        authorName: r.authorAttribution?.displayName || "Cliente de Google",
        authorPhotoUrl: r.authorAttribution?.photoUri || null,
        rating: r.rating,
        text: r.text?.text || r.originalText?.text || "",
        relativeTime: r.relativePublishTimeDescription || "",
      })),
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        "Netlify-CDN-Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, durable",
      },
      body: JSON.stringify(payload),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Fetch failed" }),
    };
  }
};
