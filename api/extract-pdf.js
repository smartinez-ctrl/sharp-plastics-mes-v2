export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { po, mockup } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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
      return res.status(response.status).json({ error: data });
    }

    const text = data.content[0].text.replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(text);
    return res.status(200).json(extracted);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
