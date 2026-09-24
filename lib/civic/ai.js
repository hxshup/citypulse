// ============================================================
// Grounded AI explanation layer.
// The AI NEVER invents civic facts. It only rephrases the
// verified deterministic findings into plain language.
// Falls back to a deterministic template if the API is down.
// ============================================================

const SYSTEM = `You are CityPulse, a civic intelligence assistant.
You receive VERIFIED structured findings from a deterministic engine.
Rules:
- Use ONLY the supplied findings. Never invent events, numbers, causes, or places.
- This is a POSSIBLE CORRELATION, not confirmed causation.
- Always use hedged language: "possible correlation", "may be related", "coincides with".
- Never state an unverified causal relationship as fact.
- Write 2-3 short sentences, plain language, understandable in ~10 seconds.
- Do not add recommendations or data not present in the findings.`

function template(f) {
  return (
    `Heavy rainfall (${f.rainfall} mm/h) in ${f.zoneName} coincides with a rise in ` +
    `traffic incidents (+${f.trafficPct}%)${f.transitPct != null ? ` and transit delays (+${f.transitPct}%)` : ''}, ` +
    `all within a ${f.timeOverlapMin}-minute window. The overlapping signals suggest a possible ` +
    `weather-related disruption (${f.confidence}% confidence). This is a possible correlation, not confirmed causation.`
  )
}

export async function generateGroundedSummary(f) {
  const structured =
    `Zone: ${f.zoneName}\n` +
    `Weather: heavy rainfall (${f.rainfall} mm/h)\n` +
    `Traffic incidents: +${f.trafficPct}%\n` +
    (f.transitPct != null ? `Transit delays: +${f.transitPct}%\n` : '') +
    `Time overlap: ${f.timeOverlapMin} minutes\n` +
    `Correlation confidence: ${f.confidence}%`

  try {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error('Missing OPENAI_API_KEY')

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        instructions: SYSTEM,
        input: `VERIFIED FINDINGS:\n${structured}\n\nWrite the grounded plain-language explanation now.`,
        temperature: 0.2,
        max_output_tokens: 220,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`)
    }

    const data = await response.json()
    const text = (data.output_text || '').trim()

    if (!text) throw new Error('Empty AI response')

    return {
      summary: text,
      ai: true,
      model,
    }
  } catch (err) {
    console.error(
      'AI summary unavailable, using deterministic fallback:',
      err?.message
    )

    return {
      summary: template(f),
      ai: false,
      model: null,
    }
  }
}