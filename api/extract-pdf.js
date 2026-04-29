export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { po, mockup } = req.body;
    if (!po || !mockup) return res.status(400).json({ error: 'Faltan los PDFs' });

    const prompt = `Analiza estos dos PDFs de un pedido de botellas de plástico impresas y extrae la información en JSON exacto sin texto adicional ni backticks:
{
  "sub_cliente": "nombre del sub-cliente bajo Ship To (primera línea solamente, ej: Peaked Sports)",
  "po": "solo el número al final del PO#, ej: si dice MF-Peaked Sports-750ml-435742527 devuelve 435742527",
  "capacidad": 750,
  "piezas": 205,
  "fecha_pedido": "2026-04-23",
  "direccion_envio": "dirección completa bajo Ship To incluyendo ciudad estado y país",
  "color_botella": "color de BOTTLE o COLOR OF BOTTLE",
  "color_tapa": "color de TOP o COLOR OF THE BOTTLE TOP",
  "color_boquilla": "color de MOUTHPIECE o COLOR OF THE MOUTH PIECE",
  "tintas": ["Black", "White"],
  "num_colores": 2,
  "notas_packaging": "texto completo de PACKAGING"
}`;

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
            { type: 'text', text: prompt }
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
      return res.status(500).json({ error: 'JSON inválido: ' + text.substring(0, 300) });
    }

    return res.status(200).json(extracted);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
