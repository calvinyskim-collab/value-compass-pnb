/**
 * Netlify Serverless Function: OpenAI Proxy Handler
 * 엔드포인트: /.netlify/functions/chat (또는 /api/chat)
 */
exports.handler = async function (event, context) {
  console.log("\n=======================================================");
  console.log("[Proxy Backend] New request received");
  console.log("[Proxy Backend] HTTP Method:", event.httpMethod);
  console.log("[Proxy Backend] Timestamp:", new Date().toISOString());

  // 1. CORS Preflight 처리
  if (event.httpMethod === "OPTIONS") {
    console.log("[Proxy Backend] Handling OPTIONS preflight request");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  // 2. HTTP Method 검증
  if (event.httpMethod !== "POST") {
    console.warn("[Proxy Backend] Invalid method rejected:", event.httpMethod);
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed. Only POST is accepted." }),
    };
  }

  // 3. 환경 변수에서 OpenAI API Key 로드
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[Proxy Backend] FATAL: OPENAI_API_KEY environment variable is missing!");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Server configuration error: OPENAI_API_KEY is not set in Netlify environment variables.",
      }),
    };
  }

  console.log("[Proxy Backend] API Key loaded successfully (Key prefix:", apiKey.substring(0, 7) + "...)");

  // 4. 요청 페이로드 파싱 및 검증
  let payload;
  try {
    payload = JSON.parse(event.body);
    console.log("[Proxy Backend] Request payload parsed successfully");
    console.log("[Proxy Backend] Target Model:", payload.model);
    console.log("[Proxy Backend] Messages count:", payload.messages ? payload.messages.length : 0);
    console.log("[Proxy Backend] Response Format:", payload.response_format ? payload.response_format.type : "standard text");
  } catch (parseError) {
    console.error("[Proxy Backend] Failed to parse request body:", parseError.message);
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON body provided." }),
    };
  }

  // 5. OpenAI API 호출
  const openAiUrl = "https://api.openai.com/v1/chat/completions";
  console.log("[Proxy Backend] Forwarding request to OpenAI:", openAiUrl);

  const startTime = Date.now();
  try {
    const openAiResponse = await fetch(openAiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const elapsed = Date.now() - startTime;
    console.log(`[Proxy Backend] OpenAI responded with HTTP ${openAiResponse.status} (Elapsed: ${elapsed}ms)`);

    const responseData = await openAiResponse.json();

    if (!openAiResponse.ok) {
      console.error("[Proxy Backend] OpenAI Error Response:", JSON.stringify(responseData, null, 2));
      return {
        statusCode: openAiResponse.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: responseData.error ? responseData.error.message : "OpenAI API returned an error",
        }),
      };
    }

    console.log("[Proxy Backend] Usage tokens:", responseData.usage);
    console.log("[Proxy Backend] Returning response to frontend client");
    console.log("=======================================================\n");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(responseData),
    };
  } catch (networkError) {
    console.error("[Proxy Backend] Network exception when calling OpenAI:", networkError.message);
    return {
      statusCode: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Failed to communicate with OpenAI API upstream: " + networkError.message,
      }),
    };
  }
};