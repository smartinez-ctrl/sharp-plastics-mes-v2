export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { po, mockup } = req.body;
    if (!po || !mockup) return res.status(400).json({ error: 'Faltan los PDFs' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: po } },
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: mockup } },
            { type: 'text', text: 'Analiza estos dos PDFs y extrae la información en este JSON exacto sin texto adicional:\n{"sub_cliente":"nombre bajo Ship To primera línea","po":"solo el número final del PO#","capacidad":600,"piezas":505,"fecha_pedido":"2026-03-25","direccion_envio":"dirección completa bajo Ship To","color_botella":"valor de BOTTLE:","color_tapa":"valor de TOP:","color_boquilla":"valor de MOUTHPIECE:","tintas":["348 C","White"],"num_colores":2}' }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: 'Anthropic error: ' + JSON.stringify(data) });
    }

    if (!data.content || !data.content[0]) {
      return res.status(500).json({ error: 'Respuesta vacía: ' + JSON.stringify(data) });
    }

    const text = data.content[0].text.replace(/```json|```/g, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(text);
    } catch(e) {
      return res.status(500).json({ error: 'JSON inválido recibido: ' + text.substring(0, 200) });
    }

    return res.status(200).json(extracted);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
